import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Database, FileText, GraduationCap, SquareTerminal, HardDrive, HelpCircle, Loader2, Plus, RefreshCw, Share2, Table2, Upload, X, Zap } from 'lucide-react'
import { InsertMode, Sidebar, pickBackup, pickFilesFor } from './Sidebar'
import { SqlEditor, runActive, setActiveText } from './SqlEditor'
import { downloadNotebook, forgetFile, openSqlFile, openSqlFiles, saveSqlFile } from './sqlFiles'
import { looksLikeTable, opensAsTab } from '../core/editorFiles'
import { Results } from './Results'
import { MoveDialog } from './MoveDialog'
import { SaveKindDialog } from './SaveKindDialog'
import { ImportDialog } from './ImportDialog'
import { DdlDialog } from './DdlDialog'
import { GenerateDialog } from './GenerateDialog'
import { CatalogDialog, DatasetProgressCard } from './CatalogDialog'
import { WelcomeDialog } from './WelcomeDialog'
import { AboutDialog } from './AboutDialog'
import { ShareDialog } from './ShareDialog'
import { PracticeDialog, TaskBar } from './Practice'
import { GuideDialog } from './Guide'
import { CompareDialog } from './Compare'
import { DialectBar } from './DialectBar'
import { checkForUpdates, updateCheckMessage, useUpdateReady } from '../pwa/register'
import { memoryNote } from '../core/dbLock'
import { takeDatabaseHere } from '../db/engine'
import { engineLoadingLabel, engineLoadingShort } from './EngineLoading'
import { addTab, closeTabs, currentPythonStarter, newPythonTab, openPractice, switchTabDialect, tabDialect, downloadBackup, duplicateTab, enqueueFiles, openAbout, openCatalog, openShare, openTables, openWelcome, pasteTable, pasteTableFromClipboard, renameTab, reopenClosedTab, updateNow, useLab } from './store'
import { AppearanceButton } from './Appearance'
import { Menu, useLongPress, type MenuItem } from './Menu'
import { tabsToClose } from '../core/tabs'

declare const __APP_VERSION__: string

