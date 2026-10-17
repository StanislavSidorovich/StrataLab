import { useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ChevronDown, ClipboardCopy, Download, Lightbulb, Loader2, TableProperties } from 'lucide-react'
import { DataGrid } from './DataGrid'
import { EngineLoading } from './EngineLoading'
import { Menu, type MenuItem } from './Menu'
import { STOPPED, ownTables, runSql, saveResultAsTable, setResultView, setTabDialect, tabDialect, useLab } from './store'
import { TranslationView } from './TranslationView'
import { sideBySide } from '../core/diff'
import { splitError } from '../core/dialect'
import { tableNameFrom } from '../core/sql'
import { exportResultCsv, exportResultJson, exportResultParquet, exportResultXlsx } from '../db/export'
import { formatterFor } from '../db/format'
import type { Table } from 'apache-arrow'

/** Copies rows (all by default) and columns of a result as tab-separated text, which pastes into Excel as cells. */
function copyAsTsv(table: Table, { header = true, rows = [0, table.numRows], cols }: { header?: boolean; rows?: [number, number]; cols?: number[] } = {}) {
  const fields = table.schema.fields
  const which = cols ?? fields.map((_, i) => i)
  const fmt = fields.map(formatterFor)
  const cell = (v: unknown) => String(v ?? '').replace(/[\t\n]/g, ' ')
  const lines = header ? [which.map((i) => fields[i].name).join('\t')] : []
  const end = Math.min(rows[1], rows[0] + 100_000)
  for (let r = rows[0]; r < end; r++) lines.push(which.map((i) => cell(fmt[i](table.getChildAt(i)?.get(r)))).join('\t'))
  void navigator.clipboard.writeText(lines.join('\n'))
}

/** Save as table: asks for a name (the tab's title, as a table name), and before replacing a table. */
function saveAsTable(table: Table, title: string) {
  const name = prompt('Save the result as a table named', tableNameFrom(title))?.trim()
  if (!name) return
  const same = ownTables(useLab.getState().tables).find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (same?.kind === 'view') return alert(`${same.name} is a view: choose another name.`)
  if (same && !confirm(`Replace the table ${same.name} (${same.rows?.toLocaleString() ?? '?'} rows) with this result?`)) return
  void saveResultAsTable(table, name, !!same)
}

export function Results() {
  const activeTab = useLab((s) => s.activeTab)
  const res = useLab((s) => s.results[s.activeTab])
  const title = useLab((s) => s.tabs.find((t) => t.id === s.activeTab)?.title ?? 'result')
  const log = useLab((s) => s.log)
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)))
  const translation = useLab((s) => s.translations[s.activeTab])
  const stored = useLab((s) => s.resultView)
  const view = stored === 'translation' && dialect !== 'tsql' ? 'result' : stored
  const changes = translation?.status === 'done' ? translation.statements.reduce((n, st) => n + (st.target == null ? 1 : sideBySide(st.source, st.target).changes), 0) : null
  const views = dialect === 'tsql' ? (['result', 'translation', 'messages'] as const) : (['result', 'messages'] as const)
  const fileName = title.replace(/[^\w-]+/g, '_').toLowerCase()

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--panel)' }} key={activeTab}>
      <div className="result-bar flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 shrink-0" style={{ borderBottom: '1px solid var(--line)', height: 36 }}>
        {views.map((v) => (
          <button
            key={v}
            className="px-2 sm:px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap"
            style={view === v ? { background: 'var(--panel-2)', fontWeight: 600 } : { color: 'var(--muted)' }}
            onClick={() => setResultView(v)}
          >
            {v === 'result' && 'Result'}
            {v === 'translation' && (
              <>
                <ArrowLeftRight size={13} /> <span className="hidden sm:inline">T-SQL → </span>DuckDB{changes != null && ` (${changes})`}
              </>
            )}
            {v === 'messages' && `Messages${log.length ? ` (${log.length})` : ''}`}
          </button>
        ))}
        <div className="flex-1" />
        {view === 'result' && res?.status === 'done' && res.table && res.table.numCols > 0 && (
          <>
            <span style={{ color: 'var(--muted)' }} className="mr-1 whitespace-nowrap">
              {res.table.numRows.toLocaleString()} rows<span className="hidden sm:inline"> · {res.ms?.toFixed(0)} ms</span>
            </span>
            <ResultActions table={res.table} title={title} fileName={fileName} />
          </>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {view === 'messages' ? <Messages /> : view === 'translation' ? <TranslationView /> : <ResultBody />}
      </div>
    </div>
  )
}

