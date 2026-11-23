// Lesson mode for a teacher (src/core/lesson.ts): `#lesson=sql&set=<section>&task=N` is one task per screen, `…&mode=vote&q=N`
// is a question with four queries to vote on, reveal and run. Hidden: no menu, button or page links here. It reuses
// the practice page's editor, runner and check; it records no progress and counts nothing in Quaera.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Table } from 'apache-arrow'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Loader2, Play, RefreshCw, Square, XCircle } from 'lucide-react'
import { compareResults, describeVerdict, type ResultData, type Verdict } from '../core/check'
import { LETTERS, arrange, clampIndex, describeRun, errorLine, hashWithoutLesson, lastTask, lessonFromHash, lessonHash, lessonSections, lessonTables, type Letter, type LessonKind } from '../core/lesson'
import { cancelQuery } from '../db/engine'
import { resultRows } from '../db/export'
import { SECTIONS } from '../data/sqlPractice'
import { VOTES } from '../data/lessonVotes'
import { taskNumber, tasksOf, type PracticeSection, type PracticeTaskCell } from '../data/practiceBook'
import { CellEditor, Grid, Prose, RunButton, RunResult, SQL_ENGINE, useCellRun } from './PracticeBook'
import { ResultCompare } from './ResultCompare'
import { runPracticeQuery, useLab } from './store'
import './lesson.css'

const LAST_KEY = 'stratalab.lesson.last.v1'
const WRITE_HINT = 'Type your query here, then press Ctrl+Enter'

type Go = (r: { set?: string | null; mode?: 'task' | 'vote'; n?: number | null }) => void

export function LessonPage() {
  const [hash, setHash] = useState(location.hash)
  const [board, setBoard] = useState(false)
  const [checkOn, setCheckOn] = useState(true)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  const route = lessonFromHash(hash)
  const kind: LessonKind = route?.kind ?? 'sql'
  const go: Go = useCallback(
    (r) => {
      history.replaceState(null, '', location.pathname + location.search + lessonHash(location.hash, { kind, ...r }))
      setHash(location.hash)
    },
    [kind],
  )
  const exit = () => {
    history.replaceState(null, '', location.pathname + location.search + hashWithoutLesson(location.hash))
    setHash(location.hash)
    setBoard(false)
  }

  const section = route?.set ? SECTIONS.find((s) => s.id === route.set) : undefined
  const tasks = section ? tasksOf(section) : []
  const questions = route?.set ? VOTES[route.set] : undefined
  const mode = route?.mode ?? 'task'
  const count = mode === 'vote' ? (questions?.length ?? 0) : tasks.length
  let n = 1
  if (route && count > 0) {
    let saved: string | null = null
    if (route.n === null && mode === 'task') {
      try {
        saved = localStorage.getItem(LAST_KEY)
      } catch {
        /* start at 1 */
      }
    }
    n = route.n === null && mode === 'task' ? (lastTask(saved, route.set!, count) ?? 1) : clampIndex(route.n, count)
  }

  // Bad or missing numbers are corrected in the address, so a copied link is a good link.
  const fix = !!route && count > 0 && route.n !== n
  useEffect(() => {
    if (fix) go({ set: route!.set, mode, n })
  }, [fix, go, route, mode, n])

  useEffect(() => {
    if (!route || mode !== 'task' || count === 0) return
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ set: route.set, task: n }))
    } catch {
      /* nothing is remembered */
    }
  }, [route, mode, count, n])

  if (!route) return null

  let body
  if (route.kind === 'python')
    body = (
      <div className="lesson-note">
        <h2>Python lessons are coming</h2>
        <p>
          Lesson mode has SQL for now. Python has a practice page: <a href="#practice=python">open the Python practice</a>.
        </p>
      </div>
    )
  else if (!section || count === 0) body = <SetList mode={mode} unknown={route.set} />
  else if (mode === 'vote') body = <VoteView key={`${section.id}-${n}`} section={section} q={n} count={count} go={go} />
  else body = <TaskView key={tasks[n - 1].id} section={section} task={tasks[n - 1]} n={n} count={count} check={checkOn} go={go} />

  return (
    <div className={`lesson-root${board ? ' lesson-board' : ''}`} data-testid="lesson">
      <div className="lesson-inner">
        <div className="lesson-switches">
          <label title="Compare each run with the answer">
            <input type="checkbox" checked={checkOn} onChange={(e) => setCheckOn(e.target.checked)} /> Check answers
          </label>
          <label title="Larger text, Lab's own frame hidden">
            <input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} /> Board mode
          </label>
          <button className="btn btn-ghost" onClick={exit} title="Back to the workbench">
            Exit lesson
          </button>
        </div>
        {body}
      </div>
    </div>
  )
}