export function App() {
  const theme = useLab((s) => s.theme)
  const importError = useLab((s) => s.importError)
  const notice = useLab((s) => s.notice)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // F5 runs the query like in SSMS (instead of reloading the page), also when the
  // focus is outside the editor; the editor handles its own keys first.
  // Ctrl+O / Ctrl+S open and save .sql files (instead of the browser's own open and save page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // Ctrl+Shift+T is the browser's own; Alt+Shift+T reopens a tab closed here.
      if (e.altKey && e.shiftKey && !mod && e.code === 'KeyT') {
        e.preventDefault()
        reopenClosedTab()
        return
      }
      if (mod && !e.altKey && (key === 'o' || key === 's')) {
        e.preventDefault()
        void (key === 'o' ? openSqlFile() : saveSqlFile(e.shiftKey))
        return
      }
      const run = e.key === 'F5' || (mod && e.key === 'Enter')
      if (!run || (e.target as HTMLElement).closest('input, textarea, select')) return
      e.preventDefault()
      runActive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ctrl+V outside the editor with cells copied from Excel: make a table of them.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.cm-editor, input, textarea, select, [contenteditable]')) return
      if (useLab.getState().engine.status !== 'ready') return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!looksLikeTable(text)) return
      e.preventDefault()
      void pasteTable(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const [split, setSplit] = useState(0.45)
  const main = useRef<HTMLDivElement>(null)
  const editorBox = useRef<HTMLDivElement>(null)
  const dragging = useDropZone()

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    // The editor and the results share what is left under the tab strip and the bars, minus the handle itself.
    const handle = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const top = editorBox.current!.getBoundingClientRect().top
    const area = main.current!.getBoundingClientRect().bottom - top - handle.height
    const move = (ev: PointerEvent) => setSplit(Math.min(0.8, Math.max(0.15, (ev.clientY - handle.height / 2 - top) / area)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <MemoryBanner />
      <div className="flex-1 min-h-0 flex">
        <div className="w-64 shrink-0 hidden md:block">
          <Sidebar />
        </div>
        <div ref={main} className="flex-1 min-w-0 flex flex-col">
          <Tabs />
          <DialectBar />
          <TaskBar />
          <div ref={editorBox} style={{ flex: `${split} 1 0` }} className="min-h-0">
            <SqlEditor />
          </div>
          <div onPointerDown={startResize} className="h-1.5 shrink-0 cursor-row-resize hover:bg-[var(--accent)]" style={{ background: 'var(--line)' }} title="Drag to resize" />
          <div style={{ flex: `${1 - split} 1 0` }} className="min-h-0">
            <Results />
          </div>
        </div>
      </div>
      <MovedScreen />
      {importError && (
        <div className="fixed bottom-4 right-4 z-40 max-w-md rounded-lg p-3 flex gap-2 shadow-lg" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{importError}</span>
          <button onClick={() => useLab.setState({ importError: null })} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      )}
      {notice && !importError && (
        <div className="fixed bottom-4 right-4 z-40 max-w-md rounded-lg p-3 flex gap-2 shadow-lg" style={{ background: 'var(--accent-soft)', color: 'var(--text)', border: '1px solid var(--accent)' }} role="status">
          <Share2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <span className="flex-1">{notice}</span>
          <button onClick={() => useLab.setState({ notice: null })} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      )}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'color-mix(in srgb, var(--q-accent) 12%, transparent)', border: '3px dashed var(--accent)' }}>
          <div className="rounded-xl px-6 py-4 flex items-center gap-3 text-base font-semibold shadow-xl" style={{ background: 'var(--panel)' }}>
            <Upload size={20} style={{ color: 'var(--accent)' }} /> Drop CSV, Excel, Parquet or JSON files to make tables, or onto a table to add rows; .sql files open as query tabs
          </div>
        </div>
      )}
      <ImportDialog />
      <MoveDialog />
      <SaveKindDialog />
      <DdlDialog />
      <GenerateDialog />
      <CatalogDialog />
      <DatasetProgressCard />
      <TablesSheet />
      <WelcomeDialog />
      <AboutDialog />
      <ShareDialog />
      <PracticeDialog />
      <GuideDialog />
      <CompareDialog />
    </div>
  )
}

function useDropZone() {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      // Dropped on a table in the object tree: add the rows to it; on a dataset's folder: new tables in it.
      const at = (e.target as Element | null)?.closest?.('[data-fill-table], [data-fill-schema]')
      const table = at?.getAttribute('data-fill-table') ?? undefined
      const schema = at?.getAttribute('data-fill-schema') ?? undefined
      const files = [...(e.dataTransfer?.files ?? [])]
      // .sql scripts open as query tabs, .py and .ipynb as Python tabs; the rest are data.
      void openSqlFiles(files.filter((f) => opensAsTab(f.name)))
      const data = files.filter((f) => !opensAsTab(f.name))
      if (data.length) void enqueueFiles(data, table, schema)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
  return dragging
}

