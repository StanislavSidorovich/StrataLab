// CodeMirror 6 with SQL highlighting and completion of the tables and
// columns that are in the database. Each query tab keeps its own editor
// state, so undo history survives switching tabs.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { MSSQL, PostgreSQL, SQLite, sql } from '@codemirror/lang-sql'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { isolateHistory, redo, toggleComment, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { runPython, runSql, setTabSql, stopQuery, tabDialect, useLab, type Dialect } from './store'
import { cellAt, splitCells } from '../core/pyCells'
import type { TableInfo } from '../db/catalog'
import { QUAERA_DATASET } from '../core/sqliteDialect'

const language = new Compartment()
const theme = new Compartment()
const states = new Map<string, EditorState>()

/** The selection if there is one, else the whole editor. */
export function currentSql(view: EditorView): string {
  const sel = view.state.selection.main
  return sel.empty ? view.state.doc.toString() : view.state.sliceDoc(sel.from, sel.to)
}

/**
 * A Python tab's Run: the selection as one cell, or every code cell in order; with `cell`, only the
 * cell at the cursor, and the cursor moves on to the next one (Shift+Enter, as in Jupyter).
 */
function runPythonFrom(v: EditorView, id: string, cell = false) {
  const sel = v.state.selection.main
  const text = v.state.doc.toString()
  if (!sel.empty && !cell) return void runPython(id, [{ code: v.state.sliceDoc(sel.from, sel.to), line: v.state.doc.lineAt(sel.from).number, index: -1 }])
  const cells = splitCells(text)
  const all = cells.map((c, index) => ({ c, index })).filter(({ c }) => c.kind === 'code')
  if (!cell) return void runPython(id, all.map(({ c, index }) => ({ code: c.source, line: c.line, index, source: c.source })))
  const at = cellAt(cells, sel.head)
  if (at < 0) return
  const c = cells[at]
  if (c.kind === 'code') void runPython(id, [{ code: c.source, line: c.line, index: at, source: c.source }])
  const next = cells[at + 1]
  // the line after the next cell's `# %%`, or the end of the tab
  const to = next ? Math.min(text.length, v.state.doc.lineAt(next.from).to + 1) : text.length
  v.dispatch({ selection: { anchor: to }, scrollIntoView: true })
}

let activeView: EditorView | null = null
export function runActive() {
  const id = useLab.getState().activeTab
  if (!activeView) return
  if (tabDialect(useLab.getState().tabs.find((t) => t.id === id)) === 'python') runPythonFrom(activeView, id)
  else void runSql(id, currentSql(activeView))
}

/** What the active tab would run: the selection, or the whole tab. */
export function activeSql(): string {
  return activeView ? currentSql(activeView) : ''
}

/** The editor toolbar's buttons: the same commands as the editor's keys. */
const COMMANDS = { undo, redo, comment: toggleComment, find: openSearchPanel }
export function editorCommand(name: keyof typeof COMMANDS) {
  if (!activeView) return
  COMMANDS[name](activeView)
  activeView.focus()
}

/**
 * Adds a statement at the end of the active tab and scrolls to it (a practice task's
 * Solution), closing the last statement with a semicolon first so the two stay apart.
 */
export function appendToActive(statement: string) {
  const v = activeView
  if (!v) return
  const end = v.state.doc.length
  const lines = v.state.doc.toString().trimEnd().split('\n')
  const last = lines[lines.length - 1].trim()
  const text = (last && !last.endsWith(';') && !last.startsWith('--') ? ';\n' : '\n') + statement
  v.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, scrollIntoView: true, userEvent: 'input' })
  v.focus()
}

const isPython = (id: string) => tabDialect(useLab.getState().tabs.find((t) => t.id === id)) === 'python'

/** Ctrl+Enter, F5: the selection or the whole tab (every cell of a Python tab). */
function runIn(v: EditorView, id: string) {
  if (isPython(id)) runPythonFrom(v, id)
  else void runSql(id, currentSql(v))
}

const FORMATTER_LANGUAGE = { duckdb: 'duckdb', tsql: 'transactsql', postgres: 'postgresql', sqlite: 'sqlite' } as const

/**
 * Format SQL (Shift+Alt+F): the selection, or the whole tab, in the tab's dialect. One change,
 * so Undo brings the old layout back. Throws when the formatter can't read the SQL.
 */
export async function formatActive(dialect: Dialect) {
  const v = activeView
  if (!v || dialect === 'python') return
  const { format } = await import('sql-formatter')
  const sel = v.state.selection.main
  const from = sel.empty ? 0 : sel.from
  const to = sel.empty ? v.state.doc.length : sel.to
  const text = v.state.sliceDoc(from, to)
  if (!text.trim()) return
  const formatted = format(text, { language: FORMATTER_LANGUAGE[dialect], keywordCase: 'upper', tabWidth: 2 })
  if (formatted !== text)
    v.dispatch({
      changes: { from, to, insert: formatted },
      selection: sel.empty ? undefined : { anchor: from, head: from + formatted.length },
      // its own Undo step, never merged with the typing just before it
      annotations: isolateHistory.of('full'),
      userEvent: 'input.format',
    })
  v.focus()
}

