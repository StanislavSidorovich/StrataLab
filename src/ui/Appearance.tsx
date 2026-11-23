// The "Aa" button in the header: light or dark theme, and the background of the centre and of
// the two side panels, each from a few pale tints or any colour. Rules and swatches in src/core/look.ts.
import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { applyBorders, readBorders, type Borders } from '../core/borders'
import { chooseContrast, CONTRAST_LEVELS, contrastLabel, readContrast, showContrast } from '../core/contrast'
import { parseZoom, ZOOM_KEY, ZOOM_STEPS, zoomLabel } from '../core/practiceZoom'
import { lookColor, lookVars, NO_LOOK, parseLook, setLookColor, SWATCHES, type Look, type LookPart } from '../core/look'
import { clampTint, hslToHex, lightnessRange, NO_TINT, parseTint, TINT_KEY, tintColor, tintVars, type Hsl, type Tint, type TintPart } from '../core/tint'
import { toggleTheme, useLab } from './store'
import { TEXT_ZOOM_EVENT } from './useTextZoom'
import './appearanceTint.css'
import './panelColours.css'
import './contrast.css'

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
  const [borders, setBorders] = useState<Borders>(readBorders)
  const [zoom, setZoom] = useState(() => {
    try {
      return parseZoom(localStorage.getItem(ZOOM_KEY))
    } catch {
      return 1
    }
  })
  const [contrast, setContrast] = useState(readContrast)
  const [tint, setTint] = useState<Tint>(() => {
    try {
      return parseTint(localStorage.getItem(TINT_KEY))
    } catch {
      return NO_TINT
    }
  })
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

  // Callout and accent colours: the panel only writes CSS variables (--note-border, --note-bg, --accent, --accent-soft).
  useEffect(() => {
    const style = document.documentElement.style
    for (const [name, value] of Object.entries(tintVars(tint, theme))) {
      if (value) style.setProperty(name, value)
      else style.removeProperty(name)
    }
    try {
      localStorage.setItem(TINT_KEY, JSON.stringify(tint))
    } catch {
      /* private mode: the colours hold for this session only */
    }
  }, [tint, theme])

  useEffect(() => applyBorders(borders), [borders])

  // Shown, not saved: only a click remembers a level, so a system asking for more contrast stays a default.
  useEffect(() => showContrast(contrast), [contrast])

  // The practice pages, the pipeline and the build page read --practice-zoom (PracticeBook.tsx, PipelinePage.tsx, build.css).
  useEffect(() => {
    document.documentElement.style.setProperty('--practice-zoom', String(zoom))
    window.dispatchEvent(new Event(TEXT_ZOOM_EVENT))
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      /* private mode: the size is not remembered */
    }
  }, [zoom])

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

  const tintRow = (part: TintPart, label: string) => {
    const c = tintColor(tint, part, theme)
    const [lo, hi] = lightnessRange(part, theme, c.h, c.s)
    const set = (patch: Partial<Hsl>) => setTint((t) => ({ ...t, [part]: { ...t[part], [theme]: clampTint(part, theme, { ...tintColor(t, part, theme), ...patch }) } }))
    const sliders: { key: keyof Hsl; name: string; min: number; max: number }[] = [
      { key: 'h', name: 'Hue', min: 0, max: 360 },
      { key: 's', name: 'Saturation', min: 0, max: part === 'callout' ? 60 : 100 },
      { key: 'l', name: 'Lightness', min: lo, max: hi },
    ]
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <span className="inline-block w-4 h-4 rounded" style={{ background: hslToHex(c), border: '1px solid var(--line)' }} aria-hidden />
          {label}
        </div>
        <div className="tint-sliders">
          {sliders.map(({ key, name, min, max }) => (
            <label key={key}>
              <span>{name}</span>
              <input type="range" min={min} max={max} value={c[key]} aria-label={`${label}: ${name.toLowerCase()}`} onChange={(e) => set({ [key]: Number(e.target.value) })} />
              <output>{c[key]}</output>
            </label>
          ))}
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
          className="absolute right-0 top-10 z-50 rounded-lg p-3 shadow-lg flex flex-col gap-3 w-[min(19rem,calc(100vw-1rem))] max-h-[calc(100vh-4rem)] overflow-y-auto"
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
          <div>
            <div className="mb-1.5" style={{ color: 'var(--muted)' }}>Borders</div>
            <div className="inline-flex rounded-md overflow-hidden" role="radiogroup" aria-label="Borders" style={{ border: '1px solid var(--line)' }}>
              {(['strong', 'soft'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={borders === b}
                  className="px-3 py-1"
                  style={borders === b ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 } : { color: 'var(--muted)' }}
                  onClick={() => setBorders(b)}
                >
                  {b === 'strong' ? 'Strong' : 'Soft'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5" style={{ color: 'var(--muted)' }}>Text size</div>
            <div className="inline-flex rounded-md overflow-hidden" role="radiogroup" aria-label="Text size" style={{ border: '1px solid var(--line)' }}>
              {ZOOM_STEPS.map((z) => (
                <button
                  key={z}
                  type="button"
                  role="radio"
                  aria-checked={zoom === z}
                  className="px-3 py-1"
                  style={zoom === z ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 } : { color: 'var(--muted)' }}
                  onClick={() => setZoom(z)}
                >
                  {zoomLabel(z)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5" style={{ color: 'var(--muted)' }}>Text contrast</div>
            <div className="inline-flex rounded-md overflow-hidden" role="radiogroup" aria-label="Text contrast" style={{ border: '1px solid var(--line)' }}>
              {CONTRAST_LEVELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={contrast === c}
                  className="px-3 py-1"
                  style={contrast === c ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 } : { color: 'var(--muted)' }}
                  onClick={() => {
                    chooseContrast(c)
                    setContrast(c)
                  }}
                >
                  {contrastLabel(c)}
                </button>
              ))}
            </div>
          </div>
          {colorRow('editor', 'Centre (SQL editor, buttons in the work area)')}
          {colorRow('left', 'Left panel (tree, top bar, dialogs)')}
          {colorRow('right', 'Right panel (tables, AI helper)')}
          {colorRow('grid', 'Data grid (results, build tables)')}
          {tintRow('callout', 'Note colour ("New:" callouts)')}
          {tintRow('accent', 'Accent (buttons, links, active tab)')}
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Colours are kept separately for the light and dark theme, in this browser.</div>
          <button type="button" className="btn self-start" onClick={() => {
              setLook(NO_LOOK)
              setTint(NO_TINT)
              setBorders('strong')
              setZoom(1)
            }}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
