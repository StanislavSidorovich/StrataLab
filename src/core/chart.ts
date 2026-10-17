// Charts of a query result: which chart and axes fit its columns, the points to
// draw, and the ticks and labels of the axes. Pure: the UI hands in column kinds
// and values, and draws what comes back as SVG.

export type ColumnKind = 'number' | 'date' | 'text'
export type ChartType = 'bar' | 'line' | 'scatter'

export interface ChartColumn {
  name: string
  kind: ColumnKind
  /** Every value is larger than the one before (a year, a step, a sequence). */
  ascending?: boolean
}

/** `x` is a column index, or -1 for the row number. `ys` are number columns. */
export interface ChartSpec {
  type: ChartType
  x: number
  ys: number[]
}

/** The categorical palette has four slots; a scatter's points of different series stay apart with three. */
export const MAX_SERIES: Record<ChartType, number> = { bar: 4, line: 4, scatter: 3 }
/** Bars past this many are left out (the chart says so): a bar per row stops being readable. */
export const MAX_BARS = 100
export const MAX_POINTS = 10_000

const ID = /(^|_|\b)id$/i

/** Number columns worth plotting on Y: an id is only a label, unless nothing else is left. */
function measures(cols: ChartColumn[], except: number): number[] {
  const nums = cols.flatMap((c, i) => (c.kind === 'number' && i !== except ? [i] : []))
  const real = nums.filter((i) => !ID.test(cols[i].name))
  return real.length ? real : nums
}

/**
 * The chart a result's columns suggest, or null when there is nothing to plot (no number column):
 * a date and numbers → a line over time; text and numbers → bars per label; an ascending number
 * and numbers → a line; two numbers → a scatter; one number → bars per row.
 */
export function pickChart(cols: ChartColumn[]): ChartSpec | null {
  if (!cols.some((c) => c.kind === 'number')) return null
  const date = cols.findIndex((c) => c.kind === 'date')
  if (date >= 0) return { type: 'line', x: date, ys: measures(cols, date).slice(0, MAX_SERIES.line) }
  const text = cols.findIndex((c) => c.kind === 'text')
  if (text >= 0) return { type: 'bar', x: text, ys: measures(cols, text).slice(0, MAX_SERIES.bar) }
  const nums = cols.flatMap((c, i) => (c.kind === 'number' ? [i] : []))
  if (nums.length >= 2) {
    const x = nums[0]
    if (cols[x].ascending) return { type: 'line', x, ys: measures(cols, x).slice(0, MAX_SERIES.line) }
    return { type: 'scatter', x, ys: [measures(cols, x)[0]] }
  }
  return { type: 'bar', x: -1, ys: nums }
}

/** The same chart as another type: the X stays, extra series beyond the type's limit drop off. */
export function withType(spec: ChartSpec, type: ChartType): ChartSpec {
  return { type, x: spec.x, ys: spec.ys.slice(0, MAX_SERIES[type]) }
}

/** Adds a series, or takes it off (the last one stays); a new one past the limit replaces the last. */
export function toggleSeries(spec: ChartSpec, col: number): ChartSpec {
  if (spec.ys.includes(col)) return spec.ys.length > 1 ? { ...spec, ys: spec.ys.filter((y) => y !== col) } : spec
  const ys = [...spec.ys, col]
  return { ...spec, ys: ys.length > MAX_SERIES[spec.type] ? [...spec.ys.slice(0, -1), col] : ys }
}

export function isAscending(values: ArrayLike<number | null>): boolean {
  if (values.length < 2) return false
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1]
    const b = values[i]
    if (a == null || b == null || !(b > a)) return false
  }
  return true
}

/** How the X axis places values: a slot per label (bars, text), or by value along the line. */
export function xScaleKind(spec: ChartSpec, xKind: ColumnKind): 'band' | 'linear' | 'time' {
  if (spec.type === 'bar' || xKind === 'text') return 'band'
  return xKind === 'date' ? 'time' : 'linear'
}

export interface ChartData {
  scale: 'band' | 'linear' | 'time'
  /** Band: the labels in order. */
  labels: string[]
  /** Linear / time: the X of each row kept; band: its label's slot. */
  xs: number[]
  /** One array per series, a value (or null) per X. */
  ys: (number | null)[][]
  /** Rows left out: past the bar or point limit (`cut`), or with no X (`blank`). */
  cut: number
  blank: number
}

