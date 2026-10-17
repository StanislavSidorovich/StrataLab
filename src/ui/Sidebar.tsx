// Object Explorer: the user's tables and views with their columns, then each loaded catalog
// dataset as a folder (its own schema), and what you can do with each one (the SSMS
// right-click menu, as a small menu button).
import { createContext, useContext, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardPaste, Database, DatabaseZap, Eye, Folder, GraduationCap, Library, Loader2, MoreHorizontal, Network, RefreshCw, Search, Sparkles, Store, Table2, Upload, X } from 'lucide-react'
import { copySchemaToPostgres, downloadBackup, dropPgObject, dropDataset, dropObject, enqueueFiles, hasDemoTables, hideDemo, loadDemo, openAndRun, openAsModel, openCatalog, openDataset, openGenerate, openPractice, ownTables, pasteTableFromClipboard, refreshTree, renameObject, restoreBackup, useLab } from './store'
import { qualifiedName } from '../core/sql'
import { treeMatch, type TreeMatch } from '../core/tree'
import { isDatabaseFile } from '../core/backup'
import { Menu, type MenuItem } from './Menu'
import { exportTable } from '../db/export'
import type { TableInfo } from '../db/catalog'
import { DEMO_TABLES } from '../data/demo'
import { datasetById } from '../data/datasets'

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.parquet,.json,.jsonl,.ndjson'

/** Restore from a backup: a .duckdb file replaces every table, after a confirmation. */
export function pickBackup() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.duckdb,.ddb,.db'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    if (!isDatabaseFile(file.name)) return void useLab.setState({ importError: `${file.name} is not a DuckDB database file (.duckdb). Restore takes a file made by “Download database”.` })
    if (confirm(`Replace all your tables, views and loaded datasets with the ones in ${file.name}? What is here now is lost (download a backup first to keep it). PostgreSQL tables are not touched.`)) void restoreBackup(file)
  }
  input.click()
}

const TreeSearchText = createContext('')
const useTreeSearch = () => useContext(TreeSearchText)

/** Tables matching the tree's search, with how they match; all of them for an empty search. */
function matching(tables: TableInfo[], search: string): [TableInfo, TreeMatch][] {
  return tables.flatMap((t) => {
    const m = treeMatch(t.schema, t.name, t.columns.map((c) => c.name), search)
    return m ? [[t, m] as [TableInfo, TreeMatch]] : []
  })
}

/** Opens the file picker; the chosen files become tables, or fill `table` (stage 2b). */
export function pickFilesFor(table?: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPT
  input.multiple = !table
  input.onchange = () => void enqueueFiles([...(input.files ?? [])], table)
  input.click()
}

