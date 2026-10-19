// Above the editor (stage 4): what this tab speaks. DuckDB runs as written; T-SQL is translated
// to DuckDB first (sqlglot) and the translation can be seen side by side; PostgreSQL runs on a
// real PostgreSQL (PGlite), a separate database that tables are copied into.
import { useEffect, useState } from 'react'
import { ArrowLeftRight, ChevronDown, Copy, ListTree, Loader2, Play, Plus, Redo2, RotateCcw, Search, Square, SquareSlash, Undo2, WandSparkles, X } from 'lucide-react'
import { copySchemaToPostgres, explainSql, ownTables, openWelcome, restartPython, retryPython, setTabDialect, showTranslation, startPython, stopQuery, tabDialect, useLab } from './store'
import { activeSql, addCell, editorCommand, formatActiveTab, runActive } from './SqlEditor'
import { Menu, type MenuItem } from './Menu'
import { SQL_DIALECTS, dismissNote, needsNote, noteDismissed, sqlLabel, type SqlDialect } from '../core/dialectNote'
import { pythonProgressLabel, pythonProgressShare } from '../core/progress'

export function DialectBar() {
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  const postgres = useLab((s) => s.postgres)
  const pgTables = useLab((s) => s.pgTables)
  const hasOwn = useLab((s) => ownTables(s.tables).some((t) => t.kind === 'table'))
  const copying = useLab((s) => s.pgCopy)
  const translation = useLab((s) => (tab ? s.translations[tab.id] : undefined))
  const python = useLab((s) => s.python)
  const dialect = tabDialect(tab)
  const shown = useSlowLoading(python.status === 'loading')
  // A Python tab starts Python (a download the first time) as soon as it is shown.
  const pythonOff = python.status === 'off'
  useEffect(() => {
    if (dialect === 'python' && pythonOff) startPython()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialect, tab?.id])
  if (!tab) return null

  return (
    <div className="relative shrink-0">
    <div className="h-9 flex items-center gap-1 sm:gap-2 px-2 overflow-x-auto" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
      <RunButton />
      {dialect !== 'python' && <ExplainButton />}
      {dialect !== 'python' && <SqlDialectMenu tabId={tab.id} dialect={dialect} />}

      {dialect === 'tsql' && (
        <>
          <span className="hidden lg:inline truncate" style={{ color: 'var(--muted)' }}>
            Translated to DuckDB before it runs
          </span>
          <button className="btn btn-ghost shrink-0" onClick={() => void showTranslation(tab.id, activeSql())} title="Translate without running and show T-SQL and DuckDB side by side">
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
          <span className="truncate" style={{ color: python.status === 'error' ? 'var(--danger)' : 'var(--py)', fontWeight: 600 }} title={python.status === 'error' ? python.error : 'A cell ends at the next # %% line (not at a semicolon). Run every cell: Ctrl+Enter · the cell at the cursor: Shift+Enter'}>
            {python.status === 'ready' && (
              <>
                Python {python.version.replace(/^(\d+)\.(\d+).*/, '$1.$2')} · pandas
              </>
            )}
            {python.status === 'off' && 'Python starts on the first run'}
            {python.status === 'loading' && (
              <span className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> {pythonLoading(python, shown)}
                <span className="hidden lg:inline">{shown && python.bytes ? ' (once, then kept in this browser)' : ''}</span>
              </span>
            )}
            {python.status === 'error' && `Python failed to start: ${python.error}`}
          </span>
          {python.status === 'error' && (
            <button className="btn btn-ghost shrink-0" onClick={retryPython} title="Try starting Python again">
              <RotateCcw size={13} /> Retry
            </button>
          )}
          {python.status === 'ready' && (
            <button className="btn btn-ghost shrink-0" onClick={restartPython} title="Restart Python: forget every variable, as a new notebook session">
              <RotateCcw size={13} /> <span className="hidden sm:inline">Restart</span>
            </button>
          )}
        </>
      )}

      <EditorTools python={dialect === 'python'} />
    </div>
    {dialect === 'python' && python.status === 'loading' && shown && <PythonBar bytes={python.bytes} />}
    {needsNote(dialect) && <DialectNote dialect={dialect} />}
    </div>
  )
}

