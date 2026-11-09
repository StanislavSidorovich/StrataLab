// Step 3 of the build page: Model, the linking screen (docs/build-linking-screen.md). Pass 1: the learner links the text
// columns to the tables that describe them (L1 to L3) and presses Build the star, which shows its SQL. Pass 2: the learner
// links the fact to its dimensions by id (F1, F2); Continue opens the Dashboard. A state saved by the first version of
// this step (a star built for the learner) keeps Model done and is shown read-only with Try it.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ExternalLink, Hammer, Loader2, RotateCcw, X } from 'lucide-react'
import { acceptedLabel, addLink, canBuildStar, diagnoseLink, linksOfPass, modelLinked, removeLink, sameLink, slotName, starSql, type Fix, type Link, type LinkDiagnosis, type Slot } from '../../core/buildLinks'
import type { BuildSourceId } from '../../data/build/kaiyoSales'
import { LINK_TEXT, PASS_TABLES, type Pass } from '../../data/build/linkData'
import { buildStar, describeTable, linkFacts, linkPeek, starFacts, type ChainPeek, type StarFacts } from '../../db/buildRun'
import { checkpoint } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { addTab, refreshCatalog } from '../store'
import { fmtN } from './BuildTable'
import { LinkCanvas, type PendingLine, type TableView } from './LinkCanvas'
import { LinkPanel, type Run, type SlotState } from './LinkPanel'
import './dashboard.css'
import './linking.css'

interface Props {
  ready: boolean
  /** bumped after every rebuild of a clean table */
  rev: number
  done: boolean
  links: Link[]
  star: boolean
  /** saved by the first version of this step */
  v1: boolean
  onLinks: (links: Link[], star: boolean) => void
  /** Build the star ran */
  onStar: () => void
  onTryIt: () => void
  onContinue: () => void
  onFixRegions: () => void
  onBackToClean: (source: BuildSourceId) => void
}

const EMPTY: SlotState = { table: null, column: null }
const filled = (s: SlotState): s is { table: string; column: string } => !!s.table && !!s.column

