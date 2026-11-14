// The bridge to Power BI Desktop (v0.40.0): the star the learner built, as CSV files plus a page of steps, in one .zip.
// Pure: the tables are read by src/db/powerBiRun.ts, the download is in src/ui/build/PowerBiBridge.tsx.
// Why CSV and steps, not a .pbix: that format is closed; the files and the steps work in the free Power BI Desktop (Windows).
import { zipSync, strToU8 } from 'fflate'
import { csvField } from './csvWrite'
import type { Cell } from './check'
import type { Link } from './buildLinks'
import { EXPECTED_LINKS, TABLE_INFO } from '../data/build/linkData'
import { ANSWERS, MONTHS_2025, TILE_CARDS } from '../data/build/kaiyoSales'

export const POWER_BI_ZIP = 'kaiyo-sales-power-bi.zip'

/** One table of the star: its DuckDB name (`gold_fact_sales`), columns with DuckDB's type names, and the rows as Lab shows them. */
export interface StarTable {
  table: string
  columns: { name: string; type: string }[]
  rows: Cell[][]
}

/** `fact_sales`: the table without `gold_`, the way the Model step calls it. */
export const shortName = (table: string): string => TABLE_INFO[table]?.short ?? table.replace(/^gold_/, '')
/** The CSV of a table, in the archive: `data/fact_sales.csv`. */
export const csvPath = (table: string): string => `data/${shortName(table)}.csv`

/** The Answer is done and the star can be exported: nothing is exported while the engine is not ready or a cell is [Error]. */
export function exportBlocker(o: { ready: boolean; errors: number; tables: readonly string[] }): string | null {
  if (!o.ready) return 'Lab is still preparing the tables. Try again in a moment.'
  if (o.errors > 0) return `The clean sales still have ${o.errors} [Error] cell${o.errors === 1 ? '' : 's'}. Fix them on Clean first, then take the star to Power BI.`
  if (!o.tables.includes('gold_fact_sales')) return 'The star is not built yet. Build it on the Model step first.'
  return null
}

// ---------------------------------------------------------------- CSV

const BOM = '﻿'

/**
 * UTF-8 with a BOM (Power BI reads Cyrillic and Japanese names without settings), commas, a point in numbers, ISO dates,
 * the header in the first line, LF line ends. The cells are already text or numbers: Lab's result formatter made dates ISO
 * and DECIMAL plain (src/db/format.ts), the same as Export as CSV.
 */
