// CodeMirror 6 with SQL highlighting and completion of the tables and
// columns that are in the database. Each query tab keeps its own editor
// state, so undo history survives switching tabs.
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { MSSQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { isolateHistory, redo, toggleComment, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { explainSql, openAsModel, ownTables, runPython, runSql, setTabSql, stopQuery, tabDialect, useLab, type Dialect } from './store'
import { Menu, useLongPress, type MenuItem } from './Menu'
import { cellAt, splitCells } from '../core/pyCells'
import type { TableInfo } from '../db/catalog'

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

/** Every code cell of a Python tab in order, or the whole SQL tab: Run all, whatever is selected. */
function runAll(v: EditorView, id: string) {
  if (!isPython(id)) return void runSql(id, v.state.doc.toString())
  const cells = splitCells(v.state.doc.toString())
  const all = cells.map((c, index) => ({ c, index })).filter(({ c }) => c.kind === 'code')
  void runPython(id, all.map(({ c, index }) => ({ code: c.source, line: c.line, index, source: c.source })))
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

/** Replaces the whole text of the active tab (a Python tab that was empty gets its example). */
export function setActiveText(text: string) {
  const v = activeView
  if (!v) return
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: 0 }, userEvent: 'input' })
  v.focus()
}

const isPython = (id: string) => tabDialect(useLab.getState().tabs.find((t) => t.id === id)) === 'python'

/** Ctrl+Enter, F5: the selection or the whole tab (every cell of a Python tab). */
function runIn(v: EditorView, id: string) {
  if (isPython(id)) runPythonFrom(v, id)
  else void runSql(id, currentSql(v))
}

const FORMATTER_LANGUAGE = { duckdb: 'duckdb', tsql: 'transactsql', postgres: 'postgresql' } as const

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

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/**
 * The editor's own menu (right-click, long press on a phone): only what Lab already does, with the
 * keys on the right. Shift + right-click opens the browser's menu instead (see SqlEditor).
 */
function EditorMenu({ view, at, close }: { view: EditorView; at: { x: number; y: number }; close: () => void }) {
  const id = useLab((s) => s.activeTab)
  const ready = useLab((s) => s.engine.status === 'ready')
  const running = useLab((s) => s.results[s.activeTab]?.status === 'running' || s.plans[s.activeTab]?.status === 'running')
  const hasTables = useLab((s) => ownTables(s.tables).some((t) => t.kind === 'table'))
  const python = isPython(id)
  const sel = view.state.selection.main
  const selected = view.state.sliceDoc(sel.from, sel.to)
  const cantRun = !ready || running
  const paste = async () => {
    view.focus()
    try {
      const text = await navigator.clipboard.readText()
      view.dispatch({ ...view.state.replaceSelection(text), scrollIntoView: true, userEvent: 'input.paste' })
    } catch {
      // Firefox and Safari ask first or refuse: the keys always work.
      useLab.setState({ notice: `Press ${mod}V to paste.` })
    }
  }
  const copy = () => {
    void navigator.clipboard?.writeText(selected).catch(() => useLab.setState({ notice: `Press ${mod}C to copy.` }))
    view.focus()
  }
  const items: MenuItem[] = [
    ...(python
      ? ([
          selected ? ['Run selection', () => runPythonFrom(view, id), { disabled: cantRun, keys: `${mod}Enter` }] : ['Run cell', () => runPythonFrom(view, id, true), { disabled: cantRun, keys: 'Shift+Enter' }],
          ['Run all', () => runAll(view, id), { disabled: cantRun, keys: selected ? undefined : `${mod}Enter` }],
        ] as MenuItem[])
      : ([
          ['Run selection', () => void runSql(id, selected), { disabled: cantRun || !selected, keys: selected ? `${mod}Enter` : undefined }],
          ['Run all', () => runAll(view, id), { disabled: cantRun, keys: selected ? undefined : `${mod}Enter` }],
          ['Explain', () => void explainSql(id, currentSql(view)), { disabled: cantRun }],
          ['Format SQL', formatActiveTab, { keys: isMac ? '⇧⌥F' : 'Shift+Alt+F' }],
        ] as MenuItem[])),
    ['Toggle comment', () => (toggleComment(view), view.focus()), { keys: `${mod}/` }],
    'separator',
    [
      'Cut',
      () => {
        copy()
        view.dispatch({ ...view.state.replaceSelection(''), userEvent: 'delete.cut' })
      },
      { disabled: !selected, keys: `${mod}X` },
    ],
    ['Copy', copy, { disabled: !selected, keys: `${mod}C` }],
    ['Paste', () => void paste(), { keys: `${mod}V` }],
    ...(python ? [] : ([ 'separator', ['Open schema in Model ↗', () => openAsModel('main'), { disabled: !ready || !hasTables }] ] as MenuItem[])),
  ]
  return <Menu items={items} close={close} at={at} label="Editor" />
}

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
    dialect === 'python'
      ? python()
      : dialect === 'postgres'
      ? sql({ dialect: PostgreSQL, schema: completionSchema(pgTables, 'public'), upperCaseKeywords: false })
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

  // Right-click opens our menu; Shift + right-click, as in a browser, leaves the browser's.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const longPress = useLongPress(setMenu)
  return (
    <>
      <div
        ref={host}
        className="h-full overflow-hidden"
        data-editor
        onContextMenu={(e) => {
          if (e.shiftKey) return
          e.preventDefault()
          const v = view.current
          // A click outside the selection puts the cursor there first, as an editor does.
          const pos = v?.posAtCoords({ x: e.clientX, y: e.clientY })
          if (v && pos != null && v.state.selection.main.empty) v.dispatch({ selection: { anchor: pos } })
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        {...longPress}
      />
      {menu && view.current && <EditorMenu view={view.current} at={menu} close={closeMenu} />}
    </>
  )
}