/** The table tree as a bottom sheet, for a phone (the sidebar is hidden there). */
function TablesSheet() {
  const open = useLab((s) => s.tablesOpen)
  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia('(min-width: 768px)')
    const close = () => mq.matches && openTables(false)
    mq.addEventListener('change', close)
    return () => mq.removeEventListener('change', close)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end md:hidden" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && openTables(false)}>
      <div role="dialog" aria-label="Tables" className="w-full flex flex-col rounded-t-xl shadow-2xl overflow-hidden" style={{ height: '85%', background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="font-semibold flex-1">Tables <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>Insert puts a name in the editor</span></span>
          <button className="btn btn-ghost" onClick={() => openTables(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="flex-1 min-h-0">
          <InsertMode.Provider value={true}>
            <Sidebar />
          </InsertMode.Provider>
        </div>
      </div>
    </div>
  )
}

function TopBar() {
  const engine = useLab((s) => s.engine)
  const updateReady = useUpdateReady()
  return (
    <header className="h-12 shrink-0 flex items-center gap-1 sm:gap-3 px-2 sm:px-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <quaera-switcher app="lab" />
      <FileMenu />
      {/* Not on a phone (its header is full): Help has Practice too. */}
      <span className="hidden sm:contents">
      <button className="btn btn-ghost" onClick={() => openPractice()} disabled={engine.status !== 'ready'} title="Practice: business questions on the demo shop, worked examples and tasks with a check of your answer and hints">
        <GraduationCap size={15} /> Practice
      </button>
      </span>
      <div className="flex-1" />
      <EngineBadge />
      {/* The sidebar (with its catalog button) is hidden on a phone. */}
      <span className="contents md:hidden">
        <button className="btn btn-ghost" onClick={() => openTables()} aria-label="Tables" title="Your tables and sample datasets">
          <Table2 size={16} /> Tables
        </button>
      </span>
      {/* Only while a new version waits (src/pwa/register.ts). */}
      {updateReady && (
        <button className="btn btn-primary" onClick={updateNow} title="A new version of Quaera Lab is ready: reload to use it (your saved tables and query tabs are kept)" aria-label="Update" data-testid="update">
          <RefreshCw size={14} /> <span className="hidden sm:inline">Update</span>
        </button>
      )}
      <HelpMenu />
      {/* On a phone the header is full: the appearance button steps aside while Update shows. */}
      <AppearanceButton className={updateReady ? 'phone-hidden' : ''} />
    </header>
  )
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** The File menu, as in a desktop program: files, data in and out, the whole database. */
function FileMenu() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const ready = useLab((s) => s.engine.status === 'ready')
  const busy = useLab((s) => s.backup !== null)
  const python = useLab((s) => s.tabs.find((t) => t.id === s.activeTab)?.dialect === 'python')
  const save = async (saveAs: boolean) => {
    if (await saveSqlFile(saveAs)) (setSaved(true), setTimeout(() => setSaved(false), 1500))
  }
  const items: MenuItem[] = [
    ['New SQL query', () => addTab()],
    ['New Python notebook', () => newPythonTab()],
    ['Open a file (.sql, .py, .ipynb)…', () => void openSqlFile(), { keys: `${mod}O` }],
    ['Save', () => void save(false), { keys: `${mod}S` }],
    ['Save as…', () => void save(true), { keys: isMac ? '⇧⌘S' : 'Ctrl+Shift+S' }],
    ['Download as notebook (.ipynb)', downloadNotebook, { disabled: !python }],
    'separator',
    ['Add CSV / Excel…', () => pickFilesFor(), { disabled: !ready }],
    ['Paste a table', () => void pasteTableFromClipboard(), { disabled: !ready }],
    ['Sample datasets…', () => openCatalog(), { disabled: !ready }],
    'separator',
    ['Share a link…', () => openShare()],
    'separator',
    ['Download database (.duckdb)', () => void downloadBackup(), { disabled: !ready || busy }],
    ['Restore from a backup…', pickBackup, { disabled: !ready || busy }],
  ]
  return (
    <div className="relative">
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title="Open, save, share; add data; back up the database">
        {saved ? <Check size={15} /> : <FileText size={15} />} {saved ? 'Saved' : 'File'} <ChevronDown size={13} />
      </button>
      {open && <Menu items={items} close={() => setOpen(false)} label="File" align="left" />}
    </div>
  )
}

async function runUpdateCheck() {
  useLab.setState({ notice: 'Checking for updates…' })
  useLab.setState({ notice: updateCheckMessage(await checkForUpdates(), __APP_VERSION__) })
}

/** Help: the guide, About & licences, Privacy (src/ui/AboutDialog.tsx). */
function HelpMenu() {
  const [open, setOpen] = useState(false)
  const items: MenuItem[] = [
    ['How to use Quaera Lab', openWelcome],
    ['Practice on the demo shop…', () => openPractice()],
    'separator',
    ['Check for updates', () => void runUpdateCheck()],
    ['About & licences', () => openAbout('about')],
    ['Privacy: your data stays here', () => openAbout('privacy')],
  ]
  return (
    <div className="relative">
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Help" title="Help: how to use, about & licences, privacy">
        <HelpCircle size={16} />
      </button>
      {open && <Menu items={items} close={() => setOpen(false)} label="Help" />}
    </div>
  )
}

function EngineBadge() {
  const engine = useLab((s) => s.engine)
  if (engine.status === 'loading')
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums" style={{ color: 'var(--muted)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="hidden sm:inline">{engineLoadingLabel(engine.progress)}</span>
        <span className="sm:hidden">{engineLoadingShort(engine.progress)}</span>
      </span>
    )
  if (engine.status === 'error')
    return (
      <span className="flex items-center gap-1.5" style={{ color: 'var(--danger)' }} title={engine.error}>
        <AlertTriangle size={14} /> Engine failed to start
      </span>
    )
  return (
    <span
      className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{ background: engine.persistent ? 'var(--accent-soft)' : 'var(--warn-soft)', color: engine.persistent ? 'var(--accent)' : 'var(--warn-text)', fontSize: 12 }}
      title={engine.persistent ? 'Tables are kept in this browser between visits. Nothing is uploaded.' : memoryNote(engine.memoryReason ?? 'failed')}
    >
      {engine.persistent ? <HardDrive size={13} /> : <Zap size={13} />}
      DuckDB {engine.version} · {engine.persistent ? 'saved in this browser' : 'in memory, not saved'}
    </span>
  )
}

/**
 * A tab in memory says so under the header, in words (the badge alone was easy to miss, and a phone
 * has no badge). When another Lab tab has the saved database, "Use this tab" brings it here.
 */
function MemoryBanner() {
  const engine = useLab((s) => s.engine)
  const [hidden, setHidden] = useState(false)
  if (engine.status !== 'ready' || engine.persistent || hidden) return null
  const reason = engine.memoryReason ?? 'failed'
  const useHere = () => {
    const { tables, schemas } = useLab.getState()
    const own = tables.some((t) => t.schema === 'main') || schemas.length > 0
    if (own && !confirm('This tab reloads to open the saved database: the tables loaded here in memory will be gone. The other tab stops using it. Go on?')) return
    takeDatabaseHere()
  }
  return (
    <div className="shrink-0 flex items-start sm:items-center gap-2 px-3 py-2 text-sm" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', borderBottom: '1px solid var(--line)' }} role="status" data-testid="memory-banner">
      <Zap size={15} className="shrink-0 mt-0.5 sm:mt-0" />
      <span className="flex-1">{memoryNote(reason)}</span>
      {reason === 'locked' && (
        <button className="btn btn-primary shrink-0" onClick={useHere} title="Close the saved database in the other tab and open it here">
          Use this tab
        </button>
      )}
      <button className="shrink-0" onClick={() => setHidden(true)} aria-label="Close" title="Hide (the badge at the top still says in memory)">
        <X size={14} />
      </button>
    </div>
  )
}

/** This tab gave the saved database to another one: nothing here works until it takes it back. */
function MovedScreen() {
  const moved = useLab((s) => s.dbMoved)
  if (!moved) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)' }} data-testid="db-moved">
      <div className="max-w-md rounded-xl p-5 shadow-xl flex flex-col gap-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 font-semibold">
          <HardDrive size={16} style={{ color: 'var(--accent)' }} /> Quaera Lab moved to another tab
        </div>
        <p style={{ color: 'var(--muted)' }}>Your saved tables are open in the other tab now. This one is paused, so that only one page writes to the database.</p>
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={() => takeDatabaseHere()}>
            Use this tab again
          </button>
        </div>
      </div>
    </div>
  )
}

