// Draggable edges for the side panes of the Clean canvas (Queries on the left, Applied steps on the right), like the sidebar of the
// workbench (App.tsx, startSideResize): pointer drag, arrow keys on the handle (±16 px), double-click resets, width kept in localStorage.
import { useEffect, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import './cleanPolish.css'

export const PANE_STEP = 16
export const PANES = {
  queries: { key: 'stratalab.clean.queriesW', min: 140, max: 380 },
  steps: { key: 'stratalab.clean.stepsW', min: 200, max: 520 },
} as const
export type PaneId = keyof typeof PANES

/** a stored width inside the pane's limits, or null (use the stylesheet's own) */
export function readPaneWidth(id: PaneId): number | null {
  try {
    const n = Number(localStorage.getItem(PANES[id].key))
    return n >= PANES[id].min && n <= PANES[id].max ? n : null
  } catch {
    return null
  }
}

export function clampPane(id: PaneId, w: number): number {
  return Math.round(Math.min(PANES[id].max, Math.max(PANES[id].min, w)))
}

/** The width of a pane (null = the default of the stylesheet) and a setter that remembers it. */
export function usePaneWidth(id: PaneId): [number | null, (w: number | null) => void] {
  const [w, setW] = useState<number | null>(() => readPaneWidth(id))
  useEffect(() => {
    try {
      if (w === null) localStorage.removeItem(PANES[id].key)
      else localStorage.setItem(PANES[id].key, String(w))
    } catch {
      /* private mode: the width is not remembered */
    }
  }, [w, id])
  return [w, (v) => setW(v === null ? null : clampPane(id, v))]
}

/** The handle on the inner edge of a pane. `side` is where the pane is: dragging towards the centre makes it wider. */
export function PaneHandle({ id, side, width, onWidth }: { id: PaneId; side: 'left' | 'right'; width: number | null; onWidth: (w: number | null) => void }) {
  const sign = side === 'left' ? 1 : -1
  const current = (el: HTMLElement) => width ?? (el.parentElement?.getBoundingClientRect().width ?? PANES[id].min)
  const start = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = current(e.currentTarget)
    const move = (ev: PointerEvent) => onWidth(w0 + sign * (ev.clientX - x0))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const key = (e: KeyboardEvent<HTMLElement>) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    onWidth(current(e.currentTarget) + sign * dir * PANE_STEP)
  }
  const label = id === 'queries' ? 'Queries' : 'Applied steps'
  return (
    <div
      className={`cc-handle is-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuemin={PANES[id].min}
      aria-valuemax={PANES[id].max}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Drag to resize; arrow keys ±16 px; double-click to reset"
      data-testid={`clean-handle-${id}`}
      onPointerDown={start}
      onKeyDown={key}
      onDoubleClick={() => onWidth(null)}
    />
  )
}
