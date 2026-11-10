// Results the learner pinned from the step More: tiles under the three on the Dashboard ("Your tiles", removable) and in
// the read-only copy on the Answer step. A pin keeps the SQL only; the result is read again when the page opens.
import { useEffect, useState } from 'react'
import type { Table } from 'apache-arrow'
import { X } from 'lucide-react'
import { pinKind, type Pin } from '../../core/buildMore'
import { moreQuestion } from '../../data/build/kaiyoSales'
import { query } from '../../db/engine'
import { resultRows } from '../../db/export'
import { ChartView, isDateColumn } from '../Chart'
import { BarChart } from './BarChart'
import './more.css'

type Loaded = { table: Table } | { error: string }

/** Reads every pin's result again (once the data is ready, and when the list of pins changes). */
export function usePinResults(pins: readonly Pin[], ready: boolean): Record<string, Loaded> {
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({})
  const key = pins.map((p) => `${p.q}:${p.sql}`).join('\n')
  useEffect(() => {
    if (!ready) return
    let alive = true
    void (async () => {
      const next: Record<string, Loaded> = {}
      for (const p of pins) {
        try {
          next[p.q] = { table: await query(p.sql) }
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

export function PinTile({ pin, loaded, compact = false, onRemove }: { pin: Pin; loaded?: Loaded; compact?: boolean; onRemove?: () => void }) {
  const q = moreQuestion(pin.q)
  const table = loaded && 'table' in loaded ? loaded.table : null
  const line = table ? pinKind(isDateColumn(table, 0)) === 'line' : false
  return (
    <section className={compact ? 'ba-dash-tile' : 'bd-tile'} data-testid={`pin-${pin.q}`}>
      <div className="bd-tile-head">
        <div className="bd-tile-title">
          {q.title}
          <span className="pin-q"> · {pin.q}</span>
        </div>
        {onRemove && (
          <button className="btn btn-ghost" onClick={onRemove} aria-label={`Remove the tile ${q.title}`} title="Remove from the dashboard" data-testid={`pin-remove-${pin.q}`}>
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
        <BarChart data={resultRows(loaded.table)} label={q.title} compact={compact} />
      )}
    </section>
  )
}

/** "Your tiles": the pins as a grid; nothing when there are none. */
export function PinnedGrid({ pins, ready, onRemove }: { pins: readonly Pin[]; ready: boolean; onRemove: (q: Pin['q']) => void }) {
  const loaded = usePinResults(pins, ready)
  if (pins.length === 0) return null
  return (
    <div data-testid="pinned-tiles" className="space-y-2">
      <div className="ba-dash-title">Your tiles</div>
      <div className="bd-grid">
        {pins.map((p) => (
          <PinTile key={p.q} pin={p} loaded={loaded[p.q]} onRemove={() => onRemove(p.q)} />
        ))}
      </div>
    </div>
  )
}
