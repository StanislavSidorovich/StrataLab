// Horizontal bars for the chains tile of the build page (and its compact copy on the Answer step): one bar per row, the
// first column is the label, the second the number. Plain HTML bars, so they follow the page zoom and both themes.
// With `onPick` each bar is a button (the chains tile: a click sets the Chain slicer); the selected bar is lit, the others fade.
import type { ResultData } from '../../core/check'
import { money } from './BuildTable'
import './barchart.css'
import './barpick.css'

interface Props {
  data: ResultData
  label: string
  compact?: boolean
  selected?: string | null
  onPick?: (name: string) => void
}

export function BarChart({ data, label, compact = false, selected = null, onPick }: Props) {
  const rows = data.rows.map((r) => ({ name: String(r[0]), value: Number(r[1]) }))
  const max = Math.max(1, ...rows.map((r) => r.value))
  const bar = (r: { value: number }) => (
    <span className="bc-track">
      <span className="bc-bar" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
    </span>
  )
  if (rows.length === 0) return <div className="bc build-muted" data-testid="bar-chart-empty">No sales under these slicers.</div>
  if (onPick) {
    return (
      <div className={`bc${compact ? ' is-compact' : ''}${selected ? ' has-selected' : ''}`} role="group" aria-label={label} data-testid="bar-chart">
        {rows.map((r) => (
          <button className={`bc-row bc-btn${selected === r.name ? ' is-selected' : ''}`} key={r.name} aria-pressed={selected === r.name} title={selected === r.name ? 'Clear the Chain slicer' : `Slice by ${r.name}`} onClick={() => onPick(r.name)} data-testid={`bar-${r.name}`}>
            <span className="bc-name">{r.name}</span>
            {bar(r)}
            <span className="bc-value">{money(r.value)}</span>
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className={`bc${compact ? ' is-compact' : ''}`} role="img" aria-label={`${label}: ${rows.map((r) => `${r.name} ${money(r.value)}`).join(', ')}`} data-testid="bar-chart">
      {rows.map((r) => (
        <div className="bc-row" key={r.name} aria-hidden="true">
          <span className="bc-name">{r.name}</span>
          {bar(r)}
          <span className="bc-value">{money(r.value)}</span>
        </div>
      ))}
    </div>
  )
}