/** Copy ▾, Export ▾ and Save as table, over the result grid. */
function ResultActions({ table, title, fileName }: { table: Table; title: string; fileName: string }) {
  const [open, setOpen] = useState<'copy' | 'export' | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const copy = (header: boolean) => (copyAsTsv(table, { header }), setCopied(true), setTimeout(() => setCopied(false), 1500))
  const exportAs = (fn: () => void | Promise<void>) => async () => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      useLab.setState({ importError: `Could not export the result: ${String(e instanceof Error ? e.message : e)}` })
    } finally {
      setBusy(false)
    }
  }
  const copyItems: MenuItem[] = [
    ['Copy with headers', () => copy(true)],
    ['Copy without headers', () => copy(false)],
  ]
  const exportItems: MenuItem[] = [
    ['CSV (.csv)', exportAs(() => exportResultCsv(table, fileName))],
    ['Excel (.xlsx)', exportAs(() => exportResultXlsx(table, fileName))],
    ['JSON (.json)', exportAs(() => exportResultJson(table, fileName))],
    ['Parquet (.parquet, for pandas)', exportAs(() => exportResultParquet(table, fileName))],
  ]
  const close = () => setOpen(null)
  return (
    <>
      <div className="relative">
        <button className="btn btn-ghost" onClick={() => setOpen(open === 'copy' ? null : 'copy')} title="Copy as a table to paste into Excel; right-click a cell to copy one value, its row or its column" aria-label="Copy" aria-haspopup="menu">
          <ClipboardCopy size={14} /> <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          <ChevronDown size={12} />
        </button>
        {open === 'copy' && <Menu items={copyItems} close={close} label="Copy" />}
      </div>
      <div className="relative">
        <button className="btn btn-ghost" onClick={() => setOpen(open === 'export' ? null : 'export')} title="Download the result as CSV, Excel, JSON or Parquet" aria-label="Export" aria-haspopup="menu" disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} <span className="hidden sm:inline">Export</span>
          <ChevronDown size={12} />
        </button>
        {open === 'export' && <Menu items={exportItems} close={close} label="Export" />}
      </div>
      <button className="btn btn-ghost" onClick={() => saveAsTable(table, title)} title="Save the result as a new table (it stays when the tab is closed)" aria-label="Save as table">
        <TableProperties size={14} /> <span className="hidden md:inline">Save as table</span>
      </button>
    </>
  )
}

/** Right-click on a cell: copy that value, its row, its column, or the whole result. */
function CellMenu({ table, row, col, at, close }: { table: Table; row: number; col: number; at: { x: number; y: number }; close: () => void }) {
  const name = table.schema.fields[col].name
  const items: MenuItem[] = [
    ['Copy value', () => copyAsTsv(table, { header: false, rows: [row, row + 1], cols: [col] })],
    [`Copy row ${row + 1}`, () => copyAsTsv(table, { header: false, rows: [row, row + 1] })],
    [`Copy column ${name}`, () => copyAsTsv(table, { header: false, cols: [col] })],
    'separator',
    ['Copy all with headers', () => copyAsTsv(table)],
    ['Copy all without headers', () => copyAsTsv(table, { header: false })],
  ]
  return <Menu items={items} close={close} at={at} label="Copy" />
}

