// One long page of practice on Kaiyo Trading (`#practice=sql`, `#practice=python`): a note, an example
// to run, a task to solve, and so on. It lies over the workbench and shares its engines. Only the
// editors on screen exist; the rest show their text, so a page of 70 cells stays light.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap, placeholder } from '@codemirror/view'
import { Prec, type Extension } from '@codemirror/state'
import { MSSQL, sql as sqlLang } from '@codemirror/lang-sql'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Table } from 'apache-arrow'
import { ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Eye, GraduationCap, Lightbulb, Loader2, Play, Square, Table2, Target, TriangleAlert, X, XCircle } from 'lucide-react'
import { create } from 'zustand'
import { compareResults, describeVerdict, type ResultData, type Verdict } from '../core/check'
import type { Output } from '../core/ipynb'
import { fabricNotes, hashWithPractice, nextTask, offersKnown, practiceCounts, practiceFromHash, readProgress, type BookKind, type FabricNote, type PracticeProgress, type SectionTasks } from '../core/sqlPractice'
import { cancelQuery } from '../db/engine'
import { resultRows } from '../db/export'
import { SECTIONS as SQL_SECTIONS, SECTION_TASKS as SQL_TASKS } from '../data/sqlPractice'
import { SECTIONS as PY_SECTIONS, SECTION_TASKS as PY_TASKS } from '../data/pyPractice'
import { aliasesIn, BOOK_TABLES } from '../data/pyPractice/tables'
import { taskNumber, tasksOf, type PracticeBlock, type PracticeExampleCell, type PracticeNote, type PracticeSection, type PracticeTables, type PracticeTaskCell } from '../data/practiceBook'
import { DataGrid } from './DataGrid'
import { Menu, useLongPress, type MenuItem } from './Menu'
import { completionSchema, darkBackground, lightTheme } from './SqlEditor'
import { OutputView } from './PythonOutput'
import { addTab, openAndRun, openPracticeBook, restartPython, runPracticePython, runPracticeQuery, startPython, useLab } from './store'

const LINE = 20

function progressStore(key: string) {
  const load = () => {
    try {
      return readProgress(localStorage.getItem(key))
    } catch {
      return readProgress(null)
    }
  }
  const store = create<PracticeProgress>(load)
  store.subscribe((p) => {
    try {
      localStorage.setItem(key, JSON.stringify(p))
    } catch {
      /* progress stays for this visit */
    }
  })
  return store
}

/** What a run of a cell gives: the rows to compare, and what to show. */
interface BookRun {
  /** the answer to compare; for SQL also the grid */
  table: Table | null
  more: boolean
  notes: FabricNote[]
  /** Python: what the cell showed, in order, with its DataFrames by place */
  outputs?: Output[]
  frames?: Record<number, Table>
  failed?: boolean
}

/** A page's language: how it runs a cell and what it says. */
interface BookEngine {
  kind: BookKind
  title: string
  sections: PracticeSection[]
  tasks: SectionTasks[]
  useProgress: ReturnType<typeof progressStore>
  language: (tables: ReturnType<typeof useLab.getState>['tables']) => Extension
  comment: string
  writeHint: string
  empty: string
  intro: ReactNode
  /** Shown after the last task, if the book has a next step elsewhere. */
  outro?: ReactNode
  run: (code: string, tag: string, isStopped: () => boolean, onProgress: (text: string) => void) => Promise<BookRun>
  /** the cell's result as rows to compare */
  rows: (code: string, tag: string) => Promise<ResultData>
  stop: (tag: string) => void
  openInLab: (code: string, title: string) => void
  openTitle: string
  /** how code names a table, a few rows of it, and one of its columns (for the right-click menu) */
  tableRef: (t: BookTable) => string
  peek: (t: BookTable) => string
  columnRef: (t: BookTable, column: string) => string
}

type BookTable = PracticeTables['tables'][number]

const linkStyle = { color: 'var(--accent)' }

