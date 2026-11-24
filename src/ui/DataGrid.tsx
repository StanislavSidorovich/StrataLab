// Virtualised grid over an Arrow table: only the visible rows are formatted,
// so a million-row result scrolls as smoothly as ten rows.
import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Table } from 'apache-arrow'
import { formatterFor, isNumericField, typeLabel } from '../db/format'
import { useLongPress } from './Menu'
import { useTextZoom } from './useTextZoom'

const BASE_ROW_H = 26

/** `onCellMenu`: a right-click (or a long press) on a cell, with its row and column. */
/** `tight`: narrow columns (at most 110 px, long names and values cut with the full text on hover), for a few sample rows that must fit without sideways scrolling (lesson mode). */
export function DataGrid({ table, compact = false, scaled = true, tight = false, onCellMenu }: { table: Table; compact?: boolean; scaled?: boolean; tight?: boolean; onCellMenu?: (row: number, col: number, at: { x: number; y: number }) => void }) {
  const parentRef = useRef<HTMLDivElement>(null)
  // the size chosen under Aa: row height, column widths and font all follow it
  // (`scaled` off where a parent already zooms the page, as the practice pages do, or where the size should not apply)
  const chosen = useTextZoom()
  const zoom = scaled ? chosen : 1
  const ROW_H = Math.round(BASE_ROW_H * zoom)
  const fields = table.schema.fields
  const cols = useMemo(() => {
    const sample = Math.min(table.numRows, 200)
    return fields.map((f, i) => {
      const vec = table.getChildAt(i)
      const fmt = formatterFor(f)
      let len = Math.max(f.name.length, typeLabel(f).length * 0.8)
      for (let r = 0; r < sample; r++) {
        const v = fmt(vec?.get(r))
        len = Math.max(len, v == null ? 4 : String(v).length)
      }
      return { field: f, vec, fmt, num: isNumericField(f), width: tight ? Math.min(110, Math.max(44, len * 6 + 14)) : Math.min(360, Math.max(70, len * 7.6 + 20)) }
    })
  }, [table, fields, tight])
  const numW = Math.round((tight ? 28 : Math.max(40, String(table.numRows).length * 8 + 16)) * zoom)
  const total = numW + cols.reduce((s, c) => s + Math.round(c.width * zoom), 0)

  const cellAt = (target: EventTarget, x: number, y: number) => {
    const el = (target as Element).closest?.('[data-cell]')
    if (!el || !onCellMenu) return false
    const [r, c] = el.getAttribute('data-cell')!.split(':').map(Number)
    onCellMenu(r, c, { x, y })
    return true
  }
  const longPress = useLongPress((at) => {
    const el = document.elementFromPoint(at.x, at.y)
    if (el) cellAt(el, at.x, at.y)
  })

  const v = useVirtualizer({ count: table.numRows, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 })
  useEffect(() => v.measure(), [ROW_H]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto mono"
      style={{ fontSize: (compact ? 12 : 12.5) * zoom }}
      onContextMenu={(e) => cellAt(e.target, e.clientX, e.clientY) && e.preventDefault()}
      {...(onCellMenu ? longPress : {})}
    >
      <div style={{ width: total, minWidth: '100%' }}>
        <div className="sticky top-0 z-10 flex" style={{ background: 'var(--grid-head)', borderBottom: '1px solid var(--line)' }}>
          <div className="sticky left-0 shrink-0" style={{ width: numW, background: 'var(--grid-head)' }} />
          {cols.map((c, i) => (
            <div key={i} className="shrink-0 px-2 py-1 truncate" style={{ width: Math.round(c.width * zoom), borderLeft: '1px solid var(--line)', textAlign: c.num ? 'right' : 'left' }} title={`${c.field.name} · ${typeLabel(c.field)}`}>
              <div className="font-semibold truncate" style={{ fontFamily: 'var(--q-font-sans)' }}>{c.field.name}</div>
              <div className="truncate" style={{ color: 'var(--muted)', fontSize: 10.5 * zoom }}>{typeLabel(c.field)}</div>
            </div>
          ))}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((row) => (
            <div key={row.index} className="flex absolute left-0" style={{ top: row.start, height: ROW_H, width: '100%', background: row.index % 2 ? 'var(--grid-alt)' : 'var(--grid-bg)' }}>
              <div className="sticky left-0 shrink-0 px-2 text-right" style={{ width: numW, lineHeight: `${ROW_H}px`, color: 'var(--muted)', background: 'inherit', borderRight: '1px solid var(--line)' }}>
                {row.index + 1}
              </div>
              {cols.map((c, i) => {
                const val = c.fmt(c.vec?.get(row.index))
                return (
                  <div key={i} data-cell={`${row.index}:${i}`} className="shrink-0 px-2 truncate" style={{ width: Math.round(c.width * zoom), lineHeight: `${ROW_H}px`, textAlign: c.num ? 'right' : 'left', borderLeft: '1px solid var(--line)' }} title={val == null ? 'NULL' : String(val)}>
                    {val == null ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>NULL</span> : String(val)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