function ResultBody() {
  const res = useLab((s) => s.results[s.activeTab])
  const loading = useLab((s) => s.engine.status === 'loading')
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)))
  const pgStarting = useLab((s) => s.postgres.status === 'loading')
  const translating = useLab((s) => s.translations[s.activeTab]?.status === 'loading')
  if (loading) return <EngineLoading />
  if (!res) return <Empty text={`Run a query to see its result here — Ctrl+Enter or F5.${dialect === 'tsql' ? ' It is translated to DuckDB first.' : dialect === 'postgres' ? ' It runs on PostgreSQL.' : ''}`} />
  if (res.status === 'running')
    return (
      <div className="h-full flex items-center justify-center gap-2 p-6 text-center" style={{ color: 'var(--muted)' }}>
        <Loader2 size={16} className="animate-spin shrink-0" />
        {dialect === 'postgres' && pgStarting
          ? 'Starting PostgreSQL: a ~10 MB download the first time, then from the browser’s cache…'
          : dialect === 'tsql' && translating
            ? 'Translating T-SQL to DuckDB: the translator (Python + sqlglot, ~12 MB) downloads once…'
            : dialect === 'postgres'
              ? 'Running…'
              : 'Running… Stop (or Esc in the editor) cancels it.'}
      </div>
    )
  if (res.status === 'error' && res.error === STOPPED) return <Empty text={`Stopped after ${((res.ms ?? 0) / 1000).toFixed(1)} s, before the query finished.`} />
  if (res.status === 'error') return <ErrorBox error={res.error!} hints={res.hints ?? []} />
  const t = res.table!
  if (t.numCols === 0 || (t.numRows === 0 && t.schema.fields.length === 1 && t.schema.fields[0].name === 'Count'))
    return <Empty text={`Done in ${res.ms?.toFixed(0)} ms.`} />
  if (t.numRows === 0)
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0" style={{ height: 48 }}>
          <DataGrid table={t} />
        </div>
        <Empty text="The query returned no rows." />
      </div>
    )
  return <GridWithMenu table={t} />
}

function GridWithMenu({ table }: { table: Table }) {
  const [menu, setMenu] = useState<{ row: number; col: number; at: { x: number; y: number } } | null>(null)
  return (
    <>
      <DataGrid table={table} onCellMenu={(row, col, at) => setMenu({ row, col, at })} />
      {menu && <CellMenu table={table} {...menu} close={() => setMenu(null)} />}
    </>
  )
}

function ErrorBox({ error, hints }: { error: string; hints: { id: string; found: string; use: string }[] }) {
  const { kind, text } = splitError(error)
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  // The hints said “this is T-SQL”: run the tab as T-SQL, translated to DuckDB.
  const runAsTsql = () => {
    if (!tab) return
    setTabDialect(tab.id, 'tsql')
    setResultView('translation')
    void runSql(tab.id, tab.sql)
  }
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="rounded-lg p-3 flex gap-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-1">{kind}</div>
          <pre className="mono whitespace-pre-wrap" style={{ fontSize: 12.5 }}>{text}</pre>
        </div>
      </div>
      {hints.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
          <div className="flex items-center gap-2 font-semibold mb-2">
            <Lightbulb size={16} /> Looks like SQL Server (T-SQL). Quaera Lab speaks DuckDB, close to PostgreSQL:
          </div>
          <ul className="space-y-1">
            {hints.map((h) => (
              <li key={h.id}>
                <code className="mono">{h.found}</code> → <code className="mono">{h.use}</code>
              </li>
            ))}
          </ul>
          <button className="btn mt-3" onClick={runAsTsql} title="Switch this tab to T-SQL: it is translated to DuckDB before it runs, and you see both side by side">
            <ArrowLeftRight size={13} /> Run this tab as T-SQL (translated to DuckDB)
          </button>
        </div>
      )}
    </div>
  )
}

function Messages() {
  const log = useLab((s) => s.log)
  if (!log.length) return <Empty text="Nothing yet: every query and import is listed here." />
  return (
    <div className="h-full overflow-auto mono" style={{ fontSize: 12 }}>
      {log.map((e, i) => (
        <div key={i} className="flex gap-3 px-3 py-1.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--muted)' }}>{new Date(e.at).toLocaleTimeString()}</span>
          <span style={{ color: e.ok ? 'var(--accent)' : 'var(--danger)' }}>{e.ok ? '✓' : '✗'}</span>
          <span className="truncate flex-1" title={e.sql}>{e.sql.replace(/\s+/g, ' ').slice(0, 120)}</span>
          <span style={{ color: e.ok ? 'var(--muted)' : 'var(--danger)' }}>{e.text}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center p-6 text-center" style={{ color: 'var(--muted)' }}>
      {text}
    </div>
  )
}
