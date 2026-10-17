// Object Explorer: tables and views with their columns, and what you can do
// with each one (the SSMS right-click menu, as a small menu button).
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Eye, MoreHorizontal, Store, Table2, Upload } from 'lucide-react'
import { dropObject, enqueueFiles, loadDemo, openAndRun, renameObject, useLab } from './store'
import { quoteIdent } from '../core/sql'
import { exportTable } from '../db/export'
import type { TableInfo } from '../db/catalog'
import { DEMO_TABLES } from '../data/demo'

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.parquet,.json,.jsonl,.ndjson'

export function Sidebar() {
  const tables = useLab((s) => s.tables)
  const engine = useLab((s) => s.engine)
  const fileInput = useRef<HTMLInputElement>(null)
  const hasDemo = DEMO_TABLES.every((n) => tables.some((t) => t.name === n))

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
        {!hasDemo && (
          <button className="btn w-full justify-center" disabled={engine.status !== 'ready'} onClick={() => void loadDemo()}>
            <Store size={14} /> Load demo shop
          </button>
        )}
      </div>
      <div className="px-3 pt-3 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
        <Database size={13} /> TABLES {tables.length > 0 && `(${tables.length})`}
      </div>
      <div className="flex-1 overflow-auto pb-3">
        {tables.length === 0 && engine.status === 'ready' && (
          <p className="px-3 py-2" style={{ color: 'var(--muted)' }}>
            No tables yet. Drop CSV or Excel files anywhere on the page.
          </p>
        )}
        {tables.map((t) => (
          <TableNode key={t.name} t={t} />
        ))}
      </div>
    </aside>
  )
}

function TableNode({ t }: { t: TableInfo }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const q = quoteIdent(t.name)
  const name = /^[a-z_][a-z0-9_]*$/.test(t.name) ? t.name : q
  const Icon = t.kind === 'view' ? Eye : Table2

  return (
    <div>
      <div className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]" onDoubleClick={() => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)}>
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Icon size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button className="truncate text-left flex-1" onClick={() => setOpen(!open)} title={`${t.name} — double-click to see the first 100 rows`}>
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
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [close])

  const cols = t.columns.map((c) => c.name).join(', ')
  const items: [string, () => void][] = [
    ['Select first 100 rows', () => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)],
    ['Count rows', () => openAndRun(`SELECT count(*) AS rows FROM ${name};`, `count ${t.name}`)],
    ['Profile columns (SUMMARIZE)', () => openAndRun(`SUMMARIZE ${name};`, `profile ${t.name}`)],
    ['Script SELECT with columns', () => openAndRun(`SELECT ${cols}\nFROM ${name}\nLIMIT 100;`, t.name)],
    ['Export as CSV', () => void exportTable(t.name, 'csv')],
    ['Export as Parquet (for pandas)', () => void exportTable(t.name, 'parquet')],
    [
      'Rename…',
      () => {
        const to = prompt(`New name for ${t.name}`, t.name)
        if (to && to !== t.name) void renameObject(t.name, to, t.kind)
      },
    ],
    [
      t.kind === 'view' ? 'Drop view…' : 'Drop table…',
      () => {
        if (confirm(`Drop ${t.kind} ${t.name}? This cannot be undone.`)) void dropObject(t.name, t.kind)
      },
    ],
  ]
  return (
    <div ref={ref} className="absolute right-0 top-7 z-30 rounded-lg py-1 shadow-lg min-w-56" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
      {items.map(([label, fn], i) => (
        <button
          key={label}
          className="block w-full text-left px-3 py-1.5 hover:bg-[var(--panel-2)]"
          style={i === items.length - 1 ? { color: 'var(--danger)', borderTop: '1px solid var(--line)' } : undefined}
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
