// The Chart view of a result: bars, a line or a scatter of its columns, drawn as SVG
// in the theme's colors, with a tooltip on hover and a PNG download.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChartColumn as BarIcon, ChartLine, ChartScatter, ChevronDown, ImageDown } from 'lucide-react'
import { DataType, type Field, type Table } from 'apache-arrow'
import {
  MAX_BARS,
  MAX_SERIES,
  chartData,
  clip,
  compactNumber,
  isAscending,
  labelEvery,
  niceTicks,
  pickChart,
  timeTicks,
  toggleSeries,
  valueRange,
  withType,
  xScaleKind,
  type ChartColumn,
  type ChartData,
  type ChartSpec,
  type ChartType,
  type ColumnKind,
} from '../core/chart'
import { download } from '../db/export'
import { formatterFor } from '../db/format'

const TYPES: [ChartType, string, typeof BarIcon][] = [
  ['bar', 'Bar', BarIcon],
  ['line', 'Line', ChartLine],
  ['scatter', 'Scatter', ChartScatter],
]

function kindOf(field: Field): ColumnKind {
  const t = field.type
  if (DataType.isInt(t) || DataType.isFloat(t) || DataType.isDecimal(t)) return 'number'
  if (DataType.isDate(t) || DataType.isTimestamp(t)) return 'date'
  return 'text'
}

/** A column's values for the chart: numbers (dates as ms), and the grid's text for labels. */
function columnValues(table: Table, i: number, kind: ColumnKind) {
  const col = table.getChildAt(i)
  const fmt = formatterFor(table.schema.fields[i])
  const text = (r: number) => {
    const v = fmt(col?.get(r))
    return v == null ? null : String(v)
  }
  const num = (r: number) => {
    const raw = col?.get(r)
    if (raw == null) return null
    const v = kind === 'date' ? Number(raw) : Number(fmt(raw))
    return Number.isFinite(v) ? v : null
  }
  return { text, num }
}

// The chart chosen for a tab stays while its result keeps the same columns.
const chosen = new Map<string, ChartSpec>()

