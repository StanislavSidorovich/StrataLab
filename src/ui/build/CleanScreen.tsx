// Step 2 of the build page: Clean (spec section 3). Four cards open one after the other (W watched, P1 products by
// buttons, P2 sales by a blank, P3 customers by a button with settings); the panel under them shows any source with its
// toolbar and applied steps, so the learner chooses the tool and the check judges the table.
import { FABRIC_CLEAN } from '../../data/build/fabricNotes'
import './fabric.css'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, CheckCircle2, Lightbulb, Loader2, X, XCircle } from 'lucide-react'
import { DEDUP_KEY } from '../../core/buildSolved'
import { CLEAN_COLUMNS, SOURCE_IDS, activeCard, addSpec, checkFormat, cleanDone, datesSql, hasFullGiven, passCard, typedColumn, type BuildWork, type StepSpec, dedupSql } from '../../core/buildSteps'
import { checkBlank } from '../../core/pipeline'
import { CLEAN_CARDS, GIVEN_NOTE, P1_SKUS, P3_NOTE, sourceById, type BuildSourceId, type CleanCard, type CleanId } from '../../data/build/kaiyoSales'
import { LINK_TEXT } from '../../data/build/linkData'
import { checkP1, checkP2, checkP3, checkP4, checkP5, checkP6, checkP7, oddValues, salesErrors, type OddValues, type CheckReport, type ErrorColumn } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { AffectedRows } from './AffectedRows'
import { fmtN } from './BuildTable'
import { StepsPanel } from './StepsPanel'
import { WatchRegions } from './WatchRegions'
import { FillButton } from './DemoContext'
import './clean.css'
import './cleanCanvas.css'
import './cleanProfile.css'
import './cleanAction.css'
import './errors.css'
import './cleanPolish.css'

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
  /** goes to the next step of the build page; undefined while Clean is not done */
  onNext?: () => void
}

/** a check report; the P5 one also carries the dates it could not read */
type Report = CheckReport & { facts?: { samples?: string[] } }
/** failed Checks of a card after which «Show the fix» is offered */
export const FIX_AFTER = 2
export const P5_FIX_FORMAT = '%d/%m/%Y'
interface ExtraChip {
  id: string
  label: string
  done: boolean
  source: BuildSourceId
}