/** Closes tabs and forgets the files they were opened from. */
function close(ids: string[]) {
  closeTabs(ids)
  ids.forEach(forgetFile)
}

function Tabs() {
  const tabs = useLab((s) => s.tabs)
  const active = useLab((s) => s.activeTab)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const [plus, setPlus] = useState<{ x: number; y: number } | null>(null)
  const longPress = useLongPress((at) => {
    const id = document.elementFromPoint(at.x, at.y)?.closest('[data-tab]')?.getAttribute('data-tab')
    if (id) setMenu({ id, at })
  })
  return (
    <div className="h-9 shrink-0 flex items-end gap-0.5 px-2 overflow-x-auto" style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)' }} {...longPress}>
      {tabs.map((t) => (
        <div
          key={t.id}
          data-tab={t.id}
          className="group flex items-center gap-1 pl-2 pr-1 h-8 rounded-t-md shrink-0 max-w-52"
          style={{
            // The kind shows on the tab itself: an icon and a thin stripe on top, Python in its own blue.
            borderTop: `2px solid ${tabDialect(t) === 'python' ? 'var(--py)' : 'var(--line)'}`,
            ...(t.id === active ? { background: 'var(--panel)', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', borderBottom: 'none', fontWeight: 600 } : { color: 'var(--muted)' }),
          }}
          onClick={() => useLab.setState({ activeTab: t.id })}
          onDoubleClick={() => setEditing(t.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ id: t.id, at: { x: e.clientX, y: e.clientY } })
          }}
        >
          {tabDialect(t) === 'python' ? (
            <SquareTerminal size={13} className="shrink-0" style={{ color: 'var(--py)' }} aria-label="Python tab" />
          ) : (
            <Database size={13} className="shrink-0" style={{ color: 'var(--muted)' }} aria-label="SQL tab" />
          )}
          {editing === t.id ? (
            <input
              autoFocus
              className="field py-0 w-32"
              defaultValue={t.title}
              onBlur={(e) => (renameTab(t.id, e.target.value), setEditing(null))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            <span className="truncate" title="Double-click to rename; right-click for more">{t.title}</span>
          )}
          <button
            className="p-0.5 rounded opacity-40 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              close([t.id])
            }}
            aria-label={`Close ${t.title}`}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        className="h-8 px-2 shrink-0"
        style={{ color: 'var(--muted)' }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPlus({ x: r.left, y: r.bottom + 2 })
        }}
        aria-haspopup="menu"
        aria-label="New tab"
        title="New SQL query or New Python notebook"
      >
        <Plus size={15} />
      </button>
      {plus && (
        <Menu
          items={[
            ['New SQL query', () => addTab(), { hint: 'DuckDB, T-SQL or PostgreSQL' }],
            ['New Python notebook', () => newPythonTab(), { hint: 'pandas, matplotlib and seaborn over the same tables' }],
          ]}
          close={() => setPlus(null)}
          at={plus}
          label="New tab"
        />
      )}
      {menu && <TabMenu id={menu.id} at={menu.at} rename={() => setEditing(menu.id)} close={() => setMenu(null)} />}
    </div>
  )
}