export function Sidebar() {
  const all = useLab((s) => s.tables)
  const engine = useLab((s) => s.engine)
  const fileInput = useRef<HTMLInputElement>(null)
  const demoHidden = useLab((s) => s.demoHidden)
  const demoHere = hasDemoTables(all)
  // A hidden demo shop keeps its tables (queries on them still work); only the tree leaves them out.
  const tables = ownTables(all).filter((t) => !(demoHidden && demoHere && DEMO_TABLES.includes(t.name)))
  const hasDemo = demoHere && !demoHidden
  const schemas = [...new Set(all.map((t) => t.schema).filter((s) => s !== 'main'))]
  const empty = tables.filter((t) => t.kind === 'table' && t.rows === 0)
  const backup = useLab((s) => s.backup)
  const [search, setSearch] = useState('')
  const searching = search.trim() !== ''
  const shown = matching(tables, search)
  const shownSchemas = schemas.map((s) => [s, matching(all.filter((t) => t.schema === s), search)] as const).filter(([, list]) => list.length > 0)

  return (
    <aside className="h-full flex flex-col" style={{ background: 'var(--panel)', borderRight: '1px solid var(--line)' }}>
      <div className="p-3 space-y-2 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
        <button className="btn btn-primary w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => fileInput.current?.click()}>
          <Upload size={14} /> Add CSV / Excel…
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void enqueueFiles(files)
          }}
        />
        <button
          className="btn w-full justify-center"
          disabled={engine.status !== 'ready'}
          onClick={() => void pasteTableFromClipboard()}
          title="Make a table from cells copied in Excel or Google Sheets (or press Ctrl+V outside the editor)"
        >
          <ClipboardPaste size={14} /> Paste a table
        </button>
        <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => openCatalog()}>
          <Library size={14} /> Sample datasets…
        </button>
        <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => openPractice()} title="Business questions on the demo shop: worked examples, and tasks with a check of your answer and hints">
          <GraduationCap size={14} /> Practice…
        </button>
        {!demoHere && !demoHidden && (
          <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => void loadDemo()}>
            <Store size={14} /> Load demo shop
          </button>
        )}
      </div>
      <TreeSearch search={search} setSearch={setSearch} />
      <div className="px-3 pt-2 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
        <Database size={13} className="shrink-0" />
        <span className="whitespace-nowrap">TABLES {tables.length > 0 && `(${searching ? `${shown.length}/${tables.length}` : tables.length})`}</span>
        {backup && <Loader2 size={12} className="animate-spin" />}
        {tables.some((t) => t.kind === 'table') && (
          <button
            className="ml-auto flex items-center gap-1 font-normal hover:underline whitespace-nowrap"
            style={{ color: 'var(--accent)', letterSpacing: 0 }}
            onClick={() => openAsModel('main')}
            title="Open these tables as a conceptual model (entities and relationships) in model.quaera.app"
          >
            <Network size={12} /> Show as model ↗
          </button>
        )}
        <DatabaseMenu push={!tables.some((t) => t.kind === 'table')} />
      </div>
      <TreeSearchText.Provider value={search}>
      <div className="flex-1 overflow-auto pb-3">
        {tables.length === 0 && engine.status === 'ready' && (
          <p className="px-3 py-2" style={{ color: 'var(--muted)' }}>
            No tables yet. Drop CSV or Excel files anywhere on the page.
            {demoHidden && demoHere && ' The demo shop is hidden: Sample datasets shows it again.'}
          </p>
        )}
        {searching && shown.length === 0 && shownSchemas.length === 0 && (
          <p className="px-3 py-2" style={{ color: 'var(--muted)' }}>
            Nothing called “{search.trim()}”, and no column by that name.
          </p>
        )}
        {!searching && empty.length > 0 && (
          <button className="mx-3 mb-1 flex items-center gap-1 hover:underline text-left" style={{ color: 'var(--accent)', fontSize: 12 }} onClick={() => void openGenerate()}>
            <Sparkles size={12} className="shrink-0" /> Generate rows for {empty.length === 1 ? `empty ${empty[0].name}` : `${empty.length} empty tables`}…
          </button>
        )}
        {!searching && hasDemo && (
          <p className="mx-3 mb-1 flex items-start gap-1.5" style={{ color: 'var(--muted)', fontSize: 12 }}>
            <Store size={12} className="shrink-0 mt-0.5" />
            <span>
              <b>demo</b> = the demo shop: made-up practice data, the same for everyone.{' '}
              <button className="hover:underline" style={{ color: 'var(--accent)' }} onClick={hideDemo} title="Take the demo tables out of this list. Nothing is deleted: Sample datasets → Demo shop shows them again.">
                Hide
              </button>
            </span>
          </p>
        )}
        {shown.map(([t, m]) => (
          <TableNode key={t.name} t={t} demo={hasDemo && DEMO_TABLES.includes(t.name)} match={searching ? m : undefined} />
        ))}
        {shownSchemas.length > 0 && (
          <div className="px-3 pt-4 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
            <Library size={13} /> DATASETS ({shownSchemas.length})
          </div>
        )}
        {shownSchemas.map(([s, list]) => (
          <SchemaNode key={s} schema={s} tables={all.filter((t) => t.schema === s)} shown={searching ? list : undefined} />
        ))}
        <PostgresSection search={search} />
      </div>
      </TreeSearchText.Provider>
    </aside>
  )
}

