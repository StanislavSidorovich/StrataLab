import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, FolderOpen, HardDrive, HelpCircle, Library, Loader2, Moon, Play, Plus, RefreshCw, Save, Square, Share2, Sun, Upload, X, Zap } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { SqlEditor, runActive } from './SqlEditor'
import { forgetFile, openSqlFile, openSqlFiles, saveSqlFile } from './sqlFiles'
import { isSqlFile, looksLikeTable } from '../core/editorFiles'
import { Results } from './Results'
import { ImportDialog } from './ImportDialog'
import { DdlDialog } from './DdlDialog'
import { GenerateDialog } from './GenerateDialog'
import { CatalogDialog, DatasetProgressCard } from './CatalogDialog'
import { WelcomeDialog } from './WelcomeDialog'
import { ShareDialog } from './ShareDialog'
import { PracticeDialog, TaskBar } from './Practice'
import { DialectBar } from './DialectBar'
import { applyUpdate, useUpdateReady } from '../pwa/register'
import { engineLoadingLabel, engineLoadingShort } from './EngineLoading'
import { addTab, closeTabs, duplicateTab, enqueueFiles, openCatalog, openShare, openWelcome, pasteTable, renameTab, reopenClosedTab, stopQuery, tabDialect, toggleTheme, useLab } from './store'
import { Menu, useLongPress, type MenuItem } from './Menu'
import { tabsToClose } from '../core/tabs'

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
  const dragging = useDropZone()

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const box = main.current!.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSplit(Math.min(0.8, Math.max(0.15, (ev.clientY - box.top) / box.height)))
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
      <div className="flex-1 min-h-0 flex">
        <div className="w-64 shrink-0 hidden md:block">
          <Sidebar />
        </div>
        <div ref={main} className="flex-1 min-w-0 flex flex-col">
          <Tabs />
          <DialectBar />
          <TaskBar />
          <div style={{ height: `${split * 100}%` }} className="min-h-0">
            <SqlEditor />
          </div>
          <div onPointerDown={startResize} className="h-1.5 shrink-0 cursor-row-resize hover:bg-[var(--accent)]" style={{ background: 'var(--line)' }} title="Drag to resize" />
          <div className="flex-1 min-h-0">
            <Results />
          </div>
        </div>
      </div>
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
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(5,150,105,0.12)', border: '3px dashed var(--accent)' }}>
          <div className="rounded-xl px-6 py-4 flex items-center gap-3 text-base font-semibold shadow-xl" style={{ background: 'var(--panel)' }}>
            <Upload size={20} style={{ color: 'var(--accent)' }} /> Drop CSV, Excel, Parquet or JSON files to make tables, or onto a table to add rows; .sql files open as query tabs
          </div>
        </div>
      )}
      <ImportDialog />
      <DdlDialog />
      <GenerateDialog />
      <CatalogDialog />
      <DatasetProgressCard />
      <WelcomeDialog />
      <ShareDialog />
      <PracticeDialog />
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
      // Dropped on a table in the object tree: add the rows to it.
      const table = (e.target as Element | null)?.closest?.('[data-fill-table]')?.getAttribute('data-fill-table') ?? undefined
      const files = [...(e.dataTransfer?.files ?? [])]
      // .sql scripts open as query tabs; the rest are data.
      void openSqlFiles(files.filter((f) => isSqlFile(f.name)))
      const data = files.filter((f) => !isSqlFile(f.name))
      if (data.length) void enqueueFiles(data, table)
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