export function ModelScreen(p: Props) {
  const { ready, rev, done, links, star, v1 } = p
  const legacy = v1 && done && !star && links.length === 0
  const [view, setView] = useState<Pass>(star || legacy ? 2 : 1)
  const pass: Pass = star || legacy ? view : 1
  const working: Pass = star ? 2 : 1
  const live = !legacy && pass === working

  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<Record<string, TableView | undefined>>({})
  const [many, setMany] = useState<SlotState>(EMPTY)
  const [one, setOne] = useState<SlotState>(EMPTY)
  const [run, setRun] = useState<Run>({ busy: false, facts: null, error: null })
  const [peek, setPeek] = useState<ChainPeek | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [nums, setNums] = useState<StarFacts | null>(null)
  const [building, setBuilding] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const stamp = useRef(0)

  // the tables on the screen: columns with types and row counts
  useEffect(() => {
    if (!ready) return
    let alive = true
    void Promise.all(
      PASS_TABLES[pass].map(async (t) => {
        const [columns, n] = await Promise.all([describeTable(enginePort, t), enginePort.query(`SELECT count(*) FROM build_kaiyo.${t}`)])
        return [t, { columns, rows: Number(n.rows[0][0]) }] as const
      }),
    )
      .then((list) => alive && setTables(Object.fromEntries(list)))
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [ready, pass, rev, star])

  // the pill of each made link: "3,000 → 144 · all found"
  const idKey = links.map((l) => l.id).join()
  useEffect(() => {
    if (!ready || links.length === 0) {
      setLabels({})
      return
    }
    let alive = true
    void Promise.all(
      links.map(async (l) => {
        try {
          return [l.id, acceptedLabel(await linkFacts(enginePort, l.many, l.one))] as const
        } catch {
          return [l.id, l.id] as const
        }
      }),
    ).then((list) => alive && setLabels(Object.fromEntries(list)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idKey, rev, star])

  // the star's numbers, once it exists
  useEffect(() => {
    if (!ready || !(star || legacy)) return
    let alive = true
    void starFacts(enginePort)
      .then((f) => alive && setNums(f))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [ready, star, legacy])

  // a new pass or step starts with empty slots
  useEffect(() => {
    setMany(EMPTY)
    setOne(EMPTY)
  }, [pass])

  // the checks of the pair in the slots (four small queries), the stale answer dropped by a counter
  const pairKey = filled(many) && filled(one) ? `${many.table}.${many.column}>${one.table}.${one.column}` : ''
  useEffect(() => {
    const mine = ++stamp.current
    setPeek(null)
    if (!ready || !filled(many) || !filled(one) || !live) {
      setRun({ busy: false, facts: null, error: null })
      return
    }
    setRun({ busy: true, facts: null, error: null })
    const m: Slot = { table: many.table, column: many.column }
    const o: Slot = { table: one.table, column: one.column }
    linkFacts(enginePort, m, o)
      .then(async (facts) => {
        if (stamp.current !== mine) return
        setRun({ busy: false, facts, error: null })
        if (facts.found && m.table !== o.table) {
          const pk = await linkPeek(enginePort, m, o).catch(() => null)
          if (stamp.current === mine) setPeek(pk)
        }
      })
      .catch((e) => stamp.current === mine && setRun({ busy: false, facts: null, error: String(e instanceof Error ? e.message : e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pairKey, live, rev])

  const pair = filled(many) && filled(one) ? { many: { table: many.table, column: many.column }, one: { table: one.table, column: one.column } } : null
  const taken = !!pair && links.some((l) => sameLink(l, pair))
  const diag: LinkDiagnosis | null = run.facts && pair ? diagnoseLink(run.facts, pass, taken) : null

  const pick = (s: Slot) => {
    const same = (x: SlotState) => x.table === s.table && x.column === s.column
    if (same(many)) return setMany(EMPTY)
    if (same(one)) return setOne(EMPTY)
    if (!many.column) return setMany(s)
    if (!one.column) return setOne(s)
    if (s.table === many.table) setMany(s)
    else setOne(s)
  }
  const onSlot = (which: 'many' | 'one', s: SlotState) => (which === 'many' ? setMany(s) : setOne(s))
  const doSwap = () => {
    setMany(one)
    setOne(many)
  }
  const create = () => {
    if (!diag?.ok || !diag.expected || !pair) return
    p.onLinks(addLink(links, { id: diag.expected.id, ...pair }), star)
    setMany(EMPTY)
    setOne(EMPTY)
  }
  const fix = (f: Fix) => {
    if (f.kind === 'swap') return doSwap()
    if (f.kind === 'region') return p.onFixRegions()
    p.onBackToClean(f.source)
  }
  const remove = (id: Link['id']) => {
    const r = removeLink(links, star, id)
    p.onLinks(r.links, r.star)
    setConfirm(null)
    if (!r.star) setView(1)
  }
  const build = async () => {
    setBuilding(true)
    setError(null)
    try {
      setNums(await buildStar(enginePort, links))
      await checkpoint()
      await refreshCatalog()
      p.onStar()
      setView(2)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBuilding(false)
    }
  }

  const pending: PendingLine | null = pair && live ? { ...pair, state: run.busy || !diag ? 'run' : diag.key === 'pass' ? 'ok' : 'bad', label: diag && diag.key !== 'pass' ? diag.badLabel : null } : null
  const sql = starSql(links)
  // the panel goes once every link of the pass is made: the drawing gets the whole card (a removed link brings it back)
  const panelOn = live && !(pass === 1 ? canBuildStar(links) : modelLinked(links))
  const made = linksOfPass(links, pass)
  const pass1 = linksOfPass(links, 1)
  const pass2 = linksOfPass(links, 2)

  return (
    <div className="lk" data-testid="build-model" onKeyDown={(e) => e.key === 'Escape' && (setMany(EMPTY), setOne(EMPTY))}>
      <p className="build-lead">{legacy ? 'The cleaned tables are linked into a star: sales in the middle, customers and products around them.' : pass === 1 ? LINK_TEXT.lead1 : LINK_TEXT.lead2}</p>
      {error && <div className="build-error" role="alert">{error}</div>}
      {legacy && (
        <div className="lk-bridge" data-testid="model-old">
          {LINK_TEXT.oldStar}{' '}
          <button className="btn" onClick={p.onTryIt} data-testid="model-try-it">
            <RotateCcw size={14} /> Try it
          </button>
        </div>
      )}
      {star && (
        <div className="lk-tabs" role="tablist" aria-label="Pass">
          <button role="tab" aria-selected={view === 1} className={`build-tab${view === 1 ? ' is-on' : ''}`} onClick={() => setView(1)}>
            Clean tables
          </button>
          <button role="tab" aria-selected={view === 2} className={`build-tab${view === 2 ? ' is-on' : ''}`} onClick={() => setView(2)}>
            Star
          </button>
        </div>
      )}
      {star && pass === 2 && !modelLinked(links) && <div className="lk-bridge" data-testid="link-bridge">{LINK_TEXT.bridge}</div>}

      {!ready || Object.keys(tables).length < PASS_TABLES[pass].length ? (
        <div className="build-muted">
          <Loader2 size={14} className="animate-spin" style={{ display: 'inline', verticalAlign: '-2px' }} /> Loading the tables…
        </div>
      ) : (
        <div className={`lk-grid${panelOn ? '' : ' is-wide'}`}>
          <div className="lk-board">
            {live && !pair && <p className="lk-caption">{pass === 2 ? LINK_TEXT.idleStar : LINK_TEXT.idle}</p>}
            <LinkCanvas pass={pass} tables={tables} links={legacy ? legacyLinks() : links} labels={legacy ? {} : labels} pending={pending} picked={{ many: filled(many) ? many : null, one: filled(one) ? one : null }} onPick={live ? pick : undefined} />
            {!legacy && (
              <ul className="lk-links" aria-label="Links" data-testid="link-list">
                {made.map((l) => (
                  <li key={l.id} className="lk-link" data-testid={`link-item-${l.id}`}>
                    <span className="lk-link-id">{l.id}</span>
                    <span className="lk-link-text">
                      {slotName(l.many)} → {slotName(l.one)}
                    </span>
                    <span className="lk-link-num">{labels[l.id] ?? ''}</span>
                    <button className="build-x" aria-label={`Remove link ${l.id}`} title="Remove this link" onClick={() => (pass === 1 && star ? setConfirm(l.id) : remove(l.id))}>
                      <X size={13} />
                    </button>
                    {confirm === l.id && (
                      <div className="lk-confirm" role="alert">
                        {LINK_TEXT.removeStar}
                        <button className="btn" onClick={() => remove(l.id)}>Remove</button>
                        <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!legacy && pass === 1 && !star && (
              <div className="lk-star" data-testid="link-star">
                {sql && canBuildStar(links) ? (
                  <>
                    <b>Build the star</b>
                    <span className="build-muted">Lab writes the SQL from your three links. Read it, then run it.</span>
                    <pre className="pl-code" data-testid="link-star-sql">{sql}</pre>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn btn-primary" disabled={building || !ready} onClick={() => void build()} data-testid="link-build">
                        {building ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />} Build the star
                      </button>
                      <button className="btn" onClick={() => addTab(sql, 'build the star')}>
                        <ExternalLink size={14} /> Open in a tab
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="build-muted" data-testid="link-star-lock">{LINK_TEXT.starLock(pass1.length)}</span>
                )}
              </div>
            )}
            {!legacy && pass === 1 && star && <span className="build-ok"><Check size={14} /> The star is built from these links. It is on the Star tab.</span>}

            {(legacy || pass === 2) && (
              <div className="space-y-3">
                {(legacy || modelLinked(links) || done) && nums && (
                  <div className="lk-nums" data-testid="model-nums">
                    <span data-testid="model-fact">{fmtN(nums.fact)} sales</span>
                    <span data-testid="model-customers">{fmtN(nums.customers)} customers ({fmtN(nums.customersSold)} have sales)</span>
                    <span data-testid="model-products">{fmtN(nums.products)} products ({fmtN(nums.productsSold)} have sales)</span>
                    <span data-testid="model-no-customer">{fmtN(nums.noCustomer)} sales without a customer</span>
                    <span data-testid="model-no-product">{fmtN(nums.noProduct)} sales without a product</span>
                  </div>
                )}
                {!legacy && !modelLinked(links) && !done && <span className="build-muted">Links made: {pass2.length} of 2.</span>}
                {done ? (
                  <span className="build-ok">
                    <Check size={14} /> Model done
                  </span>
                ) : (
                  !legacy && (
                    <button className="btn btn-primary" disabled={!modelLinked(links)} onClick={p.onContinue} data-testid="model-continue">
                      Continue <ArrowRight size={14} />
                    </button>
                  )
                )}
              </div>
            )}
          </div>
          {panelOn && <LinkPanel pass={pass} tables={tables} many={many} one={one} onSlot={onSlot} onSwap={doSwap} run={run} diag={diag} peek={peek} onCreate={create} onFix={fix} />}
        </div>
      )}
    </div>
  )
}

/** The first version's star drawn read-only: the two id links, as they are in it. */
function legacyLinks(): Link[] {
  return [
    { id: 'F1', many: { table: 'gold_fact_sales', column: 'customer_id' }, one: { table: 'gold_dim_customer', column: 'customer_id' } },
    { id: 'F2', many: { table: 'gold_fact_sales', column: 'product_id' }, one: { table: 'gold_dim_product', column: 'product_id' } },
  ]
}