/** One button for the SQL tab: "SQL · DuckDB ▾". DuckDB is the default; T-SQL and PostgreSQL are ways to write it. */
function SqlDialectMenu({ tabId, dialect }: { tabId: string; dialect: SqlDialect }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const pick = (d: SqlDialect) => setTabDialect(tabId, d)
  const [duck, ...others] = SQL_DIALECTS
  const items: MenuItem[] = [
    [duck.label, () => pick(duck.id), { hint: duck.hint, note: duck.usedIn, checked: dialect === duck.id }],
    'separator',
    { heading: 'WRITE AS…' },
    ...others.map((o): MenuItem => [o.label, () => pick(o.id), { hint: o.hint, note: o.usedIn, checked: dialect === o.id }]),
  ]
  return (
    <div className="relative shrink-0">
      <button
        className="btn btn-ghost whitespace-nowrap"
        style={{ fontWeight: 600 }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt(at ? null : { x: r.left, y: r.bottom + 2 })
        }}
        aria-haspopup="menu"
        aria-expanded={!!at}
        title="The SQL this tab is written in. DuckDB runs it as written; T-SQL and PostgreSQL are for people who learned SQL there"
      >
        {sqlLabel(dialect)} <ChevronDown size={13} />
      </button>
      {at && <Menu items={items} close={() => setAt(null)} at={at} label="SQL dialect" />}
    </div>
  )
}

/** Once per dialect: what T-SQL or PostgreSQL means here, with a link to the guide. */
function DialectNote({ dialect }: { dialect: 'tsql' | 'postgres' }) {
  const [, redraw] = useState(0)
  if (noteDismissed(dialect)) return null
  const d = SQL_DIALECTS.find((x) => x.id === dialect)!
  return (
    <div className="flex items-start gap-2 px-3 py-1.5" role="note" style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
      <span className="flex-1">
        <b>{d.label}.</b> {d.hint}{' '}
        <button className="hover:underline" style={{ color: 'var(--accent)' }} onClick={openWelcome}>
          Read the guide
        </button>
      </span>
      <button className="p-0.5 shrink-0" aria-label="Close this note" onClick={() => (dismissNote(dialect), redraw((n) => n + 1))}>
        <X size={13} />
      </button>
    </div>
  )
}

/** True once a Python download has gone on for half a second: from the cache it ends sooner and shows no bar. */
export function useSlowLoading(loading: boolean, ms = 500) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) return setSlow(false)
    const t = setTimeout(() => setSlow(true), ms)
    return () => clearTimeout(t)
  }, [loading, ms])
  return slow
}

/** The line for a Python download: with bytes and percent once it is slow enough to see. */
export function pythonLoading(k: { text: string; bytes?: { loaded: number; total: number | null } }, slow: boolean) {
  return slow && k.bytes ? pythonProgressLabel(k.text, k.bytes) : `${k.text}…`
}

/** A thin bar along the foot of the bar above the editor; pulses when the total is not known. */
function PythonBar({ bytes }: { bytes?: { loaded: number; total: number | null } }) {
  const share = bytes ? pythonProgressShare(bytes) : null
  return (
    <div className="absolute left-0 right-0 bottom-0 h-[3px]" style={{ background: 'var(--line)' }} role="progressbar" aria-label="Python download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share === null ? undefined : Math.round(share * 100)}>
      <div className={`h-full transition-[width] duration-150 ${share === null ? 'animate-pulse' : ''}`} style={{ width: `${share === null ? 100 : Math.max(2, share * 100)}%`, background: 'var(--py)', opacity: share === null ? 0.5 : 1 }} />
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
      {python && (
        <button className="btn btn-ghost shrink-0 mr-1" onClick={addCell} title="New cell: a # %% line after the current cell. A cell ends at the next # %% line (not at a semicolon)">
          <Plus size={13} /> <span className="hidden sm:inline">Cell</span>
        </button>
      )}
      {tools.map(([label, keys, icon, run]) => (
        <button key={label} className="p-[3px] sm:p-1.5 rounded hover:bg-[var(--panel-2)]" style={{ color: 'var(--muted)' }} onClick={run} aria-label={label} title={`${label} (${keys})`}>
          {icon}
        </button>
      ))}
    </div>
  )
}
