// The Power BI practice page (`#practice=powerbi`, pass 1): what a task is, how a typed number is read and checked,
// and the drill's zip (the Kaiyo star as CSV + a page of steps). Pure: the page is src/ui/PowerBiPractice.tsx, the
// engine side src/db/powerBiPracticeRun.ts, the content src/data/powerBiPractice/.
// Two layers per section: layer A is checked here in the browser (the truth of a number is computed with DuckDB on the
// same CSV files the learner gets, never typed by hand); layer B is a drill in Power BI Desktop whose numbers the learner types back.
import { zipSync, strToU8 } from 'fflate'
import { code, esc, powerBiType, shortName, starLinks, starSvg, STYLE, type StarTable } from './powerBi'

// ---------------------------------------------------------------- the star: three CSV files

export const STAR = ['fact_sales', 'dim_customer', 'dim_product'] as const
export type StarName = (typeof STAR)[number]

/** Where the files live on the site (public/datasets/powerbi/); the names are the ones the learner loads in Power BI. */
export const starUrl = (name: StarName) => `datasets/powerbi/${name}.csv`
/** The name a file is registered under in the engine. */
export const starFile = (name: StarName) => `pbi_${name}.csv`

/**
 * A query over the three files as if they were tables `fact_sales`, `dim_customer` and `dim_product`: CTEs over
 * `read_csv`, so nothing is created in the learner's database. The query itself starts with SELECT.
 */
export function withStar(sql: string): string {
  const body = sql.trim().replace(/;$/, '')
  if (!/^select\b/i.test(body)) throw new Error('A truth query starts with SELECT.')
  return `WITH ${STAR.map((n) => `${n} AS (SELECT * FROM read_csv('${starFile(n)}', header = true))`).join(', ')} ${body}`
}

/** The first cell of the first row of a result as a number: the truth of a task. */
export function numberOf(rows: readonly (readonly unknown[])[]): number {
  const v = Number(rows[0]?.[0])
  if (!Number.isFinite(v)) throw new Error('The truth query did not return a number.')
  return v
}

// ---------------------------------------------------------------- a typed number

/** One way of reading what was typed: the value and half a unit of its last digit (what "the same at this precision" means). */
export interface Reading {
  value: number
  /** half a unit of the last typed digit, in the same scale as the value (K or M scale it up) */
  tol: number
  /** typed with K, M or B: Power BI's Display units */
  units: boolean
  percent: boolean
}

const GROUPS = /^\d{1,3}(?:\.\d{3})+$|^\d{1,3}(?:,\d{3})+$/
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

/**
 * What a learner types from a Power BI card or table: `1234.56`, `1 234,56`, `1,234.56`, `1.234,56`, `1'234.56`, `314.91K`,
 * `1.47M`, `11.8%`, a leading minus (also the typographic one), a currency sign. One reading, or two when a single
 * separator with three digits after it could be either thousands or decimals (`1,234`, `1.234`); an empty list when it
 * is not a number. The last separator is the decimal one when both kinds are there.
 */