const SQL_ENGINE: BookEngine = {
  kind: 'sql',
  title: 'SQL practice · Kaiyo Trading',
  sections: SQL_SECTIONS,
  tasks: SQL_TASKS,
  useProgress: progressStore('stratalab.sql-practice.v1'),
  language: (tables) => sqlLang({ dialect: MSSQL, schema: completionSchema(tables, 'main'), upperCaseKeywords: false }),
  comment: '--',
  writeHint: 'Write your query here',
  empty: 'There is no query to run yet.',
  intro: (
    <>
      Look, remember, solve. For an explanation from the start, see the{' '}
      <a href="https://quaera.app" target="_blank" rel="noreferrer" style={linkStyle}>
        SQL track on quaera.app
      </a>
      . Your queries are T-SQL, translated to DuckDB in this browser: nearly the same as Fabric Warehouse, and a yellow note marks where it is not.
      <span className="block mt-3 px-3 py-2 rounded-md" style={{ background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)', color: 'var(--text)' }}>
        <strong>Why every table starts with quaera.</strong>
        <br />
        Tables live in a schema, a folder inside the database, and here that schema is called <strong>quaera</strong>. So a table is always written with it in front:{' '}
        <code className="mono px-1 rounded" style={{ background: 'var(--panel)', border: '1px solid var(--line)', fontWeight: 600 }}>SELECT * FROM quaera.dim_product</code>. Without{' '}
        <code className="mono px-1 rounded" style={{ background: 'var(--panel)', border: '1px solid var(--line)', fontWeight: 600 }}>quaera.</code> the database does not know where to look.
      </span>
    </>
  ),
  run: async (code, tag, isStopped, onProgress) => {
    const { table, more } = await runPracticeQuery(code, tag, isStopped, (p) => onProgress(p === 'download' ? 'Getting the T-SQL translator (once)…' : 'Starting the T-SQL translator…'))
    return { table, more, notes: fabricNotes(code) }
  },
  rows: async (code, tag) => resultRows((await runPracticeQuery(code, tag, () => false)).table),
  stop: (tag) => void cancelQuery(tag),
  openInLab: (code, title) => openAndRun(code, title, 'tsql'),
  openTitle: 'Open this query in a T-SQL tab of the workbench',
  tableRef: (t) => `quaera.${t.name}`,
  peek: (t) => `SELECT TOP 100 * FROM quaera.${t.name};`,
  columnRef: (t, c) => `quaera.${t.name}.${c}`,
}

/** A cell as a Python tab has to write it: there the tables are not variables yet. */
function asPythonTab(code: string) {
  const reads = aliasesIn(code).map((a) => `${a} = lab.table("${BOOK_TABLES[a]}")`)
  return ['import numpy as np', 'import pandas as pd', ...reads, '', code].join('\n')
}

const PY_ENGINE: BookEngine = {
  kind: 'python',
  title: 'Python practice · Kaiyo Trading',
  sections: PY_SECTIONS,
  tasks: PY_TASKS,
  useProgress: progressStore('stratalab.python-practice.v1'),
  language: () => python(),
  comment: '#',
  writeHint: 'Write your code here. The last line is your answer.',
  empty: 'There is no code to run yet.',
  intro: (
    <>
      Look, remember, solve, from a first look at the data to a business answer. For an explanation from the start, see the{' '}
      <a href="https://quaera.app" target="_blank" rel="noreferrer" style={linkStyle}>
        pandas track on quaera.app
      </a>{' '}
      or the{' '}
      <a href="https://pandas.quaera.app" target="_blank" rel="noreferrer" style={linkStyle}>
        pandas notebook
      </a>
      . Every cell starts clean, with <code className="mono">pd</code>, <code className="mono">np</code> and the tables ready as variables, so cells never depend on each other. The last line of a cell is its answer. Python runs in this browser and starts once, in about ten seconds.
    </>
  ),
  outro: (
    <>
      Next:{' '}
      <a href="https://pandas.quaera.app" target="_blank" rel="noreferrer" style={linkStyle}>
        a real Colab notebook on a cloud dataset (BigQuery, TheLook), 137 tasks
      </a>
      .
    </>
  ),
  run: async (code) => {
    const r = await runPracticePython(code)
    const error = r.result.outputs.some((o) => o.output_type === 'error')
    return { table: r.answer, more: false, notes: [], outputs: r.result.outputs, frames: Object.fromEntries(r.frames.map((f) => [f.at, f.table])), failed: error }
  },
  rows: async (code) => {
    const r = await runPracticePython(code)
    const failed = r.result.outputs.find((o) => o.output_type === 'error')
    if (failed && failed.output_type === 'error') throw new Error(`${failed.ename}: ${failed.evalue}`)
    if (!r.answer) throw new Error('The cell gave no answer.')
    return resultRows(r.answer)
  },
  stop: () => restartPython(),
  openInLab: (code, title) => void addTab(asPythonTab(code), title, 'python'),
  openTitle: 'Open this code in a Python tab of the workbench',
  tableRef: (t) => t.alias ?? t.name,
  peek: (t) => `${t.alias ?? t.name}.head(100)`,
  columnRef: (t, c) => `${t.alias ?? t.name}["${c}"]`,
}

const ENGINES: Record<BookKind, BookEngine> = { sql: SQL_ENGINE, python: PY_ENGINE }

const BookContext = createContext<BookEngine>(SQL_ENGINE)
const useBook = () => useContext(BookContext)

/** The page's one right-click menu: any block asks for it to open at a point, with its own items. */
const MenuContext = createContext<(at: { x: number; y: number }, items: MenuItem[]) => void>(() => {})

const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => {})