export function CleanScreen({ work, setWork, ready, rebuild, rev, focus, onBackToModel, onNext }: Props) {
  const active = activeCard(work.passed)
  const [source, setSource] = useState<BuildSourceId>(() => focus ?? (active ? CLEAN_CARDS.find((c) => c.id === active)!.source : 'sales'))
  // the Model step sends the learner to a column to fix: P4 is customer_name in the sales, P7 is region_id in regions.csv
  const [focusColumn] = useState<{ source: BuildSourceId; column: string } | undefined>(() => (focus === 'sales' ? { source: 'sales', column: 'customer_name' } : focus === 'regions' ? { source: 'regions', column: 'region_id' } : undefined))
  const [hints, setHints] = useState<Partial<Record<CleanId, number>>>({})
  const [hintOpen, setHintOpen] = useState(false)
  const [report, setReport] = useState<Partial<Record<CleanId, Report>>>({})
  /** failed Checks per card (P2 and P5 offer the fix after FIX_AFTER) */
  const [fails, setFails] = useState<Partial<Record<CleanId, number>>>({})
  /** a card above the canvas (P4, P7, P8) the learner opened again from its chip */
  const [openExtra, setOpenExtra] = useState<string | null>(null)
  /** a verdict panel the learner closed (until the next Check) */
  const [closed, setClosed] = useState<Partial<Record<CleanId, boolean>>>({})
  // a card that has passed can be opened again from its chip (to read it, change the step, check again)
  const [again, setAgain] = useState<CleanId | null>(null)
  /** Advanced: SQL opened or closed by the learner; null = as the card needs it */
  const [adv, setAdv] = useState<boolean | null>(null)
  const connected = work.connected.length === 4

  // [Error] cells in the sales, for the P5 and P6 cards (spec 3.6)
  const [errs, setErrs] = useState<Record<ErrorColumn, number> | null>(null)
  useEffect(() => {
    if (!ready || !work.connected.includes('sales')) return
    let alive = true
    void salesErrors(enginePort)
      .then((e) => alive && setErrs(e))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [ready, work.connected, rev])

  const cur: CleanId | null = again ?? active
  const card = cur ? CLEAN_CARDS.find((c) => c.id === cur)! : null
  useEffect(() => {
    setAdv(null)
    setHintOpen(false)
  }, [cur])

  const pass = (id: CleanId) => {
    setWork((w) => ({ ...w, passed: passCard(w, id) }))
    setAgain(null)
    const i = CLEAN_CARDS.findIndex((c) => c.id === id)
    const nextCard = CLEAN_CARDS[i + 1]
    if (nextCard) setSource(nextCard.source)
  }
  const reopen = (id: CleanId) => {
    if (again === id) {
      setAgain(null)
      return
    }
    setAgain(id)
    setSource(CLEAN_CARDS.find((c) => c.id === id)!.source)
  }
  const onReport = (id: CleanId) => (r: CheckReport) => {
    if (!r.ok) setFails((x) => ({ ...x, [id]: (x[id] ?? 0) + 1 }))
    setReport((x) => ({ ...x, [id]: r }))
    setClosed((x) => ({ ...x, [id]: false }))
  }

  const problems = CLEAN_CARDS.filter((c) => c.id !== 'W')
  const total = problems.length
  const left = problems.filter((c) => !work.passed.includes(c.id)).length
  /** open problems per source: the dot in the queries pane */
  const openCount = SOURCE_IDS.reduce(
    (acc, s) => ({ ...acc, [s]: problems.filter((c) => c.source === s && !work.passed.includes(c.id)).length + (s === 'sales' && work.p4 === 'asked' ? 1 : 0) + (s === 'regions' && work.p7 === 'asked' ? 1 : 0) }),
    {} as Record<BuildSourceId, number>,
  )

  // Advanced: SQL, over the grid, for the cards that are a blank (P2 the sale's key, P5 the date format)
  const showBlank = source === 'sales' && (cur === 'P2' || work.passed.includes('P2'))
  const showDates = source === 'sales' && (cur === 'P5' || work.passed.includes('P5'))
  const hasSaleDateStep = work.steps.sales.some((s) => typedColumn(s) === 'sale_date')
  // a step that has passed keeps its SQL behind «Show SQL», so the next problem is not read through the last one's code
  const foldDone = (id: CleanId, body: ReactNode) =>
    work.passed.includes(id) && cur !== id ? (
      <details className="cc-sqlfold" data-testid={`clean-sqlfold-${id}`}>
        <summary>Show SQL of {id} (solved)</summary>
        {body}
      </details>
    ) : (
      body
    )
  const advancedBody =
    showBlank || showDates ? (
      <div className="space-y-3">
        {showBlank && foldDone('P2', <SalesBlank work={work} setWork={setWork} ready={ready} rebuild={rebuild} fails={fails.P2 ?? 0} onReport={onReport('P2')} />)}
        {showDates && foldDone('P5', <DateStep work={work} setWork={setWork} ready={ready} rebuild={rebuild} errs={errs} fails={fails.P5 ?? 0} report={report.P5} onReport={onReport('P5')} />)}
      </div>
    ) : undefined
  // the cards above the canvas (P4, P7, P8) are shown in full only while they matter: P8 until it is read, P4 and P7 while their
  // source is on the grid, or when opened again from a chip; otherwise they are a chip, so nothing stale hangs above the canvas
  const extras: ExtraChip[] = [
    { id: 'P8', label: 'P8 · Not every odd value is an error', done: work.p8, source: 'sales' },
    ...(work.p4 ? [{ id: 'P4', label: 'P4 · Names in the sales', done: work.p4 === 'done', source: 'sales' as BuildSourceId }] : []),
    ...(work.p7 ? [{ id: 'P7', label: 'P7 · Region ids as numbers', done: work.p7 === 'done', source: 'regions' as BuildSourceId }] : []),
  ]
  const shown = (id: string) => {
    const c = extras.find((x) => x.id === id)
    if (!c) return false
    return openExtra === id || (id === 'P8' ? !c.done : source === c.source)
  }
  const advancedOpen = adv ?? (cur === 'P2' || (cur === 'P5' && hasSaleDateStep))

  if (!connected) return <p className="build-muted">Connect the four sources first.</p>
  const passed = cur ? work.passed.includes(cur) : false
  const last = cur ? report[cur] : undefined
  const level = cur ? hints[cur] ?? 0 : 0
  /** the current problem has just passed its Check: the bar says so and offers the way on */
  const justPassed = !!card && !!last?.ok && !passed
  const finishes = !!card && problems.every((c) => c.id === card.id || work.passed.includes(c.id))
  return (
    <div className="cc-root" data-testid="build-clean">
      <details className="cc-notes" data-testid="clean-notes">
        <summary>Notes: this list in Power BI and Fabric · what Lab already typed for you</summary>
        <p className="build-muted build-fabric" data-testid="fabric-clean">{FABRIC_CLEAN}</p>
        <p className="build-muted" style={{ margin: '0 0 4px' }}>{GIVEN_NOTE} It is the first step in the list of sales, marked “given”. Pick sales in the Queries list and look at Applied steps.</p>
      </details>
      <section className={`cc-task${justPassed ? ' is-pass' : ''}`} data-testid="clean-task" data-card={cur ?? 'done'}>
        <div className="cc-task-line">
          {CLEAN_CARDS.filter((c) => c.id !== 'W' && work.passed.includes(c.id)).map((c) => (
            <button key={c.id} className={`cc-done-chip${again === c.id ? ' is-on' : ''}`} aria-pressed={again === c.id} title={`${c.title}: open again`} onClick={() => reopen(c.id)} data-testid={`clean-reopen-${c.id}`}>
              <Check size={11} /> {c.id}
            </button>
          ))}
          {card ? (
            <>
              <span className="build-chip-n cc-id">{card.id}</span>
              <span className="cc-task-title">
                <b>{card.title}</b>
                <span className="build-muted"> · {sourceById(card.source).label}</span>
              </span>
            </>
          ) : (
            <span className="cc-task-title"><b>All problems solved</b></span>
          )}
          {justPassed && (
            <span className="cc-passed" role="status" data-testid="clean-passed">
              <CheckCircle2 size={14} /> Passed
            </span>
          )}
          <span className="cc-spacer" />
          <span className="build-left" data-testid="clean-left">{left === 0 ? 'All problems solved' : `${left} of ${total} problems left`}</span>
          {card && card.id !== 'W' && card.id !== 'P2' && <CheckButton card={card} work={work} ready={ready} quiet={justPassed} onReport={onReport(card.id)} />}
          {card && last?.ok && !passed && (
            <button className="btn btn-primary" onClick={() => pass(card.id)} data-testid={`clean-pass-${card.id}`}>
              {finishes ? 'Finish cleaning' : 'Next problem'} <ArrowRight size={14} />
            </button>
          )}
          {!card && onNext && (
            <button className="btn btn-primary" onClick={onNext} data-testid="clean-next-step">
              Next step: Model <ArrowRight size={14} />
            </button>
          )}
          {card && card.hints.length > 0 && (
            <button
              className="btn cc-hint"
              aria-expanded={hintOpen}
              title="If you're stuck: a hint, one level at a time"
              data-testid="clean-hint-toggle"
              onClick={() => {
                if (!hintOpen && level === 0) setHints((h) => ({ ...h, [card.id]: 1 }))
                setHintOpen((v) => !v)
              }}
            >
              <Lightbulb size={14} /> Hint
            </button>
          )}
          {card && <FillButton unit={{ step: 'clean', card: card.id }} hidden={passed} />}
        </div>
        {card && card.id !== 'W' && <ActionText action={card.action} text={card.text} />}
        {card && card.id === 'W' && <p className="build-muted" style={{ margin: 0 }}>{card.text}</p>}
        {card?.id === 'P1' && (
          <div className="build-skus" aria-label="The six SKUs as they are in the file">
            {P1_SKUS.map((s) => (
              <code key={s}>{s}</code>
            ))}
          </div>
        )}
        {card?.id === 'P3' && <p className="build-muted" style={{ margin: 0 }}>{P3_NOTE}</p>}
        {card && (card.id === 'P2' || card.id === 'P3') && (
          <details className="cc-more">
            <summary>The rows this problem is about</summary>
            <AffectedRows card={card.id} ready={ready} rev={rev} />
          </details>
        )}
        {card?.id === 'P6' && <NumberNote work={work} errs={errs} />}
        {card && hintOpen && <Hints card={card} level={Math.max(level, 1)} onMore={() => setHints((h) => ({ ...h, [card.id]: Math.max(level, 1) + 1 }))} />}
      </section>
      {card && last && !closed[card.id] && (
        <div className="cc-verdict">
          <Verdict report={last} />
          <button className="build-x" aria-label="Close the result" title="Close" onClick={() => setClosed((x) => ({ ...x, [card.id]: true }))}>
            <X size={13} />
          </button>
        </div>
      )}
      {cleanDone(work.passed) && (
        <div className="build-quick" data-testid="clean-done">
          <b>Clean is done.</b> Regions 16 rows, products 47, sales 3,000, customers 144, and the sales have dates and numbers.{' '}
          {!hasFullGiven(work) && work.p4 !== 'done' && 'The names of the stores in the sales are still as the distributors typed them: the Model step will tell whether they link. '}
          The numbers from your Quick look will not come back the same.
        </div>
      )}
      {cleanDone(work.passed) && (
        <ExtraChips
          chips={extras.filter((c) => !shown(c.id))}
          onOpen={(c) => {
            setOpenExtra(c.id)
            setSource(c.source)
          }}
        />
      )}
      {cleanDone(work.passed) && shown('P8') && <OddCard work={work} setWork={setWork} ready={ready} rev={rev} />}
      {work.p4 && cleanDone(work.passed) && shown('P4') && (
        <ExtraCard id="P4" work={work} setWork={setWork} ready={ready} onFocus={() => setSource('sales')} onBack={onBackToModel} text={LINK_TEXT.p4} where="sales · asked for by the Model step" check={() => checkP4(enginePort, work.steps.sales)} />
      )}
      {work.p7 && cleanDone(work.passed) && shown('P7') && (
        <ExtraCard id="P7" work={work} setWork={setWork} ready={ready} onFocus={() => setSource('regions')} onBack={onBackToModel} text={LINK_TEXT.p7} where="regions.csv · asked for by the Model step" check={() => checkP7(enginePort)} />
      )}
      <StepsPanel
        source={source}
        work={work}
        ready={ready}
        rev={rev}
        onChange={rebuild}
        onSource={setSource}
        focusColumn={focusColumn}
        openCount={openCount}
        centre={
          cur === 'W' ? (
            <WatchRegions
              ready={ready}
              onFix={(specs) => {
                setSource('regions')
                return rebuild('regions', specs)
              }}
              onDone={() => pass('W')}
            />
          ) : undefined
        }
        advanced={advancedBody}
        advancedOpen={advancedOpen}
        onAdvanced={() => setAdv(!advancedOpen)}
      />
    </div>
  )
}

/** The cards above the canvas that are not the work of the moment: one chip each; a click opens the card and shows its source. */
function ExtraChips({ chips, onOpen }: { chips: ExtraChip[]; onOpen: (c: ExtraChip) => void }) {
  if (chips.length === 0) return null
  return (
    <div className="cc-chiprow" data-testid="clean-extra-chips">
      {chips.map((c) => (
        <button key={c.id} className={`cc-done-chip${c.done ? '' : ' is-open-problem'}`} title={`${c.label}: open the card`} onClick={() => onOpen(c)} data-testid={`clean-extra-${c.id}`}>
          {c.done ? <Check size={11} /> : null} {c.label}
          {c.done ? '' : ' · open'}
        </button>
      ))}
    </div>
  )
}

/** The first line says what to press (a `name` in backticks is a button label or a column), the second what is wrong. */
function ActionText({ action, text }: { action: string; text: string }) {
  return (
    <div className="build-action">
      <p className="build-action-do" data-testid="clean-action">
        {action.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
      </p>
      <p className="build-action-why">{text}</p>
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
          <Lightbulb size={14} /> {level === 0 ? "If you're stuck" : 'Another hint'}
        </button>
      )}
    </div>
  )
}