export function readNumber(raw: string): Reading[] {
  let s = raw.replace(/[   ]/g, ' ').trim()
  if (!s) return []
  let neg = false
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) {
    neg = true
    s = paren[1].trim()
  }
  if (/^[-−–]/.test(s)) {
    neg = !neg
    s = s.slice(1).trim()
  }
  s = s.replace(/^[$€£¥₽]\s*/, '').replace(/\s*[$€£¥₽]$/, '')
  let percent = false
  if (s.endsWith('%')) {
    percent = true
    s = s.slice(0, -1).trim()
  }
  let scale = 1
  const suffix = /^(.*?)\s*([kmb])$/i.exec(s)
  if (suffix) {
    scale = SCALE[suffix[2].toLowerCase()]
    s = suffix[1].trim()
  }
  // thousands separated by a space or an apostrophe (1 234,56 / 1'234.56)
  if (/^\d{1,3}(?:[ '’]\d{3})+(?:[.,]\d+)?$/.test(s)) s = s.replace(/[ '’]/g, '')
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return []

  const make = (plain: string): Reading => {
    const decimals = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0
    const value = Number(plain) * scale * (neg ? -1 : 1)
    return { value, tol: 0.5 * Math.pow(10, -decimals) * scale, units: scale > 1, percent }
  }
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  if (dots && commas) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const thousands = decimal === '.' ? ',' : '.'
    const at = s.lastIndexOf(decimal)
    const whole = s.slice(0, at)
    const frac = s.slice(at + 1)
    const wholeOk = decimal === '.' ? /^\d{1,3}(?:,\d{3})+$/ : /^\d{1,3}(?:\.\d{3})+$/
    if (!/^\d+$/.test(frac) || !wholeOk.test(whole)) return []
    return [make(`${whole.split(thousands).join('')}.${frac}`)]
  }
  if (!dots && !commas) return [make(s)]
  const sep = dots ? '.' : ','
  const parts = s.split(sep)
  if (parts.length > 2) return GROUPS.test(s) ? [make(parts.join(''))] : []
  const [whole, frac] = parts
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (!whole && !frac)) return []
  const asDecimal = make(`${whole || '0'}.${frac}`)
  // 1,234 / 1.234: the point may be thousands (a European card) or decimals; both are tried
  if (frac.length === 3 && whole.length >= 1 && whole.length <= 3 && !whole.startsWith('0')) {
    const asThousands = make(whole + frac)
    return sep === ',' ? [asThousands, asDecimal] : [asDecimal, asThousands]
  }
  return [asDecimal]
}

export interface NumberTrap {
  value: number
  says: string
}

export type NumberVerdict =
  | { kind: 'empty' }
  | { kind: 'unreadable' }
  | { kind: 'right'; rounded: boolean; units: boolean }
  /** matches only because the typed number is rounded far too coarsely (1M for 1,473,843.82) */
  | { kind: 'coarse' }
  | { kind: 'trap'; says: string }
  | { kind: 'sign' }
  | { kind: 'wrong' }

/** Half a unit of the last digit is allowed, but not more than 1% of the number: `1M` is not an answer. */
const COARSEST = 0.01

function matches(r: Reading, expected: number, percent: boolean): 'yes' | 'coarse' | 'no' {
  const forms = percent && !r.percent ? [r.value, r.value * 100] : [r.value]
  const tols = percent && !r.percent ? [r.tol, r.tol * 100] : [r.tol]
  for (let i = 0; i < forms.length; i++) {
    const slack = tols[i] + 1e-6
    if (Math.abs(forms[i] - expected) <= slack) return tols[i] > COARSEST * Math.abs(expected) && Math.abs(forms[i] - expected) > 0.0051 ? 'coarse' : 'yes'
  }
  return 'no'
}

/**
 * Checks the number a learner typed against the truth. In this order: empty (no check), unreadable, right (also at the
 * precision they typed, said so), a known trap (its own message), a negative where the truth is positive, wrong.
 * `percent`: the truth is a percentage such as 11.8; `11.8`, `11.8%` and `0.118` all count.
 */
export function checkNumber(raw: string, expected: number, o: { percent?: boolean; traps?: readonly NumberTrap[] } = {}): NumberVerdict {
  if (!raw.trim()) return { kind: 'empty' }
  const readings = readNumber(raw)
  if (!readings.length) return { kind: 'unreadable' }
  const percent = !!o.percent
  let coarse = false
  for (const r of readings) {
    const m = matches(r, expected, percent)
    if (m === 'yes') {
      const shown = percent && !r.percent && Math.abs(r.value) <= 1 ? r.value * 100 : r.value
      return { kind: 'right', rounded: Math.abs(expected - shown) > 0.0051, units: r.units }
    }
    if (m === 'coarse') coarse = true
  }
  if (coarse) return { kind: 'coarse' }
  for (const t of o.traps ?? []) if (readings.some((r) => matches(r, t.value, percent) === 'yes')) return { kind: 'trap', says: t.says }
  if (expected > 0 && readings.some((r) => r.value < 0)) return { kind: 'sign' }
  return { kind: 'wrong' }
}

