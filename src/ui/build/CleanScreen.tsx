// Step 2 of the build page: Clean (spec section 3). Four cards open one after the other (W watched, P1 products by
// buttons, P2 sales by a blank, P3 customers by a button with settings); the panel under them shows any source with its
// toolbar and applied steps, so the learner chooses the tool and the check judges the table.
import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Lightbulb, Loader2, Lock, XCircle } from 'lucide-react'
import { CLEAN_COLUMNS, activeCard, addSpec, cleanDone, dedupSql, passedInOrder, type BuildWork, type StepSpec } from '../../core/buildSteps'
import { checkBlank } from '../../core/pipeline'
import { CLEAN_CARDS, GIVEN_NOTE, P1_SKUS, P3_NOTE, sourceById, type BuildSourceId, type CleanCard, type CleanId } from '../../data/build/kaiyoSales'
import { LINK_TEXT } from '../../data/build/linkData'
import { checkP1, checkP2, checkP3, checkP7, type CheckReport } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { StepsPanel } from './StepsPanel'
import { WatchRegions } from './WatchRegions'
import './clean.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
  /** sets a source's steps and rebuilds its clean table; resolves with an error message or null */
  rebuild: (source: BuildSourceId, specs: StepSpec[]) => Promise<string | null>
  rev: number
  /** the source to show first (the Model step sent the learner here) */
  focus?: BuildSourceId
  onBackToModel: () => void
}