function TopBar() {
  const engine = useLab((s) => s.engine)
  const theme = useLab((s) => s.theme)
  const updateReady = useUpdateReady()
  return (
    <header className="h-12 shrink-0 flex items-center gap-1 sm:gap-3 px-2 sm:px-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex items-center gap-2 font-bold text-[15px] whitespace-nowrap">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
          <ellipse cx="16" cy="7" rx="11" ry="4" fill="var(--accent)" />
          <path d="M5 7v18c0 2.2 4.9 4 11 4s11-1.8 11-4V7" fill="none" stroke="var(--accent)" strokeWidth="3" />
          <path d="M5 16c0 2.2 4.9 4 11 4s11-1.8 11-4" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.6" />
        </svg>
        Quaera Lab
      </div>
      <nav className="hidden lg:flex items-center gap-1 ml-2" style={{ color: 'var(--muted)', fontSize: 12 }}>
        <span>part of</span>
        <a className="hover:underline" href="https://quaera.app" target="_blank" rel="noreferrer">Quaera</a>
        <span>·</span>
        <a className="hover:underline" href="https://model.quaera.app" target="_blank" rel="noreferrer">model</a>
        <span>·</span>
        <a className="hover:underline" href="https://flow.quaera.app" target="_blank" rel="noreferrer">flow</a>
        <span>·</span>
        <a className="hover:underline" href="https://pandas.quaera.app" target="_blank" rel="noreferrer">pandas</a>
      </nav>
      <div className="flex-1" />
      <FileButtons />
      <RunButton />
      <EngineBadge />
      {/* The sidebar (with its catalog button) is hidden on a phone. */}
      <button className="btn btn-ghost md:hidden" onClick={() => openCatalog()} disabled={engine.status !== 'ready'} aria-label="Sample datasets" title="Sample datasets">
        <Library size={16} />
      </button>
      {/* Only while a new version waits (src/pwa/register.ts). */}
      {updateReady && (
        <button className="btn btn-primary" onClick={applyUpdate} title="A new version of Quaera Lab is ready: reload to use it (your tables and query tabs are kept)" aria-label="Update" data-testid="update">
          <RefreshCw size={14} /> <span className="hidden sm:inline">Update</span>
        </button>
      )}
      <button className="btn btn-ghost" onClick={openWelcome} aria-label="How to use Quaera Lab" title="How to use Quaera Lab">
        <HelpCircle size={16} />
      </button>
      {/* On a phone the header is full: the theme button steps aside while Update shows. */}
      <button className={`btn btn-ghost${updateReady ? ' phone-hidden' : ''}`} onClick={toggleTheme} aria-label="Switch theme" title="Light / dark">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  )
}

function FileButtons() {
  const [saved, setSaved] = useState(false)
  const save = async (saveAs: boolean) => {
    if (await saveSqlFile(saveAs)) (setSaved(true), setTimeout(() => setSaved(false), 1500))
  }
  return (
    <div className="flex items-center">
      <button className="btn btn-ghost" onClick={() => void openSqlFile()} aria-label="Open a .sql file" title="Open a .sql file in a new tab (Ctrl+O)">
        <FolderOpen size={15} /> <span className="hidden lg:inline">Open</span>
      </button>
      <button className="btn btn-ghost" onClick={(e) => void save(e.shiftKey)} aria-label="Save this tab as a .sql file" title="Save this tab as a .sql file (Ctrl+S); Shift+click or Ctrl+Shift+S: save as…">
        {saved ? <Check size={15} /> : <Save size={15} />} <span className="hidden lg:inline">{saved ? 'Saved' : 'Save'}</span>
      </button>
      {/* A phone's header is full: there, Share is in the tab menu (a long press on a tab). */}
      <button className="btn btn-ghost hidden sm:inline-flex" onClick={() => openShare()} aria-label="Share a link" title="Share a link to these queries and the sample datasets they use">
        <Share2 size={15} /> <span className="hidden lg:inline">Share</span>
      </button>
    </div>
  )
}

/** Run, or Stop while the active tab's query runs (PostgreSQL tabs can't be stopped). */
function RunButton() {
  const engine = useLab((s) => s.engine)
  const tabId = useLab((s) => s.activeTab)
  const running = useLab((s) => s.results[s.activeTab]?.status === 'running')
  const pg = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)) === 'postgres')
  if (running && !pg)
    return (
      <button className="btn btn-danger" onClick={() => void stopQuery(tabId)} title="Stop the running query (Esc in the editor)">
        <Square size={13} fill="currentColor" /> Stop
      </button>
    )
  return (
    <button className="btn btn-primary" onClick={runActive} disabled={engine.status !== 'ready' || running} title="Run the selection, or the whole tab (Ctrl+Enter, F5)">
      {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
    </button>
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
      title={engine.persistent ? 'Tables are kept in this browser between visits. Nothing is uploaded.' : 'Tables last until this tab is closed: Quaera Lab is already open in another tab (it holds the saved database), or this browser has no private file store.'}
    >
      {engine.persistent ? <HardDrive size={13} /> : <Zap size={13} />}
      DuckDB {engine.version} · {engine.persistent ? 'saved in this browser' : 'in memory'}
    </span>
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
          className="group flex items-center gap-1 pl-3 pr-1 h-8 rounded-t-md shrink-0 max-w-52"
          style={t.id === active ? { background: 'var(--panel)', border: '1px solid var(--line)', borderBottom: 'none', fontWeight: 600 } : { color: 'var(--muted)' }}
          onClick={() => useLab.setState({ activeTab: t.id })}
          onDoubleClick={() => setEditing(t.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ id: t.id, at: { x: e.clientX, y: e.clientY } })
          }}
        >
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
      <button className="h-8 px-2 shrink-0" style={{ color: 'var(--muted)' }} onClick={() => addTab()} aria-label="New query tab" title="New query tab">
        <Plus size={15} />
      </button>
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
  const items: MenuItem[] = [
    ['Rename', rename, { keys: 'double-click' }],
    ['Duplicate', () => duplicateTab(id)],
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