/** What the user has selected on the page, if anything: offered first in every menu. */
function selectionItems(): MenuItem[] {
  const sel = window.getSelection()?.toString() ?? ''
  return sel.trim() ? [['Copy selection', () => copy(sel)], 'separator'] : []
}

/** Handlers for an element that opens the menu on right-click, and on a long press on a touch screen. */
function useContextMenu(items: () => MenuItem[]) {
  const open = useContext(MenuContext)
  const longPress = useLongPress((at) => open(at, [...selectionItems(), ...items()]))
  return {
    ...longPress,
    onContextMenu: (e: React.MouseEvent) => {
      // A link keeps the browser's menu (open in a new tab); the innermost block wins.
      if ((e.target as HTMLElement).closest('a')) return
      e.preventDefault()
      e.stopPropagation()
      open({ x: e.clientX, y: e.clientY }, [...selectionItems(), ...items()])
    },
  }
}

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
  const book = useBook()
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
        // No clipping box around the editor, so the completion list can reach out of it: round the editor itself.
        EditorView.theme({ '&': { borderRadius: '5px' }, '.cm-scroller': { borderRadius: '5px' }, '.cm-gutters': { borderRadius: '5px 0 0 5px' } }),
        book.language(tables),
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
    <div ref={box} style={{ minHeight: lines * LINE + 8, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--code-bg)' }}>
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
  | { status: 'done'; ms: number; result: BookRun }

/** Running one cell: Stop, what is being started the first time, and the notes on Fabric. */
function useCellRun(id: string) {
  const book = useBook()
  const [run, setRun] = useState<Run>({ status: 'idle' })
  const stopped = useRef(false)
  const exec = async (code: string): Promise<BookRun | null> => {
    if (!code.trim()) {
      setRun({ status: 'error', message: book.empty })
      return null
    }
    stopped.current = false
    const t0 = performance.now()
    setRun({ status: 'running', message: 'Running…' })
    try {
      const result = await book.run(code, `practice-${id}`, () => stopped.current, (message) => setRun({ status: 'running', message }))
      setRun({ status: 'done', ms: performance.now() - t0, result })
      return result
    } catch (e) {
      setRun({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      return null
    }
  }
  /** Adds a note under a finished run. */
  const note = (n: FabricNote) => setRun((r) => (r.status === 'done' ? { ...r, result: { ...r.result, notes: [...r.result.notes, n] } } : r))
  const stop = () => {
    stopped.current = true
    book.stop(`practice-${id}`)
  }
  return { run, exec, stop, note }
}

const SHOWN_ROWS = 10
const ROW_H = 26
const HEAD_H = 46
/** Room for the horizontal scrollbar of a wide table, so a short table needs no vertical scroll. */
const SCROLLBAR_H = 16

function Grid({ table }: { table: Table }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ height: Math.min(table.numRows, SHOWN_ROWS) * ROW_H + HEAD_H + 2 + (table.numRows <= SHOWN_ROWS ? SCROLLBAR_H : 0), border: '1px solid var(--line)' }}>
      <DataGrid table={table} compact />
    </div>
  )
}

