// Results the learner pinned from the step More: tiles under the three on the Dashboard ("Your tiles", removable) and in
// the read-only copy on the Answer step. A pin keeps the SQL only; the result is read again when the page opens, and again
// when a slicer changes (the SQL then runs on the slice, see src/core/buildSlice.ts). The title of a tile is its question.
import { useEffect, useState } from 'react'
import type { Table } from 'apache-arrow'
import { X } from 'lucide-react'
import { pinKind, type Pin } from '../../core/buildMore'
import { notSliced, sliceOn, slicerAdds, type SliceFilter } from '../../core/buildSlice'
import { moreQuestion } from '../../data/build/kaiyoSales'
import { slicedSql, withSlice } from '../../db/buildSlice'
import { query } from '../../db/engine'
import { resultRows } from '../../db/export'
import { enginePort } from '../../db/pipelinePort'
import { ChartView, isDateColumn } from '../Chart'
import { BarChart } from './BarChart'
import './more.css'
import './slicer.css'

type Loaded = { table: Table } | { error: string }

/** Reads every pin's result again (once the data is ready, when the list of pins changes, and when a slicer changes). */
export function usePinResults(pins: readonly Pin[], ready: boolean, slice?: SliceFilter): Record<string, Loaded> {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const on = !!slice && sliceOn(slice)
  const key = pins.map((p) => `${p.q}:${p.sql}`).join('\n') + (on ? `|${slice.chain}|${slice.brand}` : '')
  useEffect(() => {
    if (!ready) return
    let alive = true
    void (async () => {
      const next: Record<string, Loaded> = {}
      for (const p of pins) {
        try {
          next[p.q] = { table: on ? await withSlice(enginePort, slice, () => query(slicedSql(p.sql))) : await query(p.sql) }
        } catch (e) {
          next[p.q] = { error: String(e instanceof Error ? e.message : e).split('\n')[0] }
        }
      }
      if (alive) setLoaded(next)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])
  return loaded
}

export function PinTile({ pin, loaded, compact = false, onRemove, slice }: { pin: Pin; loaded?: Loaded; compact?: boolean; onRemove?: () => void; slice?: SliceFilter }) {
  const q = moreQuestion(pin.q)
  const table = loaded && 'table' in loaded ? loaded.table : null
  const line = table ? pinKind(isDateColumn(table, 0)) === 'line' : false
  const on = !!slice && sliceOn(slice)
  return (
    <section className={compact ? 'ba-dash-tile' : 'bd-tile'} data-testid={`pin-${pin.q}`}>
      <div className="bd-tile-head">
        <div className="bd-tile-title">
          {q.question}
          <span className="pin-q"> · {pin.q}</span>
        </div>
        {on && notSliced(pin.sql) && (
          <span className="sl-badge" title="This SQL names no table of the star, so the slicers do not reach it" data-testid={`pin-notsliced-${pin.q}`}>
            not sliced
          </span>
        )}
        {onRemove && (
          <button className="btn btn-ghost" onClick={onRemove} aria-label={`Remove the tile ${pin.q}`} title="Remove from the dashboard" data-testid={`pin-remove-${pin.q}`}>
            <X size={14} />
          </button>
        )}
      </div>
      {!loaded ? (
        <div className="build-muted">Loading…</div>
      ) : 'error' in loaded ? (
        <div className="build-error">{loaded.error}</div>
      ) : line ? (
        <div className="bd-chart" data-testid={`pin-line-${pin.q}`}>
          <ChartView table={loaded.table} tabId={`build-pin-${pin.q}${compact ? '-copy' : ''}`} fileName={`kaiyo-${pin.q}`} />
        </div>
      ) : (
        <BarChart data={resultRows(loaded.table)} label={q.question} compact={compact} />
      )}
      {on && !notSliced(pin.sql) && (
        <details className="sl-sql" data-testid={`pin-slicer-sql-${pin.q}`}>
          <summary>SQL it runs with the slicers</summary>
          <pre>{slicerAdds(pin.sql, slice)}</pre>
        </details>
      )}
    </section>
  )
}

/** "Your tiles": the pins as a grid; nothing when there are none. */
export function PinnedGrid({ pins, ready, onRemove, slice }: { pins: readonly Pin[]; ready: boolean; onRemove: (q: Pin['q']) => void; slice?: SliceFilter }) {
  const loaded = usePinResults(pins, ready, slice)
  if (pins.length === 0) return null
  return (
    <div data-testid="pinned-tiles" className="space-y-2">
      <div className="ba-dash-title">Your tiles</div>
      <div className="bd-grid">
        {pins.map((p) => (
          <PinTile key={p.q} pin={p} loaded={loaded[p.q]} onRemove={() => onRemove(p.q)} slice={slice} />
        ))}
      </div>
    </div>
  )
}