/** What the page says under a number: ok, a title and the detail. */
export function numberMessage(v: NumberVerdict, where?: string): { ok: boolean; title: string; detail: string } {
  switch (v.kind) {
    case 'empty':
      return { ok: false, title: 'Type a number first.', detail: 'Read it off your Power BI report and type it here.' }
    case 'unreadable':
      return { ok: false, title: 'That does not read as a number.', detail: 'Type it as Power BI shows it, for example 1,234.56 or 1.23K.' }
    case 'right':
      if (v.rounded && v.units) return { ok: true, title: 'Right.', detail: 'It matches at this precision. Switch Display units to None to see the full number.' }
      if (v.rounded) return { ok: true, title: 'Right.', detail: 'It matches at the precision you typed.' }
      return { ok: true, title: 'Right.', detail: '' }
    case 'coarse':
      return { ok: false, title: 'Too rounded to check.', detail: 'Show more digits: Display units None and two decimal places, then type what you see.' }
    case 'trap':
      return { ok: false, title: 'Not yet.', detail: v.says }
    case 'sign':
      return { ok: false, title: 'A negative number.', detail: 'Returns are units < 0; did you filter them? The answer is not negative.' }
    case 'wrong':
      return { ok: false, title: 'Not the number I expected.', detail: where ? `Look again at ${where}. A missing link or a wrong filter is the usual cause.` : 'Look at the filter and the links again.' }
  }
}

// ---------------------------------------------------------------- what a task is

export interface PbiHints {
  hints: string[]
}

export interface PbiPredict extends PbiHints {
  kind: 'predict'
  id: string
  title: string
  question: string
  /** a query over fact_sales, dim_customer, dim_product (`withStar` makes them tables); returns the number one column, one row */
  sql: string
  percent?: boolean
  /** wrong numbers people really get: the query's result and what went wrong */
  traps?: { sql: string; says: string }[]
  explain: string
}

export interface PbiOption {
  id: string
  text: string
  /** said when this option is chosen and wrong */
  why: string
}

/** `pick` and `spot`: one answer from a list; spot shows a snippet (a formula, a message) first. */
export interface PbiPick extends PbiHints {
  kind: 'pick' | 'spot'
  id: string
  title: string
  question: string
  snippet?: string
  options: PbiOption[]
  right: string
  explain: string
}

export interface PbiOrder extends PbiHints {
  kind: 'order'
  id: string
  title: string
  question: string
  /** in the right order */
  steps: string[]
  explain: string
}

export type PbiTask = PbiPredict | PbiPick | PbiOrder

export interface PbiCheck {
  id: string
  /** what the learner reads and types, as a label on the field */
  label: string
  /** where in Power BI it is read */
  where: string
  sql: string
  percent?: boolean
  traps?: { sql: string; says: string }[]
}

export interface PbiDrill extends PbiHints {
  kind: 'drill'
  id: string
  title: string
  question: string
  /** the archive's name */
  zip: string
  /** the first line on the steps page */
  intro: string
  /** "start from scratch in 2 minutes": list items (HTML), the state the drill begins from */
  scratch: string[]
  /** what the previous drill leaves, in a line; empty for the first */
  continues: string
  steps: { title: string; html: string }[]
  checks: PbiCheck[]
  /** the checks' "If you see…" lines for the steps page, in the order of the checks; no numbers in them */
  ifWrong: string[]
}

export interface PbiNote {
  kind: 'note'
  topic?: string
  text: string
  trap?: string
}

export type PbiBlock = PbiNote | PbiTask | PbiDrill

export interface PbiSection {
  id: string
  n: number
  title: string
  /** shown as "coming next" with this line */
  soon?: string
  blocks: PbiBlock[]
}

export const isTask = (b: PbiBlock): b is PbiTask => b.kind === 'predict' || b.kind === 'pick' || b.kind === 'spot' || b.kind === 'order'
export const isDrill = (b: PbiBlock): b is PbiDrill => b.kind === 'drill'