/** A cell whose last line is one number or short text: its text, or null for a table, a chart or a long value. */
function singleValue(o: Output): string | null {
  if (o.output_type !== 'execute_result' || o.data['image/png']) return null
  const text = (o.data['text/plain'] ?? '').trim()
  return text && text.length <= 60 && !text.includes('\n') ? text : null
}

function SingleValue({ text }: { text: string }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-md px-3 py-1.5" style={{ background: 'var(--panel-2)' }}>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Result</span>
      <span className="mono font-semibold" style={{ fontSize: 18 }}>
        {text}
      </span>
    </div>
  )
}

function RunResult({ run }: { run: Run }) {
  const book = useBook()
  const kernel = useLab((s) => s.python)
  if (run.status === 'idle') return null
  if (run.status === 'running')
    return (
      <div className="flex items-center gap-2 py-1" role="status" style={{ color: 'var(--muted)' }}>
        <Loader2 size={14} className="animate-spin" /> {book.kind === 'python' && kernel.status === 'loading' ? 'Starting Python (once, about ten seconds)…' : run.message}
      </div>
    )
  if (run.status === 'error')
    return (
      <div className="rounded-md px-2.5 py-1.5 flex gap-2 whitespace-pre-wrap" role="status" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <XCircle size={15} className="shrink-0 mt-0.5" />
        <span className="min-w-0 break-words">{run.message}</span>
      </div>
    )
  const { result } = run
  const rows = result.table?.numRows ?? 0
  return (
    <div className="space-y-1.5">
      {result.outputs ? (
        result.outputs.map((o, i) => {
          const single = !result.frames?.[i] && singleValue(o)
          return single ? <SingleValue key={i} text={single} /> : <OutputView key={i} o={o} frame={result.frames?.[i] && <Grid table={result.frames[i]} />} />
        })
      ) : result.table && result.table.numCols > 0 ? (
        <Grid table={result.table} />
      ) : (
        <div style={{ color: 'var(--muted)' }}>Done: no rows to show.</div>
      )}
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {result.table && !(result.outputs?.some(singleValue) && Object.keys(result.frames ?? {}).length === 0) && (
          <>
            {rows.toLocaleString('en-US')}
            {result.more ? '+' : ''} row{rows === 1 ? '' : 's'} ·{' '}
          </>
        )}
        {run.ms.toFixed(0)} ms
      </div>
      {result.notes.map((n) => (
        <div key={n.id} className="rounded-md px-2.5 py-1.5 flex gap-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
          <TriangleAlert size={15} className="shrink-0 mt-0.5" />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  )
}

/** The page is wide for code and result tables; running text keeps a line length that reads well. */
const READABLE = 'max-w-[46rem]'

function NoteBlock({ block, afterWork }: { block: PracticeNote; afterWork: boolean }) {
  return (
    <div className={afterWork ? 'space-y-2 pt-5 mt-2' : 'space-y-2'} style={afterWork ? { borderTop: '1px solid var(--line)' } : undefined}>
      <div className="font-semibold" style={{ color: 'var(--muted)', fontWeight: 500 }}>
        Reminder
      </div>
      <p className={`m-0 ${READABLE}`} style={{ fontSize: 15, lineHeight: 1.55 }}>
        <Prose text={block.text} />
      </p>
      {block.syntax && (
        <pre className="mono m-0 px-3 py-2 rounded-md overflow-x-auto" style={{ background: 'var(--panel-2)', fontSize: 13 }}>
          {block.syntax}
        </pre>
      )}
      {block.trap && (
        <p className={`m-0 flex gap-2 ${READABLE}`} style={{ color: 'var(--warn-text)' }}>
          <TriangleAlert size={15} className="shrink-0 mt-0.5" />
          <span>
            <Prose text={block.trap} />
          </span>
        </p>
      )}
    </div>
  )
}

function TableItem({ table: t, first }: { table: BookTable; first: boolean }) {
  const book = useBook()
  const open = useContext(MenuContext)
  const tableItems = (): MenuItem[] => [
    [`Copy ${book.tableRef(t)}`, () => copy(book.tableRef(t))],
    [book.kind === 'python' ? 'Copy a look at the rows' : 'Copy SELECT TOP 100', () => copy(book.peek(t))],
    ['Open a look at the rows in Lab', () => (openPracticeBook(null), book.openInLab(book.peek(t), t.name))],
  ]
  // Over a column name the menu is about the column first, then about its table.
  const columnItems = (c: string): MenuItem[] => [
    [`Copy ${c}`, () => copy(c)],
    [`Copy ${book.columnRef(t, c)}`, () => copy(book.columnRef(t, c))],
  ]
  const itemsAt = (target: Element | null): MenuItem[] => {
    const column = target?.closest('[data-column]')?.getAttribute('data-column')
    return [...selectionItems(), ...(column ? [...columnItems(column), 'separator' as const] : []), ...tableItems()]
  }
  const longPress = useLongPress((at) => open(at, itemsAt(document.elementFromPoint(at.x, at.y))))
  return (
    <li
      className="px-3 py-2"
      style={first ? undefined : { borderTop: '1px solid var(--line)' }}
      {...longPress}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        open({ x: e.clientX, y: e.clientY }, itemsAt(e.target as Element))
      }}
    >
      <span className="mono font-semibold">{t.alias ?? t.name}</span>
      <span style={{ color: 'var(--muted)' }}>
        {t.alias ? ` (${t.name})` : ''} · one row: {t.row}
      </span>
      <div className="mono" style={{ color: 'var(--muted)', fontSize: 12, overflowWrap: 'anywhere' }}>
        {t.columns.map((c, i) => (
          <span key={c} data-column={c}>
            {c}
            {i < t.columns.length - 1 ? ', ' : ''}
          </span>
        ))}
      </div>
    </li>
  )
}

function TablesBlock({ block }: { block: PracticeTables }) {
  return (
    <ul className="m-0 p-0 list-none rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      {block.tables.map((t, i) => (
        <TableItem key={t.name} table={t} first={i === 0} />
      ))}
    </ul>
  )
}