/** Shows a formatter error where import errors go. */
function formatError(e: unknown) {
  const msg = String(e instanceof Error ? e.message : e).split('\n')[0]
  useLab.setState({ importError: `Could not format this SQL: ${msg}` })
}

export function formatActiveTab() {
  const s = useLab.getState()
  void formatActive(tabDialect(s.tabs.find((t) => t.id === s.activeTab))).catch(formatError)
}

/**
 * Completion: the tables of the schemas a bare name reaches as they are (the first schema wins a
 * name), the others after their schema name (chinook.Track).
 */
function completionSchema(tables: TableInfo[], ...plain: string[]) {
  const schema: Record<string, string[] | Record<string, string[]>> = {}
  for (const t of tables) if (!plain.includes(t.schema)) ((schema[t.schema] ??= {}) as Record<string, string[]>)[t.name] = t.columns.map((c) => c.name)
  for (const p of plain) for (const t of tables) if (t.schema === p && !(t.name in schema)) schema[t.name] = t.columns.map((c) => c.name)
  return schema
}

// The editor's background is --code-bg (src/index.css), which the Appearance button can change.
const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--code-bg)', color: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--q-accent) 7%, transparent)' },
})

// One Dark with its background taken from --code-bg (One Dark's own #282c34 unless changed).
const darkBackground = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--code-bg)' },
    '.cm-gutters': { backgroundColor: 'var(--code-bg)' },
  },
  { dark: true },
)

export function SqlEditor() {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const activeTab = useLab((s) => s.activeTab)
  const tables = useLab((s) => s.tables)
  const pgTables = useLab((s) => s.pgTables)
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)))
  const dark = useLab((s) => s.theme === 'dark')

  // A PostgreSQL tab completes PostgreSQL's tables; T-SQL highlights as SQL Server; a SQLite tab
  // names the trainer's tables bare, as its search path does.
  const langExt = () =>
    dialect === 'python'
      ? python()
      : dialect === 'postgres'
      ? sql({ dialect: PostgreSQL, schema: completionSchema(pgTables, 'public'), upperCaseKeywords: false })
      : dialect === 'sqlite'
        ? sql({ dialect: SQLite, schema: completionSchema(tables, QUAERA_DATASET, 'main'), upperCaseKeywords: false })
        : sql({ dialect: dialect === 'tsql' ? MSSQL : PostgreSQL, schema: completionSchema(tables, 'main'), upperCaseKeywords: false })
  const themeExt = () => (dark ? [Prec.high(darkBackground), oneDark] : lightTheme)

  const makeState = (id: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: (v) => (runIn(v, id), true) },
            { key: 'F5', run: (v) => (runIn(v, id), true) },
            // Python tabs: the cell at the cursor, then on to the next (Jupyter's Shift+Enter).
            { key: 'Shift-Enter', run: (v) => (isPython(id) ? (runPythonFrom(v, id, true), true) : false) },
            { key: 'Shift-Alt-f', run: () => (formatActiveTab(), true) },
            // Esc stops a running query; otherwise it does what it always does (close completion…).
            {
              key: 'Escape',
              run: () => {
                if (useLab.getState().results[id]?.status !== 'running') return false
                void stopQuery(id)
                return true
              },
            },
          ]),
        ),
        basicSetup,
        language.of(langExt()),
        theme.of(themeExt()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setTabSql(id, u.state.doc.toString())
        }),
      ],
    })

  useEffect(() => {
    if (!host.current) return
    const s = useLab.getState()
    const tab = s.tabs.find((t) => t.id === s.activeTab)!
    const v = new EditorView({ state: makeState(tab.id, tab.sql), parent: host.current })
    view.current = v
    activeView = v
    return () => {
      v.destroy()
      view.current = null
      activeView = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Switch tabs: keep the old state, restore (or create) the new one.
  const shownTab = useRef(activeTab)
  useEffect(() => {
    const v = view.current
    if (!v || shownTab.current === activeTab) return
    states.set(shownTab.current, v.state)
    const tab = useLab.getState().tabs.find((t) => t.id === activeTab)
    if (!tab) return
    let st = states.get(activeTab) ?? makeState(activeTab, tab.sql)
    if (st.doc.toString() !== tab.sql) st = makeState(activeTab, tab.sql)
    v.setState(st)
    v.dispatch({ effects: [language.reconfigure(langExt()), theme.reconfigure(themeExt())] })
    shownTab.current = activeTab
    v.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    view.current?.dispatch({ effects: language.reconfigure(langExt()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, pgTables, dialect])

  useEffect(() => {
    view.current?.dispatch({ effects: theme.reconfigure(themeExt()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  return <div ref={host} className="h-full overflow-hidden" />
}
