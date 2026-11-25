// Lesson mode for a teacher (src/core/lesson.ts): `#lesson=sql&set=<section>&task=N` is one task per screen, `…&mode=vote&q=N`
// is a question with four queries to vote on, reveal and run, `set=warmup&q=N` a short "which one do you use" question,
// and `#lesson=sql` alone is the page where a teacher builds a plan (`&plan=w3,v2,t:inner-join:4`) that runs the chosen
// items in order. Hidden: no menu, button or page links here. It reuses the practice page's editor, runner and check;
// it records no progress and counts nothing in Quaera.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Table } from 'apache-arrow'
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Eye, ListChecks, Loader2, Play, RefreshCw, Square, XCircle } from 'lucide-react'
import { compareResults, describeVerdict, type ResultData, type Verdict } from '../core/check'
import {
  LETTERS, LEVELS, PICK_ROWS, PLAN_MAX, WARMUP_SET, clampIndex, stepLabel, describeRun, errorLine, handShares, hashWithoutLesson, isRoomItem, lastTask, lessonFromHash, lessonHash, lessonSections, lessonTables, planFromHash, planHash, planKey, voteOptions, warmOptions,
  type Letter, type LessonKind, type Level, type PlanCatalog, type PlanItem, type QuizOption,
} from '../core/lesson'
import { cancelQuery } from '../db/engine'
import { resultRows } from '../db/export'
import { SECTIONS } from '../data/sqlPractice'
import { SHOP_VOTES, VOTES, WARMUP } from '../data/lessonVotes'
import { FILL_ANSWERS, FILL_WHY } from '../data/lessonFillAnswers'
import { FILL_QUESTIONS } from '../data/lessonFill'
import { fillStats, rightQuery } from '../core/lessonFill'
import { FillCode, FillPhones, FillStatsPanel, FilledQuery, useFillRead } from './LessonFill'
import { taskNumber, tasksOf, type PracticeSection, type PracticeTaskCell } from '../data/practiceBook'
import { CellEditor, Grid, Prose, RunButton, RunResult, SQL_ENGINE, useCellRun } from './PracticeBook'
import { ResultCompare } from './ResultCompare'
import { RoomChip, RoomProvider, RoomSide, useRoom, useTeacherRoom } from './LessonRoom'
import { ResultsSlide, SchemaSlide, ScopeContext, isShopPlan, loadHands, saveHands, useScope } from './LessonPlanSlides'
import { RESULTS_KEY, roomKeyForPlan, roomKeyForSet, sharesFromCounts, teacherView, votesText, type RoomQuestion } from '../core/voting'
import { runPracticeQuery, useLab } from './store'
import './lesson.css'

const LAST_KEY = 'stratalab.lesson.last.v1'
const WRITE_HINT = 'Type your query here, then press Ctrl+Enter'

type Go = (r: { set?: string | null; mode?: 'task' | 'vote'; n?: number | null }) => void

/** The "n of N" control of a screen: its own set (Task 3 of 7) or the lesson plan (Step 2 of 5). */
interface NavSpec {
  label: string
  n: number
  count: number
  go: (m: number) => void
}