/** The Check button of the task bar (P1, P3, P5, P6): runs the queries on the table as it is now. */
function CheckButton({ card, work, ready, quiet, onReport }: { card: CleanCard; work: BuildWork; ready: boolean; quiet?: boolean; onReport: (r: CheckReport) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      onReport(
        card.id === 'P1' ? await checkP1(enginePort, work.steps.products) : card.id === 'P5' ? await checkP5(enginePort, work.steps.sales) : card.id === 'P6' ? await checkP6(enginePort) : await checkP3(enginePort, work.steps.customers),
      )
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {error && <span className="build-error">{error}</span>}
      <button className={`btn${quiet ? '' : ' btn-primary'}`} disabled={!ready || busy} onClick={() => void run()} data-testid={`clean-check-${card.id}`}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Check
      </button>
    </>
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
function SalesBlank({ work, setWork, ready, rebuild, fails, onReport }: { work: BuildWork; setWork: Props['setWork']; ready: boolean; rebuild: Props['rebuild']; fails: number; onReport: (r: CheckReport) => void }) {
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
        {fails >= FIX_AFTER && !work.passed.includes('P2') && (
          <button className="btn" onClick={() => setWork((w) => ({ ...w, blank: DEDUP_KEY }))} data-testid="clean-fix-P2" title="Puts the answer into the blank; press Apply and check to run it">
            <Lightbulb size={14} /> Show the fix
          </button>
        )}
      </div>
    </div>
  )
}

/** The card the Model step asked for: P4 (names of the sales) or P7 (region ids as numbers). Same shape: text, hints, Check, back to Model. */
function ExtraCard({ id, work, setWork, ready, onFocus, onBack, text, where, check }: { id: 'P4' | 'P7'; work: BuildWork; setWork: Props['setWork']; ready: boolean; onFocus: () => void; onBack: () => void; text: { title: string; action: string; text: string; hints: readonly string[] }; where: string; check: () => Promise<CheckReport> }) {
  const [level, setLevel] = useState(0)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [busy, setBusy] = useState(false)
  const key = id === 'P4' ? 'p4' : 'p7'
  const passed = work[key] === 'done'
  const run = async () => {
    setBusy(true)
    try {
      const r = await check()
      setReport(r)
      if (r.ok) setWork((w) => ({ ...w, [key]: 'done' }))
    } catch (e) {
      setReport({ ok: false, line: String(e instanceof Error ? e.message : e), chips: [] })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`build-clean-card is-open${passed ? ' is-passed' : ''}`} data-testid={`clean-card-${id}`}>
      <div className="build-clean-head">
        <span className="build-chip-n">{passed ? <Check size={13} /> : id}</span>
        <div>
          <div className="font-semibold">{text.title}</div>
          <div className="build-muted">{where}</div>
        </div>
      </div>
      <ActionText action={text.action} text={text.text} />
      <div>
        {level > 0 && (
          <ul className="m-0 pl-5" style={{ fontSize: 13 }} data-testid="clean-hints">
            {text.hints.slice(0, level).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {level < text.hints.length && (
          <button className="btn" style={{ marginTop: level > 0 ? 6 : 0 }} onClick={() => setLevel(level + 1)}>
            <Lightbulb size={14} /> {level === 0 ? "If you're stuck" : 'Another hint'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={onFocus}>Show {id === 'P4' ? 'sales' : 'regions.csv'} below</button>
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()} data-testid={`clean-check-${id}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Check
        </button>
      </div>
      <FillButton unit={{ step: 'clean', card: id }} hidden={passed} />
      {report && <Verdict report={report} />}
      {(passed || report?.ok) && (
        <button className="btn btn-primary" onClick={onBack} data-testid="clean-back-model">
          Back to Model <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

/** P5: the learner presses Change type with Date; it fails on the dates not written as 2024-01-05; the card then offers the SQL with the format blank. */
function DateStep({ work, setWork, ready, rebuild, errs, fails, report, onReport }: { work: BuildWork; setWork: Props['setWork']; ready: boolean; rebuild: Props['rebuild']; errs: Record<ErrorColumn, number> | null; fails: number; report?: Report; onReport: (r: CheckReport) => void }) {
  const { before, after } = useMemo(() => {
    const [b, a] = datesSql(CLEAN_COLUMNS.sales, '\u0000').split('\u0000')
    return { before: b, after: a }
  }, [])
  const [busy, setBusy] = useState(false)
  const step = work.steps.sales.find((s) => typedColumn(s) === 'sale_date')
  const format = work.format
  const bad = format.trim() ? checkFormat(format) : null
  const n = errs?.sale_date ?? 0

  const apply = async () => {
    const refused = checkFormat(format)
    if (refused) {
      onReport({ ok: false, line: refused, chips: [] })
      return
    }
    setBusy(true)
    try {
      // a spelling added later (Refresh) stays when the format of this card is applied again
      const format2 = work.steps.sales.find((s) => s.kind === 'dates')?.params.format2
      const params = { format: format.trim(), ...(format2 ? { format2 } : {}) }
      const err = await rebuild('sales', addSpec(work.steps.sales, 'dates', params))
      onReport(await checkP5(enginePort, addSpec(work.steps.sales, 'dates', params)))
      if (err) onReport({ ok: false, line: err, chips: [] })
    } catch (e) {
      onReport({ ok: false, line: String(e instanceof Error ? e.message : e), chips: [] })
    } finally {
      setBusy(false)
    }
  }

  if (!step) return <p className="build-muted" style={{ margin: 0 }} data-testid="clean-p5-wait">Click the sale_date header, then Change type → Date in the ribbon.</p>
  return (
    <div className="build-fixbox">
      {step.kind === 'type' && n > 0 && (
        <div className="build-error" role="alert" data-testid="clean-p5-failed">
          The step is added, but it fails: <b>{fmtN(n)} rows [Error]</b> in the preview. A plain Change type reads 2024-01-05 and nothing else; the other dates are written another way. Show the error rows, look at them, then write the step yourself:
        </div>
      )}
      {step.kind === 'type' && n === 0 && <p className="build-muted" style={{ margin: 0 }}>The step is added and there are no errors. Check it.</p>}
      {(n > 0 || step.kind === 'dates') && (
        <>
          <pre className="pl-code" data-testid="clean-p5-sql">
            {before}
            <input
              className="pl-blank"
              aria-label="The blank: the format of the slash dates"
              spellCheck={false}
              autoComplete="off"
              value={format}
              placeholder="____"
              size={Math.max(8, Math.min(30, format.length + 1))}
              onChange={(e) => {
                const v = e.target.value.replace(/\r?\n/g, ' ')
                setWork((w) => ({ ...w, format: v }))
              }}
              onKeyDown={(e) => e.key === 'Enter' && ready && !busy && void apply()}
            />
            {after}
          </pre>
          {bad && <div className="build-error">{bad}</div>}
          {report && !report.ok && (report.facts?.samples?.length ?? 0) > 0 && (
            <ul className="cc-values" data-testid="clean-p5-values" aria-label="Dates that still fail">
              {report.facts!.samples!.slice(0, 2).map((v) => (
                <li key={v}>
                  <code>{v}</code> is read with <code>{format.trim() || '____'}</code>: still [Error]
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void apply()} data-testid="clean-apply-P5">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Apply and check
            </button>
            <span className="build-muted">The step takes the place of the failing one; the format can be changed and applied again.</span>
            {fails >= FIX_AFTER && !work.passed.includes('P5') && (
              <button className="btn" onClick={() => setWork((w) => ({ ...w, format: P5_FIX_FORMAT }))} data-testid="clean-fix-P5" title="Puts the answer into the blank; press Apply and check to run it">
                <Lightbulb size={14} /> Show the fix
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** P6: says what the preview says, in words, once Change type has been pressed on the numbers. */
function NumberNote({ work, errs }: { work: BuildWork; errs: Record<ErrorColumn, number> | null }) {
  const typed = (c: string) => work.steps.sales.some((s) => typedColumn(s) === c)
  if (!typed('revenue') && !typed('units')) return <p className="build-muted" style={{ margin: 0 }}>Click the revenue header, then Change type → Decimal; the same for units, Whole number.</p>
  const parts = [typed('revenue') && errs && errs.revenue > 0 && `${fmtN(errs.revenue)} revenues`, typed('units') && errs && errs.units > 0 && `${fmtN(errs.units)} units`].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <div className="build-error" role="alert" data-testid="clean-p6-failed">
      The step is added, but it fails: <b>{parts.join(' and ')} [Error]</b>. Show the error rows below and read one: how is the number written?
    </div>
  )
}

/** P8 (spec 3.0): an info card, nothing to fix. Odd values that are not errors: an empty revenue stays NULL, a return stays negative. */
function OddCard({ work, setWork, ready, rev }: { work: BuildWork; setWork: Props['setWork']; ready: boolean; rev: number }) {
  const [odd, setOdd] = useState<OddValues | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    void oddValues(enginePort)
      .then((o) => alive && setOdd(o))
      .catch(() => alive && setOdd(null))
    return () => {
      alive = false
    }
  }, [ready, rev])
  if (!odd) return null
  return (
    <div className={`build-clean-card is-open${work.p8 ? ' is-passed' : ''}`} data-testid="clean-card-P8">
      <div className="build-clean-head">
        <span className="build-chip-n">{work.p8 ? <Check size={13} /> : 'i'}</span>
        <div>
          <div className="font-semibold">Not every odd value is an error</div>
          <div className="build-muted">sales · nothing to fix</div>
        </div>
      </div>
      <ActionText action={work.p8 ? 'Nothing to change here.' : 'Read the three numbers, then press Got it.'} text="Not every odd value is an error: an empty revenue stays NULL, a return stays negative." />
      <p style={{ margin: 0 }} data-testid="clean-p8-numbers">
        {fmtN(odd.noRevenue)} sales have no revenue, {fmtN(odd.noUnits)} have no units, and {fmtN(odd.returns)} have negative units (returns).
      </p>
      {!work.p8 && (
        <div>
          <button className="btn btn-primary" onClick={() => setWork((w) => ({ ...w, p8: true }))} data-testid="clean-p8-read">
            <Check size={14} /> Got it
          </button>
        </div>
      )}
    </div>
  )
}
