// CodeMirror 6 with SQL highlighting and completion of the tables and
// columns that are in the database. Each query tab keeps its own editor
// state, so undo history survives switching tabs.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { MSSQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { isolateHistory, redo, toggleComment, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { runSql, setTabSql, stopQuery, tabDialect, useLab, type Dialect } from './store'
import type { TableInfo } from '../db/catalog'

const language = new Compartment()
const theme = new Compartment()
const states = new Map<string, EditorState>()

/** The selection if there is one, else the whole editor. */
export function currentSql(view: EditorView): string {
  const sel = view.state.selection.main
  return sel.empty ? view.state.doc.toString() : view.state.sliceDoc(sel.from, sel.to)
}

let activeView: EditorView | null = null
export function runActive() {
  const id = useLab.getState().activeTab
  if (activeView) void runSql(id, currentSql(activeView))
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

const FORMATTER_LANGUAGE = { duckdb: 'duckdb', tsql: 'transactsql', postgres: 'postgresql' } as const

/**
 * Format SQL (Shift+Alt+F): the selection, or the whole tab, in the tab's dialect. One change,
 * so Undo brings the old layout back. Throws when the formatter can't read the SQL.
 */
export async function formatActive(dialect: Dialect) {
  const v = activeView
  if (!v) return
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

/** Completion: the default schema's tables as they are, others after their schema name (chinook.Track). */
function completionSchema(tables: TableInfo[], plain: string) {
  const schema: Record<string, string[] | Record<string, string[]>> = {}
  for (const t of tables) {
    const cols = t.columns.map((c) => c.name)
    if (t.schema === plain) schema[t.name] = cols
    else ((schema[t.schema] ??= {}) as Record<string, string[]>)[t.name] = cols
  }
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

  // A PostgreSQL tab completes PostgreSQL's tables; T-SQL highlights as SQL Server.
  const langExt = () =>
    dialect === 'postgres'
      ? sql({ dialect: PostgreSQL, schema: completionSchema(pgTables, 'public'), upperCaseKeywords: false })
      : sql({ dialect: dialect === 'tsql' ? MSSQL : PostgreSQL, schema: completionSchema(tables, 'main'), upperCaseKeywords: false })
  const themeExt = () => (dark ? [Prec.high(darkBackground), oneDark] : lightTheme)

  const makeState = (id: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: (v) => (void runSql(id, currentSql(v)), true) },
            { key: 'F5', run: (v) => (void runSql(id, currentSql(v)), true) },
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
