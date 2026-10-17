// Object Explorer: the user's tables and views with their columns, then each loaded catalog
// dataset as a folder (its own schema), and what you can do with each one (the SSMS
// right-click menu, as a small menu button).
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Eye, Folder, Library, MoreHorizontal, Network, Sparkles, Store, Table2, Upload } from 'lucide-react'
import { dropDataset, dropObject, enqueueFiles, loadDemo, openAndRun, openAsModel, openCatalog, openDataset, openGenerate, ownTables, renameObject, useLab } from './store'
import { qualifiedName } from '../core/sql'
import { exportTable } from '../db/export'
import type { TableInfo } from '../db/catalog'
import { DEMO_TABLES } from '../data/demo'
import { datasetById } from '../data/datasets'

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.parquet,.json,.jsonl,.ndjson'

/** Opens the file picker; the chosen files fill `table` (stage 2b). */
function pickFilesFor(table: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPT
  input.onchange = () => void enqueueFiles([...(input.files ?? [])], table)
  input.click()
}

export function Sidebar() {
  const all = useLab((s) => s.tables)
  const engine = useLab((s) => s.engine)
  const fileInput = useRef<HTMLInputElement>(null)
  const tables = ownTables(all)
  const hasDemo = DEMO_TABLES.every((n) => tables.some((t) => t.name === n))
  const schemas = [...new Set(all.map((t) => t.schema).filter((s) => s !== 'main'))]
  const empty = tables.filter((t) => t.kind === 'table' && t.rows === 0)

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
        <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => openCatalog()}>
          <Library size={14} /> Sample datasets…
        </button>
        {!hasDemo && (
          <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => void loadDemo()}>
            <Store size={14} /> Load demo shop
          </button>
        )}
      </div>
      <div className="px-3 pt-3 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
        <Database size={13} /> TABLES {tables.length > 0 && `(${tables.length})`}
        {tables.some((t) => t.kind === 'table') && (
          <button
            className="ml-auto flex items-center gap-1 font-normal hover:underline"
            style={{ color: 'var(--accent)', letterSpacing: 0 }}
            onClick={() => openAsModel('main')}
            title="Open these tables as a conceptual model (entities and relationships) in model.quaera.app"
          >
            <Network size={12} /> Show as model ↗
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto pb-3">
        {tables.length === 0 && engine.status === 'ready' && (
          <p className="px-3 py-2" style={{ color: 'var(--muted)' }}>
            No tables yet. Drop CSV or Excel files anywhere on the page.
          </p>
        )}
        {empty.length > 0 && (
          <button className="mx-3 mb-1 flex items-center gap-1 hover:underline text-left" style={{ color: 'var(--accent)', fontSize: 12 }} onClick={() => void openGenerate()}>
            <Sparkles size={12} className="shrink-0" /> Generate rows for {empty.length === 1 ? `empty ${empty[0].name}` : `${empty.length} empty tables`}…
          </button>
        )}
        {tables.map((t) => (
          <TableNode key={t.name} t={t} />
        ))}
        {schemas.length > 0 && (
          <div className="px-3 pt-4 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
            <Library size={13} /> DATASETS ({schemas.length})
          </div>
        )}
        {schemas.map((s) => (
          <SchemaNode key={s} schema={s} tables={all.filter((t) => t.schema === s)} />
        ))}
      </div>
    </aside>
  )
}

/** A loaded dataset: a folder with its tables, and a menu to open its starter query, reload or remove it. */
function SchemaNode({ schema, tables }: { schema: string; tables: TableInfo[] }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const d = datasetById(schema)
  const items: [string, () => void][] = [
    ...(d
      ? ([
          ['New query on this dataset', () => void openDataset(d)],
          ['Reload (undo my changes)…', () => confirm(`Load ${d.title} again? Changes made to its tables are lost.`) && void openDataset(d, true)],
        ] as [string, () => void][])
      : []),
    ['Show as model in model.quaera.app ↗', () => openAsModel(schema)],
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
          {tables.length}
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
          {tables.map((t) => (
            <TableNode key={t.name} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function TableNode({ t }: { t: TableInfo }) {
  const [open, setOpen] = useState(false)
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
          {t.name}
        </button>
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
              <span className="truncate flex-1 mono" style={{ fontSize: 12 }}>{c.name}</span>
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
  const items: [string, () => void][] = [
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

/** A small drop-down of actions; with `danger`, the last one is set apart in red. */
function Menu({ items, close, danger = false }: { items: [string, () => void][]; close: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [close])
  return (
    <div ref={ref} className="absolute right-0 top-7 z-30 rounded-lg py-1 shadow-lg min-w-56" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
      {items.map(([label, fn], i) => (
        <button
          key={label}
          className="block w-full text-left px-3 py-1.5 hover:bg-[var(--panel-2)]"
          style={danger && i === items.length - 1 ? { color: 'var(--danger)', borderTop: '1px solid var(--line)' } : undefined}
          onClick={() => {
            close()
            fn()
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
