// The AI helper's width: a hook for the aside and the drag handle on its left edge.
// Pure rules (limits, default, keys) are in src/core/sidePanelWidth.ts; same behaviour as the sidebar's handle in App.tsx
// (pointer drag, double-click resets) plus arrow keys. Under 768 px the panel is a bottom dock and the handle is hidden.
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  SIDE_PANEL_KEY,
  SIDE_PANEL_MIN,
  clampSidePanelWidth,
  effectiveSidePanelWidth,
  keySidePanelWidth,
  maxSidePanelWidth,
  parseSidePanelWidth,
} from '../core/sidePanelWidth'

function readSaved(): number | null {
  try {
    return parseSidePanelWidth(localStorage.getItem(SIDE_PANEL_KEY))
  } catch {
    return null
  }
}

export function useSidePanelWidth(active: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [saved, setSaved] = useState<number | null>(readSaved)
  const [row, setRow] = useState(0)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  // The row is the editor and the panel side by side; its width bounds the panel, also after the window is resized.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!active || !parent) return
    const measure = () => {
      setRow(parent.getBoundingClientRect().width)
      setViewport(window.innerWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [active])

  const width = effectiveSidePanelWidth(saved, row || 100000, viewport)
  const max = row ? maxSidePanelWidth(row) : width

  const save = useCallback((w: number | null) => {
    setSaved(w)
    try {
      if (w === null) localStorage.removeItem(SIDE_PANEL_KEY)
      else localStorage.setItem(SIDE_PANEL_KEY, String(w))
    } catch {
      /* private mode: the width holds for this session only */
    }
  }, [])

  return { ref, width, max, saved, setWidth: save, row }
}

export function SidePanelHandle({ width, max, row, onWidth }: { width: number; max: number; row: number; onWidth: (w: number | null) => void }) {
  const start = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = width
    // dragging left makes the panel wider
    const move = (ev: PointerEvent) => onWidth(clampSidePanelWidth(w0 - (ev.clientX - x0), row || 100000))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const key = (e: KeyboardEvent<HTMLElement>) => {
    const next = keySidePanelWidth(e.key, width, row || 100000)
    if (next === null) return
    e.preventDefault()
    onWidth(next)
  }
  return (
    <div
      className="hidden md:block absolute top-0 left-0 h-full w-1.5 -ml-[3px] cursor-col-resize hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] z-20 outline-none"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize AI helper"
      aria-valuemin={SIDE_PANEL_MIN}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize; arrow keys ±16 px; double-click to reset"
      data-testid="ai-panel-handle"
      onPointerDown={start}
      onKeyDown={key}
      onDoubleClick={() => onWidth(null)}
    />
  )
}