function SetList({ mode, unknown }: { mode: 'task' | 'vote'; unknown: string | null }) {
  const sections = lessonSections(SECTIONS).filter((s) => mode === 'task' || VOTES[s.id])
  return (
    <div className="lesson-note">
      <h2>{unknown ? `There is no lesson set “${unknown}”` : 'Choose a set'}</h2>
      <p>{mode === 'vote' ? 'Sets with a vote:' : 'Sets with tasks:'}</p>
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={lessonHash('', { kind: 'sql', set: s.id, mode, n: 1 })}>
              {s.n}. {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** ← and → move between tasks, unless the focus is where arrows mean something else. */
function useArrows(prev: (() => void) | null, next: (() => void) | null) {
  const f = useRef({ prev, next })
  f.current = { prev, next }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if ((e.target as HTMLElement | null)?.closest?.('.cm-editor, input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') f.current.prev?.()
      else if (e.key === 'ArrowRight') f.current.next?.()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}

function Nav({ label, n, count, go, mode }: { label: string; n: number; count: number; go: Go; mode: 'task' | 'vote' }) {
  return (
    <span className="lesson-nav">
      <button className="btn" disabled={n <= 1} onClick={() => go({ set: undefined, mode, n: n - 1 })} aria-label="Previous">
        <ArrowLeft size={16} />
      </button>
      <b>
        {label} {n} of {count}
      </b>
      <button className="btn" disabled={n >= count} onClick={() => go({ set: undefined, mode, n: n + 1 })} aria-label="Next">
        <ArrowRight size={16} />
      </button>
    </span>
  )
}

// ------------------------------------------------------------------ A: one task a screen

type CheckState = { verdict: Verdict; trap: string | null; got: ResultData; expected: ResultData } | null

function TaskView({ section, task, n, count, check, go }: { section: PracticeSection; task: PracticeTaskCell; n: number; count: number; check: boolean; go: Go }) {
  const text = useRef('')
  const { run, exec, stop } = useCellRun(`lesson-${task.id}`)
  const [result, setResult] = useState<CheckState>(null)
  const [solution, setSolution] = useState(false)
  const busy = useRef(false)
  const setHere = (m: number) => go({ set: section.id, mode: 'task', n: m })
  useArrows(n > 1 ? () => setHere(n - 1) : null, n < count ? () => setHere(n + 1) : null)

  // The same comparison as the practice page: its runner and compareResults, traps included.
  const go_ = async () => {
    if (busy.current) return
    busy.current = true
    setResult(null)
    try {
      const ran = await exec(text.current)
      if (!check || !ran || ran.failed || !ran.table || ran.table.numCols === 0) return
      const got = resultRows(ran.table)
      const expected = await SQL_ENGINE.rows(task.solution, `lesson-${task.id}-answer`)
      const verdict = compareResults(got, expected, task.ordered)
      let trap: string | null = null
      if (!verdict.ok)
        for (const t of task.traps ?? []) {
          if (compareResults(got, await SQL_ENGINE.rows(t.code, `lesson-${task.id}-trap`), task.ordered).ok) {
            trap = t.says
            break
          }
        }
      setResult({ verdict, trap, got, expected })
    } catch {
      setResult(null)
    } finally {
      busy.current = false
    }
  }
  const said = result ? describeVerdict(result.verdict, 'sql') : null
  const index = section.blocks.indexOf(task)
  const before = section.blocks.slice(0, index)
  const note = [...before].reverse().find((b) => b.kind === 'note') ?? section.blocks.find((b) => b.kind === 'note')
  const example = [...before].reverse().find((b) => b.kind === 'example') ?? section.blocks.find((b) => b.kind === 'example')

  return (
    <>
      <div className="lesson-bar">
        <span className="lesson-crumb">
          SQL · <b>{section.n}. {section.title}</b>
        </span>
        <Nav label="Task" n={n} count={count} go={(r) => setHere(r.n ?? n)} mode="task" />
      </div>
      <div className="lesson-body">
        <p className="lesson-q">
          <span className="lesson-no">{taskNumber(section, task)}</span> <Prose text={task.question} />
        </p>
        <TablesPanel task={task} />
        {(note || example) && (
          <details className="lesson-fold">
            <summary>Theory</summary>
            {note?.kind === 'note' && (
              <p>
                <Prose text={note.text} />
              </p>
            )}
            {note?.kind === 'note' && note.syntax && <pre className="mono">{note.syntax}</pre>}
            {example?.kind === 'example' && (
              <>
                <div className="lesson-sub">Example: {example.title}</div>
                <pre className="mono">{example.code}</pre>
              </>
            )}
          </details>
        )}
        <CellEditor value="" onChange={(v) => (text.current = v)} onRun={() => void go_()} onCheck={() => void go_()} minLines={6} hint={WRITE_HINT} label="Your query" />
        <div className="lesson-run">
          <RunButton run={run} exec={() => void go_()} stop={stop} />
          <button className="btn" onClick={() => setSolution(!solution)} aria-expanded={solution}>
            <Eye size={14} /> {solution ? 'Hide solution' : 'Show solution'}
          </button>
        </div>
        {solution && (
          <pre className="mono lesson-solution" data-testid="lesson-solution">
            {task.solution}
          </pre>
        )}
        <RunResult run={run} />
        {result && said && (
          <div role="status" data-testid="lesson-verdict" className={`lesson-verdict ${result.verdict.ok ? 'ok' : 'bad'}`}>
            {result.verdict.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>
              <b>{result.verdict.ok ? 'Matches the expected result.' : said.title}</b> <Prose text={result.verdict.ok ? said.detail : (result.trap ?? said.detail)} />
            </span>
          </div>
        )}
        {result && !result.verdict.ok && <ResultCompare got={result.got} expected={result.expected} trap={result.trap != null} />}
      </div>
    </>
  )
}

/** The tables a task names: columns, key and two rows of the dataset, open and foldable. */
function TablesPanel({ task }: { task: PracticeTaskCell }) {
  const all = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'tables')
  const tables = all?.kind === 'tables' ? lessonTables(task, all.tables) : []
  const names = tables.map((t) => t.name).join(',')
  const ready = useLab((s) => s.engine.status)
  const [rows, setRows] = useState<Record<string, { table: Table } | { error: string }>>({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (ready !== 'ready' || !names) return
    let off = false
    setRows({})
    void (async () => {
      for (const name of names.split(',')) {
        try {
          const { table } = await runPracticeQuery(`SELECT TOP (2) * FROM quaera.${name};`, `lesson-peek-${name}`, () => off)
          if (!off) setRows((r) => ({ ...r, [name]: { table } }))
        } catch (e) {
          if (!off) setRows((r) => ({ ...r, [name]: { error: errorLine(e instanceof Error ? e.message : String(e)) } }))
          return
        }
      }
    })()
    return () => {
      off = true
    }
  }, [names, ready, attempt])

  if (tables.length === 0) return null
  return (
    <div className="lesson-tables" data-testid="lesson-tables">
      {tables.map((t) => {
        const got = rows[t.name]
        return (
          <details key={t.name} open className="lesson-fold lesson-table">
            <summary>
              <b className="mono">{t.name}</b> <span className="lesson-muted">· {t.row}</span>
            </summary>
            <div className="lesson-cols">
              {t.columns.map((c) => (
                <span key={c} className={`mono lesson-col${c === t.key ? ' key' : ''}`}>
                  {c}
                  {c === t.key ? ' · key' : ''}
                </span>
              ))}
            </div>
            {got && 'table' in got ? (
              <Grid table={got.table} />
            ) : got ? (
              <div className="lesson-err">
                {got.error} <button className="btn" onClick={() => setAttempt(attempt + 1)}><RefreshCw size={13} /> Retry</button>
              </div>
            ) : (
              <div className="lesson-muted">
                <Loader2 size={13} className="animate-spin inline" /> {ready === 'ready' ? 'Loading the rows…' : 'Starting the engine…'}
              </div>
            )}
          </details>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ B: vote, then run

type Option = { status: 'idle' } | { status: 'running' } | { status: 'done'; text: string } | { status: 'error'; text: string; dataset: boolean }

function VoteView({ section, q, count, go }: { section: PracticeSection; q: number; count: number; go: Go }) {
  const item = VOTES[section.id][q - 1]
  const options = arrange(item, q - 1)
  const [revealed, setRevealed] = useState(false)
  const [runs, setRuns] = useState<Partial<Record<Letter, Option>>>({})
  const [running, setRunning] = useState(false)
  const busy = useRef(false)
  const stopped = useRef(false)
  const ready = useLab((s) => s.engine.status === 'ready')
  const setHere = (m: number) => go({ set: section.id, mode: 'vote', n: m })
  useArrows(q > 1 ? () => setHere(q - 1) : null, q < count ? () => setHere(q + 1) : null)

  const reveal = () => setRevealed(true)
  const runAll = async () => {
    if (busy.current) return
    busy.current = true
    stopped.current = false
    setRunning(true)
    setRuns({})
    try {
      for (const o of options) {
        if (stopped.current) {
          setRuns((r) => ({ ...r, [o.letter]: { status: 'error', text: 'Stopped.', dataset: false } }))
          continue
        }
        setRuns((r) => ({ ...r, [o.letter]: { status: 'running' } }))
        try {
          const { table, more } = await runPracticeQuery(o.sql, `lesson-vote-${o.letter}`, () => stopped.current)
          setRuns((r) => ({ ...r, [o.letter]: { status: 'done', text: describeRun(resultRows(table), 3, more) } }))
        } catch (e) {
          const msg = errorLine(e instanceof Error ? e.message : String(e))
          setRuns((r) => ({ ...r, [o.letter]: { status: 'error', text: stopped.current ? 'Stopped.' : msg, dataset: /could not be loaded|was not loaded/.test(msg) } }))
        }
      }
    } finally {
      busy.current = false
      setRunning(false)
    }
  }
  const stop = () => {
    stopped.current = true
    for (const l of LETTERS) void cancelQuery(`lesson-vote-${l}`)
  }
  const failedToLoad = LETTERS.some((l) => {
    const r = runs[l]
    return r?.status === 'error' && r.dataset
  })

  return (
    <>
      <div className="lesson-bar">
        <span className="lesson-crumb">
          SQL · <b>{section.n}. {section.title}</b> · vote
        </span>
        <Nav label="Question" n={q} count={count} go={(r) => setHere(r.n ?? q)} mode="vote" />
        <span className="lesson-nav">
          {!revealed ? (
            <button className="btn btn-primary" onClick={reveal}>
              Reveal
            </button>
          ) : running ? (
            <button className="btn" onClick={stop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!ready} onClick={() => void runAll()} title={ready ? undefined : 'The engine is still loading'}>
              {failedToLoad ? <RefreshCw size={14} /> : <Play size={14} />} {failedToLoad ? 'Retry' : 'Run all four'}
            </button>
          )}
        </span>
      </div>
      <div className="lesson-body">
        <p className="lesson-q">
          <Prose text={item.question} />
        </p>
        <div className="lesson-vote">
          <div className="lesson-opts">
            {options.map((o) => (
              <div key={o.letter} className={`lesson-opt${revealed && o.right ? ' right' : ''}`} data-testid={`opt-${o.letter}`} data-right={revealed ? o.right : undefined}>
                <b className="lesson-letter">{o.letter}</b>
                <pre className="mono">{o.sql}</pre>
              </div>
            ))}
          </div>
          <div className="lesson-qr" aria-hidden="true" data-testid="lesson-qr" />
        </div>
        {!revealed && <p className="lesson-muted lesson-hands">Vote: A, B, C or D (hands up)</p>}
        {revealed && (
          <>
            <h3 className="lesson-answer">{options.find((o) => o.right)!.letter} is right.</h3>
            <p className="lesson-why">
              <b>Why:</b> {item.why}
            </p>
            <div className="lesson-results" data-testid="lesson-results">
              {options.map((o) => {
                const r = runs[o.letter]
                return (
                  <div key={o.letter} className="lesson-result" data-testid={`res-${o.letter}`}>
                    <b className="lesson-letter">{o.letter}</b>
                    {!r || r.status === 'idle' ? (
                      <span className="lesson-muted">Not run yet.</span>
                    ) : r.status === 'running' ? (
                      <span className="lesson-muted">
                        <Loader2 size={14} className="animate-spin inline" /> Running…
                      </span>
                    ) : r.status === 'error' ? (
                      <span>
                        <b>Error:</b> {r.text}
                      </span>
                    ) : (
                      <span>
                        <b>{o.right ? 'Right.' : 'Runs, but not the answer:'}</b> {r.text}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
