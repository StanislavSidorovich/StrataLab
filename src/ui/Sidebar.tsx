// Object Explorer: the user's tables and views with their columns, then each dataset as a
// folder (its own schema): the user's own, made with New dataset and filled a table at a time,
// and the loaded catalog datasets; and what you can do with each one (the SSMS right-click
// menu, as a small menu button).
import { insertAtCursor } from './SqlEditor'
import { createContext, useContext, useRef, useState } from 'react'
import { CheckSquare, CornerDownLeft, ChevronDown, ChevronRight, ClipboardPaste, Database, DatabaseZap, Eye, Folder, FolderPlus, Library, Loader2, MoreHorizontal, Network, RefreshCw, Search, Sparkles, Store, Table2, Upload, X } from 'lucide-react'
import { RESERVED_IDS, addTab, copySchemaToPostgres, newPythonNotebookOn, downloadBackup, dropPgObject, dependentsOf, exportDatasetCsv, dropDataset, dropObjects, enqueueFiles, hasDemoTables, hideDemo, loadDemo, newDataset, openAndRun, openAsModel, openCatalog, openDataset, openGenerate, openGuide, openMove, openPractice, openTables, ownTables, pasteTableFromClipboard, refreshTree, renameDataset, renameObject, restoreBackup, useLab } from './store'
import { isOwnSchema } from '../core/ownDatasets'
import { qualifiedName } from '../core/sql'
import { treeMatch, type TreeMatch } from '../core/tree'
import { isDatabaseFile } from '../core/backup'
import { Menu, type MenuItem } from './Menu'
import { canPickFolder, exportTable } from '../db/export'
import type { TableInfo } from '../db/catalog'
import { DEMO_SCHEMA, WELCOME_SQL } from '../data/demo'
import { labName } from '../core/pyStarter'
import { AuthorLinks } from './AuthorLinks'
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

/** Opens the file picker; the chosen files become tables of `schema`, or fill `table` (stage 2b). */
export function pickFilesFor(table?: string, schema = 'main') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPT
  input.multiple = !table
  input.onchange = () => void enqueueFiles([...(input.files ?? [])], table, schema)
  input.click()
}

/** True inside the phone's Tables sheet: each table gets an Insert button. */
export const InsertMode = createContext(false)

/** Picking several tables to drop at once: `on` shows a checkbox on every table, `picked` holds their qualified names. */
type Picking = { on: boolean; picked: Set<string>; toggle: (name: string, e?: { shiftKey: boolean; currentTarget: Element }) => void; start: (name?: string) => void }
const PickTables = createContext<Picking>({ on: false, picked: new Set(), toggle: () => {}, start: () => {} })