const CATALOG: PlanCatalog = {
  warm: WARMUP.length,
  shop: SHOP_VOTES.length,
  fill: FILL_QUESTIONS.length,
  votes: Object.fromEntries(Object.entries(VOTES).map(([k, v]) => [k, v.length])),
  tasks: Object.fromEntries(SECTIONS.map((s) => [s.id, tasksOf(s).length])),
}

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
  // A lesson link never shows the first-visit welcome (the store skips it on load); when the link is followed inside a tab that
  // already opened it, the dialog is hidden here. It is not marked as seen: a later ordinary visit still gets it.
  const inLesson = !!route
  useEffect(() => {
    if (inLesson) useLab.setState({ welcomeOpen: false })
  }, [inLesson])
  const kind: LessonKind = route?.kind ?? 'sql'
  const plan = route && kind === 'sql' ? planFromHash(hash, CATALOG) : null
  const running = !!plan && plan.items.length > 0
  const go: Go = useCallback(
    (r) => {
      history.replaceState(null, '', location.pathname + location.search + lessonHash(location.hash, { kind, ...r }))
      setHash(location.hash)
    },
    [kind],
  )
  const goPlan = useCallback((items: readonly PlanItem[], at: number) => {
    history.replaceState(null, '', location.pathname + location.search + planHash(location.hash, items, at))
    setHash(location.hash)
  }, [])
  const exit = () => {
    history.replaceState(null, '', location.pathname + location.search + hashWithoutLesson(location.hash))
    setHash(location.hash)
    setBoard(false)
  }
  // A plan runs on the projector: larger text, Lab's own frame hidden (the switch stays, the teacher may turn it off).
  useEffect(() => {
    if (running) setBoard(true)
  }, [running])

  const warm = route?.set === WARMUP_SET
  const section = route?.set && !warm ? SECTIONS.find((s) => s.id === route.set) : undefined
  const tasks = section ? tasksOf(section) : []
  const questions = route?.set && !warm ? VOTES[route.set] : undefined
  const mode = route?.mode ?? 'task'
  const count = plan ? 0 : warm ? WARMUP.length : mode === 'vote' ? (questions?.length ?? 0) : tasks.length
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
    if (!running || !plan) return
    const raw = /(?:^#|&)i=([^&]*)/i.exec(hash)?.[1]
    if (raw !== undefined && Number(raw) !== plan.at) goPlan(plan.items, plan.at)
  }, [running, plan, hash, goPlan])

  useEffect(() => {
    if (!route || plan || mode !== 'task' || count === 0) return
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ set: route.set, task: n }))
    } catch {
      /* nothing is remembered */
    }
  }, [route, plan, mode, count, n])

  // Phone voting (hidden, optional): one room per plan or per single vote link; it follows the question on the screen.
  const planItem = running && plan ? plan.items[plan.at - 1] : null
  let roomKey: string | null = null
  let asked: RoomQuestion | null = null
  if (route && kind === 'sql') {
    if (running && plan) {
      roomKey = roomKeyForPlan(plan.items.map(planKey))
      // the phone shows the projector's own "Step 3 of 8"; a slide or a task has no vote (the results slide is told apart by its key)
      const label = stepLabel(plan.at, plan.items.length)
      if (planItem && isRoomItem(planItem)) asked = { key: planKey(planItem), label }
      else if (planItem?.kind === 'r') asked = { key: RESULTS_KEY, label }
      // the demo shop's schema slide tells the phones which tables to list (the key is no question: the phone shows "no vote right now")
      else if (planItem?.kind === 's' && isShopPlan(plan.items)) asked = { key: 's:shop', label }
    } else if (!plan && warm && count > 0) {
      roomKey = roomKeyForSet(WARMUP_SET)
      asked = { key: `w${n}`, label: `Warm-up ${n}` }
    } else if (!plan && !warm && mode === 'vote' && section && questions && count > 0) {
      roomKey = roomKeyForSet(section.id)
      asked = { key: planKey({ kind: 'v', set: section.id, n }), label: `Question ${n}` }
    }
  }
  const room = useTeacherRoom(roomKey, asked)

  if (!route) return null

  const setNav = (label: string, m: number, total: number, set: string): NavSpec => ({ label, n: m, count: total, go: (x) => go({ set, mode: set === WARMUP_SET ? 'vote' : mode, n: x }) })
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
  else if (plan && plan.items.length > 0) body = <PlanRun key={plan.items.map(planKey).join()} items={plan.items} at={plan.at} skipped={plan.skipped} capped={plan.capped} checkOn={checkOn} goPlan={goPlan} />
  else if (plan || (!route.set && route.n === null && mode === 'task')) body = <PlanBuilder note={plan ? (plan.skipped.length ? `Nothing in that plan could be used (${plan.skipped.join(', ')}).` : 'That plan is empty.') : null} onOpen={(items) => goPlan(items, 1)} />
  else if (warm) body = <WarmView key={n} q={n} count={count} nav={setNav('Question', n, count, WARMUP_SET)} />
  else if (!section || count === 0) body = <SetList mode={mode} unknown={route.set} />
  else if (mode === 'vote') body = <VoteView key={`${section.id}-${n}`} section={section} q={n} nav={setNav('Question', n, count, section.id)} />
  else body = <TaskView key={tasks[n - 1].id} section={section} task={tasks[n - 1]} check={checkOn} nav={setNav('Task', n, count, section.id)} />

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
          <RoomProvider value={room}>
            <RoomChip />
          </RoomProvider>
          <button className="btn btn-ghost" onClick={exit} title="Back to the workbench">
            Exit lesson
          </button>
        </div>
        <ScopeContext.Provider value={roomKey}>
          <RoomProvider value={room}>{body}</RoomProvider>
        </ScopeContext.Provider>
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
        {mode === 'vote' && (
          <li>
            <a href={lessonHash('', { kind: 'sql', set: WARMUP_SET, mode: 'vote', n: 1 })}>Warm-up questions ({WARMUP.length})</a>
          </li>
        )}
        {sections.map((s) => (
          <li key={s.id}>
            <a href={lessonHash('', { kind: 'sql', set: s.id, mode, n: 1 })}>
              {s.n}. {s.title}
            </a>
          </li>
        ))}
      </ul>
      <p>
        <a href="#lesson=sql">Build a lesson plan</a>
      </p>
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