export function CleanScreen({ work, setWork, ready, rebuild, rev, focus, onBackToModel }: Props) {
  const active = activeCard(work.passed)
  const [source, setSource] = useState<BuildSourceId>(() => focus ?? (active ? CLEAN_CARDS.find((c) => c.id === active)!.source : 'sales'))
  const [hints, setHints] = useState<Partial<Record<CleanId, number>>>({})
  const [report, setReport] = useState<Partial<Record<CleanId, CheckReport>>>({})
  const connected = work.connected.length === 4

  const pass = (id: CleanId) => {
    setWork((w) => ({ ...w, passed: passedInOrder([...w.passed, id]) }))
    const i = CLEAN_CARDS.findIndex((c) => c.id === id)
    const nextCard = CLEAN_CARDS[i + 1]
    if (nextCard) setSource(nextCard.source)
  }

  if (!connected) return <p className="build-muted">Connect the four sources first.</p>
  return (
    <div className="space-y-4" data-testid="build-clean">
      <details className="build-given">
        <summary>{GIVEN_NOTE}</summary>
        <p className="build-muted" style={{ margin: '6px 0 0' }}>It is the first step in the list of sales, marked “given”. Pick the sales tab below and open its SQL.</p>
      </details>
      <ol className="build-cards">
        {CLEAN_CARDS.map((c) => {
          const passed = work.passed.includes(c.id)
          const open = active === c.id
          const level = hints[c.id] ?? 0
          const last = report[c.id]
          return (
            <li key={c.id} className={`build-clean-card${open ? ' is-open' : ''}${passed ? ' is-passed' : ''}`} data-testid={`clean-card-${c.id}`}>
              <div className="build-clean-head">
                <span className="build-chip-n">{passed ? <Check size={13} /> : open ? c.id : <Lock size={12} />}</span>
                <div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="build-muted">{sourceById(c.source).label}</div>
                </div>
              </div>
              {open && c.id === 'W' && (
                <WatchRegions
                  ready={ready}
                  onFix={(specs) => {
                    setSource('regions')
                    return rebuild('regions', specs)
                  }}
                  onDone={() => pass('W')}
                />
              )}
              {open && c.id !== 'W' && (
                <>
                  <p style={{ margin: 0 }}>{c.text}</p>
                  {c.id === 'P1' && (
                    <div className="build-skus" aria-label="The six SKUs as they are in the file">
                      {P1_SKUS.map((s) => (
                        <code key={s}>{s}</code>
                      ))}
                    </div>
                  )}
                  {c.id === 'P2' && <SalesBlank work={work} setWork={setWork} ready={ready} rebuild={rebuild} onReport={(r) => setReport((x) => ({ ...x, P2: r }))} />}
                  {c.id === 'P3' && <p className="build-muted" style={{ margin: 0 }}>{P3_NOTE}</p>}
                  <Hints card={c} level={level} onMore={() => setHints((h) => ({ ...h, [c.id]: level + 1 }))} />
                  {c.id !== 'P2' && <CheckBar card={c} work={work} ready={ready} report={last} onReport={(r) => setReport((x) => ({ ...x, [c.id]: r }))} />}
                  {last && <Verdict report={last} />}
                  {last?.ok && (
                    <button className="btn btn-primary" onClick={() => pass(c.id)} data-testid={`clean-pass-${c.id}`}>
                      {c.id === 'P3' ? 'Finish cleaning' : 'Next problem'} <ArrowRight size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
      {cleanDone(work.passed) && (
        <div className="build-quick" data-testid="clean-done">
          <b>Clean is done.</b> Every source is as it should be: regions 16 rows, products 47, sales 3,000, customers 144. The numbers from your Quick look will not come back the same.
        </div>
      )}
      {work.p7 && cleanDone(work.passed) && (
        <P7Card work={work} setWork={setWork} ready={ready} onFocus={() => setSource('regions')} onBack={onBackToModel} />
      )}
      <StepsPanel source={source} work={work} ready={ready} rev={rev} onChange={rebuild} onSource={setSource} />
    </div>
  )
}

function Hints({ card, level, onMore }: { card: CleanCard; level: number; onMore: () => void }) {
  if (card.hints.length === 0) return null
  return (
    <div>
      {level > 0 && (
        <ul className="m-0 pl-5" style={{ fontSize: 13 }} data-testid="clean-hints">
          {card.hints.slice(0, level).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {level < card.hints.length && (
        <button className="btn" style={{ marginTop: level > 0 ? 6 : 0 }} onClick={onMore}>
          <Lightbulb size={14} /> {level === 0 ? 'Hint' : 'Another hint'}
        </button>
      )}
    </div>
  )
}

/** The check of P1 and P3: runs the queries on the table as it is now. */
function CheckBar({ card, work, ready, report, onReport }: { card: CleanCard; work: BuildWork; ready: boolean; report?: CheckReport; onReport: (r: CheckReport) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      onReport(card.id === 'P1' ? await checkP1(enginePort, work.steps.products) : await checkP3(enginePort, work.steps.customers))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()} data-testid={`clean-check-${card.id}`}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Check
      </button>
      {!report && <span className="build-muted">Use the buttons under {sourceById(card.source).label} below, then Check.</span>}
      {error && <span className="build-error">{error}</span>}
    </div>
  )
}

function Verdict({ report }: { report: CheckReport }) {
  return (
    <div className="build-verdict" data-testid="clean-verdict">
      <div className="build-chips">
        {report.chips.map((c) => (
          <span key={c.label} className={`build-chipx ${c.ok ? 'is-ok' : 'is-bad'}`}>
            {c.ok ? <Check size={12} /> : <XCircle size={12} />} {c.label}: <b>{typeof c.value === 'number' ? c.value.toLocaleString('en-US') : c.value}</b>
          </span>
        ))}
      </div>
      <div className={report.ok ? 'build-ok' : 'build-error'} role={report.ok ? 'status' : 'alert'} data-testid="clean-line">
        {report.ok ? 'Passed: the table matches the expected one.' : report.line}
      </div>
    </div>
  )
}

/** P2: the SQL of the step with one blank, Apply and check. */
function SalesBlank({ work, setWork, ready, rebuild, onReport }: { work: BuildWork; setWork: Props['setWork']; ready: boolean; rebuild: Props['rebuild']; onReport: (r: CheckReport) => void }) {
  const { before, after } = useMemo(() => {
    const [b, a] = dedupSql(CLEAN_COLUMNS.sales, '\u0000').split('\u0000')
    return { before: b, after: a }
  }, [])
  const [busy, setBusy] = useState(false)
  const blank = work.blank
  const bad = blank.trim() ? checkBlank(blank) : null

  const apply = async () => {
    const refused = checkBlank(blank)
    if (refused) {
      onReport({ ok: false, line: refused, chips: [] })
      return
    }
    setBusy(true)
    try {
      const err = await rebuild('sales', addSpec(work.steps.sales, 'dedup', { blank: blank.trim() }))
      const r = await checkP2(enginePort, blank.trim(), err)
      onReport(r)
    } catch (e) {
      onReport({ ok: false, line: String(e instanceof Error ? e.message : e), chips: [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <pre className="pl-code" data-testid="clean-p2-sql">
        {before}
        <input
          className="pl-blank"
          aria-label="The blank: what makes two rows the same sale"
          spellCheck={false}
          autoComplete="off"
          value={blank}
          placeholder="____"
          size={Math.max(8, Math.min(60, blank.length + 1))}
          onChange={(e) => {
            const v = e.target.value.replace(/\r?\n/g, ' ')
            setWork((w) => ({ ...w, blank: v }))
          }}
          onKeyDown={(e) => e.key === 'Enter' && ready && !busy && void apply()}
        />
        {after}
      </pre>
      {bad && <div className="build-error">{bad}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void apply()} data-testid="clean-apply-P2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Apply and check
        </button>
        <span className="build-muted">The step is added to the sales list; the blank can be changed and applied again.</span>
      </div>
    </div>
  )
}

/** P7, asked for by the Model step: region_id as a number, so customers and regions can be linked. */
function P7Card({ work, setWork, ready, onFocus, onBack }: { work: BuildWork; setWork: Props['setWork']; ready: boolean; onFocus: () => void; onBack: () => void }) {
  const [level, setLevel] = useState(0)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [busy, setBusy] = useState(false)
  const passed = work.p7 === 'done'
  const run = async () => {
    setBusy(true)
    try {
      const r = await checkP7(enginePort)
      setReport(r)
      if (r.ok) setWork((w) => ({ ...w, p7: 'done' }))
    } catch (e) {
      setReport({ ok: false, line: String(e instanceof Error ? e.message : e), chips: [] })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`build-clean-card is-open${passed ? ' is-passed' : ''}`} data-testid="clean-card-P7">
      <div className="build-clean-head">
        <span className="build-chip-n">{passed ? <Check size={13} /> : 'P7'}</span>
        <div>
          <div className="font-semibold">{LINK_TEXT.p7.title}</div>
          <div className="build-muted">regions.csv · asked for by the Model step</div>
        </div>
      </div>
      <p style={{ margin: 0 }}>{LINK_TEXT.p7.text}</p>
      <div>
        {level > 0 && (
          <ul className="m-0 pl-5" style={{ fontSize: 13 }} data-testid="clean-hints">
            {LINK_TEXT.p7.hints.slice(0, level).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {level < LINK_TEXT.p7.hints.length && (
          <button className="btn" style={{ marginTop: level > 0 ? 6 : 0 }} onClick={() => setLevel(level + 1)}>
            <Lightbulb size={14} /> {level === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={onFocus}>Show regions.csv below</button>
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()} data-testid="clean-check-P7">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Check
        </button>
      </div>
      {report && <Verdict report={report} />}
      {(passed || report?.ok) && (
        <button className="btn btn-primary" onClick={onBack} data-testid="clean-back-model">
          Back to Model <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}
