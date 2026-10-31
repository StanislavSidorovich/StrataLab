// One long page of SQL practice on Kaiyo Trading (`#practice=sql`): a note, an example to run, a task
// to solve, and so on. It lies over the workbench and shares its engine. Only the editors on screen
// exist; the rest show their text, so a page of 70 cells stays light.
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap, placeholder } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { MSSQL, sql as sqlLang } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Table } from 'apache-arrow'
import { ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Eye, GraduationCap, Lightbulb, Loader2, Play, Square, Target, TriangleAlert, X, XCircle } from 'lucide-react'
import { create } from 'zustand'
import { compareResults, describeVerdict, type ResultData, type Verdict } from '../core/check'
import { fabricNotes, hashWithPractice, nextTask, offersKnown, practiceCounts, practiceFromHash, readProgress, type FabricNote, type PracticeProgress } from '../core/sqlPractice'
import { cancelQuery } from '../db/engine'
import { resultRows } from '../db/export'
import { SECTIONS, SECTION_TASKS, tasksOf, taskNumber } from '../data/sqlPractice'
import type { PracticeBlock, PracticeExampleCell, PracticeNote, PracticeSection, PracticeTables, PracticeTaskCell } from '../data/sqlPractice/types'
import { DataGrid } from './DataGrid'
import { completionSchema, darkBackground, lightTheme } from './SqlEditor'
import { openAndRun, openSqlPractice, runPracticeQuery, useLab } from './store'

const PROGRESS_KEY = 'stratalab.sql-practice.v1'
const LINE = 20

function loadProgress(): PracticeProgress {
  try {
    return readProgress(localStorage.getItem(PROGRESS_KEY))
  } catch {
    return readProgress(null)
  }
}

const useProgress = create<PracticeProgress>(loadProgress)
useProgress.subscribe((p) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    /* progress stays for this visit */
  }
})

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** `code` in backticks becomes code. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/).map((part, i) =>
        i % 2 ? (
          <code key={i} className="mono px-1 rounded" style={{ background: 'var(--panel-2)', fontSize: '0.92em' }}>
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}

function CellEditor({ value, onChange, onRun, onCheck, minLines, hint, label }: { value: string; onChange: (v: string) => void; onRun: () => void; onCheck?: () => void; minLines: number; hint?: string; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const text = useRef(value)
  const handlers = useRef({ onChange, onRun, onCheck })
  handlers.current = { onChange, onRun, onCheck }
  const [visible, setVisible] = useState(false)
  const dark = useLab((s) => s.theme === 'dark')
  const tables = useLab((s) => s.tables)

  useEffect(() => {
    const seen = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '600px 0px' })
    seen.observe(box.current!)
    return () => seen.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !host.current) return
    const view = new EditorView({
      parent: host.current,
      doc: text.current,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: () => (handlers.current.onRun(), true) },
            { key: 'Mod-Shift-Enter', run: () => (handlers.current.onCheck?.(), true) },
          ]),
        ),
        basicSetup,
        EditorView.lineWrapping,
        sqlLang({ dialect: MSSQL, schema: completionSchema(tables, 'main'), upperCaseKeywords: false }),
        dark ? [Prec.high(darkBackground), oneDark] : lightTheme,
        hint ? placeholder(hint) : [],
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return
          text.current = u.state.doc.toString()
          handlers.current.onChange(text.current)
        }),
      ],
    })
    return () => view.destroy()
    // The text lives in the ref: the editor is rebuilt only for what its setup depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dark, tables])

  const lines = Math.max(minLines, text.current.split('\n').length)
  return (
    <div ref={box} style={{ minHeight: lines * LINE + 8, border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--code-bg)' }}>
      {visible ? (
        <div ref={host} data-testid="practice-editor" />
      ) : (
        <pre className="mono m-0 px-10 py-1 overflow-hidden" style={{ fontSize: 13, lineHeight: `${LINE}px` }}>
          {text.current}
        </pre>
      )}
    </div>
  )
}

type Run =
  | { status: 'idle' }
  | { status: 'running'; message: string }
  | { status: 'error'; message: string }
  | { status: 'done'; table: Table; more: boolean; ms: number; notes: FabricNote[] }

