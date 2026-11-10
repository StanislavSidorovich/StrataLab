// Horizontal bars for the chains tile of the build page (and its compact copy on the Answer step): one bar per row, the
// first column is the label, the second the number. Plain HTML bars, so they follow the page zoom and both themes.
import type { ResultData } from '../../core/check'
import { money } from './BuildTable'
import './barchart.css'

export function BarChart({ data, label, compact = false }: { data: ResultData; label: string; compact?: boolean }) {
  const rows = data.rows.map((r) => ({ name: String(r[0]), value: Number(r[1]) }))
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className={`bc${compact ? ' is-compact' : ''}`} role="img" aria-label={`${label}: ${rows.map((r) => `${r.name} ${money(r.value)}`).join(', ')}`} data-testid="bar-chart">
      {rows.map((r) => (
        <div className="bc-row" key={r.name} aria-hidden="true">
          <span className="bc-name">{r.name}</span>
          <span className="bc-track">
            <span className="bc-bar" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
          </span>
          <span className="bc-value">{money(r.value)}</span>
        </div>
      ))}
    </div>
  )
}