/** Right-click (or a long press) on a tab, as in SSMS and browsers. */
function TabMenu({ id, at, rename, close: closeMenu }: { id: string; at: { x: number; y: number }; rename: () => void; close: () => void }) {
  const ids = useLab((s) => s.tabs).map((t) => t.id)
  const closed = useLab((s) => s.closedTabs.length)
  const others = tabsToClose(ids, id, 'others')
  const right = tabsToClose(ids, id, 'right')
  const tab = useLab((s) => s.tabs.find((t) => t.id === id))
  const python = tabDialect(tab) === 'python'
  const items: MenuItem[] = [
    ['Rename', rename, { keys: 'double-click' }],
    ['Duplicate', () => duplicateTab(id)],
    // An empty tab turns into the other kind; one with text stays as it is and a new tab opens beside it.
    [
      python ? 'Switch to SQL' : 'Switch to Python',
      () => {
        const empty = !tab?.sql.trim()
        useLab.setState({ activeTab: id })
        switchTabDialect(id, python ? 'duckdb' : 'python')
        if (empty && !python) setTimeout(() => setActiveText(currentPythonStarter()), 0)
      },
      { hint: tab?.sql.trim() ? 'Opens a new tab; this one stays as it is' : undefined },
    ],
    ['Share a link…', () => (useLab.setState({ activeTab: id }), openShare())],
    'separator',
    ['Close', () => close([id])],
    ['Close others', () => close(others), { disabled: !others.length }],
    ['Close tabs to the right', () => close(right), { disabled: !right.length }],
    'separator',
    ['Reopen closed tab', reopenClosedTab, { disabled: !closed, keys: 'Alt+Shift+T' }],
  ]
  return <Menu items={items} close={closeMenu} at={at} label="Tab" />
}