/** Running one cell's query: Stop, the translator's first download, and the notes on Fabric. */
function useCellRun(id: string) {
  const [run, setRun] = useState<Run>({ status: 'idle' })
  const stopped = useRef(false)
  const exec = async (sql: string): Promise<Table | null> => {
    if (!sql.trim()) {
      setRun({ status: 'error', message: 'There is no query to run yet.' })
      return null
    }
    stopped.current = false
    const t0 = performance.now()
    setRun({ status: 'running', message: 'Running…' })
    try {
      const { table, more } = await runPracticeQuery(sql, `practice-${id}`, () => stopped.current, (p) => setRun({ status: 'running', message: p === 'download' ? 'Getting the T-SQL translator (once)…' : 'Starting the T-SQL translator…' }))
      setRun({ status: 'done', table, more, ms: performance.now() - t0, notes: fabricNotes(sql) })
      return table
    } catch (e) {
      setRun({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      return null
    }
  }
  const stop = () => {
    stopped.current = true
    void cancelQuery(`practice-${id}`)
  }
  return { run, exec, stop }
}

const SHOWN_ROWS = 10
const ROW_H = 26
const HEAD_H = 46

function RunResult({ run }: { run: Run }) {
  if (run.status === 'idle') return null
  if (run.status === 'running')
    return (
      <div className="flex items-center gap-2 py-1" role="status" style={{ color: 'var(--muted)' }}>
        <Loader2 size={14} className="animate-spin" /> {run.message}
      </div>
    )
  if (run.status === 'error')
    return (
      <div className="rounded-md px-2.5 py-1.5 flex gap-2 whitespace-pre-wrap" role="status" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <XCircle size={15} className="shrink-0 mt-0.5" />
        <span className="min-w-0 break-words">{run.message}</span>
      </div>
    )
  const rows = run.table.numRows
  return (
    <div className="space-y-1.5">
      {run.table.numCols > 0 ? (
        <div className="rounded-md overflow-hidden" style={{ height: Math.min(rows, SHOWN_ROWS) * ROW_H + HEAD_H + 2, border: '1px solid var(--line)' }}>
          <DataGrid table={run.table} compact />
        </div>
      ) : (
        <div style={{ color: 'var(--muted)' }}>Done: no rows to show.</div>
      )}
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {rows.toLocaleString('en-US')}
        {run.more ? '+' : ''} row{rows === 1 ? '' : 's'} · {run.ms.toFixed(0)} ms
      </div>
      {run.notes.map((n) => (
        <div key={n.id} className="rounded-md px-2.5 py-1.5 flex gap-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
          <TriangleAlert size={15} className="shrink-0 mt-0.5" />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  )
}

function NoteBlock({ block }: { block: PracticeNote }) {
  return (
    <div className="space-y-2">
      <p className="m-0" style={{ fontSize: 15, lineHeight: 1.55 }}>
        <Prose text={block.text} />
      </p>
      {block.syntax && (
        <pre className="mono m-0 px-3 py-2 rounded-md overflow-x-auto" style={{ background: 'var(--panel-2)', fontSize: 13 }}>
          {block.syntax}
        </pre>
      )}
      {block.trap && (
        <p className="m-0 flex gap-2" style={{ color: 'var(--warn-text)' }}>
          <TriangleAlert size={15} className="shrink-0 mt-0.5" />
          <span>
            <Prose text={block.trap} />
          </span>
        </p>
      )}
    </div>
  )
}

function TablesBlock({ block }: { block: PracticeTables }) {
  return (
    <ul className="m-0 p-0 list-none rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      {block.tables.map((t, i) => (
        <li key={t.name} className="px-3 py-2" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
          <span className="mono font-semibold">{t.name}</span>
          <span style={{ color: 'var(--muted)' }}> · one row: {t.row}</span>
          <div className="mono" style={{ color: 'var(--muted)', fontSize: 12, overflowWrap: 'anywhere' }}>
            {t.columns.join(', ')}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Opens the cell's query in the workbench, in a T-SQL tab. */
function OpenInLab({ sql, title }: { sql: string; title: string }) {
  return (
    <button
      className="btn btn-ghost"
      disabled={!sql.trim()}
      title="Open this query in a T-SQL tab of the workbench"
      onClick={() => {
        openSqlPractice(false)
        openAndRun(sql, title, 'tsql')
      }}
    >
      <ExternalLink size={14} /> <span className="hidden sm:inline">Open in Lab</span>
    </button>
  )
}

function RunButton({ run, exec, stop }: { run: Run; exec: () => void; stop: () => void }) {
  const ready = useLab((s) => s.engine.status === 'ready')
  if (run.status === 'running')
    return (
      <button className="btn" onClick={stop}>
        <Square size={14} /> Stop
      </button>
    )
  return (
    <button className="btn" disabled={!ready} onClick={exec} title={ready ? 'Run (Ctrl+Enter)' : 'The engine is still loading'}>
      <Play size={14} /> Run
    </button>
  )
}

function ExampleBlock({ block }: { block: PracticeExampleCell }) {
  const [text, setText] = useState(block.sql)
  const { run, exec, stop } = useCellRun(block.id)
  const go = () => void exec(text)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold flex-1 min-w-[12rem]">
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Example · </span>
          {block.title}
        </span>
        <RunButton run={run} exec={go} stop={stop} />
        <OpenInLab sql={text} title={block.title} />
      </div>
      <CellEditor value={block.sql} onChange={setText} onRun={go} minLines={1} label={`Example: ${block.title}`} />
      <RunResult run={run} />
    </div>
  )
}

type CheckState = { verdict: Verdict; trap: string | null } | null

function TaskBlock({ section, block, onNext }: { section: PracticeSection; block: PracticeTaskCell; onNext: (id: string) => void }) {
  const number = taskNumber(section, block)
  const saved = useProgress((p) => p.drafts[block.id] ?? '')
  const hints = useProgress((p) => p.hints[block.id] ?? 0)
  const solved = useProgress((p) => p.solved.includes(block.id))
  const [initial, setInitial] = useState(saved)
  const [editorKey, setEditorKey] = useState(0)
  const text = useRef(saved)
  const { run, exec, stop } = useCellRun(block.id)
  const [check, setCheck] = useState<CheckState>(null)
  const [checking, setChecking] = useState(false)
  const [offer, setOffer] = useState(false)
  const ready = useLab((s) => s.engine.status === 'ready')

  const change = (v: string) => {
    text.current = v
    useProgress.setState((p) => ({ drafts: { ...p.drafts, [block.id]: v } }))
  }
  const go = () => {
    setCheck(null)
    void exec(text.current)
  }
  const doCheck = async () => {
    setCheck(null)
    setChecking(true)
    try {
      const table = await exec(text.current)
      if (!table) return
      if (table.numCols === 0) return
      const got: ResultData = resultRows(table)
      const never = () => false
      const expected = resultRows((await runPracticeQuery(block.solution, `practice-${block.id}-answer`, never)).table)
      const verdict = compareResults(got, expected, block.ordered)
      let trap: string | null = null
      if (!verdict.ok) {
        for (const t of block.traps ?? []) {
          const wrong = resultRows((await runPracticeQuery(t.sql, `practice-${block.id}-trap`, never)).table)
          if (compareResults(got, wrong, block.ordered).ok) {
            trap = t.says
            break
          }
        }
      } else {
        const p = useProgress.getState()
        const section_ = SECTION_TASKS.find((s) => s.id === section.id)!
        setOffer(offersKnown(section_, block.id, p))
        if (!p.solved.includes(block.id)) useProgress.setState({ solved: [...p.solved, block.id] })
      }
      setCheck({ verdict, trap })
    } catch (e) {
      setCheck(null)
      useLab.setState({ importError: `The answer could not be computed (were the quaera tables changed?): ${String(e instanceof Error ? e.message : e).split('\n')[0]}` })
    } finally {
      setChecking(false)
    }
  }
  const showSolution = () => {
    if (!confirm('Show the solution? It is added under your query.')) return
    const next = `${text.current.trimEnd()}${text.current.trim() ? '\n\n' : ''}-- Solution:\n${block.solution}\n`
    change(next)
    setInitial(next)
    setEditorKey((k) => k + 1)
  }
  const next = check?.verdict.ok ? nextTask(SECTION_TASKS, useProgress.getState()) : null
  const said = check ? describeVerdict(check.verdict) : null

  return (
    <div id={`task-${block.id}`} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: `1px solid ${solved ? 'var(--accent)' : 'var(--line)'}`, scrollMarginTop: 72 }}>
      <div className="font-semibold flex items-center gap-2">
        {solved ? <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} aria-label="Solved" /> : <GraduationCap size={16} style={{ color: 'var(--muted)' }} />}
        Task {number} · {block.title}
      </div>
      <p className="m-0" style={{ fontSize: 15, lineHeight: 1.5 }}>
        <Prose text={block.question} />
      </p>
      <CellEditor key={editorKey} value={initial} onChange={change} onRun={go} onCheck={() => void doCheck()} minLines={4} hint="Write your query here" label={`Task ${number}: your query`} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <RunButton run={run} exec={go} stop={stop} />
        <button className="btn btn-primary" disabled={!ready || checking} onClick={() => void doCheck()} title="Run your query and compare its result with the answer (Ctrl+Shift+Enter)">
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Check
        </button>
        <button className="btn" disabled={hints >= block.hints.length} onClick={() => useProgress.setState((p) => ({ hints: { ...p.hints, [block.id]: hints + 1 } }))}>
          <Lightbulb size={14} /> Hint {hints < block.hints.length ? `${hints + 1}/${block.hints.length}` : ''}
        </button>
        <button className="btn btn-ghost" onClick={showSolution}>
          <Eye size={14} /> Solution
        </button>
        <OpenInLab sql={text.current} title={`Task ${number}`} />
      </div>
      {hints > 0 && (
        <ol className="m-0 p-0 list-none space-y-0.5">
          {block.hints.slice(0, hints).map((h, i) => (
            <li key={i} className="flex gap-1.5">
              <Lightbulb size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--warn-text)' }} />
              <span>{h}</span>
            </li>
          ))}
        </ol>
      )}
      <RunResult run={run} />
      {check && said && (
        <div role="status" className="rounded-md px-2.5 py-1.5 flex gap-2" style={check.verdict.ok ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
          {check.verdict.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
          <span className="flex-1 min-w-0">
            <b>{said.title}</b> {check.trap ?? said.detail}
          </span>
          {next && (
            <button className="btn shrink-0" onClick={() => onNext(next)}>
              Next task <ArrowDown size={14} />
            </button>
          )}
        </div>
      )}
      {offer && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex-1 min-w-[12rem]">You solved the hardest task of this section. Skip the rest?</span>
          <button
            className="btn"
            onClick={() => {
              useProgress.setState((p) => ({ known: p.known.includes(section.id) ? p.known : [...p.known, section.id] }))
              setOffer(false)
            }}
          >
            Mark the section as known
          </button>
        </div>
      )}
    </div>
  )
}

function Block({ section, block, onNext }: { section: PracticeSection; block: PracticeBlock; onNext: (id: string) => void }) {
  switch (block.kind) {
    case 'note':
      return <NoteBlock block={block} />
    case 'tables':
      return <TablesBlock block={block} />
    case 'example':
      return <ExampleBlock block={block} />
    case 'task':
      return <TaskBlock section={section} block={block} onNext={onNext} />
  }
}

function SectionView({ section, onNext }: { section: PracticeSection; onNext: (id: string) => void }) {
  const known = useProgress((p) => p.known.includes(section.id))
  const [opened, setOpened] = useState(false)
  const tasks = tasksOf(section)
  const open = !known || opened
  return (
    <section id={`section-${section.id}`} data-section={section.id} className="space-y-4" style={{ scrollMarginTop: 64 }}>
      <div className="flex items-center gap-2 flex-wrap pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <h2 className="m-0 flex-1 min-w-[12rem] text-lg font-semibold">
          {known && (
            <button className="mr-1 align-middle" onClick={() => setOpened(!opened)} aria-expanded={open} aria-label={open ? 'Fold this section' : 'Show this section'}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          <span style={{ color: 'var(--muted)' }}>{section.n}</span> {section.title}
        </h2>
        {tasks.length > 0 && !known && (
          <button className="btn btn-ghost" onClick={() => onNext(tasks[tasks.length - 1].id)} title="Jump to this section's hardest task. Solve it to skip the rest.">
            <Target size={14} /> Test me
          </button>
        )}
        {tasks.length > 0 && (
          <button
            className="btn btn-ghost"
            aria-pressed={known}
            onClick={() => {
              useProgress.setState((p) => ({ known: toggled(p.known, section.id) }))
              setOpened(false)
            }}
            title={known ? 'Back to not known' : 'Fold this section: you remember it. It is not counted as solved.'}
          >
            {known ? <CheckCircle2 size={14} /> : <Check size={14} />} {known ? 'Known' : 'I know this'}
          </button>
        )}
      </div>
      {open && section.blocks.map((b, i) => <Block key={i} section={section} block={b} onNext={onNext} />)}
    </section>
  )
}

export function SqlPracticePage() {
  const open = useLab((s) => s.sqlPracticeOpen)
  if (!open) return null
  return <Page />
}

function Page() {
  const progress = useProgress()
  const counts = practiceCounts(SECTION_TASKS, progress)
  const next = nextTask(SECTION_TASKS, progress)
  const main = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => practiceFromHash(location.hash)?.at ?? SECTIONS[0].id)
  const shown = useMemo(() => SECTIONS.filter((s) => !progress.hideKnown || !progress.known.includes(s.id)), [progress.hideKnown, progress.known])

  const toSection = (id: string) => document.getElementById(`section-${id}`)?.scrollIntoView()
  const toTask = (id: string) => document.getElementById(`task-${id}`)?.scrollIntoView()

  // Opened on a section's address: go there once, before the list starts following the scroll
  // (the top section is in view at first, and would take over the address).
  const settled = useRef(false)
  useEffect(() => {
    const at = practiceFromHash(location.hash)?.at
    if (at) toSection(at)
    const done = setTimeout(() => (settled.current = true), 300)
    return () => clearTimeout(done)
  }, [])

  // The section being read: marked in the list and kept in the address.
  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)?.target.getAttribute('data-section')
        if (!hit || !settled.current) return
        setActive(hit)
        history.replaceState(null, '', location.pathname + location.search + hashWithPractice(location.hash, hit))
      },
      { root: main.current, rootMargin: '-15% 0px -80% 0px' },
    )
    main.current?.querySelectorAll('[data-section]').forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [shown])

  const statusOf = (s: PracticeSection) => {
    const ids = tasksOf(s).map((t) => t.id)
    return { known: progress.known.includes(s.id), done: ids.filter((t) => progress.solved.includes(t)).length, total: ids.length }
  }

  return (
    <div className="absolute inset-0 z-30 flex min-w-0" style={{ background: 'var(--bg)' }} data-testid="sql-practice">
      <nav aria-label="Sections" className="hidden md:flex flex-col w-56 shrink-0 overflow-y-auto p-2" style={{ background: 'var(--panel)', borderRight: '1px solid var(--line)' }}>
        <ul className="m-0 p-0 list-none flex-1">
          {SECTIONS.map((s) => {
            const st = statusOf(s)
            return (
              <li key={s.id}>
                <button
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md"
                  style={s.id === active ? { background: 'var(--accent-soft)', fontWeight: 600 } : { color: st.known ? 'var(--muted)' : undefined }}
                  aria-current={s.id === active ? 'true' : undefined}
                  onClick={() => toSection(s.id)}
                >
                  <span className="w-5 shrink-0 tabular-nums" style={{ color: 'var(--muted)' }}>
                    {s.n}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  {st.total > 0 && (
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {st.done === st.total ? <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} aria-label="All solved" /> : st.known ? 'known' : `${st.done}/${st.total}`}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <label className="flex items-center gap-2 px-2 py-2" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={progress.hideKnown} onChange={(e) => useProgress.setState({ hideKnown: e.target.checked })} /> Hide known sections
        </label>
      </nav>
      <div ref={main} className="flex-1 min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-20 px-4 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
          <div className="flex-1 min-w-[10rem]">
            <div className="font-semibold">SQL practice · Kaiyo Trading</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {counts.solved} solved · {counts.known} known · {counts.left} left
            </div>
          </div>
          {next && (
            <button className="btn btn-primary" onClick={() => toTask(next)}>
              Continue <ArrowRight size={14} />
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => openSqlPractice(false)} aria-label="Close the practice" title="Back to the workbench">
            <X size={16} />
          </button>
        </header>
        <div className="md:hidden px-4 pt-3">
          <select className="field w-full" aria-label="Go to section" value={active} onChange={(e) => toSection(e.target.value)}>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.n} {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-8">
          <p className="m-0" style={{ color: 'var(--muted)' }}>
            Look, remember, solve. For an explanation from the start, see the{' '}
            <a href="https://quaera.app" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              SQL track on quaera.app
            </a>
            . Your queries are T-SQL, translated to DuckDB in this browser: nearly the same as Fabric Warehouse, and a yellow note marks where it is not.
          </p>
          {shown.map((s) => (
            <SectionView key={s.id} section={s} onNext={toTask} />
          ))}
          <div className="flex justify-end">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => {
                if (confirm('Forget what you solved, marked and wrote on this page?')) useProgress.setState(readProgress(null))
              }}
            >
              Reset progress
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