export function ChartView({ table, tabId, fileName }: { table: Table; tabId: string; fileName: string }) {
  const fields = table.schema.fields
  const cols: ChartColumn[] = useMemo(
    () =>
      fields.map((f, i) => {
        const kind = kindOf(f)
        if (kind !== 'number') return { name: f.name, kind }
        const { num } = columnValues(table, i, kind)
        const values = Array.from({ length: Math.min(table.numRows, 10_000) }, (_, r) => num(r))
        return { name: f.name, kind, ascending: isAscending(values) }
      }),
    [table, fields],
  )
  const key = `${tabId}|${cols.map((c) => `${c.name}:${c.kind}`).join(',')}`
  const [picked, setPicked] = useState<{ key: string; spec: ChartSpec | null } | null>(null)
  const spec = picked?.key === key ? picked.spec : (chosen.get(key) ?? pickChart(cols))
  const setSpec = (s: ChartSpec) => (chosen.set(key, s), setPicked({ key, spec: s }))
  const svgRef = useRef<SVGSVGElement>(null)

  if (!spec) return <div className="h-full flex items-center justify-center p-6 text-center" style={{ color: 'var(--muted)' }}>No number column to chart: select one in the query (a COUNT, a SUM, a price…).</div>

  const xKind: ColumnKind = spec.x < 0 ? 'number' : cols[spec.x].kind
  const scale = xScaleKind(spec, xKind)
  const xv = spec.x < 0 ? null : columnValues(table, spec.x, xKind)
  const yv = spec.ys.map((y) => columnValues(table, y, 'number'))
  const data = chartData(
    spec,
    xKind,
    table.numRows,
    (r) => (xv == null ? (scale === 'band' ? String(r + 1) : r + 1) : scale === 'band' ? xv.text(r) : xv.num(r)),
    (s, r) => yv[s].num(r),
  )
  const xName = spec.x < 0 ? 'Row' : cols[spec.x].name
  const yNames = spec.ys.map((y) => cols[y].name)
  const numberCols = cols.flatMap((c, i) => (c.kind === 'number' ? [i] : []))
  const notes = [data.cut && (scale === 'band' ? `First ${MAX_BARS} bars of ${(data.cut + data.labels.length).toLocaleString()} rows.` : `First ${data.xs.length.toLocaleString()} points of ${(data.cut + data.xs.length).toLocaleString()} rows.`), data.blank && `${data.blank.toLocaleString()} row${data.blank === 1 ? '' : 's'} with an empty ${xName} left out.`].filter(Boolean)

  return (
    <div className="h-full flex flex-col">
      <div className="chart-bar flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="flex rounded-md" role="radiogroup" aria-label="Chart type" style={{ border: '1px solid var(--line)' }}>
          {TYPES.map(([type, label, Icon]) => (
            <button
              key={type}
              role="radio"
              aria-checked={spec.type === type}
              aria-label={label}
              title={`${label} chart`}
              className="px-2 py-1 flex items-center gap-1.5"
              style={spec.type === type ? { background: 'var(--panel-2)', fontWeight: 600 } : { color: 'var(--muted)' }}
              onClick={() => setSpec(withType(spec, type))}
            >
              <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 min-w-0">
          <span style={{ color: 'var(--muted)' }}>X</span>
          <select className="field min-w-0 max-w-[6.5rem] sm:max-w-[14rem]" style={{ paddingTop: 3, paddingBottom: 3 }} value={spec.x} onChange={(e) => setSpec({ ...spec, x: Number(e.target.value) })} aria-label="X axis">
            <option value={-1}>Row number</option>
            {cols.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
        </label>
        <SeriesPicker spec={spec} cols={cols} numberCols={numberCols} onChange={setSpec} />
        <div className="flex-1" />
        <button className="btn btn-ghost" onClick={() => svgRef.current && void savePng(svgRef.current, fileName)} title="Download the chart as a PNG image" aria-label="Save as PNG">
          <ImageDown size={14} /> <span className="hidden sm:inline">PNG</span>
        </button>
      </div>
      {notes.length > 0 && (
        <div className="px-3 pt-1.5 shrink-0" style={{ color: 'var(--muted)', fontSize: 12 }}>
          {notes.join(' ')}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Plot ref={svgRef} spec={spec} data={data} xKind={xKind} xName={xName} yNames={yNames} />
      </div>
    </div>
  )
}

/** Y: the number columns, ticked for each series drawn. */
function SeriesPicker({ spec, cols, numberCols, onChange }: { spec: ChartSpec; cols: ChartColumn[]; numberCols: number[]; onChange: (s: ChartSpec) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false)
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
  const names = spec.ys.map((y) => cols[y].name).join(', ')
  return (
    <div className="relative flex items-center gap-1 min-w-0" ref={ref}>
      <span style={{ color: 'var(--muted)' }}>Y</span>
      <button className="field flex items-center gap-1 min-w-0 max-w-[6.5rem] sm:max-w-[16rem]" style={{ paddingTop: 3, paddingBottom: 3 }} onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} aria-label="Y axis" title={names}>
        <span className="truncate">{names}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 rounded-lg py-1 shadow-lg min-w-48 max-h-72 overflow-auto" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <div className="px-3 py-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
            Up to {MAX_SERIES[spec.type]} series
          </div>
          {numberCols.map((i) => {
            const on = spec.ys.includes(i)
            return (
              <label key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--panel-2)] cursor-pointer">
                <input type="checkbox" checked={on} onChange={() => onChange(toggleSeries(spec, i))} />
                {on && <span className="inline-block rounded-sm" style={{ width: 10, height: 10, background: `var(--series-${spec.ys.indexOf(i) + 1})` }} />}
                <span className="truncate">{cols[i].name}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

const FONT = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif"
const fmtValue = (v: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 4 }))

/** The rounded data end of a bar from `base` to `top` (either way up): square at the baseline. */
function barPath(x: number, w: number, base: number, top: number): string {
  const h = Math.abs(base - top)
  const r = Math.min(4, w / 2, h)
  if (top <= base) return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top - r}V${base}Z`
}

interface PlotProps {
  spec: ChartSpec
  data: ChartData
  xKind: ColumnKind
  xName: string
  yNames: string[]
  ref: React.Ref<SVGSVGElement>
}

function Plot({ spec, data, xKind, xName, yNames, ref }: PlotProps) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<{ i: number; s?: number; px: number; py: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  useEffect(() => setHover(null), [spec, data])

  const { w: W, h: H } = size
  const n = data.xs.length
  const phone = W < 480
  const [lo, hi] = valueRange(data.ys, spec.type === 'bar')
  const yTicks = niceTicks(lo, hi, H < 260 ? 3 : 5)
  const yLabels = yTicks.map(compactNumber)
  const legend = yNames.length > 1
  const top = 34
  const left = Math.max(...yLabels.map((l) => l.length)) * 7 + 14
  const right = 16
  const bottom = 40
  const pw = Math.max(10, W - left - right)
  const ph = Math.max(10, H - top - bottom)
  const y0 = yTicks[0]
  const y1 = yTicks[yTicks.length - 1]
  const sy = (v: number) => top + ph - ((v - y0) / (y1 - y0 || 1)) * ph

  // X: a slot per label, or a value scale
  const band = data.scale === 'band'
  const bw = band ? pw / Math.max(n, 1) : 0
  let xTicks: number[] = []
  let xLabel: (v: number) => string = (v) => String(v)
  let sx: (v: number) => number
  if (band) {
    sx = (i) => left + (i + 0.5) * bw
  } else if (data.scale === 'time') {
    const min = Math.min(...data.xs)
    const max = Math.max(...data.xs)
    const t = timeTicks(min, max, Math.max(2, Math.floor(pw / 90)))
    xTicks = t.ticks
    xLabel = t.label
    sx = (v) => left + ((v - min) / (max - min || 1)) * pw
  } else {
    let min = Infinity
    let max = -Infinity
    for (const v of data.xs) (min = Math.min(min, v)), (max = Math.max(max, v))
    xTicks = niceTicks(min, max, Math.max(2, Math.floor(pw / 80)))
    xLabel = compactNumber
    const a = xTicks[0]
    const b = xTicks[xTicks.length - 1]
    sx = (v) => left + ((v - a) / (b - a || 1)) * pw
  }
  const every = band ? labelEvery(bw, phone ? 60 : 80) : 1
  const maxChars = band ? Math.max(3, Math.floor((bw * every) / 6.5)) : 0

  const k = data.ys.length
  const barW = band ? Math.min(24, Math.max(1, (bw * 0.8 - 2 * (k - 1)) / k)) : 0
  const groupW = barW * k + 2 * (k - 1)
  const showDots = spec.type === 'line' && n <= 60 && pw / n >= 14

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    if (px < left || px > left + pw || py < top - 8 || py > top + ph + 8 || !n) return setHover(null)
    if (band && spec.type !== 'scatter') return setHover({ i: Math.min(n - 1, Math.floor((px - left) / bw)), px, py })
    if (spec.type === 'line') {
      // nearest X: xs are sorted for a line
      let a = 0
      let b = n - 1
      while (b - a > 1) {
        const m = (a + b) >> 1
        if (sx(data.xs[m]) < px) a = m
        else b = m
      }
      return setHover({ i: Math.abs(sx(data.xs[a]) - px) <= Math.abs(sx(data.xs[b]) - px) ? a : b, px, py })
    }
    let best = { d: 24 * 24, i: -1, s: 0 }
    for (let s = 0; s < k; s++)
      for (let i = 0; i < n; i++) {
        const v = data.ys[s][i]
        if (v == null) continue
        const d = (sx(data.xs[i]) - px) ** 2 + (sy(v) - py) ** 2
        if (d < best.d) best = { d, i, s }
      }
    setHover(best.i < 0 ? null : { i: best.i, s: best.s, px, py })
  }

  const xText = (i: number) => (band ? data.labels[i] : data.scale === 'time' ? timeText(data.xs[i], xKind) : fmtValue(data.xs[i]))
  const title = `${yNames.join(', ')} by ${xName}`

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      {W > 0 && H > 0 && (
        <svg
          ref={ref}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${spec.type} chart of ${title}`}
          style={{ fontFamily: FONT, fontSize: 11, display: 'block', touchAction: 'pan-y' }}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <rect width={W} height={H} style={{ fill: 'var(--panel)' }} />
          {legend ? (
            <g>
              {(() => {
                let x = left
                return yNames.map((name, s) => {
                  const label = clip(name, phone ? 12 : 24)
                  const g = (
                    <g key={s} transform={`translate(${x},14)`}>
                      <rect y={-8} width={10} height={10} rx={2} style={{ fill: `var(--series-${s + 1})` }} />
                      <text x={14} style={{ fill: 'var(--text)', fontSize: 12 }}>{label}</text>
                    </g>
                  )
                  x += 14 + label.length * 7 + 14
                  return g
                })
              })()}
            </g>
          ) : (
            <text x={left} y={16} style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{clip(title, Math.floor((W - left) / 7))}</text>
          )}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={left} x2={left + pw} y1={sy(t)} y2={sy(t)} style={{ stroke: t === 0 ? 'var(--muted)' : 'var(--line)', strokeOpacity: t === 0 ? 0.5 : 1 }} />
              <text x={left - 6} y={sy(t)} dy="0.32em" textAnchor="end" style={{ fill: 'var(--muted)' }}>{yLabels[i]}</text>
            </g>
          ))}
          {band
            ? data.labels.map((l, i) =>
                i % every === 0 ? (
                  <text key={i} x={sx(i)} y={top + ph + 16} textAnchor="middle" style={{ fill: 'var(--muted)' }}>
                    <title>{l}</title>
                    {clip(l, maxChars)}
                  </text>
                ) : null,
              )
            : xTicks.map((t, i) => (
                <text key={i} x={sx(t)} y={top + ph + 16} textAnchor="middle" style={{ fill: 'var(--muted)' }}>{xLabel(t)}</text>
              ))}
          <text x={left + pw / 2} y={H - 6} textAnchor="middle" style={{ fill: 'var(--muted)' }}>{clip(xName, Math.floor(pw / 7))}</text>

          {spec.type === 'bar' &&
            data.ys.map((s, si) =>
              s.map((v, i) =>
                v == null ? null : <path key={`${si}-${i}`} d={barPath(sx(i) - groupW / 2 + si * (barW + 2), barW, sy(0), sy(v))} style={{ fill: `var(--series-${si + 1})` }} />,
              ),
            )}
          {spec.type === 'line' &&
            data.ys.map((s, si) => {
              let d = ''
              let pen = false
              s.forEach((v, i) => {
                if (v == null) return void (pen = false)
                d += `${pen ? 'L' : 'M'}${sx(data.xs[i]).toFixed(1)},${sy(v).toFixed(1)}`
                pen = true
              })
              return <path key={si} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: `var(--series-${si + 1})` }} />
            })}
          {(spec.type === 'scatter' || showDots) &&
            data.ys.map((s, si) =>
              s.map((v, i) =>
                v == null ? null : <circle key={`${si}-${i}`} cx={sx(data.xs[i])} cy={sy(v)} r={4} strokeWidth={spec.type === 'scatter' && n > 500 ? 0 : 2} style={{ fill: `var(--series-${si + 1})`, stroke: 'var(--panel)', fillOpacity: spec.type === 'scatter' ? 0.85 : 1 }} />,
              ),
            )}

          {hover && (
            <g className="chart-hover" pointerEvents="none">
              {band && spec.type === 'bar' ? (
                <rect x={left + hover.i * bw} y={top} width={bw} height={ph} style={{ fill: 'var(--text)', fillOpacity: 0.05 }} />
              ) : spec.type === 'line' ? (
                <>
                  <line x1={sx(data.xs[hover.i])} x2={sx(data.xs[hover.i])} y1={top} y2={top + ph} style={{ stroke: 'var(--muted)', strokeOpacity: 0.6 }} />
                  {data.ys.map((s, si) => (s[hover.i] == null ? null : <circle key={si} cx={sx(data.xs[hover.i])} cy={sy(s[hover.i]!)} r={5} strokeWidth={2} style={{ fill: `var(--series-${si + 1})`, stroke: 'var(--panel)' }} />))}
                </>
              ) : (
                <circle cx={sx(data.xs[hover.i])} cy={sy(data.ys[hover.s ?? 0][hover.i]!)} r={6} strokeWidth={2} style={{ fill: `var(--series-${(hover.s ?? 0) + 1})`, stroke: 'var(--text)' }} />
              )}
            </g>
          )}
        </svg>
      )}
      {hover && (
        <div
          className="absolute pointer-events-none rounded-md px-2.5 py-1.5 shadow-lg"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            fontSize: 12,
            maxWidth: 260,
            top: Math.min(Math.max(4, hover.py + 14), H - 90),
            ...(hover.px > W / 2 ? { right: W - hover.px + 12 } : { left: hover.px + 12 }),
          }}
        >
          <div className="font-semibold truncate">
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{xName}: </span>
            {xText(hover.i)}
          </div>
          {data.ys.map((s, si) =>
            spec.type === 'scatter' && hover.s !== si ? null : (
              <div key={si} className="flex items-center gap-1.5">
                <span className="inline-block rounded-sm shrink-0" style={{ width: 8, height: 8, background: `var(--series-${si + 1})` }} />
                <span className="truncate" style={{ color: 'var(--muted)' }}>{yNames[si]}</span>
                <span className="ml-auto pl-2 tabular-nums">{fmtValue(s[hover.i])}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function timeText(ms: number, kind: ColumnKind): string {
  const iso = new Date(ms).toISOString()
  return kind === 'date' && ms % 86_400_000 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ')
}

/** The chart as a PNG at twice its size: the theme's colors written in, the hover marks left out. */
async function savePng(svg: SVGSVGElement, fileName: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.querySelectorAll('.chart-hover').forEach((el) => el.remove())
  const css = getComputedStyle(svg)
  for (const el of [clone, ...clone.querySelectorAll<SVGElement>('[style]')]) {
    const style = el.getAttribute('style')
    if (style) el.setAttribute('style', style.replace(/var\((--[\w-]+)\)/g, (_, v: string) => css.getPropertyValue(v).trim() || '#000'))
  }
  const w = Number(svg.getAttribute('width'))
  const h = Number(svg.getAttribute('height'))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
    if (blob) download(blob, `${fileName}.png`, 'image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