export function Sidebar() {
  const all = useLab((s) => s.tables)
  const engine = useLab((s) => s.engine)
  const fileInput = useRef<HTMLInputElement>(null)
  const demoHidden = useLab((s) => s.demoHidden)
  const demoHere = hasDemoTables(all)
  // A hidden demo shop keeps its tables (queries on them still work); only the tree leaves them out.
  const tables = ownTables(all)
  const demoTables = all.filter((t) => t.schema === DEMO_SCHEMA)
  const hasDemo = demoHere && !demoHidden
  const schemas = useLab((s) => s.schemas)
  const empty = tables.filter((t) => t.kind === 'table' && t.rows === 0)
  const backup = useLab((s) => s.backup)
  const [search, setSearch] = useState('')
  const anchor = useRef<string | null>(null)
  const [pickOn, setPickOn] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const picking: Picking = {
    on: pickOn,
    picked,
    // Shift extends from the last one ticked to this one, in the order they are on screen; Ctrl just toggles.
    toggle: (name, e) => {
      const from = anchor.current
      anchor.current = name
      if (e?.shiftKey && from && from !== name) {
        const order = [...(e.currentTarget.closest('aside')?.querySelectorAll<HTMLElement>('[data-pick]') ?? [])].map((i) => i.dataset.pick!)
        const [a, b] = [order.indexOf(from), order.indexOf(name)]
        if (a >= 0 && b >= 0) {
          setPicked((p) => new Set([...p, ...order.slice(Math.min(a, b), Math.max(a, b) + 1)]))
          return
        }
      }
      setPicked((p) => {
        const n = new Set(p)
        if (!n.delete(name)) n.add(name)
        return n
      })
    },
    start: (name) => {
      anchor.current = name ?? null
      setPickOn(true)
      setPicked(new Set(name ? [name] : []))
    },
  }
  const stopPicking = () => {
    setPickOn(false)
    setPicked(new Set())
  }
  // Tables and views of every schema that exist now (one dropped elsewhere leaves the selection on its own).
  const pickable = all.map((t) => [qualifiedName(t.schema, t.name), t] as const)
  const chosen = pickable.filter(([n]) => picked.has(n)).map(([, t]) => t)
  const dropChosen = async () => {
    if (chosen.length === 0) return
    if (await confirmDrop(chosen)) stopPicking()
  }
  const searching = search.trim() !== ''
  const shown = matching(tables, search)
  const shownDemo = matching(demoTables, search)
  // While searching, only folders with a match; otherwise every one, empty ones too (yours, waiting for tables).
  const shownSchemas = schemas.map((s) => [s, matching(all.filter((t) => t.schema === s), search)] as const).filter(([, list]) => !searching || list.length > 0)

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
        {all.length > 0 && (
          <button
            className={`p-0.5 rounded hover:bg-[var(--panel-2)] ${tables.some((t) => t.kind === 'table') ? '' : 'ml-auto'}`}
            style={pickOn ? { color: 'var(--accent)' } : undefined}
            onClick={() => (pickOn ? stopPicking() : picking.start())}
            aria-label="Select tables to drop"
            aria-pressed={pickOn}
            title="Tick several tables, then drop them in one go (Ctrl+click a name does the same; Shift+click ticks a range)"
          >
            <CheckSquare size={14} />
          </button>
        )}
        <DatabaseMenu push={!tables.some((t) => t.kind === 'table') && all.length === 0} />
      </div>
      {pickOn && (
        <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap shrink-0" style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
          <span className="font-semibold">{chosen.length} selected</span>
          <button className="hover:underline" style={{ color: 'var(--accent)' }} onClick={() => setPicked(new Set(pickable.map(([n]) => n)))}>
            All
          </button>
          <button className="hover:underline" style={{ color: 'var(--accent)' }} onClick={() => setPicked(new Set())}>
            None
          </button>
          <button className="btn ml-auto" style={{ padding: '2px 8px', color: chosen.length ? 'var(--danger)' : undefined }} disabled={chosen.length === 0} onClick={() => void dropChosen()}>
            Drop…
          </button>
          <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={stopPicking} aria-label="Cancel selecting">
            <X size={13} />
          </button>
        </div>
      )}
      <TreeSearchText.Provider value={search}>
      <PickTables.Provider value={picking}>
      <div className="flex-1 overflow-auto pb-3">
        {tables.length === 0 && !hasDemo && engine.status === 'ready' && (
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
        {hasDemo && (!searching || shownDemo.length > 0) && <DemoGroup tables={shownDemo} total={demoTables.length} searching={searching} />}
        {shown.map(([t, m]) => (
          <TableNode key={t.name} t={t} match={searching ? m : undefined} />
        ))}
        {(!searching || shownSchemas.length > 0) && engine.status === 'ready' && (
          <div className="px-3 pt-4 pb-1 flex items-center gap-2 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
            <Library size={13} className="shrink-0" />
            <span className="whitespace-nowrap">DATASETS{shownSchemas.length > 0 && ` (${shownSchemas.length})`}</span>
            <button
              className="ml-auto flex items-center gap-1 font-normal hover:underline whitespace-nowrap"
              style={{ color: 'var(--accent)', letterSpacing: 0 }}
              onClick={() => void newDataset()}
              title="Make an empty dataset (a schema: a folder for your tables), then add tables to it one at a time"
            >
              <FolderPlus size={12} /> New dataset
            </button>
          </div>
        )}
        {!searching && shownSchemas.length === 0 && engine.status === 'ready' && (
          <p className="px-3 py-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
            Group tables into a dataset of your own, or load a sample one.
          </p>
        )}
        {shownSchemas.map(([s, list]) => (
          <SchemaNode key={s} schema={s} tables={all.filter((t) => t.schema === s)} shown={searching ? list : undefined} />
        ))}
        <PostgresSection search={search} />
      </div>
      </PickTables.Provider>
      </TreeSearchText.Provider>
      <div style={{ borderTop: "1px solid var(--line)" }}><AuthorLinks className="px-3 py-2" /></div>
    </aside>
  )
}

const DEMO_OPEN_KEY = 'stratalab.demo-open'

/**
 * The demo shop, a folder like the datasets: "demo shop (4)" with an arrow, open or closed as the user
 * left it (kept in this browser). Hiding it altogether is in its menu; Sample datasets brings it back.
 */
function DemoGroup({ tables, total, searching }: { tables: [TableInfo, TreeMatch][]; total: number; searching: boolean }) {
  const [userOpen, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DEMO_OPEN_KEY) !== '0'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!userOpen)
    try {
      localStorage.setItem(DEMO_OPEN_KEY, userOpen ? '0' : '1')
    } catch {
      /* ignore */
    }
  }
  // While searching, the group is open and shows only the matches.
  const open = userOpen || searching
  const [menu, setMenu] = useState(false)
  const items: MenuItem[] = [
    ['New SQL query', () => addTab(WELCOME_SQL, 'Demo shop')],
    ['New Python notebook', () => newPythonNotebookOn('demo.orders', 'Demo shop'), { hint: 'lab.table("demo.orders")' }],
    'separator',
    ['Practice on the demo shop…', () => openPractice()],
    ['Show as model ↗', () => openAsModel(DEMO_SCHEMA), { hint: 'Open the four demo tables as a conceptual model in model.quaera.app' }],
    ['Hide the demo shop', hideDemo, { hint: 'Nothing is deleted: Sample datasets → Demo shop shows it again.' }],
  ]
  return (
    <div>
      <div className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]">
        <button className="p-0.5" onClick={toggle} aria-label={open ? 'Collapse the demo shop' : 'Expand the demo shop'} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Store size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button className="truncate text-left flex-1" onClick={toggle} title="The demo shop: made-up practice data, the same for everyone. Its tables are in the demo schema: FROM demo.orders in SQL, lab.table(&quot;demo.orders&quot;) in Python.">
          demo
          <span className="block truncate" style={{ color: 'var(--muted)', fontSize: 10.5, lineHeight: 1.2 }}>demo shop: made-up practice data</span>
        </button>
        <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>
          {searching ? `${tables.length}/${total}` : total}
        </span>
        <div className="relative">
          <button className="p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100" style={menu ? { opacity: 1 } : undefined} onClick={() => setMenu(!menu)} aria-label="Actions for the demo shop">
            <MoreHorizontal size={14} />
          </button>
          {menu && <Menu items={items} close={() => setMenu(false)} />}
        </div>
      </div>
      {open && (
        <div className="pl-4">
          {tables.map(([t, m]) => (
            <TableNode key={t.name} t={t} match={searching ? m : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A dataset: a folder with its tables. A catalog one's menu opens its starter query, reloads or
 * removes it; one of the user's takes files (from the menu, or dropped on it), is renamed, removed.
 */
function SchemaNode({ schema, tables, shown }: { schema: string; tables: TableInfo[]; shown?: [TableInfo, TreeMatch][] }) {
  const own = isOwnSchema(schema, RESERVED_IDS)
  const [userOpen, setOpen] = useState(own && tables.length === 0)
  // While searching, a folder with matches is open and shows only them.
  const open = userOpen || !!shown
  const [menu, setMenu] = useState(false)
  const [dropHere, setDropHere] = useState(0)
  const d = own ? undefined : datasetById(schema)
  const hasTables = tables.some((t) => t.kind === 'table')
  const empty = tables.filter((t) => t.kind === 'table' && t.rows === 0)
  const exporting = useLab((s) => s.csvExport)
  const exportingHere = exporting?.schema === schema ? exporting : null
  const items: MenuItem[] = [
    ...(d
      ? ([
          ['New SQL query', () => void openDataset(d)],
          ['New Python notebook', () => void openDataset(d, false, 'python'), { hint: `lab.table("${d.id}.${d.main}")` }],
          ['Guide: about, examples, pandas ↔ SQL', () => openGuide(d.id)],
          ['Reload (undo my changes)…', () => confirm(`Load ${d.title} again? Changes made to its tables are lost.`) && void openDataset(d, true)],
        ] as MenuItem[])
      : ([
          ['Add CSV / Excel…', () => pickFilesFor(undefined, schema)],
          ...(empty.length ? [['Generate sample rows…', () => void openGenerate(undefined, schema)]] : []),
          ['Rename…', () => void renameDataset(schema)],
        ] as [string, () => void][])),
    ...(hasTables
      ? ([
          ['Show as model in model.quaera.app ↗', () => openAsModel(schema)],
          ['Copy dataset to PostgreSQL', () => void copySchemaToPostgres(schema)],
          ...(canPickFolder()
            ? ([['Export all tables as CSV to a folder…', () => void exportDatasetCsv(schema, true), { disabled: !!exporting, hint: 'one .csv per table, for Power BI or Excel' }]] as MenuItem[])
            : []),
          ['Export all tables as CSV (.zip)', () => void exportDatasetCsv(schema, false), { disabled: !!exporting, hint: canPickFolder() ? undefined : 'one .csv per table, for Power BI or Excel' }],
        ] as MenuItem[])
      : []),
    [
      'Remove from this browser…',
      () => confirm(tables.length ? `Remove ${d?.title ?? schema} and its ${tables.length} tables from this browser?` : `Remove the empty dataset ${schema}?`) && void dropDataset(schema),
    ],
  ]
  return (
    <div>
      {/* A file dropped on one of the user's folders becomes a table in it (the page-wide drop handler reads data-fill-schema). */}
      <div
        className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]"
        data-fill-schema={own ? schema : undefined}
        onDragOver={(e) => own && e.dataTransfer.types.includes(TABLE_DRAG) && e.preventDefault()}
        style={dropHere > 0 && own ? { background: 'var(--accent-soft)', outline: '2px dashed var(--accent)', outlineOffset: -2 } : undefined}
        onDragEnter={() => setDropHere((n) => n + 1)}
        onDragLeave={() => setDropHere((n) => Math.max(0, n - 1))}
        onDrop={(e) => {
          setDropHere(0)
          const dragged = own ? e.dataTransfer.getData(TABLE_DRAG) : ''
          if (!dragged) return
          e.preventDefault()
          const from: { schema: string; name: string } = JSON.parse(dragged)
          const t = useLab.getState().tables.find((x) => x.schema === from.schema && x.name === from.name)
          if (t && t.schema !== schema) void openMove(t, schema)
        }}
      >
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Folder size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button
          className="truncate text-left flex-1"
          onClick={() => setOpen(!open)}
          title={own ? `Your dataset ${schema}: its tables are ${schema}.table_name; drop files here to add tables` : `${d?.title ?? schema}: tables are in the schema ${schema} (${schema}.table_name)`}
        >
          {schema}
        </button>
        {own && (
          <span className="shrink-0 px-1 rounded" style={{ background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 10 }} title="Your own dataset (not a sample one)">
            my
          </span>
        )}
        {exportingHere ? (
          <span className="shrink-0 flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: 11 }} title={`Exporting ${exportingHere.table} as CSV`}>
            <Loader2 size={11} className="animate-spin" /> CSV {exportingHere.done + 1}/{exportingHere.total}
          </span>
        ) : (
          <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 11 }}>
            {shown ? `${shown.length}/${tables.length}` : tables.length}
          </span>
        )}
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
          {!shown && tables.length === 0 && (
            <p className="pl-6 pr-2 py-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
              Empty. Drop CSV or Excel files on the folder, or{' '}
              <button className="hover:underline" style={{ color: 'var(--accent)' }} onClick={() => pickFilesFor(undefined, schema)}>
                add a file
              </button>
              .
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** What a dragged table carries: its schema and name. */
const TABLE_DRAG = 'application/x-lab-table'

/** `match`: while searching, how the table matched; one found by its columns opens on them. */
function TableNode({ t, match }: { t: TableInfo; match?: TreeMatch }) {
  const [userOpen, setOpen] = useState(false)
  const byColumn = !!match?.columns.length
  const open = userOpen || byColumn
  const [menu, setMenu] = useState(false)
  const insertable = useContext(InsertMode)
  const pick = useContext(PickTables)
  const [dropHere, setDropHere] = useState(0)
  const name = qualifiedName(t.schema, t.name)
  const fillable = (isOwnSchema(t.schema, RESERVED_IDS) || t.schema === DEMO_SCHEMA) && t.kind === 'table'
  const Icon = t.kind === 'view' ? Eye : Table2

  return (
    <div>
      {/* A file dropped here fills this table (the page-wide drop handler reads data-fill-table). */}
      <div
        className="group flex items-center gap-1 pl-2 pr-1 py-1 hover:bg-[var(--panel-2)]"
        data-fill-table={fillable ? t.name : undefined}
        data-fill-schema={fillable ? t.schema : undefined}
        // A table can be dragged onto one of the user's datasets (Move to dataset opens with it chosen).
        draggable={fillable && t.schema !== DEMO_SCHEMA}
        onDragStart={(e) => {
          e.dataTransfer.setData(TABLE_DRAG, JSON.stringify({ schema: t.schema, name: t.name }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        style={dropHere > 0 && fillable ? { background: 'var(--accent-soft)', outline: '2px dashed var(--accent)', outlineOffset: -2 } : undefined}
        onDragEnter={() => setDropHere((n) => n + 1)}
        onDragLeave={() => setDropHere((n) => Math.max(0, n - 1))}
        onDrop={() => setDropHere(0)}
        onDoubleClick={() => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)}
      >
        {pick.on && <input type="checkbox" className="shrink-0" data-pick={name} checked={pick.picked.has(name)} onChange={() => {}} onClick={(e) => pick.toggle(name, e)} aria-label={`Select ${name}`} />}
        <button className="p-0.5" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Icon size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <button className="truncate text-left flex-1" onClick={(e) => {
          // Ctrl / Shift + click on a name starts picking, like in a file list.
          if (!pick.on && (e.ctrlKey || e.metaKey || e.shiftKey)) pick.start(name)
          else if (pick.on) pick.toggle(name, e)
          else setOpen(!open)
        }} title={`${name} — double-click to see the first 100 rows${fillable ? '; drop a file here to add rows' : ''}`}>
          <Highlight text={t.name} match={match?.byName ? match : undefined} />
        </button>
        {insertable && (
          <button
            className="btn shrink-0"
            style={{ padding: '2px 8px' }}
            onClick={() => {
              if (insertAtCursor(name)) openTables(false)
            }}
            aria-label={`Insert ${name} into the editor`}
          >
            <CornerDownLeft size={13} /> Insert
          </button>
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
          {menu && <TableMenu t={t} name={name} close={() => setMenu(false)} pick={pick.start} />}
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

function TableMenu({ t, name, close, pick }: { t: TableInfo; name: string; close: () => void; pick: (name: string) => void }) {
  const cols = t.columns.map((c) => c.name).join(', ')
  const fillable = (isOwnSchema(t.schema, RESERVED_IDS) || t.schema === DEMO_SCHEMA) && t.kind === 'table'
  const items: MenuItem[] = [
    ['New SQL query', () => addTab(`SELECT *\nFROM ${name}\nLIMIT 100;\n`, t.name)],
    ['New Python notebook', () => newPythonNotebookOn(labName(t), t.name), { hint: `lab.table(${JSON.stringify(labName(t))})` }],
    'separator',
    ['Select first 100 rows', () => openAndRun(`SELECT * FROM ${name} LIMIT 100;`, t.name)],
    ['Count rows', () => openAndRun(`SELECT count(*) AS rows FROM ${name};`, `count ${t.name}`)],
    ['Profile columns (SUMMARIZE)', () => openAndRun(`SUMMARIZE ${name};`, `profile ${t.name}`)],
    ['Script SELECT with columns', () => openAndRun(`SELECT ${cols}
FROM ${name}
LIMIT 100;`, t.name)],
    ...(fillable
      ? ([
          ['Add rows from CSV / Excel…', () => pickFilesFor(t.name, t.schema)],
          ['Generate sample rows…', () => void openGenerate(t.name, t.schema)],
          ['Move to dataset…', () => void openMove(t)],
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
    ['Select several to drop…', () => pick(name)],
    [
      t.kind === 'view' ? 'Drop view…' : 'Drop table…',
      () => void confirmDrop([t]),
    ],
  ]
  return <Menu items={items} close={close} danger />
}

/**
 * Asks before dropping `list`, naming the tables that point at them with a foreign key: DuckDB
 * refuses to drop a table while those exist, so they go too. True when it was dropped.
 */
async function confirmDrop(list: TableInfo[]): Promise<boolean> {
  const names = (l: TableInfo[]) => (l.length <= 8 ? l.map((t) => qualifiedName(t.schema, t.name)).join(', ') : `${l.length} tables`)
  const extra = await dependentsOf(list).catch(() => [])
  const what = list.length === 1 ? `${list[0].kind} ${names(list)}` : names(list)
  const note = extra.length ? ` ${extra.length === 1 ? 'It is' : 'They are'} referenced by ${names(extra)} (foreign keys), so ${extra.length === 1 ? 'that table goes' : 'those go'} too.` : ''
  if (!confirm(`Drop ${what}?${note} This cannot be undone.`)) return false
  await dropObjects([...list, ...extra])
  return true
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
