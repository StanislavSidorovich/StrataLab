// The optional step Refresh (spec docs/build-kaiyo-sales-spec.md, 5.7): a new file arrives in the sales folder, the learner runs the
// whole chain again and reads the journal. Three moments: the source reads a fixed list and misses the file (switch it to a pattern),
// the run shows the known dirt cleaned by the learner's own steps, and a new date spelling fails the date step (fix it, run again).
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, FolderOpen, Lightbulb, Loader2, Play } from 'lucide-react'
import { checkR1, nextRunNumber, pushRun, runGreen, runLine, statusText, STAGE_LABEL, type JournalRow } from '../../core/buildRefresh'
import { CLEAN_COLUMNS, checkFormat, datesSql, type BuildWork } from '../../core/buildSteps'
import type { ResultData } from '../../core/check'
import { CONNECT_SQL, REFRESH_RETURN_URL, SALES_PATTERN, sourceById, type SalesMode } from '../../data/build/kaiyoSales'
import { JULY_FILE, REFRESH_TEXT } from '../../data/build/refreshData'
import { runRefresh, type RefreshModel } from '../../db/buildRefresh'
import { enginePort } from '../../db/pipelinePort'
import { R1_QUESTION } from '../../data/build/refreshData'
import { BuildTable, fmtN } from './BuildTable'
import { CountInQuaera } from './CountInQuaera'
import { FillButton, useDemo } from './DemoContext'
import './more.css'
import './refresh.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
  model: RefreshModel
  /** the tables changed: the page saves a checkpoint, refreshes the tree and measures the [Error] cells */
  onRan: () => Promise<void>
  /** a journal line was clicked: open the step it is about */
  onOpen: (row: JournalRow) => void
  onDashboard: () => void
}

/** The list of Connect, drawn short: the first and the last name, and how many there are between. */
function listSql(): string {
  const full = CONNECT_SQL(sourceById('sales'), Array.from({ length: 30 }, (_, i) => `build_kaiyo/sales/export_${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}.csv`), 'list')
  return full.replace(/\[('[^']+'), .*, ('[^']+')\]/s, '[$1, … 28 more names …, $2]')
}

