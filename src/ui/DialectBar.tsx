// Above the editor (stage 4): what this tab speaks. DuckDB runs as written; T-SQL and SQLite
// (as the Quaera trainer runs it) are translated to DuckDB first (sqlglot) and the translation can
// be seen side by side; PostgreSQL runs on a real PostgreSQL (PGlite), a separate database that
// tables are copied into.
import { useEffect } from 'react'
import { ArrowLeftRight, Copy, ListTree, Loader2, Play, Redo2, RotateCcw, Search, Square, SquareSlash, Undo2, WandSparkles } from 'lucide-react'
import { copySchemaToPostgres, explainSql, isTranslated, ownTables, restartPython, setTabDialect, showTranslation, startPython, stopQuery, tabDialect, useLab, type Dialect } from './store'
import { activeSql, editorCommand, formatActiveTab, runActive } from './SqlEditor'

/** `title`: when to use it, then what happens (the switch's tooltips; the guide says the same). */
export const DIALECTS: { id: Dialect; label: string; short: string; title: string }[] = [
  { id: 'duckdb', label: 'DuckDB', short: 'DuckDB', title: 'For your own data and analysis: runs as written on DuckDB (close to PostgreSQL)' },
  { id: 'sqlite', label: 'SQLite (Quaera)', short: 'SQLite', title: 'To re-run a Quaera trainer task with the same result: SQLite as quaera.app runs it, on its Kaiyo Trading tables (bare names), translated to DuckDB' },
  { id: 'tsql', label: 'SQL Server (T-SQL)', short: 'T-SQL', title: 'To practise an employer’s SQL Server: write T-SQL, it is translated to DuckDB (by sqlglot) before it runs, and you can see the translation side by side' },
  { id: 'postgres', label: 'PostgreSQL', short: 'Postgres', title: 'To practise an employer’s PostgreSQL: runs on a real PostgreSQL in this browser (PGlite), a separate database, copy tables into it from the tree' },
  { id: 'python', label: 'Python', short: 'Python', title: 'Python with pandas, matplotlib and seaborn over the same tables: lab.table("orders"), lab.sql("SELECT …"). # %% lines split the tab into cells' },
]

export function DialectBar() {
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  const postgres = useLab((s) => s.postgres)
  const pgTables = useLab((s) => s.pgTables)
  const hasOwn = useLab((s) => ownTables(s.tables).some((t) => t.kind === 'table'))
  const copying = useLab((s) => s.pgCopy)
  const translation = useLab((s) => (tab ? s.translations[tab.id] : undefined))
  const python = useLab((s) => s.python)
  const dialect = tabDialect(tab)
  // A Python tab starts Python (a download the first time) as soon as it is shown.
  const pythonOff = python.status === 'off'
  useEffect(() => {
    if (dialect === 'python' && pythonOff) startPython()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialect, tab?.id])
  if (!tab) return null

  return (
    <div className="h-9 shrink-0 flex items-center gap-1 sm:gap-2 px-2 overflow-x-auto" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
      <RunButton />
      {dialect !== 'python' && <ExplainButton />}
      <div role="radiogroup" aria-label="Dialect of this tab" className="flex shrink-0 rounded-md p-0.5" style={{ background: 'var(--panel-2)' }}>
        {DIALECTS.map((d) => (
          <button
            key={d.id}
            role="radio"
            aria-checked={dialect === d.id}
            className="px-1.5 sm:px-2.5 py-1 rounded whitespace-nowrap"
            style={dialect === d.id ? { background: 'var(--panel)', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', color: 'var(--accent)' } : { color: 'var(--muted)' }}
            title={d.title}
            onClick={() => setTabDialect(tab.id, d.id)}
          >
            <span className="hidden sm:inline">{d.label}</span>
            <span className="sm:hidden">{d.short}</span>
          </button>
        ))}
      </div>

      {isTranslated(dialect) && (
        <>
          <span className="hidden lg:inline truncate" style={{ color: 'var(--muted)' }}>
            {dialect === 'sqlite' ? 'As in the Quaera trainer: its tables, translated to DuckDB' : 'Translated to DuckDB before it runs'}
          </span>
          <button className="btn btn-ghost shrink-0" onClick={() => void showTranslation(tab.id, activeSql())} title={`Translate without running and show ${dialect === 'sqlite' ? 'SQLite' : 'T-SQL'} and DuckDB side by side`}>
            {translation?.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />} Show translation
          </button>
        </>
      )}

      {dialect === 'postgres' && (
        <>
          <span className="truncate" style={{ color: postgres.status === 'error' ? 'var(--danger)' : 'var(--muted)' }} title={postgres.status === 'error' ? postgres.error : undefined}>
            {postgres.status === 'ready' && `PostgreSQL ${postgres.version} in this browser · ${pgTables.length} table${pgTables.length === 1 ? '' : 's'} · a separate database from DuckDB${postgres.persistent ? '' : ' (in memory)'}`}
            {(postgres.status === 'loading' || postgres.status === 'off') && (
              <span className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Starting PostgreSQL (a ~10 MB download, once)…
              </span>
            )}
            {postgres.status === 'error' && 'PostgreSQL failed to start'}
          </span>
          {hasOwn && postgres.status === 'ready' && (
            <button className="btn btn-ghost shrink-0" disabled={!!copying} onClick={() => void copySchemaToPostgres('main')} title="Copy your DuckDB tables (with their keys and rows) into PostgreSQL, replacing the copies already there">
              {copying ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} {copying ? `Copying ${copying}…` : 'Copy my tables here'}
            </button>
          )}
        </>
      )}

      {dialect === 'python' && (
        <>
          <span className="truncate" style={{ color: python.status === 'error' ? 'var(--danger)' : 'var(--muted)' }} title={python.status === 'error' ? python.error : 'Run every cell: Ctrl+Enter · the cell at the cursor: Shift+Enter'}>
            {python.status === 'ready' && (
              <>
                Python {python.version.replace(/^(\d+)\.(\d+).*/, '$1.$2')} with pandas<span className="hidden lg:inline"> · Shift+Enter runs a cell</span>
              </>
            )}
            {python.status === 'off' && 'Python starts on the first run'}
            {python.status === 'loading' && (
              <span className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> {python.text}…<span className="hidden lg:inline"> (once, then kept in this browser)</span>
              </span>
            )}
            {python.status === 'error' && `Python failed to start: ${python.error}`}
          </span>
          {(python.status === 'ready' || python.status === 'error') && (
            <button className="btn btn-ghost shrink-0" onClick={restartPython} title="Restart Python: forget every variable, as a new notebook session">
              <RotateCcw size={13} /> <span className="hidden sm:inline">Restart</span>
            </button>
          )}
        </>
      )}

      <EditorTools python={dialect === 'python'} />
    </div>
  )
}

/** Run, or Stop while the active tab's query runs (PostgreSQL tabs can't be stopped). */
function RunButton() {
  const engine = useLab((s) => s.engine)
  const tabId = useLab((s) => s.activeTab)
  const running = useLab((s) => s.results[s.activeTab]?.status === 'running' || s.plans[s.activeTab]?.status === 'running')
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)))
  const pg = dialect === 'postgres'
  const python = dialect === 'python'
  if (running && !pg)
    return (
      <button className="btn btn-danger btn-run shrink-0" onClick={() => void stopQuery(tabId)} title={python ? 'Stop: restarts Python, so its variables are gone (Esc in the editor)' : 'Stop the running query (Esc in the editor)'}>
        <Square size={12} fill="currentColor" /> Stop
      </button>
    )
  return (
    <button className="btn btn-primary btn-run shrink-0" onClick={runActive} disabled={engine.status !== 'ready' || running} title={python ? 'Run the selection, or every cell in order (Ctrl+Enter, F5); the cell at the cursor: Shift+Enter' : 'Run the selection, or the whole tab (Ctrl+Enter, F5)'}>
      {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
    </button>
  )
}