/**
 * The points of a chart. `x` gives each row's X (a number, a date in ms, or a label), `y` a
 * series' values. A line is drawn in X order; bars keep the result's order (ORDER BY decides).
 */
export function chartData(
  spec: ChartSpec,
  xKind: ColumnKind,
  rows: number,
  x: (row: number) => number | string | null,
  y: (series: number, row: number) => number | null,
): ChartData {
  const scale = xScaleKind(spec, xKind)
  const limit = scale === 'band' ? MAX_BARS : MAX_POINTS
  const keep: number[] = []
  let blank = 0
  let cut = 0
  for (let r = 0; r < rows; r++) {
    if (x(r) == null) blank++
    else if (keep.length < limit) keep.push(r)
    else cut++
  }
  if (scale !== 'band' && spec.type === 'line') keep.sort((a, b) => (x(a) as number) - (x(b) as number))
  const labels = scale === 'band' ? keep.map((r) => String(x(r))) : []
  const xs = scale === 'band' ? keep.map((_, i) => i) : keep.map((r) => x(r) as number)
  const ys = spec.ys.map((_, s) => keep.map((r) => y(s, r)))
  return { scale, labels, xs, ys, cut, blank }
}

/** Round numbers a little past the data, about `count` of them, for an axis. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    const pad = Math.abs(min) || 1
    return niceTicks(min - pad, max + pad, count)
  }
  const raw = (max - min) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v < max + step * 0.999; v += step) ticks.push(Math.round(v / step) * step)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  // -0 reads oddly in a label
  return ticks.map((t) => (Object.is(t, -0) ? 0 : +t.toPrecision(12)))
}

/** 950, 1.2K, 3.4M, 0.25: short labels for ticks. */
export function compactNumber(v: number): string {
  const a = Math.abs(v)
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [n, u] of units) if (a >= n) return `${+(v / n).toFixed(a / n >= 100 ? 0 : 1)}${u}`
  return String(+v.toPrecision(3))
}

const DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

/** Dates on an axis: whole years, months, days or hours, whichever gives about `count` ticks (UTC, like the grid). */
export function timeTicks(min: number, max: number, count = 5): { ticks: number[]; label: (ms: number) => string } {
  const span = Math.max(max - min, 1)
  const iso = (ms: number) => new Date(ms).toISOString()
  const months = [1, 2, 3, 6, 12, 24, 60, 120, 240, 600]
  if (span > 60 * DAY) {
    const per = months.find((m) => (span / (30.4 * DAY)) / m <= count) ?? 1200
    const d = new Date(min)
    let y = d.getUTCFullYear()
    let m = Math.floor(d.getUTCMonth() / per) * per
    if (per >= 12) (y = Math.floor(y / (per / 12)) * (per / 12)), (m = 0)
    const ticks: number[] = []
    for (;;) {
      const t = Date.UTC(y, m)
      if (t >= min && t <= max) ticks.push(t)
      if (t > max) break
      m += per
    }
    return { ticks, label: per >= 12 ? (ms) => iso(ms).slice(0, 4) : (ms) => iso(ms).slice(0, 7) }
  }
  const steps = [3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, DAY, 2 * DAY, 7 * DAY, 14 * DAY]
  const step = steps.find((s) => span / s <= count) ?? 30 * DAY
  const ticks: number[] = []
  // weeks start on a Monday (1970-01-05 was one)
  const origin = step >= 7 * DAY ? 4 * DAY : 0
  for (let t = Math.ceil((min - origin) / step) * step + origin; t <= max; t += step) ticks.push(t)
  const label = step < DAY ? (ms: number) => (ms % DAY === 0 ? iso(ms).slice(5, 10) : `${pad(new Date(ms).getUTCHours())}:00`) : (ms: number) => iso(ms).slice(0, 10)
  return { ticks, label }
}

/** The smallest and largest of the series' values, with 0 in for bars (they grow from 0). */
export function valueRange(ys: (number | null)[][], withZero: boolean): [number, number] {
  let lo = withZero ? 0 : Infinity
  let hi = withZero ? 0 : -Infinity
  for (const s of ys) for (const v of s) if (v != null && Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v))
  return lo > hi ? [0, 1] : [lo, hi]
}

/** Every k-th band label, so the labels of a crowded axis don't overlap. */
export function labelEvery(bandWidth: number, labelWidth: number): number {
  return Math.max(1, Math.ceil(labelWidth / Math.max(bandWidth, 1)))
}

/** A label cut to `max` characters, with an ellipsis. */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}