export function RefreshScreen({ work, setWork, ready, model, onRan, onOpen, onDashboard }: Props) {
  const r = work.refresh
  const { demo } = useDemo()
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<JournalRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hints, setHints] = useState(0)
  const [line, setLine] = useState<string | null>(null)
  const [fixLine, setFixLine] = useState<string | null>(null)
  const [july, setJuly] = useState<ResultData | null>(null)

  useEffect(() => {
    if (!ready) return
    let alive = true
    void enginePort
      .query(`SELECT * FROM read_csv(['build_kaiyo/sales/${JULY_FILE}'], delim = ';', header = true, all_varchar = true) LIMIT 8`)
      .then((d) => alive && setJuly(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [ready])

  const journal = running ? live : r.journal
  const ranOnce = r.runs.length > 0
  const green = runGreen(r.journal) && !running
  const dateRowBad = r.journal.some((x) => x.status === 'error' && x.stage === 'clean' && x.source === 'sales' && x.note.startsWith('sale_date'))
  const dates = work.steps.sales.find((s) => s.kind === 'dates')
  const showFix = !!dates && r.mode === 'pattern' && (dateRowBad || !!dates.params.format2)

  const run = async (w: BuildWork) => {
    if (!ready || running) return
    setRunning(true)
    setLive([])
    setError(null)
    try {
      const out = await runRefresh(enginePort, w, model, (row) => setLive((l) => [...l, row]))
      setWork((x) => ({ ...x, refresh: { ...x.refresh, journal: out.rows, runs: pushRun(x.refresh.runs, out.summary) } }))
      await onRan()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setRunning(false)
    }
  }

  const setMode = (mode: SalesMode) => setWork((w) => ({ ...w, refresh: { ...w.refresh, mode } }))

  const [before, after] = useMemo(() => {
    const [b, a] = datesSql(CLEAN_COLUMNS.sales, dates?.params.format ?? '%d/%m/%Y', '\u0000').split('\u0000')
    return [b, a]
  }, [dates?.params.format])
  const bad = r.format2.trim() ? checkFormat(r.format2) : null

  const applyFix = async () => {
    const refused = checkFormat(r.format2)
    if (refused) return setFixLine(refused)
    setFixLine(null)
    const f = r.format2.trim()
    const steps = work.steps.sales.map((s) => (s.kind === 'dates' ? { ...s, params: { ...s.params, format2: f } } : s))
    const next: BuildWork = { ...work, steps: { ...work.steps, sales: steps }, refresh: { ...work.refresh, format2: f } }
    setWork((w) => ({ ...w, steps: { ...w.steps, sales: w.steps.sales.map((s) => (s.kind === 'dates' ? { ...s, params: { ...s.params, format2: f } } : s)) } }))
    await run(next)
  }

  const check = () => {
    const res = checkR1(r.answer)
    setLine(res.line)
    if (res.ok) setWork((w) => ({ ...w, refresh: { ...w.refresh, done: true } }))
  }

  return (
    <div className="space-y-4" data-testid="build-refresh">
      <p className="build-lead">{REFRESH_TEXT.lead}</p>

      <section className="rf-card" data-testid="refresh-folder">
        <header className="rf-head">
          <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
          <div className="font-semibold">sales/</div>
          <div className="build-muted">{REFRESH_TEXT.folder}</div>
        </header>
        <p className="build-muted" style={{ margin: 0 }}>
          export_2024-01.csv … export_2026-06.csv, and the new one: <code>{JULY_FILE}</code> <span className="rf-new">new</span>
        </p>
        <BuildTable data={july} caption={`${JULY_FILE}, first lines as they came`} />
      </section>

      <section className="rf-card" data-testid="refresh-setting">
        <div className="font-semibold">{REFRESH_TEXT.settingTitle}</div>
        <div className="rf-modes" role="radiogroup" aria-label="How the source finds its files">
          {(['list', 'pattern'] as const).map((m) => (
            <label key={m} className={`rf-mode${r.mode === m ? ' is-on' : ''}`}>
              <input type="radio" name="rf-mode" checked={r.mode === m} onChange={() => setMode(m)} data-testid={`refresh-mode-${m}`} />
              {m === 'list' ? REFRESH_TEXT.list : REFRESH_TEXT.pattern}
            </label>
          ))}
        </div>
        <pre className="pl-code" data-testid="refresh-source-sql">{r.mode === 'pattern' ? CONNECT_SQL(sourceById('sales'), [], 'pattern') : listSql()}</pre>
        <p className="build-muted" style={{ margin: 0 }}>{REFRESH_TEXT.tradeoff} <span className="rf-glob">Pattern: {SALES_PATTERN}</span></p>
        <FillButton unit={{ step: 'refresh', part: 'source' }} hidden={r.mode === 'pattern'} />
      </section>

      <section className="rf-card" data-testid="refresh-run">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={!ready || running} onClick={() => void run(work)} data-testid="refresh-run-button">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run{ranOnce || running ? ` ${running ? nextRunNumber(r.runs) : nextRunNumber(r.runs)}` : ''}
          </button>
          <span className="build-muted">{REFRESH_TEXT.runHint}</span>
        </div>
        {error && <div className="build-error" role="alert">{error}</div>}
        {journal.length > 0 && <Journal rows={journal} onOpen={onOpen} />}
        {!running && r.runs.length > 0 && (
          <div data-testid="refresh-history">
            <div className="build-muted">{REFRESH_TEXT.history}</div>
            <ul className="rf-history">
              {[...r.runs].reverse().map((x) => (
                <li key={x.n}>{runLine(x)}</li>
              ))}
            </ul>
          </div>
        )}
        {!running && r.journal.some((x) => x.status === 'error' && x.stage === 'clean') && (
          <div className="build-error" role="alert" data-testid="refresh-locked">
            A step failed, so the star and the tiles did not run, and the Dashboard stays locked until the sales have no [Error] cells.
          </div>
        )}
      </section>

      {showFix && (
        <section className="rf-card" data-testid="refresh-fix">
          <div className="font-semibold">{REFRESH_TEXT.fixTitle}</div>
          <p style={{ margin: 0 }}>{REFRESH_TEXT.fixText}</p>
          <pre className="pl-code" data-testid="refresh-fix-sql">
            {before}
            <input
              className="pl-blank"
              aria-label="The blank: the format of the dates written year first"
              spellCheck={false}
              autoComplete="off"
              value={r.format2}
              placeholder="____"
              size={Math.max(8, Math.min(30, r.format2.length + 1))}
              onChange={(e) => {
                const v = e.target.value.replace(/\r?\n/g, ' ')
                setWork((w) => ({ ...w, refresh: { ...w.refresh, format2: v } }))
              }}
              onKeyDown={(e) => e.key === 'Enter' && ready && !running && void applyFix()}
            />
            {after}
          </pre>
          {(bad || fixLine) && <div className="build-error">{bad ?? fixLine}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={!ready || running} onClick={() => void applyFix()} data-testid="refresh-fix-apply">
              <CheckCircle2 size={14} /> Apply and run
            </button>
            <FillButton unit={{ step: 'refresh', part: 'date' }} hidden={!!dates?.params.format2} />
            {hints < 2 && (
              <button className="btn" onClick={() => setHints(hints + 1)}>
                <Lightbulb size={14} /> {hints === 0 ? 'Hint' : 'Another hint'}
              </button>
            )}
          </div>
          {hints > 0 && (
            <ul className="m-0 pl-5" style={{ fontSize: 13 }}>
              {[REFRESH_TEXT.fixHint1, REFRESH_TEXT.fixHint2].slice(0, hints).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!dates && r.mode === 'pattern' && r.journal.some((x) => x.status === 'error' && x.stage === 'clean') && (
        <div className="build-error" role="alert" data-testid="refresh-no-dates">Your sales have no SQL date step to extend. Write one in Clean (the date card), then run again.</div>
      )}

      {(green || r.done) && (
        <section className={`rf-card${r.done ? ' is-done' : ''}`} data-testid="refresh-r1">
          <div className="font-semibold">{REFRESH_TEXT.r1Title}</div>
          <p style={{ margin: 0 }}>{REFRESH_TEXT.r1Text}</p>
          <div className="more-q">R1. {R1_QUESTION.question}</div>
          <div className="more-answer">
            <div className="ba-fields">
              <label>
                {R1_QUESTION.numberLabel}
                <input className="ba-num" inputMode="decimal" autoComplete="off" value={r.answer.number} onChange={(e) => setWork((w) => ({ ...w, refresh: { ...w.refresh, answer: { pick: '', number: e.target.value } } }))} onKeyDown={(e) => e.key === 'Enter' && check()} data-testid="refresh-number" />
              </label>
              <button className="btn btn-primary" onClick={check} data-testid="refresh-check">
                <CheckCircle2 size={14} /> Check
              </button>
              <FillButton unit={{ step: 'refresh', part: 'answer' }} hidden={r.done} />
              <button className="btn" onClick={onDashboard} data-testid="refresh-open-dashboard">
                Open the dashboard <ArrowRight size={14} />
              </button>
              {r.done && (
                <span className="build-ok" data-testid="refresh-right">
                  <Check size={14} /> Right
                </span>
              )}
            </div>
            {line && !r.done && (
              <div className="build-error" role="alert" data-testid="refresh-line">
                {line}
              </div>
            )}
          </div>
        </section>
      )}
      {r.done && (
        <div className="build-quick" data-testid="refresh-done">
          <b>Refreshed.</b> You wrote the steps once, and they ran on a file you had never seen. When the file brought something new, the journal showed where, and one change fixed it for every month after.
          {!demo && (
            <div className="more-ways">
              <CountInQuaera url={REFRESH_RETURN_URL} primary testid="refresh-count" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Journal({ rows, onOpen }: { rows: JournalRow[]; onOpen: (row: JournalRow) => void }) {
  return (
    <div className="build-table-wrap" tabIndex={0} role="region" aria-label="Journal of the run" data-testid="refresh-journal">
      <table className="build-table rf-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Stage</th>
            <th>Step</th>
            <th className="rf-num">Rows in</th>
            <th className="rf-num">Rows out</th>
            <th>Status</th>
            <th className="rf-num">ms</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.n} className={`rf-row is-${x.status}`} data-status={x.status} data-testid={`journal-row-${x.n}`}>
              <td>{x.n}</td>
              <td>{STAGE_LABEL[x.stage]}{x.source ? <span className="rf-src"> · {x.source}</span> : null}</td>
              <td>
                <button className="rf-step" onClick={() => onOpen(x)} title="Open this step">{x.step}</button>
                {x.note && <div className="rf-note">{x.note}</div>}
              </td>
              <td className="rf-num">{x.rowsIn === null ? '–' : fmtN(x.rowsIn)}</td>
              <td className="rf-num">{x.rowsOut === null ? '–' : fmtN(x.rowsOut)}</td>
              <td className={`rf-status rf-s-${x.status}`}>{statusText(x)}</td>
              <td className="rf-num">{x.ms || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