/** Layer A tasks of a section (the warm-up draws from these). */
export const tasksA = (s: PbiSection) => s.blocks.filter(isTask)
/** What counts as a task of the page for progress: layer A, then the drill last (the hardest, as "Test me" in the other practices). */
export const progressIds = (s: PbiSection) => [...tasksA(s).map((t) => t.id), ...s.blocks.filter(isDrill).map((d) => d.id)]

/** A task's number on the page: 3.2 is the second layer A task of section 3, the drill follows them. */
export function taskNumber(s: PbiSection, id: string): string {
  const i = progressIds(s).indexOf(id)
  return `${s.n}.${i + 1}`
}

// ---------------------------------------------------------------- order tasks

/** The page of 3 to 6 steps in a mixed order that is never the right one; the same for the same seed. */
export function shuffledOrder(n: number, seed: string): number[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let tries = 0; tries < 20; tries++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    if (idx.some((v, i) => v !== i)) return idx
  }
  return [...idx.slice(1), idx[0]]
}

/** The learner's order (indexes into the right order) against the right one: how many are in place, and the first that is not. */
export function orderVerdict(order: readonly number[]): { ok: boolean; inPlace: number; firstWrong: number | null } {
  const inPlace = order.filter((v, i) => v === i).length
  const firstWrong = order.findIndex((v, i) => v !== i)
  return { ok: inPlace === order.length, inPlace, firstWrong: firstWrong < 0 ? null : firstWrong }
}

// ---------------------------------------------------------------- CSV, in a few lines

/** A small CSV reader (BOM off, quotes, LF or CRLF). The star's files have no line breaks inside a field. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') (cell += '"', i++)
        else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') (row.push(cell), (cell = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) (row.push(cell), rows.push(row))
  return rows
}

/** DuckDB's type of a column of the star, as the bridge names them (powerBiType reads it). */
const COLUMN_TYPES: Record<string, string> = { sale_date: 'DATE', customer_id: 'BIGINT', product_id: 'BIGINT', units: 'BIGINT', revenue: 'DOUBLE', region_id: 'BIGINT' }

/** The tables for the star diagram: only the names and columns matter to it. */
export function starTablesFor(csvs: Record<StarName, Uint8Array>): StarTable[] {
  const dec = new TextDecoder('utf-8')
  return STAR.map((name) => {
    const header = dec.decode(csvs[name]).split('\n', 1)[0].replace(/\r$/, '').split(',')
    return { table: `gold_${name}`, columns: header.map((h) => ({ name: h, type: COLUMN_TYPES[h] ?? 'VARCHAR' })), rows: [] as StarTable['rows'] }
  })
}

/** Rows of a CSV file without its header. */
export function dataRows(bytes: Uint8Array): number {
  let n = 0
  for (const b of bytes) if (b === 10) n++
  return Math.max(0, n - 1)
}

// ---------------------------------------------------------------- the steps page of a drill

