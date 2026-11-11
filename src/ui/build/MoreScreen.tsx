// The optional step More (spec 5.5): five more questions from the Head of Sales, each answered with the learner's own SQL
// over the star. A list of the five on the left; the question, a free editor, Run, the result, Pin to the dashboard, the
// answer field and the two hints on the right. "Show a solution" counts the question as done, marked "with solution".
import { useEffect, useRef, useState } from 'react'
import type { Table } from 'apache-arrow'
import { ArrowRight, Check, CheckCircle2, Lightbulb, Loader2, Pin, Play } from 'lucide-react'
import { checkMoreAnswer, moreDone, moreSqlProblem, pinnable, removePin, setPin, type MoreWork } from '../../core/buildMore'
import type { BuildWork } from '../../core/buildSteps'
import type { GoldTable } from '../../db/buildRun'
import { MORE_IDS, MORE_QUESTIONS, MORE_RETURN_URL, moreQuestion, type MoreId } from '../../data/build/kaiyoSales'
import { query } from '../../db/engine'
import { resultRows } from '../../db/export'
import { readableError } from '../../core/sqlPractice'
import { kindOf } from '../Chart'
import { BuildTable } from './BuildTable'
import { CountInQuaera } from './CountInQuaera'
import { MoreEditor } from './MoreEditor'
import { FillButton, useDemo } from './DemoContext'
import { SlicerBar } from './SlicerBar'
import { StarPanel } from './StarPanel'
import './dashboard.css'
import './more.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
  /** opens the Dashboard step (K6 is answered there) */
  onDashboard: () => void
}

type Run = { sql: string; table: Table } | { sql: string; error: string }
const SHOWN_ROWS = 100