/** A loaded dataset: a folder with its tables, and a menu to open its starter query, reload or remove it. */
function SchemaNode({ schema, tables, shown }: { schema: string; tables: TableInfo[]; shown?: [TableInfo, TreeMatch][] }) {
  const [userOpen, setOpen] = useState(false)
  // While searching, a folder with matches is open and shows only them.
  const open = userOpen || !!shown
  const [menu, setMenu] = useState(false)
  const d = datasetById(schema)
  const items: MenuItem[] = [
    ...(d
      ? ([
          ['New query on this dataset', () => void openDataset(d)],
          ['Reload (undo my changes)…', () => confirm(`Load ${d.title} again? Changes made to its tables are lost.`) && void openDataset(d, true)],
        ] as [string, () => void][])
      : []),
    ['Show as model in model.quaera.app ↗', () => openAsModel(schema)],
    ['Copy dataset to PostgreSQL', () => void copySchemaToPostgres(schema)],
    ['Remove from this browser…', () => confirm(`Remove ${d?.title ?? schema} and its ${tables.length} tables from this browser?`) && void dropDataset(schema)],
  ]
  return (
    <div>
      <div className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]">
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Folder size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button className="truncate text-left flex-1" onClick={() => setOpen(!open)} title={`${d?.title ?? schema}: tables are in the schema ${schema} (${schema}.table_name)`}>
          {schema}
        </button>
        <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>
          {shown ? `${shown.length}/${tables.length}` : tables.length}
        </span>
        <div className="relative">
          <button className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100" style={menu ? { opacity: 1 } : undefined} onClick={() => setMenu(!menu)} aria-label={`Actions for ${schema}`}>
            <MoreHorizontal size={14} />
          </button>
          {menu && <Menu items={items} close={() => setMenu(false)} />}
        </div>
      </div>
      {open && (
        <div className="pl-4">
          {(shown ?? tables.map((t) => [t, undefined] as const)).map(([t, m]) => (
            <TableNode key={t.name} t={t} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}

/** `match`: while searching, how the table matched; one found by its columns opens on them. */
function TableNode({ t, demo = false, match }: { t: TableInfo; demo?: boolean; match?: TreeMatch }) {
  const [userOpen, setOpen] = useState(false)
  const byColumn = !!match?.columns.length
  const open = userOpen || byColumn
  const [menu, setMenu] = useState(false)
  const [dropHere, setDropHere] = useState(0)
  const name = qualifiedName(t.schema, t.name)
  const own = t.schema === 'main'
  const fillable = own && t.kind === 'table'
  const Icon = t.kind === 'view' ? Eye : Table2

  return (
    <div>
      {/* A file dropped here fills this table (the page-wide drop handler reads data-fill-table). */}
      <div
        className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]"
        data-fill-table={fillable ? t.name : undefined}
        style={dropHere > 0 && fillable ? { background: 'var(--accent-soft)', outline: '2px dashed var(--accent)', outlineOffset: -2 } : undefined}
        onDragEnter={() => setDropHere((n) => n + 1)}
        onDragLeave={() => setDropHere((n) => Math.max(0, n - 1))}
        onDrop={() => setDropHere(0)}
        onDoubleClick={() => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)}
      >
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Icon size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button className="truncate text-left flex-1" onClick={() => setOpen(!open)} title={`${name} — double-click to see the first 100 rows${fillable ? '; drop a file here to add rows' : ''}`}>
          <Highlight text={t.name} match={match?.byName ? match : undefined} />
        </button>
        {demo && (
          <span className="shrink-0 px-1 rounded" style={{ background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 10 }} title="Demo shop: made-up practice data">
            demo
          </span>
        )}
        {t.rows != null && (
          <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>
            {t.rows.toLocaleString()}
          </span>
        )}
        <div className="relative">
          <button className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100" style={menu ? { opacity: 1 } : undefined} onClick={() => setMenu(!menu)} aria-label={`Actions for ${t.name}`}>
            <MoreHorizontal size={14} />
          </button>
          {menu && <TableMenu t={t} name={name} close={() => setMenu(false)} />}
        </div>
      </div>
      {open && (
        <div className="pl-9 pr-2 pb-1">
          {t.columns.map((c) => (
            <div key={c.name} className="flex gap-2 py-0.5" title={c.nullable ? 'can be NULL' : 'NOT NULL'}>
              <span className="truncate flex-1 mono" style={{ fontSize: 12 }}>
                <Highlight text={c.name} match={match?.columns.includes(c.name) ? match : undefined} />
              </span>
              <span className="shrink-0 mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{c.type.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TableMenu({ t, name, close }: { t: TableInfo; name: string; close: () => void }) {
  const cols = t.columns.map((c) => c.name).join(', ')
  const fillable = t.schema === 'main' && t.kind === 'table'
  const items: MenuItem[] = [
    ['Select first 100 rows', () => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)],
    ['Count rows', () => openAndRun(`SELECT count(*) AS rows FROM ${name};`, `count ${t.name}`)],
    ['Profile columns (SUMMARIZE)', () => openAndRun(`SUMMARIZE ${name};`, `profile ${t.name}`)],
    ['Script SELECT with columns', () => openAndRun(`SELECT ${cols}
FROM ${name}
LIMIT 100;`, t.name)],
    ...(fillable
      ? ([
          ['Add rows from CSV / Excel…', () => pickFilesFor(t.name)],
          ['Generate sample rows…', () => void openGenerate(t.name)],
        ] as [string, () => void][])
      : []),
    ...(t.kind === 'table' ? ([['Copy to PostgreSQL', () => void copySchemaToPostgres(t.schema, [t.name])]] as [string, () => void][]) : []),
    ['Export as CSV', () => void exportTable(name, t.name, 'csv')],
    ['Export as Parquet (for pandas)', () => void exportTable(name, t.name, 'parquet')],
    [
      'Rename…',
      () => {
        const to = prompt(`New name for ${t.name}`, t.name)
        if (to && to !== t.name) void renameObject(t, to)
      },
    ],
    [
      t.kind === 'view' ? 'Drop view…' : 'Drop table…',
      () => {
        if (confirm(`Drop ${t.kind} ${name}? This cannot be undone.`)) void dropObject(t)
      },
    ],
  ]
  return <Menu items={items} close={close} danger />
}

/** The PostgreSQL database (stage 4), once it has been started: its tables, by schema. */
function PostgresSection({ search }: { search: string }) {
  const pg = useLab((s) => s.postgres)
  const all = useLab((s) => s.pgTables)
  const tables = matching(all, search).map(([t]) => t)
  const copying = useLab((s) => s.pgCopy)
  if (pg.status === 'off') return null
  return (
    <>
      <div className="px-3 pt-4 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
        <DatabaseZap size={13} /> POSTGRESQL {pg.status === 'ready' && `(${tables.length === all.length ? all.length : `${tables.length}/${all.length}`})`}
        {(pg.status === 'loading' || copying) && <Loader2 size={12} className="animate-spin" />}
      </div>
      {pg.status === 'ready' && all.length === 0 && (
        <p className="px-3 py-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
          A separate database. Copy tables into it from a table’s or dataset’s ⋯ menu, or CREATE TABLE in a PostgreSQL tab.
        </p>
      )}
      {pg.status === 'error' && (
        <p className="px-3 py-1" style={{ color: 'var(--danger)', fontSize: 12 }}>
          PostgreSQL failed to start: {pg.error}
        </p>
      )}
      {tables.map((t) => (
        <PgTableNode key={`${t.schema}.${t.name}`} t={t} />
      ))}
    </>
  )
}

function PgTableNode({ t }: { t: TableInfo }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const label = t.schema === 'public' ? t.name : `${t.schema}.${t.name}`
  const name = t.schema === 'public' ? qualifiedName('main', t.name) : qualifiedName(t.schema, t.name)
  const items: MenuItem[] = [
    ['Select first 100 rows', () => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, `${t.name} · PostgreSQL`, 'postgres')],
    ['Count rows', () => openAndRun(`SELECT count(*) AS rows FROM ${name};`, `count ${t.name} · PostgreSQL`, 'postgres')],
    ['Describe (columns and types)', () => openAndRun(`SELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = '${t.schema}' AND table_name = '${t.name.replace(/'/g, "''")}'\nORDER BY ordinal_position;`, `${t.name} columns · PostgreSQL`, 'postgres')],
    [
      t.kind === 'view' ? 'Drop view…' : 'Drop table…',
      () => {
        if (confirm(`Drop ${t.kind} ${label} from PostgreSQL? DuckDB's tables are not touched.`)) void dropPgObject(t)
      },
    ],
  ]
  return (
    <div>
      <div className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]" onDoubleClick={() => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, `${t.name} · PostgreSQL`, 'postgres')}>
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {t.kind === 'view' ? <Eye size={14} className="shrink-0" style={{ color: '#336791' }} /> : <Table2 size={14} className="shrink-0" style={{ color: '#336791' }} />}
        <button className="truncate text-left flex-1" onClick={() => setOpen(!open)} title={`${name} in PostgreSQL — double-click to see the first 100 rows`}>
          {label}
        </button>
        {t.rows != null && (
          <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>
            {t.rows.toLocaleString()}
          </span>
        )}
        <div className="relative">
          <button className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100" style={menu ? { opacity: 1 } : undefined} onClick={() => setMenu(!menu)} aria-label={`Actions for ${label} in PostgreSQL`}>
            <MoreHorizontal size={14} />
          </button>
          {menu && <Menu items={items} close={() => setMenu(false)} danger />}
        </div>
      </div>
      {open && (
        <div className="pl-9 pr-2 pb-1">
          {t.columns.map((c) => (
            <div key={c.name} className="flex gap-2 py-0.5" title={c.nullable ? 'can be NULL' : 'NOT NULL'}>
              <span className="truncate flex-1 mono" style={{ fontSize: 12 }}>{c.name}</span>
              <span className="shrink-0 mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{c.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The search box over the tree, with Refresh. Esc clears it. */
function TreeSearch({ search, setSearch }: { search: string; setSearch: (s: string) => void }) {
  const ready = useLab((s) => s.engine.status === 'ready')
  const [spinning, setSpinning] = useState(false)
  const refresh = async () => {
    setSpinning(true)
    try {
      await refreshTree()
    } finally {
      setTimeout(() => setSpinning(false), 300)
    }
  }
  return (
    <div className="px-3 pt-3 flex items-center gap-1">
      <div className="relative flex-1 min-w-0">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input
          type="search"
          className="field w-full py-1"
          style={{ paddingLeft: 26, paddingRight: search ? 24 : undefined }}
          placeholder="Find a table or column"
          aria-label="Find a table or column"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
        />
        {search && (
          <button className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5" style={{ color: 'var(--muted)' }} onClick={() => setSearch('')} aria-label="Clear the search">
            <X size={12} />
          </button>
        )}
      </div>
      <button className="p-1.5 rounded hover:bg-[var(--panel-2)]" style={{ color: 'var(--muted)' }} disabled={!ready} onClick={() => void refresh()} aria-label="Refresh the tree" title="Refresh: read the tables again (after changes made in another browser tab, say)">
        <RefreshCw size={14} className={spinning ? 'animate-spin' : undefined} />
      </button>
    </div>
  )
}

/** The TABLES section's ⋯: refresh, and the whole database to a file and back. */
function DatabaseMenu({ push }: { push: boolean }) {
  const [menu, setMenu] = useState(false)
  const ready = useLab((s) => s.engine.status === 'ready')
  const busy = useLab((s) => s.backup !== null)
  const items: MenuItem[] = [
    ['Refresh', () => void refreshTree()],
    'separator',
    ['Download database (.duckdb)', () => void downloadBackup(), { disabled: busy }],
    ['Restore from a backup…', pickBackup, { disabled: busy }],
  ]
  return (
    <div className={`relative font-normal${push ? ' ml-auto' : ''}`} style={{ letterSpacing: 0 }}>
      <button className="p-0.5 rounded hover:bg-[var(--panel-2)]" disabled={!ready} onClick={() => setMenu(!menu)} aria-label="Database actions" title="Refresh, download the whole database as a backup file, restore one">
        <MoreHorizontal size={14} />
      </button>
      {menu && <Menu items={items} close={() => setMenu(false)} label="Database" />}
    </div>
  )
}

/** The part of a name that matches the tree's search, marked. */
function Highlight({ text, match }: { text: string; match?: TreeMatch }) {
  const search = useTreeSearch()
  const q = search.trim().toLowerCase()
  const at = match && q ? text.toLowerCase().indexOf(q) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark style={{ background: 'var(--accent-soft)', color: 'inherit', borderRadius: 2 }}>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}