function Nav({ nav }: { nav: NavSpec }) {
  const { label, n, count, go } = nav
  return (
    <span className="lesson-nav">
      <button className="btn" disabled={n <= 1} onClick={() => go(n - 1)} aria-label="Previous">
        <ArrowLeft size={16} />
      </button>
      <b data-testid="lesson-position">
        {label} {n} of {count}
      </b>
      <button className="btn" disabled={n >= count} onClick={() => go(n + 1)} aria-label="Next">
        <ArrowRight size={16} />
      </button>
    </span>
  )
}

const useNavArrows = (nav: NavSpec) => useArrows(nav.n > 1 ? () => nav.go(nav.n - 1) : null, nav.n < nav.count ? () => nav.go(nav.n + 1) : null)

// ------------------------------------------------------------------ A: one task a screen

type CheckState = { verdict: Verdict; trap: string | null; got: ResultData; expected: ResultData } | null

function TaskView({ section, task, check, nav }: { section: PracticeSection; task: PracticeTaskCell; check: boolean; nav: NavSpec }) {
  const text = useRef('')
  const { run, exec, stop } = useCellRun(`lesson-${task.id}`)
  const [result, setResult] = useState<CheckState>(null)
  const [solution, setSolution] = useState(false)
  const busy = useRef(false)
  useNavArrows(nav)

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
        <Nav nav={nav} />
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
  // Two tables share a row; one whose sample rows do not fit half the width takes a row of its own. Measured, not guessed from the
  // number of columns: after the rows are drawn, a table whose grid scrolls sideways is widened (and stays so until the width changes).
  const box = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState<string[]>([])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const over = [...el.querySelectorAll<HTMLElement>('details[data-table]')]
      .filter((d) => !wide.includes(d.dataset.table!) && [...d.querySelectorAll<HTMLElement>('.overflow-auto')].some((g) => g.scrollWidth > g.clientWidth + 1))
      .map((d) => d.dataset.table!)
    if (over.length) setWide([...wide, ...over])
  })
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) > 8) {
        last = el.clientWidth
        setWide([])
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    <div ref={box} className="lesson-tables" data-testid="lesson-tables">
      {tables.map((t) => {
        const got = rows[t.name]
        return (
          <details key={t.name} open data-table={t.name} className={`lesson-fold lesson-table${wide.includes(t.name) ? ' wide' : ''}`}>
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
              <Grid table={got.table} tight />
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

// ------------------------------------------------------------------ B: a question with four options (a vote on code, a warm-up)

type Option = { status: 'idle' } | { status: 'running' } | { status: 'none' } | { status: 'done'; text: string } | { status: 'error'; text: string; dataset: boolean }
type Pick = { letter: Letter } & ({ status: 'running' } | { status: 'none' } | { status: 'error'; text: string; dataset: boolean } | { status: 'rows'; table: Table; total: number; more: boolean })

interface QuizProps {
  /** the question as a plan item (w3, v2): the typed hand counts are kept under it */
  qkey: string
  crumb: string
  question: string
  options: QuizOption[]
  /** one or two sentences after Reveal */
  why: string
  nav: NavSpec
}

const failedLoad = (msg: string) => /could not be loaded|was not loaded/.test(msg)

function QuizView({ qkey, crumb, question, options, why, nav }: QuizProps) {
  const [revealed, setRevealed] = useState(false)
  const [runs, setRuns] = useState<Partial<Record<Letter, Option>>>({})
  const [running, setRunning] = useState(false)
  const [pick, setPick] = useState<Pick | null>(null)
  const busy = useRef(false)
  const stopped = useRef(false)
  const pickSeq = useRef(0)
  const ready = useLab((s) => s.engine.status === 'ready')
  const room = useRoom()
  useNavArrows(nav)
  const queries = options.filter((o) => o.sql).length

  const runAll = async () => {
    if (busy.current) return
    busy.current = true
    stopped.current = false
    setRunning(true)
    setRuns({})
    try {
      for (const o of options) {
        if (!o.sql) {
          setRuns((r) => ({ ...r, [o.letter]: { status: 'none' } }))
          continue
        }
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
          setRuns((r) => ({ ...r, [o.letter]: { status: 'error', text: stopped.current ? 'Stopped.' : msg, dataset: failedLoad(msg) } }))
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

  /** A click on an option, after Reveal: run its query and show the first rows or the error under the options. */
  const choose = async (o: QuizOption) => {
    if (!revealed) return
    const seq = ++pickSeq.current
    if (!o.sql) {
      setPick({ letter: o.letter, status: 'none' })
      return
    }
    if (!ready) {
      setPick({ letter: o.letter, status: 'error', text: 'The engine is still loading: click again in a moment.', dataset: false })
      return
    }
    setPick({ letter: o.letter, status: 'running' })
    try {
      const { table, more } = await runPracticeQuery(o.sql, 'lesson-pick', () => seq !== pickSeq.current)
      if (seq === pickSeq.current) setPick({ letter: o.letter, status: 'rows', table: table.slice(0, PICK_ROWS), total: table.numRows, more })
    } catch (e) {
      if (seq !== pickSeq.current) return
      const msg = errorLine(e instanceof Error ? e.message : String(e))
      setPick({ letter: o.letter, status: 'error', text: msg, dataset: failedLoad(msg) })
    }
  }
  const failedToLoad = LETTERS.some((l) => {
    const r = runs[l]
    return r?.status === 'error' && r.dataset
  })
  const rightOpt = options.find((o) => o.right)!
  const picked = pick ? options.find((o) => o.letter === pick.letter)! : null

  return (
    <>
      <div className="lesson-bar">
        <span className="lesson-crumb">{crumb}</span>
        <Nav nav={nav} />
        <span className="lesson-nav">
          {!revealed ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setRevealed(true)
                if (room?.current) room.reveal(room.current.key)
              }}
            >
              Reveal
            </button>
          ) : running ? (
            <button className="btn" onClick={stop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!ready || queries === 0} onClick={() => void runAll()} title={ready ? undefined : 'The engine is still loading'}>
              {failedToLoad ? <RefreshCw size={14} /> : <Play size={14} />} {failedToLoad ? 'Retry' : queries === options.length ? 'Run all four' : 'Run all'}
            </button>
          )}
        </span>
      </div>
      <div className="lesson-body">
        <p className="lesson-q">
          <Prose text={question} />
        </p>
        <div className="lesson-vote">
          <div className="lesson-opts">
            {options.map((o) => (
              <div
                key={o.letter}
                className={`lesson-opt${revealed && o.right ? ' right' : ''}${revealed ? ' clickable' : ''}${pick?.letter === o.letter ? ' picked' : ''}`}
                data-testid={`opt-${o.letter}`}
                data-right={revealed ? o.right : undefined}
                role={revealed ? 'button' : undefined}
                tabIndex={revealed ? 0 : undefined}
                aria-pressed={revealed ? pick?.letter === o.letter : undefined}
                title={revealed ? (o.sql ? 'Run this option' : 'This option is not a query') : undefined}
                onClick={() => void choose(o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void choose(o)
                  }
                }}
              >
                <b className="lesson-letter">{o.letter}</b>
                {o.code ? (
                  <pre className="mono">{o.text}</pre>
                ) : (
                  <div className="lesson-opt-text">
                    <Prose text={o.text} />
                  </div>
                )}
                {revealed && o.why && <p className="lesson-optwhy">{o.why}</p>}
              </div>
            ))}
          </div>
          {room ? (
            <div className="lesson-qr lesson-qr-live" data-testid="lesson-qr">
              <RoomSide />
            </div>
          ) : (
            <div className="lesson-qr" aria-hidden="true" data-testid="lesson-qr" />
          )}
        </div>
        {room && <PhoneBars right={revealed ? rightOpt.letter : null} />}
        {!revealed && <p className="lesson-muted lesson-hands">{room?.state.phase === 'live' && !room.state.lost ? 'Vote on your phone, or hands up.' : 'Vote: A, B, C or D (hands up)'}</p>}
        {revealed && (
          <>
            <h3 className="lesson-answer">{rightOpt.letter} is right.</h3>
            <p className="lesson-why">
              <b>Why:</b> {why}
            </p>
            {room?.state.phase === 'live' ? (
              <details className="lesson-fold" open={room.state.lost || undefined} data-testid="hands-fold">
                <summary>Count hands instead</summary>
                <HandCounts right={rightOpt.letter} qkey={qkey} />
              </details>
            ) : (
              <HandCounts right={rightOpt.letter} qkey={qkey} />
            )}
            {picked && pick && <PickPanel option={picked} pick={pick} />}
            <p className="lesson-muted lesson-clickhint">Click an option to run its query.</p>
            <div className="lesson-results" data-testid="lesson-results">
              {options.map((o) => {
                const r = runs[o.letter]
                if (!r) return null
                return (
                  <div key={o.letter} className="lesson-result" data-testid={`res-${o.letter}`}>
                    <b className="lesson-letter">{o.letter}</b>
                    {r.status === 'idle' ? (
                      <span className="lesson-muted">Not run yet.</span>
                    ) : r.status === 'none' ? (
                      <span className="lesson-muted">Not a query: see the line under the option.</span>
                    ) : r.status === 'running' ? (
                      <span className="lesson-muted">
                        <Loader2 size={14} className="animate-spin inline" /> Running…
                      </span>
                    ) : r.status === 'error' ? (
                      <span>
                        <b>Error:</b> {r.text}
                        {o.mssql && (
                          <>
                            {' '}
                            <b>In SQL Server:</b> {o.mssql}
                          </>
                        )}
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

/** What a click on an option showed: its query (for a warm-up), then the error with SQL Server's wording, or the first rows. */
function PickPanel({ option, pick }: { option: QuizOption; pick: Pick }) {
  return (
    <div className="lesson-pick" data-testid="lesson-pick">
      <div className="lesson-pick-head">
        <b className="lesson-letter">{option.letter}</b>
        {option.sql && option.text !== option.sql && <pre className="mono">{option.sql}</pre>}
      </div>
      {pick.status === 'running' && (
        <div className="lesson-muted">
          <Loader2 size={14} className="animate-spin inline" /> Running…
        </div>
      )}
      {pick.status === 'none' && <div className="lesson-muted">This option is not a query. The line under it says why it is right or wrong.</div>}
      {pick.status === 'error' && (
        <div data-testid="pick-error">
          <div className="lesson-pick-err">
            <b>Error:</b> {pick.text}
          </div>
          {option.mssql && (
            <div className="lesson-pick-mssql" data-testid="pick-mssql">
              <b>In SQL Server:</b> {option.mssql}
            </div>
          )}
        </div>
      )}
      {pick.status === 'rows' && (
        <div data-testid="pick-rows">
          <div className={option.right ? 'lesson-pick-ok' : 'lesson-pick-diff'}>
            <b>{option.right ? 'Right.' : 'Runs, but not the answer.'}</b>{' '}
            {pick.total === 0 ? '0 rows.' : `${pick.total.toLocaleString('en-US')}${pick.more ? '+' : ''} row${pick.total === 1 ? '' : 's'}${pick.total > PICK_ROWS ? `, the first ${PICK_ROWS} shown` : ''}.`}
          </div>
          {pick.table.numRows > 0 && <Grid table={pick.table} />}
        </div>
      )}
    </div>
  )
}

/** The teacher types how many hands each letter got; bars and percentages appear. Nothing is sent or stored. */
function HandCounts({ right, qkey }: { right: Letter; qkey: string }) {
  const scope = useScope()
  const [raw, setRaw] = useState(() => {
    const kept = loadHands(scope)[qkey]
    return kept ?? ['', '', '', '']
  })
  const shares = handShares(raw)
  const counted = shares?.reduce((a, s) => a + s.count, 0) ?? 0
  return (
    <div className="lesson-handcounts" data-testid="lesson-handcounts">
      <div className="lesson-hand-inputs">
        <b>Hands:</b>
        {LETTERS.map((l, i) => {
          const t = raw[i].trim()
          const bad = t !== '' && !/^\d{1,9}$/.test(t)
          return (
            <label key={l} title={bad ? 'Not a whole number: counted as 0' : undefined}>
              <b className="lesson-letter">{l}</b>
              <input
                inputMode="numeric"
                aria-label={`Hands for ${l}`}
                aria-invalid={bad || undefined}
                data-testid={`hands-${l}`}
                value={raw[i]}
                placeholder="0"
                onChange={(e) => {
                  const next = raw.map((v, j) => (j === i ? e.target.value : v))
                  setRaw(next)
                  saveHands(scope, qkey, next)
                }}
              />
            </label>
          )
        })}
      </div>
      {shares ? <Bars shares={shares} right={right} note={`${counted.toLocaleString('en-US')} counted`} /> : <div className="lesson-muted">Type how many hands each letter got; the bars appear here.</div>}
    </div>
  )
}

/** Bars for four counts, from hands or from phones. */
function Bars({ shares, right, note, id = '' }: { shares: NonNullable<ReturnType<typeof handShares>>; right: Letter | null; note: string; id?: string }) {
  return (
    <div className="lesson-bars" data-testid={`${id}lesson-bars`}>
      {shares.map((s) => (
        <div key={s.letter} className="lesson-barrow" data-testid={`${id}bar-${s.letter}`}>
          <b className="lesson-letter">{s.letter}</b>
          <div className="lesson-bartrack">
            <div className={`lesson-barfill${s.letter === right ? ' right' : ''}`} style={{ width: `${s.pct}%` }} />
          </div>
          <span className="lesson-barnum">
            {s.count.toLocaleString('en-US')} · {s.pct}%
          </span>
        </div>
      ))}
      <div className="lesson-muted">{note}</div>
    </div>
  )
}

/** Live votes from the room for the question on the screen: "N votes" and bars (none while nobody has voted). */
function PhoneBars({ right }: { right: Letter | null }) {
  const room = useRoom()
  if (!room || room.state.phase !== 'live') return null
  const v = teacherView(room.state, room.current)
  const lost = room.state.lost
  return (
    <div className="lesson-phonebars" data-testid="phone-bars">
      {lost && (
        <div className="lesson-lost" role="status" data-testid="room-lost">
          Connection lost: count hands.
        </div>
      )}
      {v.here && !lost && (
        <>
          <div className="lesson-phonehead">
            <b data-testid="phone-total">{votesText(v.total)}</b> <span className="lesson-muted">from phones{v.open ? ' · open' : ' · closed'}</span>
          </div>
          {sharesFromCounts(room.state.counts) && <Bars id="phone-" shares={sharesFromCounts(room.state.counts)!} right={right} note={`${v.total.toLocaleString('en-US')} counted`} />}
        </>
      )}
    </div>
  )
}

function VoteView({ section, q, nav }: { section: PracticeSection; q: number; nav: NavSpec }) {
  const item = VOTES[section.id][q - 1]
  return <QuizView qkey={planKey({ kind: 'v', set: section.id, n: q })} crumb={`SQL · ${section.n}. ${section.title} · vote`} question={item.question} options={voteOptions(item, q - 1)} why={item.why} nav={nav} />
}

function WarmView({ q, nav }: { q: number; count: number; nav: NavSpec }) {
  const item = WARMUP[q - 1]
  return <QuizView qkey={`w${q}`} crumb={`SQL · Warm-up · ${item.topic} · ${item.level}`} question={item.question} options={warmOptions(item)} why={item.why} nav={nav} />
}

/** A question on the demo shop (plan item `d<n>`): the same slide as a warm-up, over demo.customers, orders and the rest. */
function ShopView({ q, nav }: { q: number; nav: NavSpec }) {
  const item = SHOP_VOTES[q - 1]
  return <QuizView qkey={`d${q}`} crumb={`SQL · Demo shop · ${item.topic}`} question={item.question} options={warmOptions(item)} why={item.why} nav={nav} />
}

/** A fill-the-gaps question (plan item `f<n>`): the code with gaps, phones answer by choosing words or typing; Reveal shows who got what right. */
function FillView({ q, nav }: { q: number; nav: NavSpec }) {
  const item = FILL_QUESTIONS[q - 1]
  const accepted = FILL_ANSWERS[item.id]
  const [revealed, setRevealed] = useState(false)
  const room = useRoom()
  const { rows, missing, failed } = useFillRead(item.id)
  useNavArrows(nav)
  const live = room?.state.phase === 'live' && !room.state.lost
  const stats = useMemo(() => fillStats(accepted, rows), [accepted, rows])
  const right = accepted.map((a) => a[0])
  const open = !!room && room.state.q_key === item.id && room.state.open
  return (
    <>
      <div className="lesson-bar">
        <span className="lesson-crumb">SQL · Demo shop · Fill the gaps · {item.mode === 'choose' ? 'choose words' : 'type words'}</span>
        <Nav nav={nav} />
        <span className="lesson-nav">
          {!revealed && (
            <button
              className="btn btn-primary"
              data-testid="fill-reveal"
              onClick={() => {
                setRevealed(true)
                if (room?.current) room.reveal(room.current.key)
              }}
            >
              Reveal
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
            <FillCode template={item.template} words={revealed ? right : null} />
            {item.mode === 'choose' && !revealed && (
              <div className="fill-bank fill-bank-board" aria-label="Words to choose from">
                {item.bank!.map((w) => (
                  <span key={w} className="fill-chip mono">
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>
          {room ? (
            <div className="lesson-qr lesson-qr-live" data-testid="lesson-qr">
              <RoomSide />
            </div>
          ) : (
            <div className="lesson-qr" aria-hidden="true" data-testid="lesson-qr" />
          )}
        </div>
        <FillPhones total={stats.total} live={!!live} missing={missing} failed={failed} open={open} />
        {revealed && (
          <>
            <h3 className="lesson-answer">The answer</h3>
            <FillStatsPanel stats={stats} live={!!live && !missing} />
            <p className="lesson-why">
              <b>Why:</b> {FILL_WHY[item.id]}
            </p>
            <FilledQuery sql={rightQuery(item.template, accepted)} />
          </>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ C: a lesson plan, run in order

function PlanRun({ items, at, skipped, capped, checkOn, goPlan }: { items: PlanItem[]; at: number; skipped: string[]; capped: boolean; checkOn: boolean; goPlan: (items: readonly PlanItem[], at: number) => void }) {
  const nav: NavSpec = { label: 'Step', n: at, count: items.length, go: (m) => goPlan(items, m) }
  const it = items[at - 1]
  const section = it.kind === 'w' || it.kind === 'd' || it.kind === 'f' || it.kind === 's' || it.kind === 'r' ? undefined : SECTIONS.find((s) => s.id === it.set)
  let body = null
  if (it.kind === 's') body = <SchemaSlide key="s" items={items} nav={nav} />
  else if (it.kind === 'r') body = <ResultsSlide key="r" items={items} nav={nav} goStep={(m) => goPlan(items, m)} />
  else if (it.kind === 'w') body = <WarmView key={`w${it.n}`} q={it.n} count={WARMUP.length} nav={nav} />
  else if (it.kind === 'd') body = <ShopView key={`d${it.n}`} q={it.n} nav={nav} />
  else if (it.kind === 'f') body = <FillView key={`f${it.n}`} q={it.n} nav={nav} />
  else if (section && it.kind === 'v') body = <VoteView key={`v-${section.id}-${it.n}`} section={section} q={it.n} nav={nav} />
  else if (section && it.kind === 't') {
    const task = tasksOf(section)[it.n - 1]
    body = <TaskView key={task.id} section={section} task={task} check={checkOn} nav={nav} />
  }
  return (
    <>
      {(skipped.length > 0 || capped) && (
        <div className="lesson-plannote" data-testid="plan-note">
          {skipped.length > 0 && <>Skipped, not found: {skipped.join(', ')}. </>}
          {capped && <>Only the first {PLAN_MAX} items are used.</>}
        </div>
      )}
      {body}
    </>
  )
}

interface PlanRow {
  group: 'w' | 'd' | 'f' | 'v' | 't' | 'x'
  item: PlanItem
  key: string
  topic: string
  level?: Level
  text: string
}

const plain = (s: string, max = 120) => {
  const t = s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const GROUPS = [
  { id: 'x', title: 'Slides', note: 'the schema and the results of the votes: put them where you want them' },
  { id: 'w', title: 'Warm-up', note: 'a short question, four options, run a query by clicking an option' },
  { id: 'd', title: 'Demo shop', note: 'a question on the small demo shop (customers, orders): no business terms needed, run a query by clicking an option' },
  { id: 'f', title: 'Fill the gaps', note: 'a query with gaps on the demo shop: phones choose words (tap or drag) or type them; needs phones' },
  { id: 'v', title: 'Vote on code', note: 'four queries, the room votes, then all four run on the data' },
  { id: 't', title: 'Write code', note: 'a practice task: the room writes the query, Check compares it' },
] as const

const ROWS: PlanRow[] = [
  { item: { kind: 's' }, group: 'x', key: 's', topic: 'Slides', text: 'The tables the plan uses, with keys and links' },
  { item: { kind: 'r' }, group: 'x', key: 'r', topic: 'Slides', text: 'Results of every vote in the plan: votes and share right' },
  ...WARMUP.map((q, i): PlanRow => ({ item: { kind: 'w', n: i + 1 }, group: 'w', key: `w${i + 1}`, topic: q.topic, level: q.level, text: plain(q.question) })),
  ...SHOP_VOTES.map((q, i): PlanRow => ({ item: { kind: 'd', n: i + 1 }, group: 'd', key: `d${i + 1}`, topic: `Demo shop · ${q.topic}`, level: q.level, text: plain(q.question) })),
  ...FILL_QUESTIONS.map((q, i): PlanRow => ({ item: { kind: 'f', n: i + 1 }, group: 'f', key: `f${i + 1}`, topic: `Demo shop · ${q.topic}`, level: q.level, text: plain(q.question) })),
  ...Object.entries(VOTES).flatMap(([setId, qs]) => {
    const s = SECTIONS.find((x) => x.id === setId)!
    return qs.map((q, i): PlanRow => ({ item: { kind: 'v', set: setId, n: i + 1 }, group: 'v', key: planKey({ kind: 'v', set: setId, n: i + 1 }), topic: `${s.n}. ${s.title}`, text: plain(q.question) }))
  }),
  ...lessonSections(SECTIONS).flatMap((s) =>
    tasksOf(s).map((t, i): PlanRow => ({ item: { kind: 't', set: s.id, n: i + 1 }, group: 't', key: planKey({ kind: 't', set: s.id, n: i + 1 }), topic: `${s.n}. ${s.title}`, text: plain(t.question) })),
  ),
]
const WARM_TOPICS = [...new Set(WARMUP.map((q) => q.topic))]
const SHOP_TOPICS = [...new Set([...SHOP_VOTES.map((q) => q.topic), ...FILL_QUESTIONS.map((q) => q.topic)].map((t) => `Demo shop · ${t}`))]
const SECTION_TOPICS = [...new Set(ROWS.filter((r) => r.group === 'v' || r.group === 't').map((r) => r.topic))]

/** `#lesson=sql`: the teacher ticks warm-up questions, votes and tasks, and gets a link that runs them in order. */
function PlanBuilder({ note, onOpen }: { note: string | null; onOpen: (items: PlanItem[]) => void }) {
  const [sel, setSel] = useState<PlanItem[]>([])
  const [group, setGroup] = useState<'all' | 'w' | 'd' | 'f' | 'v' | 't' | 'x'>('all')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<'' | Level>('')
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const linkRef = useRef<HTMLInputElement>(null)
  const keys = sel.map(planKey)
  const link = sel.length ? location.origin + location.pathname + location.search + planHash('', sel) : ''
  const full = sel.length >= PLAN_MAX

  const shown = useMemo(() => ROWS.filter((r) => (group === 'all' || r.group === group) && (!topic || r.topic === topic) && (!level || r.level === level)), [group, topic, level])
  const toggle = (row: PlanRow) => {
    setCopied('')
    setSel((s) => (s.some((x) => planKey(x) === row.key) ? s.filter((x) => planKey(x) !== row.key) : s.length >= PLAN_MAX ? s : [...s, row.item]))
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('ok')
    } catch {
      linkRef.current?.select() // no clipboard here (an insecure page, a locked-down browser): the link is selected to copy by hand
      setCopied('fail')
    }
  }

  return (
    <div className="lesson-plan" data-testid="plan-builder">
      <h2>Lesson plan</h2>
      <p className="lesson-muted">Tick what to use, in the order you want it. The link opens the items one after another, with Back and Next.</p>
      {note && <p className="lesson-plannote">{note}</p>}
      <div className="lesson-planbox">
        <div>
          <b data-testid="plan-count">
            {sel.length} of {PLAN_MAX} items
          </b>{' '}
          <span className="mono lesson-plankeys">{keys.join(', ') || 'nothing yet'}</span>
        </div>
        <div className="lesson-planlink">
          <input ref={linkRef} readOnly value={link} placeholder="The link appears when you tick an item" aria-label="Plan link" data-testid="plan-link" onFocus={(e) => e.target.select()} />
          <button className="btn" disabled={!sel.length} onClick={() => void copy()} data-testid="plan-copy">
            <Copy size={14} /> {copied === 'ok' ? 'Copied' : 'Copy link'}
          </button>
          <button className="btn btn-primary" disabled={!sel.length} onClick={() => onOpen(sel)} data-testid="plan-open">
            <ListChecks size={14} /> Start
          </button>
          <button className="btn btn-ghost" disabled={!sel.length} onClick={() => setSel([])}>
            Clear
          </button>
        </div>
        {copied === 'fail' && <div className="lesson-muted">Could not copy automatically: the link is selected, press Ctrl+C.</div>}
        {full && <div className="lesson-muted">That is the most a plan holds ({PLAN_MAX}). Untick an item to add another.</div>}
      </div>
      <div className="lesson-filters">
        <label>
          Kind{' '}
          <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} data-testid="plan-kind">
            <option value="all">All kinds</option>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic or section{' '}
          <select value={topic} onChange={(e) => setTopic(e.target.value)} data-testid="plan-topic">
            <option value="">All</option>
            <optgroup label="Warm-up topics">
              {WARM_TOPICS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </optgroup>
            <optgroup label="Demo shop">
              {SHOP_TOPICS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </optgroup>
            <optgroup label="Sections">
              {SECTION_TOPICS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label title="Only warm-up and demo shop questions have a level">
          Level (warm-up, shop){' '}
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} data-testid="plan-level">
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      {GROUPS.map((g) => {
        const rows = shown.filter((r) => r.group === g.id)
        if (rows.length === 0) return null
        return (
          <section key={g.id} className="lesson-planlist" data-testid={`plan-group-${g.id}`}>
            <h3>
              {g.title} <span className="lesson-muted">({rows.length}) · {g.note}</span>
            </h3>
            {rows.map((r) => {
              const at = keys.indexOf(r.key)
              return (
                <label key={r.key} className={`lesson-planrow${at >= 0 ? ' on' : ''}`}>
                  <input type="checkbox" checked={at >= 0} disabled={at < 0 && full} onChange={() => toggle(r)} data-testid={`plan-pick-${r.key}`} />
                  <span className="mono lesson-planid">{r.key}</span>
                  <span className="lesson-plantext">{r.text}</span>
                  <span className="lesson-muted lesson-plantag">{r.level ? `${r.topic} · ${r.level}` : r.topic}</span>
                  {at >= 0 && <span className="lesson-planat">{at + 1}</span>}
                </label>
              )
            })}
          </section>
        )
      })}
      {shown.length === 0 && <p className="lesson-muted">Nothing matches these filters.</p>}
    </div>
  )
}
