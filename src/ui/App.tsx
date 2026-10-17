import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, HardDrive, Loader2, Moon, Play, Plus, Sun, Upload, X, Zap } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { SqlEditor, runActive } from './SqlEditor'
import { Results } from './Results'
import { ImportDialog } from './ImportDialog'
import { addTab, closeTab, enqueueFiles, renameTab, toggleTheme, useLab } from './store'

export function App() {
  const theme = useLab((s) => s.theme)
  const importError = useLab((s) => s.importError)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // F5 runs the query like in SSMS (instead of reloading the page), also when the
  // focus is outside the editor; the editor handles its own keys first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const run = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
      if (!run || (e.target as HTMLElement).closest('input, textarea, select')) return
      e.preventDefault()
      runActive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(5,150,105,0.12)', border: '3px dashed var(--accent)' }}>
          <div className="rounded-xl px-6 py-4 flex items-center gap-3 text-base font-semibold shadow-xl" style={{ background: 'var(--panel)' }}>
            <Upload size={20} style={{ color: 'var(--accent)' }} /> Drop CSV, Excel, Parquet or JSON files to make tables
          </div>
        </div>
      )}
      <ImportDialog />
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
      void enqueueFiles([...(e.dataTransfer?.files ?? [])])
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
  return (
    <header className="h-12 shrink-0 flex items-center gap-3 px-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex items-center gap-2 font-bold text-[15px]">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
          <ellipse cx="16" cy="7" rx="11" ry="4" fill="var(--accent)" />
          <path d="M5 7v18c0 2.2 4.9 4 11 4s11-1.8 11-4V7" fill="none" stroke="var(--accent)" strokeWidth="3" />
          <path d="M5 16c0 2.2 4.9 4 11 4s11-1.8 11-4" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.6" />
        </svg>
        SQL Lab
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
      <button className="btn btn-primary" onClick={runActive} disabled={engine.status !== 'ready'} title="Run the selection, or the whole tab (Ctrl+Enter, F5)">
        <Play size={14} /> Run
      </button>
      <EngineBadge />
      <button className="btn btn-ghost" onClick={toggleTheme} aria-label="Switch theme" title="Light / dark">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  )
}

function EngineBadge() {
  const engine = useLab((s) => s.engine)
  if (engine.status === 'loading')
    return (
      <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
        <Loader2 size={14} className="animate-spin" /> Starting DuckDB…
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
      title={engine.persistent ? 'Tables are kept in this browser between visits. Nothing is uploaded.' : 'Tables last until this tab is closed: SQL Lab is already open in another tab (it holds the saved database), or this browser has no private file store.'}
    >
      {engine.persistent ? <HardDrive size={13} /> : <Zap size={13} />}
      DuckDB {engine.version} · {engine.persistent ? 'saved in this browser' : 'in memory'}
    </span>
  )
}

function Tabs() {
  const tabs = useLab((s) => s.tabs)
  const active = useLab((s) => s.activeTab)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="h-9 shrink-0 flex items-end gap-0.5 px-2 overflow-x-auto" style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)' }}>
      {tabs.map((t) => (
        <div
          key={t.id}
          className="group flex items-center gap-1 pl-3 pr-1 h-8 rounded-t-md shrink-0 max-w-52"
          style={t.id === active ? { background: 'var(--panel)', border: '1px solid var(--line)', borderBottom: 'none', fontWeight: 600 } : { color: 'var(--muted)' }}
          onClick={() => useLab.setState({ activeTab: t.id })}
          onDoubleClick={() => setEditing(t.id)}
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
            <span className="truncate" title="Double-click to rename">{t.title}</span>
          )}
          <button
            className="p-0.5 rounded opacity-40 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.id)
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
    </div>
  )
}