/** Opens the cell in the workbench, in a tab of its language. */
function OpenInLab({ code, title }: { code: string; title: string }) {
  const book = useBook()
  return (
    <button
      className="btn btn-ghost"
      disabled={!code.trim()}
      title={book.openTitle}
      onClick={() => {
        openPracticeBook(null)
        book.openInLab(code, title)
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
  const [text, setText] = useState(block.code)
  const { run, exec, stop } = useCellRun(block.id)
  const go = () => void exec(text)
  const book = useBook()
  const ready = useLab((s) => s.engine.status === 'ready')
  const menu = useContextMenu(() => [
    run.status === 'running' ? ['Stop', stop] : ['Run', go, { disabled: !ready, keys: 'Ctrl+Enter' }],
    'separator',
    ['Copy code', () => copy(text)],
    ['Open in Lab', () => (openPracticeBook(null), book.openInLab(text, block.title)), { disabled: !text.trim() }],
  ])
  return (
    <div className="space-y-2" {...menu}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold flex-1 min-w-[12rem]">
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Example · </span>
          {block.title}
        </span>
        <RunButton run={run} exec={go} stop={stop} />
        <OpenInLab code={text} title={block.title} />
      </div>
      <CellEditor value={block.code} onChange={setText} onRun={go} minLines={1} label={`Example: ${block.title}`} />
      <RunResult run={run} />
    </div>
  )
}

type CheckState = { verdict: Verdict; trap: string | null } | null

function TaskBlock({ section, block, onNext }: { section: PracticeSection; block: PracticeTaskCell; onNext: (id: string) => void }) {
  const book = useBook()
  const useProgress = book.useProgress
  const number = taskNumber(section, block)
  const saved = useProgress((p) => p.drafts[block.id] ?? '')
  const hints = useProgress((p) => p.hints[block.id] ?? 0)
  const solved = useProgress((p) => p.solved.includes(block.id))
  const [initial, setInitial] = useState(saved)
  const [editorKey, setEditorKey] = useState(0)
  const text = useRef(saved)
  const { run, exec, stop, note } = useCellRun(block.id)
  const [check, setCheck] = useState<CheckState>(null)
  const [checking, setChecking] = useState(false)
  const [offer, setOffer] = useState(false)
  const [solutionShown, setSolutionShown] = useState(false)
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
      const ran = await exec(text.current)
      if (!ran || ran.failed) return
      if (!ran.table || ran.table.numCols === 0) {
        if (book.kind === 'python') note({ id: 'no-answer', text: 'Nothing to check: end the cell with the answer itself, not an assignment. Put the variable’s name on the last line.' })
        return
      }
      const got: ResultData = resultRows(ran.table)
      const expected = await book.rows(block.solution, `practice-${block.id}-answer`)
      const verdict = compareResults(got, expected, block.ordered)
      let trap: string | null = null
      if (!verdict.ok) {
        for (const t of block.traps ?? []) {
          const wrong = await book.rows(t.code, `practice-${block.id}-trap`)
          if (compareResults(got, wrong, block.ordered).ok) {
            trap = t.says
            break
          }
        }
      } else {
        const p = useProgress.getState()
        const section_ = book.tasks.find((s) => s.id === section.id)!
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
    if (!confirm('Show the solution? It is added under what you wrote.')) return
    const next = `${text.current.trimEnd()}${text.current.trim() ? '\n\n' : ''}${book.comment} Solution:\n${block.solution}\n`
    change(next)
    setInitial(next)
    setEditorKey((k) => k + 1)
    setSolutionShown(true)
  }
  const next = check?.verdict.ok ? nextTask(book.tasks, useProgress.getState()) : null
  const said = check ? describeVerdict(check.verdict, book.kind) : null
  const moreHint = () => useProgress.setState((p) => ({ hints: { ...p.hints, [block.id]: hints + 1 } }))
  const clear = () => {
    if (text.current.trim() && !confirm('Clear your answer?')) return
    change('')
    setInitial('')
    setEditorKey((k) => k + 1)
    setCheck(null)
  }
  const menu = useContextMenu(() => [
    run.status === 'running' ? ['Stop', stop] : ['Run', go, { disabled: !ready, keys: 'Ctrl+Enter' }],
    ['Check', () => void doCheck(), { disabled: !ready || checking, keys: 'Ctrl+Shift+Enter' }],
    'separator',
    [hints < block.hints.length ? `Hint ${hints + 1}/${block.hints.length}` : 'No more hints', moreHint, { disabled: hints >= block.hints.length }],
    ['Show the solution', showSolution],
    'separator',
    ['Copy my answer', () => copy(text.current), { disabled: !text.current.trim() }],
    ['Open in Lab', () => (openPracticeBook(null), book.openInLab(text.current, `Task ${number}`)), { disabled: !text.current.trim() }],
    ['Clear my answer', clear],
  ])

  return (
    <div id={`task-${block.id}`} className="rounded-lg p-3 space-y-2" {...menu} style={{ background: 'var(--panel)', border: `1px solid ${solved ? 'var(--accent)' : 'var(--line)'}`, scrollMarginTop: 72 }}>
      <div className="font-semibold flex items-center gap-2">
        {solved ? <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} aria-label="Solved" /> : <GraduationCap size={16} style={{ color: 'var(--muted)' }} />}
        Task {number} · {block.title}
      </div>
      <p className={`m-0 ${READABLE}`} style={{ fontSize: 15, lineHeight: 1.5 }}>
        <Prose text={block.question} />
      </p>
      <CellEditor key={editorKey} value={initial} onChange={change} onRun={go} onCheck={() => void doCheck()} minLines={4} hint={book.writeHint} label={`Task ${number}: your answer`} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <RunButton run={run} exec={go} stop={stop} />
        <button className="btn btn-primary" disabled={!ready || checking} onClick={() => void doCheck()} title="Run your cell and compare its result with the answer (Ctrl+Shift+Enter)">
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Check
        </button>
        <button className="btn" disabled={hints >= block.hints.length} onClick={moreHint}>
          <Lightbulb size={14} /> Hint {hints < block.hints.length ? `${hints + 1}/${block.hints.length}` : ''}
        </button>
        <button className="btn btn-ghost" onClick={showSolution}>
          <Eye size={14} /> Solution
        </button>
        <OpenInLab code={text.current} title={`Task ${number}`} />
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
      {solutionShown && block.pg && (
        <details>
          <summary className="cursor-pointer select-none" style={{ color: 'var(--muted)', fontSize: 12 }}>
            In PostgreSQL
          </summary>
          <pre className="mono m-0 mt-1 px-3 py-2 rounded-md overflow-x-auto" style={{ background: 'var(--panel-2)', fontSize: 13 }}>
            {block.pg}
          </pre>
        </details>
      )}
      {check && said && (
        <div role="status" className="rounded-md px-2.5 py-1.5 flex gap-2" style={check.verdict.ok ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
          {check.verdict.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
          <span className="flex-1 min-w-0">
            <b>{said.title}</b>
            {check.verdict.ok ? ' ' : <br />}
            <Prose text={check.trap ?? said.detail} />
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

function Block({ section, block, afterWork, onNext }: { section: PracticeSection; block: PracticeBlock; afterWork: boolean; onNext: (id: string) => void }) {
  switch (block.kind) {
    case 'note':
      return <NoteBlock block={block} afterWork={afterWork} />
    case 'tables':
      return <TablesBlock block={block} />
    case 'example':
      return <ExampleBlock block={block} />
    case 'task':
      return <TaskBlock section={section} block={block} onNext={onNext} />
  }
}

function SectionView({ section, onNext }: { section: PracticeSection; onNext: (id: string) => void }) {
  const useProgress = useBook().useProgress
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
      {open && section.blocks.map((b, i) => <Block key={i} section={section} block={b} afterWork={i > 0 && section.blocks[i - 1].kind === 'task'} onNext={onNext} />)}
    </section>
  )
}

export function PracticeBookPage() {
  const kind = useLab((s) => s.practiceBook)
  if (!kind) return null
  return (
    <BookContext.Provider value={ENGINES[kind]}>
      <Page key={kind} />
    </BookContext.Provider>
  )
}

function Page() {
  const book = useBook()
  const { sections: SECTIONS, tasks: SECTION_TASKS, useProgress } = book
  const progress = useProgress()
  const counts = practiceCounts(SECTION_TASKS, progress)
  const next = nextTask(SECTION_TASKS, progress)
  const main = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => practiceFromHash(location.hash)?.at ?? SECTIONS[0].id)
  const [tablesOpen, setTablesOpen] = useState(false)
  const tablesBlock = useMemo(() => SECTIONS.flatMap((s) => s.blocks).find((b): b is PracticeTables => b.kind === 'tables'), [SECTIONS])
  const shown = useMemo(() => SECTIONS.filter((s) => !progress.hideKnown || !progress.known.includes(s.id)), [progress.hideKnown, progress.known])

  // Python takes a few seconds to start: have it ready before the first Run.
  useEffect(() => {
    if (book.kind === 'python') startPython()
  }, [book.kind])

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
        history.replaceState(null, '', location.pathname + location.search + hashWithPractice(location.hash, hit, book.kind))
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

  // The menu is one for the whole page; a block says where and with what it opens.
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null)
  const openMenu = (at: { x: number; y: number }, items: MenuItem[]) => setMenu({ at, items })
  const sectionItems = (s: PracticeSection, known: boolean): MenuItem[] => [
    ['Go to this section', () => toSection(s.id)],
    ...(tasksOf(s).length ? ([[known ? 'Back to not known' : 'Mark as known', () => useProgress.setState((p) => ({ known: toggled(p.known, s.id) }))]] as MenuItem[]) : []),
  ]
  const sectionMenu = (s: PracticeSection, known: boolean) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      openMenu({ x: e.clientX, y: e.clientY }, sectionItems(s, known))
    },
  })

  return (
    <MenuContext.Provider value={openMenu}>
    <div className="absolute inset-0 z-30 flex min-w-0" style={{ background: 'var(--bg)', zoom: 'var(--practice-zoom, 1)' }} data-testid="sql-practice">
      <nav aria-label="Sections" className="hidden md:flex flex-col w-56 shrink-0 overflow-y-auto p-2" style={{ background: 'var(--panel)', borderRight: '1px solid var(--line)' }}>
        <ul className="m-0 p-0 list-none flex-1">
          {SECTIONS.map((s) => {
            const st = statusOf(s)
            return (
              <li key={s.id}>
                {s.part && (
                  <div className="px-2 pt-3 pb-1 font-semibold" style={{ color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.part}
                  </div>
                )}
                <button
                  {...sectionMenu(s, st.known)}
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
            <div className="font-semibold">{book.title}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {counts.solved} solved · {counts.known} known · {counts.left} left
            </div>
          </div>
          {tablesBlock && (
            <button className="btn" aria-expanded={tablesOpen} onClick={() => setTablesOpen(!tablesOpen)} title="Tables and their columns, without leaving your place">
              <Table2 size={14} /> Tables
            </button>
          )}
          {next && (
            <button className="btn btn-primary" onClick={() => toTask(next)}>
              Continue <ArrowRight size={14} />
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => openPracticeBook(null)} aria-label="Close the practice" title="Back to the workbench">
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
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-8">
          <p className={`m-0 ${READABLE}`} style={{ color: 'var(--muted)' }}>
            {book.intro}
          </p>
          {shown.map((s) => (
            <div key={s.id} className="space-y-4">
              {s.part && <div className="pt-2 text-xl font-semibold">{s.part}</div>}
              <SectionView section={s} onNext={toTask} />
            </div>
          ))}
          {book.outro && (
            <p className={`m-0 ${READABLE}`} style={{ color: 'var(--muted)' }}>
              {book.outro}
            </p>
          )}
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
      {tablesOpen && tablesBlock && (
        <aside aria-label="Tables and columns" className="absolute inset-y-0 right-0 z-30 w-full max-w-sm md:static md:w-80 md:shrink-0 flex flex-col" style={{ background: 'var(--panel)', borderLeft: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="font-semibold flex-1">Tables and columns</span>
            <button className="btn btn-ghost" onClick={() => setTablesOpen(false)} aria-label="Close the tables">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <TablesBlock block={tablesBlock} />
          </div>
        </aside>
      )}
      {menu && <Menu items={menu.items} at={menu.at} close={() => setMenu(null)} />}
    </div>
    </MenuContext.Provider>
  )
}
