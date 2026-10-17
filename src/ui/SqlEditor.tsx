// CodeMirror 6 with SQL highlighting and completion of the tables and
// columns that are in the database. Each query tab keeps its own editor
// state, so undo history survives switching tabs.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { runSql, setTabSql, useLab } from './store'

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

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(5,150,105,0.06)' },
})

export function SqlEditor() {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const activeTab = useLab((s) => s.activeTab)
  const tables = useLab((s) => s.tables)
  const dark = useLab((s) => s.theme === 'dark')

  // The user's tables complete as they are; a dataset's after its schema name (chinook.Track).
  const schema: Record<string, string[] | Record<string, string[]>> = {}
  for (const t of tables) {
    const cols = t.columns.map((c) => c.name)
    if (t.schema === 'main') schema[t.name] = cols
    else ((schema[t.schema] ??= {}) as Record<string, string[]>)[t.name] = cols
  }
  const langExt = () => sql({ dialect: PostgreSQL, schema, upperCaseKeywords: false })
  const themeExt = () => (dark ? oneDark : lightTheme)

  const makeState = (id: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: (v) => (void runSql(id, currentSql(v)), true) },
            { key: 'F5', run: (v) => (void runSql(id, currentSql(v)), true) },
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
  }, [tables])

  useEffect(() => {
    view.current?.dispatch({ effects: theme.reconfigure(themeExt()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  return <div ref={host} className="h-full overflow-hidden" />
}
