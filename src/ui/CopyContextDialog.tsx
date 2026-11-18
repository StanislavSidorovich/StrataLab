// Fallback modal shown when navigator.clipboard.writeText is unavailable or denied:
// lets the user select and copy the generated AI context manually.
import { useEffect, useRef } from 'react'
import { ClipboardCopy, X } from 'lucide-react'
import { closeCopyContextFallback, useLab } from './store'

export function CopyContextDialog() {
  const text = useLab((s) => s.copyContextFallback)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (text === null) return
    const el = areaRef.current
    if (el) {
      el.focus()
      el.select()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCopyContextFallback()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [text])

  if (text === null) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,14,20,0.55)' }}
      onMouseDown={(e) => e.target === e.currentTarget && closeCopyContextFallback()}
    >
      <div
        role="dialog"
        aria-label="Copy context for AI"
        className="w-full max-w-2xl max-h-full flex flex-col rounded-xl shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <ClipboardCopy size={18} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Copy context for AI</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Clipboard access is unavailable here. Copy the schema and summary context below manually (no raw rows are included):
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeCopyContextFallback} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto min-h-0 px-4 py-3 space-y-3">
          <textarea
            ref={areaRef}
            className="field w-full mono"
            style={{ fontSize: 12, height: 300, resize: 'vertical' }}
            readOnly
            value={text}
            aria-label="AI context"
            onFocus={(e) => e.target.select()}
          />
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={closeCopyContextFallback}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