export function MoreScreen({ work, setWork, ready, onDashboard }: Props) {
  const more = work.more
  const [sel, setSel] = useState<MoreId>(() => MORE_IDS.find((id) => !more.done.includes(id)) ?? 'K1')
  const setMore = (f: (m: MoreWork) => MoreWork) => setWork((w) => ({ ...w, more: f(w.more) }))
  // in demo mode a question filled in moves on to the next one that is open
  const { demo } = useDemo()
  useEffect(() => {
    const next = MORE_IDS.find((id) => !more.done.includes(id))
    if (demo && next && more.done.includes(sel)) setSel(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [more.done.join(',')])
  const [noRegion, setNoRegion] = useState(false)
  const onTables = (t: GoldTable[]) => setNoRegion(t.length > 0 && !t.find((x) => x.table === 'gold_dim_customer')?.columns.some((c) => c.name === 'region_name'))

  return (
    <div className="space-y-4" data-testid="build-more">
      <p className="build-lead">
        Six more questions from the Head of Sales. You write the SQL yourself this time, over the star you built; the last one is answered with the dashboard's slicers. Pin a result to the dashboard if it deserves a tile.
      </p>
      <StarPanel ready={ready} defaultOpen withRegions onTables={onTables} />
      <div className="more-layout">
        <ol className="more-list" aria-label="Questions" data-testid="more-list">
          {MORE_QUESTIONS.map((q) => {
            const done = more.done.includes(q.id)
            return (
              <li key={q.id}>
                <button className={`more-item${sel === q.id ? ' is-open' : ''}${done ? ' is-done' : ''}`} onClick={() => setSel(q.id)} aria-current={sel === q.id ? 'true' : undefined} data-testid={`more-item-${q.id}`}>
                  <span className="more-item-n">{done ? <Check size={13} /> : q.id}</span>
                  <span className="more-item-text">
                    {q.title}
                    {done && more.solved.includes(q.id) && <span className="more-mark"> with solution</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <Work key={sel} id={sel} work={work} ready={ready} setMore={setMore} noRegion={noRegion} onDashboard={onDashboard} />
      </div>
      {moreDone(more) && (
        <div className="build-quick" data-testid="more-done">
          <b>Six more, all yours.</b> You answered every question, five with your own SQL{more.solved.length ? `, ${more.solved.length} with a solution shown` : ''}. Keep building here, or take the same moves back to Quaera.
          <WaysOut />
        </div>
      )}
    </div>
  )
}

/** The two ways out of the build, as under "You built it". */
export function WaysOut() {
  const { demo } = useDemo()
  if (demo) return null
  return (
    <div className="more-ways">
      <CountInQuaera url={MORE_RETURN_URL} primary testid="more-count" />
      <span className="build-muted">Counts the six more questions. Next there: the SQL track on GROUP BY and JOIN, the same moves you just made.</span>
    </div>
  )
}

function Work({ id, work, ready, setMore, noRegion, onDashboard }: { id: MoreId; work: BuildWork; ready: boolean; setMore: (f: (m: MoreWork) => MoreWork) => void; noRegion: boolean; onDashboard: () => void }) {
  const q = moreQuestion(id)
  const more = work.more
  const text = more.sql[id]
  const answer = more.answers[id]
  const done = more.done.includes(id)
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState(0)
  const [solution, setSolution] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const textRef = useRef(text)
  textRef.current = text

  const edit = (v: string) => setMore((m) => ({ ...m, sql: { ...m.sql, [id]: v } }))
  const editAnswer = (p: Partial<{ pick: string; number: string }>) => setMore((m) => ({ ...m, answers: { ...m.answers, [id]: { ...m.answers[id], ...p } } }))

  const doRun = async () => {
    if (!ready || busy) return
    const sql = textRef.current
    const problem = moreSqlProblem(sql)
    if (problem) return setRun({ sql, error: problem })
    setBusy(true)
    try {
      setRun({ sql, table: await query(sql) })
    } catch (e) {
      setRun({ sql, error: readableError(String(e instanceof Error ? e.message : e)).split('\n')[0] })
    } finally {
      setBusy(false)
    }
  }

  const doCheck = () => {
    const r = checkMoreAnswer(id, answer)
    setLine(r.line)
    if (r.ok) setMore((m) => ({ ...m, done: MORE_IDS.filter((k) => k === id || m.done.includes(k)) }))
  }
  const showSolution = () => {
    setSolution(true)
    if (!done) setMore((m) => ({ ...m, done: MORE_IDS.filter((k) => k === id || m.done.includes(k)), solved: MORE_IDS.filter((k) => k === id || m.solved.includes(k)) }))
  }

  const table = run && 'table' in run ? run.table : null
  const cols = table ? table.schema.fields.map((f) => ({ name: f.name, kind: kindOf(f) })) : []
  const canPin = !!table && pinnable(cols)
  const pinned = more.pins.find((p) => p.q === id)
  const shown = table ? resultRows(table) : null
  if (shown && shown.rows.length > SHOWN_ROWS) shown.rows = shown.rows.slice(0, SHOWN_ROWS)

  return (
    <section className={`more-work${done ? ' is-done' : ''}`} data-testid={`more-work-${id}`}>
      <div>
        <div className="more-q">
          {id}. {q.question}
        </div>
        <div className="build-muted">Practises: {q.practises}.{!q.slicers && ' Write the schema in front of a table: build_kaiyo.gold_fact_sales.'}</div>
      </div>
      {id === 'K4' && noRegion && (
        <div className="bd-peek" data-testid="more-noregion">
          This star has no region column on the customers. Join clean_regions on region_id (it must be a number: finish Clean for regions first).
        </div>
      )}
      {q.slicers ? (
        <div className="space-y-2" data-testid="more-slicers">
          <p style={{ margin: 0 }}>No SQL this time. Use the slicers of the dashboard and read the revenue tile. Set them here or on the Dashboard: they are the same.</p>
          <SlicerBar ready={ready} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={onDashboard} data-testid="more-open-dashboard">
              Open the dashboard <ArrowRight size={14} />
            </button>
            <span className="build-muted">The slicers stay as you set them.</span>
          </div>
        </div>
      ) : (
        <>
      <MoreEditor value={text} onChange={edit} onRun={() => void doRun()} label={`SQL for question ${id}`} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void doRun()} data-testid="more-run">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
        </button>
        <button className="btn" disabled={!canPin} onClick={() => run && setMore((m) => ({ ...m, pins: setPin(m.pins, { q: id, sql: run.sql }) }))} title={canPin ? 'Show this result as a tile on the dashboard' : 'A tile needs two columns: a label and a number'} data-testid="more-pin">
          <Pin size={14} /> {pinned ? 'Update the tile' : 'Pin to dashboard'}
        </button>
        {pinned && (
          <button className="btn btn-ghost" onClick={() => setMore((m) => ({ ...m, pins: removePin(m.pins, id) }))} data-testid="more-unpin">
            Remove the tile
          </button>
        )}
        <span className="build-muted">Ctrl+Enter runs</span>
      </div>
      {run && 'error' in run && (
        <div className="build-error" role="alert" data-testid="more-error">
          {run.error}
        </div>
      )}
      {shown && (
        <div data-testid="more-result">
          <BuildTable data={shown} caption={`Result of question ${id}`} />
          {table && table.numRows > SHOWN_ROWS && <div className="build-muted">First {SHOWN_ROWS} of {table.numRows.toLocaleString('en-US')} rows.</div>}
          {table && !canPin && <div className="build-muted">To pin it, return two columns: a label and a number.</div>}
          {pinned && <div className="build-ok"><Check size={14} /> On the dashboard, under “Your tiles”.</div>}
        </div>
      )}
        </>
      )}
      <div className="more-answer">
        <div className="ba-fields">
          {q.options && (
            <label>
              {q.pickLabel}
              <select className="build-select" value={answer.pick} onChange={(e) => editAnswer({ pick: e.target.value })} data-testid="more-pick">
                <option value="">Choose…</option>
                {q.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {q.numberLabel}
            <input className="ba-num" inputMode="decimal" autoComplete="off" value={answer.number} onChange={(e) => editAnswer({ number: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && doCheck()} data-testid="more-number" />
          </label>
          <button className="btn btn-primary" onClick={doCheck} data-testid="more-check">
            <CheckCircle2 size={14} /> Check
          </button>
          <FillButton unit={{ step: 'more', q: id }} hidden={done} />
          {done && (
            <span className="build-ok" data-testid="more-right">
              <Check size={14} /> {more.solved.includes(id) ? 'Done, with solution' : 'Right'}
            </span>
          )}
        </div>
        {line && !done && (
          <div className="build-error" role="alert" data-testid="more-line">
            {line}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {hints < 2 && (
            <button className="btn" onClick={() => setHints(hints + 1)} data-testid="more-hint">
              <Lightbulb size={14} /> {hints === 0 ? 'Hint' : 'Another hint'}
            </button>
          )}
          {hints >= 2 && !solution && !q.slicers && (
            <button className="btn" onClick={showSolution} data-testid="more-solution">
              Show a solution
            </button>
          )}
        </div>
        {hints > 0 && (
          <ul className="m-0 pl-5" style={{ fontSize: 13 }}>
            {q.hints.slice(0, hints).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {solution && (
          <div data-testid="more-solution-sql">
            <pre className="pl-code">{q.solution}</pre>
            {!more.solved.includes(id) ? null : <div className="build-muted">Counted as done, marked “with solution”.</div>}
          </div>
        )}
      </div>
    </section>
  )
}