/** Explain: how the database runs the tab's query, as a tree of steps (the Plan view under the editor). */
function ExplainButton() {
  const ready = useLab((s) => s.engine.status === 'ready')
  const tabId = useLab((s) => s.activeTab)
  const busy = useLab((s) => s.results[s.activeTab]?.status === 'running' || s.plans[s.activeTab]?.status === 'running')
  return (
    <button
      className="btn btn-ghost btn-explain shrink-0"
      onClick={() => void explainSql(tabId, activeSql())}
      disabled={!ready || busy}
      aria-label="Explain"
      title="Explain: show how the database runs this query, step by step, with the rows and the time of each step (EXPLAIN ANALYZE)"
    >
      <ListTree size={13} /> <span className="hidden sm:inline">Explain</span>
    </button>
  )
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** The editor's own commands as buttons: hints at the keys on a computer, the only way on a phone. */
function EditorTools({ python }: { python: boolean }) {
  const tools: [string, string, React.ReactNode, () => void][] = [
    ['Undo', `${mod}Z`, <Undo2 size={14} />, () => editorCommand('undo')],
    ['Redo', isMac ? '⇧⌘Z' : 'Ctrl+Y', <Redo2 size={14} />, () => editorCommand('redo')],
    ['Comment or uncomment the lines', `${mod}/`, <SquareSlash size={14} />, () => editorCommand('comment')],
    ...(python ? [] : [['Format SQL (the selection, or the whole tab)', isMac ? '⇧⌥F' : 'Shift+Alt+F', <WandSparkles size={14} />, formatActiveTab] as [string, string, React.ReactNode, () => void]]),
    ['Find and replace', `${mod}F`, <Search size={14} />, () => editorCommand('find')],
  ]
  return (
    <div className="ml-auto flex shrink-0 items-center" role="toolbar" aria-label="Editor">
      {tools.map(([label, keys, icon, run]) => (
        <button key={label} className="p-[3px] sm:p-1.5 rounded hover:bg-[var(--panel-2)]" style={{ color: 'var(--muted)' }} onClick={run} aria-label={label} title={`${label} (${keys})`}>
          {icon}
        </button>
      ))}
    </div>
  )
}
