// A small drop-down of actions: under a ⋯ button, or where the user right-clicked (a context menu).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** An action, or a line between groups. */
export type MenuItem = [label: string, run: () => void, opts?: { disabled?: boolean; keys?: string }] | 'separator'

/**
 * With `danger`, the last item is set apart in red. With `at`, the menu opens at that point of
 * the window (kept inside it); else under its parent, which is `position: relative`, lined up
 * with its right edge (or its left one, with `align="left"`).
 */
export function Menu({ items, close, danger = false, at, label, align = 'right' }: { items: MenuItem[]; close: () => void; danger?: boolean; at?: { x: number; y: number }; label?: string; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useEffect(() => {
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [close])
  useLayoutEffect(() => {
    if (!at || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({ x: Math.max(4, Math.min(at.x, innerWidth - width - 4)), y: Math.max(4, Math.min(at.y, innerHeight - height - 4)) })
  }, [at])
  const last = items.length - 1
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`${at ? 'fixed' : align === 'left' ? 'absolute left-0 top-9' : 'absolute right-0 top-7'} z-50 rounded-lg py-1 shadow-lg min-w-56`}
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', fontSize: 13, fontWeight: 400, letterSpacing: 0, color: 'var(--text)', ...(pos ? { left: pos.x, top: pos.y } : {}) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="my-1" style={{ borderTop: '1px solid var(--line)' }} />
        ) : (
          <button
            key={item[0]}
            role="menuitem"
            disabled={item[2]?.disabled}
            className="flex w-full items-center gap-4 text-left px-3 py-1.5 hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:hover:bg-transparent"
            style={danger && i === last ? { color: 'var(--danger)', borderTop: '1px solid var(--line)' } : undefined}
            onClick={() => {
              close()
              item[1]()
            }}
          >
            <span className="flex-1">{item[0]}</span>
            {item[2]?.keys && (
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{item[2].keys}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}

/** Opens a context menu on a long press too: iPhones and iPads send no contextmenu event. */
export function useLongPress(open: (at: { x: number; y: number }) => void) {
  const timer = useRef<number | null>(null)
  const start = useRef({ x: 0, y: 0 })
  const fired = useRef(false)
  const cancel = () => {
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = null
  }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const at = (start.current = { x: e.clientX, y: e.clientY })
      cancel()
      fired.current = false
      timer.current = window.setTimeout(() => {
        fired.current = true
        open(at)
      }, 550)
    },
    // Lifting the finger after the menu opened must not click (and so close it, or pick the item under it).
    onTouchEnd: (e: React.TouchEvent) => {
      if (fired.current) e.preventDefault()
      fired.current = false
    },
    onPointerUp: cancel,
    // A finger never stays quite still; scrolling the tab strip cancels.
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel()
    },
    onPointerCancel: cancel,
  }
}