export function csvText(header: readonly string[], rows: readonly Cell[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

// ---------------------------------------------------------------- what Power BI will see

/** The type Power BI should show in Column tools, from DuckDB's type name. */
export function powerBiType(duckType: string): string {
  const u = duckType.trim().toUpperCase()
  if (u === 'DATE') return 'Date'
  if (u.startsWith('TIMESTAMP')) return 'Date/Time'
  if (/^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|INT)$/.test(u)) return 'Whole number'
  if (/^(DECIMAL|DOUBLE|FLOAT|REAL)/.test(u)) return 'Decimal number'
  if (u === 'BOOLEAN') return 'True/False'
  return 'Text'
}

/** "314,906.13": the money as the checks write it. */
export const money = (v: number): string => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface ModelLink {
  id: string
  many: { table: string; column: string }
  one: { table: string; column: string }
}

/** The relationships of the star: the learner's F links when they are there, else the expected ones (a run saved before the learner made links). Only links between exported tables. */
export function starLinks(links: readonly Link[], tables: readonly string[]): ModelLink[] {
  const out: ModelLink[] = []
  for (const e of EXPECTED_LINKS.filter((x) => x.pass === 2)) {
    const l = links.find((x) => x.id === e.id) ?? e
    if (tables.includes(l.many.table) && tables.includes(l.one.table)) out.push({ id: e.id, many: l.many, one: l.one })
  }
  return out
}

/** The numbers the Check step shows, from the same constants the Answer step checks. */
export function checkNumbers() {
  const a1 = ANSWERS.find((q) => q.id === 'A1')!.right
  const a2 = ANSWERS.find((q) => q.id === 'A2')!.right
  const a3 = ANSWERS.find((q) => q.id === 'A3')!.right
  return {
    total: money(a1.value),
    month: MONTHS_2025.find((m) => m.value === a2.pick)?.label ?? String(a2.pick),
    monthValue: money(a2.value),
    chain: a3.pick ?? '',
    chainValue: money(a3.value),
  }
}

// ---------------------------------------------------------------- steps.html

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const code = (s: string) => `<code>${esc(s)}</code>`
const pre = (s: string) => `<pre>${esc(s)}</pre>`

const STYLE = `body{font:16px/1.5 system-ui,Segoe UI,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#1c2330}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:2rem 0 .5rem;border-bottom:1px solid #d5dbe5;padding-bottom:.25rem}
code,pre{font-family:Consolas,Menlo,monospace;font-size:.92em;background:#f1f4f9;border-radius:4px}code{padding:.05rem .3rem}
pre{padding:.7rem .9rem;overflow-x:auto;white-space:pre-wrap}li{margin:.3rem 0}.muted{color:#5b6778}
.check{background:#eef7ee;border:1px solid #b9dcb9;border-radius:6px;padding:.6rem 1rem}table{border-collapse:collapse}td,th{border:1px solid #d5dbe5;padding:.2rem .6rem;text-align:left}`

/** The star as an inline SVG (no scripts): the fact in the middle, the dimensions around, one line per link, `*` at the fact, `1` at the dimension, the column names on the line. */
export function starSvg(tables: readonly StarTable[], mls: readonly ModelLink[]): string {
  const W = 680
  const H = 380
  const cx = W / 2
  const cy = H / 2
  const factT = tables.find((t) => t.table === 'gold_fact_sales')?.table ?? tables[0]?.table
  const dims = tables.map((t) => t.table).filter((t) => t !== factT)
  const box = (table: string) => {
    const t = tables.find((x) => x.table === table)
    return { name: shortName(table), cols: (t?.columns ?? []).map((c) => c.name) }
  }
  const BW = 190
  const boxH = (n: number) => 34 + n * 18
  const pos = new Map<string, { x: number; y: number; h: number }>()
  const fb = box(factT ?? '')
  pos.set(factT ?? '', { x: cx, y: cy, h: boxH(fb.cols.length) })
  const spots = dims.length === 1 ? [[100, cy]] : dims.length === 2 ? [[100, cy], [W - 100, cy]] : dims.map((_, i) => [i % 2 === 0 ? 100 : W - 100, 70 + Math.floor(i / 2) * 150])
  dims.forEach((d, i) => pos.set(d, { x: spots[i][0], y: spots[i][1], h: boxH(box(d).cols.length) }))
  const drawBox = (table: string) => {
    const p = pos.get(table)!
    const b = box(table)
    const x = p.x - BW / 2
    const y = p.y - p.h / 2
    const isFact = table === factT
    return `<rect x="${x}" y="${y}" width="${BW}" height="${p.h}" rx="6" fill="${isFact ? '#e3ecfb' : '#f4f6fa'}" stroke="#1c2330" stroke-width="${isFact ? 2.5 : 1.5}"/>` +
      `<text x="${p.x}" y="${y + 22}" text-anchor="middle" font-size="16" font-weight="700" fill="#1c2330">${esc(b.name)}${isFact ? ' (fact)' : ''}</text>` +
      b.cols.map((c, i) => `<text x="${x + 12}" y="${y + 46 + i * 18}" font-size="13" font-family="Consolas,Menlo,monospace" fill="#1c2330">${esc(c)}</text>`).join('')
  }
  const edge = (p: { x: number; y: number }, toward: { x: number }) => ({ x: p.x + Math.sign(toward.x - p.x || 1) * (BW / 2), y: p.y })
  const lineEls = mls
    .map((l) => {
      const a = pos.get(l.many.table)
      const b = pos.get(l.one.table)
      if (!a || !b) return ''
      const pa = edge(a, b)
      const pb = edge(b, a)
      const sa = Math.sign(pb.x - pa.x || 1)
      const lab = l.many.column === l.one.column ? l.many.column : `${l.many.column} → ${l.one.column}`
      return `<g class="link"><line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#1c2330" stroke-width="2"/>` +
        `<text x="${pa.x + sa * 14}" y="${pa.y - 8}" text-anchor="middle" font-size="16" font-weight="700" fill="#1c2330">*</text>` +
        `<text x="${pb.x - sa * 14}" y="${pb.y - 8}" text-anchor="middle" font-size="16" font-weight="700" fill="#1c2330">1</text>` +
        `<text x="${(pa.x + pb.x) / 2}" y="${(pa.y + pb.y) / 2 - 10}" text-anchor="middle" font-size="13" font-family="Consolas,Menlo,monospace" fill="#1c2330">${esc(lab)}</text></g>`
    })
    .join('')
  return `<svg role="img" aria-labelledby="star-t" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;background:#fff" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="star-t">The star: ${esc(fb.name)} in the middle, linked to ${dims.map((d) => esc(shortName(d))).join(' and ')}</title>` +
    lineEls + tables.map((t) => drawBox(t.table)).join('') + `</svg>`
}

/** Revenue of January to June 2026 per chain, from the exported tables, largest first; sales of customers with no chain are left out, as on the dashboard. */
export function chainTotals(tables: readonly StarTable[]): { chain: string; value: number }[] {
  const f = tables.find((t) => t.table === 'gold_fact_sales')
  const c = tables.find((t) => t.table === 'gold_dim_customer')
  if (!f || !c) return []
  const fi = (n: string) => f.columns.findIndex((x) => x.name === n)
  const ci = (n: string) => c.columns.findIndex((x) => x.name === n)
  const [fd, fc, fr, cid, cch] = [fi('sale_date'), fi('customer_id'), fi('revenue'), ci('customer_id'), ci('chain_name')]
  if ([fd, fc, fr, cid, cch].some((i) => i < 0)) return []
  const chainOf = new Map<string, string>()
  for (const r of c.rows) if (r[cch] !== null && r[cch] !== '') chainOf.set(String(r[cid]), String(r[cch]))
  const sum = new Map<string, number>()
  for (const r of f.rows) {
    const d = String(r[fd])
    const ch = chainOf.get(String(r[fc]))
    if (!ch || r[fr] === null || d < '2026-01-01' || d >= '2026-07-01') continue
    sum.set(ch, (sum.get(ch) ?? 0) + Math.round(Number(r[fr]) * 100))
  }
  return [...sum].map(([chain, v]) => ({ chain, value: v / 100 })).sort((a, b) => b.value - a.value)
}

/** The page of steps: English, verbs first, no scripts, one file (the star diagram is an inline SVG). */
export function stepsHtml(tables: readonly StarTable[], links: readonly Link[]): string {
  const names = tables.map((t) => t.table)
  const fSale = shortName('gold_fact_sales')
  const mls = starLinks(links, names)
  const n = checkNumbers()
  const kpi = TILE_CARDS.find((t) => t.id === 'kpi')!.title
  const line = TILE_CARDS.find((t) => t.id === 'line')!.title
  const chains = TILE_CARDS.find((t) => t.id === 'chains')!.title
  const chainCol = 'chain_name'
  const dimC = shortName('gold_dim_customer')

  const loadList = tables.map((t) => `<li>${code(csvPath(t.table).replace('data/', ''))} ${t.rows.length.toLocaleString('en-US')} rows</li>`).join('')
  // Only the columns where a wrong type is likely: dates and money (the rest Power BI reads right).
  const typeRows = tables
    .flatMap((t) => t.columns.filter((c) => ['Date', 'Date/Time', 'Decimal number'].includes(powerBiType(c.type))).map((c) => ({ t, c })))
    .map(({ t, c }) => {
      const ty = powerBiType(c.type)
      const fix = ty === 'Decimal number' ? 'Column tools, Data type, Decimal number (or Fixed decimal number)' : `Column tools, Data type, ${ty}`
      return `<tr><td>${code(`${shortName(t.table)}[${c.name}]`)}</td><td>${ty}</td><td>${fix}</td></tr>`
    })
    .join('')
  const chainRows = chainTotals(tables)
  const chainNames = chainRows.map((c) => c.chain)
  const chainCount = chainNames.length
  const linkList = mls
    .map((l) => `<li>Drag ${code(`${shortName(l.many.table)}[${l.many.column}]`)} onto ${code(`${shortName(l.one.table)}[${l.one.column}]`)} (Lab's link ${l.id}). Check: Cardinality <b>Many to one (*:1)</b>, Cross filter direction <b>Single</b>, <b>Make this relationship active</b> ticked, then OK.</li>`)
    .join('')

  const monthCol = `Month = DATE(YEAR(${fSale}[sale_date]), MONTH(${fSale}[sale_date]), 1)`
  const revenue = `Revenue = SUM(${fSale}[revenue])`
  const h1 = `Revenue H1 2026 =
CALCULATE(
    [Revenue],
    ${fSale}[sale_date] >= DATE(2026, 1, 1),
    ${fSale}[sale_date] < DATE(2026, 7, 1)
)`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kaiyo sales in Power BI Desktop</title><style>${STYLE}</style></head><body>
<h1>Kaiyo sales in Power BI Desktop</h1>
<p class="muted">The star you built in Quaera Lab, rebuilt in the free Power BI Desktop (Windows). About 15 minutes.</p>

<h2>1. Get the data</h2>
<ol>
<li>Unzip the archive. Open Power BI Desktop and start a blank report.</li>
<li>Press <b>Home, Get data, Text/CSV</b>. Pick a file from the <code>data</code> folder.</li>
<li>Check the preview: File origin <b>65001: Unicode (UTF-8)</b>, Delimiter <b>Comma</b>. Press <b>Load</b>.</li>
<li>Repeat for every file:<ul>${loadList}</ul></li>
</ol>

<h2>2. Check the column types</h2>
<p>Open <b>Table view</b>, press the column, read <b>Data type</b> under Column tools. The other columns are read right; check only these:</p>
<table><tr><th>Column</th><th>Expected type</th><th>Fix if different</th></tr>${typeRows}</table>
<p class="muted">If a date or number is still wrong, press <b>Transform data</b>, then on the column <b>Change type, Using locale…</b> with English (United States).</p>

<h2>3. Link the tables in Model view</h2>
<p>Open <b>Model view</b>. Power BI may link tables by itself: delete any line that is not in this picture, then make exactly these links. <b>*</b> is the many side (the fact), <b>1</b> is the one side (a dimension).</p>
${starSvg(tables, mls)}
<ol>${linkList || '<li>No links to make: the star has only one table.</li>'}</ol>
<p class="muted">The fact is on the many side and the dimensions filter it, as on Lab's Model step.</p>

<h2>4. Two measures and one column</h2>
<p><b>4a. Measures.</b> Press <code>${esc(fSale)}</code> in the <b>Data</b> pane so it is selected. Press <b>Table tools, New measure</b>, paste the text, press Enter. Do this for each:</p>
<ol>
<li>Revenue (the line and the bars use it):${pre(revenue)}</li>
<li>Revenue H1 2026 (the number tile, and the bars):${pre(h1)}</li>
</ol>
<p><b>4b. Column.</b> Select <code>${esc(fSale)}</code> in the Data pane again. Press <b>Table tools, New column</b> (<b>not</b> New measure) and paste:</p>
${pre(monthCol)}
<ol>
<li>Check in the Data pane that <code>Month</code> sits under <code>${esc(fSale)}</code>.</li>
<li>Press <code>Month</code>, then <b>Column tools, Format</b>: choose <b>Custom</b> and type <code>mmm yyyy</code>.</li>
</ol>
<p class="muted">Yellow error "A single value for column 'sale_date' in table '${esc(fSale)}' cannot be determined"? You made a measure where a column is needed. Delete it and make it again with <b>New column</b>.</p>

<h2>5. Build the three visuals</h2>
<p>The same three tiles as the dashboard in Lab.</p>
<ol>
<li><b>${esc(kpi)}</b>: add a <b>Card</b>. Drag <code>Revenue H1 2026</code> into Fields. In <b>Format, Callout value</b> set <b>Display units: None</b> and <b>Decimal places: 2</b>. It reads <b>${n.total}</b>.</li>
<li><b>${esc(line)}</b>: add a <b>Line chart</b>. Drag <code>${esc(fSale)}[Month]</code> into <b>X-axis</b>. If the axis shows Year, Quarter, Month, Day, press the arrow next to Month in the X-axis well and choose <b>Month</b>, not Date Hierarchy. In <b>Format, X-axis</b>, set <b>Type</b> to <b>Categorical</b>. Y-axis: <code>Revenue</code>. You see one point per month, January 2024 to June 2026 (30 points); ${esc(n.month)} 2025 is the highest of 2025 at <b>${n.monthValue}</b>.</li>
<li><b>${esc(chains)}</b>: add a <b>Clustered bar chart</b>. Y-axis: <b>${esc(`${dimC}[${chainCol}]`)}</b>, not <code>customer_name</code> (those are single stores like "Minori #1013"). X-axis: <code>Revenue H1 2026</code>. In Filters on this visual set <code>${chainCol}</code> to <b>is not blank</b>, as Lab's tile does. You see <b>${chainCount} bars</b>: ${esc(chainNames.join(', '))}; the top one is <b>${esc(n.chain)} ${n.chainValue}</b>.</li>
</ol>

<h2>6. Check the numbers</h2>
<div class="check">
<ul>
<li>Check: the card shows <b>${n.total}</b> for January to June 2026.<br>If it shows <code>314.91K</code>: Display units is on Auto, set it to None. If it shows a different number or "(Blank)": the measure is wrong or a link is missing (step 3). If it shows the sum of the whole column: you made a column instead of a measure.</li>
<li>Check: the bars show <b>${esc(n.chain)} ${n.chainValue}</b> as the longest, ${chainCount} bars in all. The bars add up to less than the card: customers with no chain are left out, as on Lab's dashboard.<br>If you see many bars with "#" in the names: the axis is <code>customer_name</code>, use <code>${chainCol}</code>. If an empty bar shows: the "is not blank" filter is missing.</li>
<li>Check: ${esc(n.month)} is the top month of 2025 in the line, <b>${n.monthValue}</b> (point at it to read it).<br>If the axis shows years or a falling line of yearly totals: the Date Hierarchy is on, choose <b>Month</b> (step 5). If the tooltip reads "8/1/2025 12:00:00 AM": Month is read as a date, set Type to Categorical and the format to <code>mmm yyyy</code>. If Month is not under <code>${esc(fSale)}</code> or the yellow error shows: it is a measure or sits in another table, remake it as a column on the fact.</li>
</ul>
</div>
<p>When a number still differs, go back to step 3: a missing or one-way link is the usual cause, then to step 2: a wrong data type.</p>

<h2>What you did in Lab, what you do here</h2>
<p>The steps you took on Clean in Lab are the same idea as <b>Applied steps</b> in Power Query (Transform data): trim, change type, remove duplicates, replace values, each one a named step in order. The files in this archive are the result of your steps, so you start at the model.</p>
</body></html>
`
}

export const README_TXT = `Kaiyo sales: your star for Power BI Desktop
data/            the tables of the star you built in Quaera Lab, as CSV (UTF-8 with BOM, comma, ISO dates)
steps.html       open it in a browser: load, link, measures, visuals and the numbers to check
Power BI Desktop is free (Windows). Start with steps.html.
Made by Quaera Lab, lab.quaera.app. Everything was made in your browser: nothing was uploaded.
`

// ---------------------------------------------------------------- the archive

/** The files of the archive, by path: `data/<table>.csv`, `steps.html`, `README.txt`. */
export function powerBiFiles(tables: readonly StarTable[], links: readonly Link[]): Record<string, string> {
  const files: Record<string, string> = {}
  for (const t of tables) files[csvPath(t.table)] = csvText(t.columns.map((c) => c.name), t.rows)
  files['steps.html'] = stepsHtml(tables, links)
  files['README.txt'] = README_TXT
  return files
}

/** The .zip bytes (fflate, deflated; names and text UTF-8). */
export function powerBiZip(tables: readonly StarTable[], links: readonly Link[]): Uint8Array {
  const data: Record<string, Uint8Array> = {}
  for (const [name, text] of Object.entries(powerBiFiles(tables, links))) data[name] = strToU8(text)
  return zipSync(data, { level: 6 })
}
