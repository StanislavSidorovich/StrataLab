// The "Aa" button in the header: light or dark theme, and the background of the SQL editor and of
// the panels, each from a few pale tints or any colour. Rules and swatches in src/core/look.ts.
import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { lookColor, lookVars, NO_LOOK, parseLook, setLookColor, SWATCHES, type Look, type LookPart } from '../core/look'
import { toggleTheme, useLab } from './store'

const LOOK_KEY = 'stratalab.look'

function readLook(): Look {
  try {
    return parseLook(localStorage.getItem(LOOK_KEY))
  } catch {
    return NO_LOOK
  }
}

export function AppearanceButton({ className = '' }: { className?: string }) {
  const theme = useLab((s) => s.theme)
  const [look, setLook] = useState(readLook)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const style = document.documentElement.style
    for (const [name, value] of Object.entries(lookVars(look, theme))) {
      if (value) style.setProperty(name, value)
      else style.removeProperty(name)
    }
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(look))
    } catch {
      /* private mode: the look is not remembered */
    }
  }, [look, theme])

  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const colorRow = (which: LookPart, label: string) => {
    const current = lookColor(look, which, theme)
    return (
      <div>
        <div className="mb-1.5" style={{ color: 'var(--muted)' }}>{label}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES[which][theme].map((c, i) => (
            <button
              key={c}
              type="button"
              className="w-6 h-6 rounded-full"
              style={{ background: c, border: '1px solid var(--line)', boxShadow: current === c ? '0 0 0 2px var(--panel), 0 0 0 4px var(--accent)' : undefined }}
              title={i === 0 ? 'Default' : c}
              aria-label={i === 0 ? `${label}: default` : `${label}: ${c}`}
              aria-pressed={current === c}
              onClick={() => setLook((l) => setLookColor(l, which, theme, c))}
            />
          ))}
          <label
            className="relative w-6 h-6 rounded-full flex items-center justify-center cursor-pointer overflow-hidden"
            style={{ background: current, border: '1px dashed var(--muted)', color: 'var(--muted)' }}
            title="Any colour…"
          >
            <span aria-hidden>+</span>
            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label}: any colour`} value={current} onChange={(e) => setLook((l) => setLookColor(l, which, theme, e.target.value))} />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} ref={root}>
      <button className="btn btn-ghost font-semibold" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label="Appearance" title="Appearance: light or dark theme, editor and panel colours">
        Aa
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="absolute right-0 top-10 z-50 rounded-lg p-3 shadow-lg flex flex-col gap-3 w-[min(19rem,calc(100vw-1rem))]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
        >
          <div>
            <div className="mb-1.5" style={{ color: 'var(--muted)' }}>Theme</div>
            <div className="inline-flex rounded-md overflow-hidden" role="radiogroup" aria-label="Theme" style={{ border: '1px solid var(--line)' }}>
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  className="flex items-center gap-1.5 px-3 py-1"
                  style={theme === t ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 } : { color: 'var(--muted)' }}
                  onClick={() => theme !== t && toggleTheme()}
                >
                  {t === 'dark' ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>
          {colorRow('editor', 'SQL editor')}
          {colorRow('panels', 'Panels (top bar, tree, results, dialogs)')}
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Colours are kept separately for the light and dark theme, in this browser.</div>
          <button type="button" className="btn self-start" onClick={() => setLook(NO_LOOK)}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