/** The page of steps: same look as the bridge's (src/core/powerBi.ts), English, no scripts, one file. Numbers of the answers are not in it. */
export function drillStepsHtml(d: PbiDrill, csvs: Record<StarName, Uint8Array>, number: string): string {
  const tables = starTablesFor(csvs)
  const names = tables.map((t) => t.table)
  const fileList = STAR.map((n) => `<li>${code(`${n}.csv`)}</li>`).join('')
  const typeRows = tables
    .flatMap((t) => t.columns.filter((c) => ['Date', 'Decimal number'].includes(powerBiType(c.type))).map((c) => ({ t, c })))
    .map(({ t, c }) => `<tr><td>${code(`${shortName(t.table)}[${c.name}]`)}</td><td>${powerBiType(c.type)}</td></tr>`)
    .join('')
  const links = starLinks([], names)
  const showStar = d.steps.some((s) => s.html.includes('{{star}}'))
  const star = showStar ? starSvg(tables, links) : ''
  const linkList = links
    .map((l) => `<li>Drag ${code(`${shortName(l.many.table)}[${l.many.column}]`)} onto ${code(`${shortName(l.one.table)}[${l.one.column}]`)}. Check: Cardinality <b>Many to one (*:1)</b>, Cross filter direction <b>Single</b>, <b>Make this relationship active</b> ticked, then OK.</li>`)
    .join('')
  const fill = (html: string) => html.replace('{{star}}', star).replace('{{files}}', `<ul>${fileList}</ul>`).replace('{{types}}', `<table><tr><th>Column</th><th>Expected type</th></tr>${typeRows}</table>`).replace('{{links}}', `<ol>${linkList}</ol>`)
  const start = d.continues
    ? `<h2>Start</h2>
<p>Either way you end up in the same place:</p>
<ul>
<li><b>Your own file.</b> Open the .pbix you saved after the last drill (${esc(d.continues)}).</li>
<li><b>From scratch, about 2 minutes</b> (no file, or it went wrong):</li>
</ul>
<ol>${d.scratch.join('')}</ol>`
    : `<h2>Start</h2>
<ol><li>Unzip the archive. Open Power BI Desktop and start a blank report.</li></ol>`
  const steps = d.steps.map((s, i) => `<h2>${i + 1}. ${esc(s.title)}</h2>\n${fill(s.html)}`).join('\n\n')
  const checks = d.checks.map((c, i) => `<li>${esc(c.label)}: read it ${esc(c.where)}. Type it into Lab.<br>If ${d.ifWrong[i] ?? 'it looks wrong, go back one step.'}</li>`).join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`Power BI drill ${number}: ${d.title}`)}</title><style>${STYLE}</style></head><body>
<h1>${esc(`Drill ${number}: ${d.title}`)}</h1>
<p class="muted">${esc(d.intro)} Free Power BI Desktop (Windows). About 10 to 15 minutes.</p>

${start}

${steps}

<h2>Check: type your numbers into Lab</h2>
<div class="check">
<ul>
${checks}
</ul>
</div>
<p>Open <code>lab.quaera.app/#practice=powerbi</code>, find this drill and type the numbers. Lab checks them against the same CSV files.</p>
<p class="muted">Save your file as a .pbix: the next drill continues from it.</p>
</body></html>
`
}

export const drillReadme = (d: PbiDrill, number: string) => `Kaiyo Trading: Power BI drill ${number}, ${d.title}
data/            the Kaiyo star as CSV (UTF-8 with BOM, comma, ISO dates): fact_sales, dim_customer, dim_product
steps.html       open it in a browser: the steps and what to read off your report
start/           how to begin from scratch in 2 minutes if you have no file from the last drill
Power BI Desktop is free (Windows). Start with steps.html. Type the numbers back into Lab: lab.quaera.app/#practice=powerbi
Made by Quaera Lab. Everything was made in your browser: nothing was uploaded.
`

/** The same "start from scratch" as plain text, for a person who does not want a browser page. */
export const drillStartText = (d: PbiDrill) =>
  `Start from scratch, about 2 minutes\n\n` +
  (d.scratch.length ? d.scratch.map((s, i) => `${i + 1}. ${s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')}`).join('\n') : '1. Open Power BI Desktop and start a blank report. This drill starts with the files.') +
  '\n'

/** The archive's files by path. */
export function drillFiles(d: PbiDrill, csvs: Record<StarName, Uint8Array>, number: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (const n of STAR) files[`data/${n}.csv`] = csvs[n]
  files['steps.html'] = strToU8(drillStepsHtml(d, csvs, number))
  files['start/start-from-scratch.txt'] = strToU8(drillStartText(d))
  files['README.txt'] = strToU8(drillReadme(d, number))
  return files
}

export const drillZip = (d: PbiDrill, csvs: Record<StarName, Uint8Array>, number: string): Uint8Array => zipSync(drillFiles(d, csvs, number), { level: 6 })

// ---------------------------------------------------------------- a snippet that shows a number

/** The total of all revenue: a snippet writes it as `{{TOTAL}}` and the page puts the computed number there. */
export const TOTAL_SQL = 'SELECT round(sum(revenue), 2) FROM fact_sales'
export const fillTotal = (snippet: string, total: number): string => snippet.split('{{TOTAL}}').join(total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
