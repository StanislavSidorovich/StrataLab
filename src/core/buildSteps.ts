// Applied steps of the build page (spec docs/build-kaiyo-sales-spec.md, 2.6 and 3.3 to 3.5): a step is a SELECT that reads
// `{prev}`; the clean table of a source is rebuilt from bronze through the whole list. Pure: the engine part is
// src/db/buildRun.ts. What is kept in localStorage is only {id, kind, params}; the SQL is written again on reading.
import { BUILD_DIAGNOSIS, CLEAN_IDS, GIVEN_FULL_SQL, GIVEN_SQL, SCHEMA, sourceById, type BuildSourceId, type CleanId } from '../data/build/kaiyoSales'
import { DIAGNOSIS_TEXT } from '../data/pipelines/kaiyoSellout'
import { emptyDash, readDash, type DashWork } from './buildDashboard'
import { emptyMore, readMore, type MoreWork } from './buildMore'
import { emptyRefresh, readRefresh, type RefreshWork } from './buildRefresh'
import { checkBlank } from './pipeline'
import { quoteString } from './sql'

export type StepKind = 'given' | 'distinct' | 'latest' | 'trim' | 'upper' | 'dedup' | 'extract' | 'type' | 'dates' | 'replace'

/** What Change type turns a column into. */
export type TypeTo = 'date' | 'whole' | 'decimal'
export const TYPE_WORD: Record<TypeTo, string> = { date: 'Date', whole: 'Whole number', decimal: 'Decimal' }

/** What is kept of a step. */
export interface StepSpec {
  id: string
  kind: StepKind
  params: Record<string, string>
}

export interface Step extends StepSpec {
  label: string
  /** a SELECT that reads `{prev}` */
  sql: string
  /** put there by the page; cannot be removed in v1 */
  given: boolean
}

export const SOURCE_IDS: readonly BuildSourceId[] = ['sales', 'customers', 'products', 'regions']

/** The columns of each source's clean table (the steps of v1 never add or drop one). */
export const CLEAN_COLUMNS: Record<BuildSourceId, readonly string[]> = {
  sales: ['raw_id', 'source_file', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue'],
  customers: sourceById('customers').columns,
  products: sourceById('products').columns,
  regions: sourceById('regions').columns,
}

export const GIVEN_SPEC: StepSpec = { id: 'given', kind: 'given', params: {} }
/** Work saved by v0.32.0 or before: its given step also did dates, decimal commas and names (P4 to P6 count as done). */
export const GIVEN_FULL_SPEC: StepSpec = { id: 'given', kind: 'given', params: { full: '1' } }

// ---------------------------------------------------------------- the generators

/** The column list of the step before, with one column replaced by an expression. */
function replaceColumn(cols: readonly string[], col: string, expr: string): string {
  return `SELECT ${cols.map((c) => (c === col ? `${expr} AS ${c}` : c)).join(', ')}\nFROM {prev}`
}

export const distinctSql = () => 'SELECT DISTINCT * FROM {prev}'
export const trimSql = (cols: readonly string[], col: string) => replaceColumn(cols, col, `trim(${col})`)
export const upperSql = (cols: readonly string[], col: string) => replaceColumn(cols, col, `upper(${col})`)
/** Extract number (spec 2.6, P7): the digits inside a text, as a whole number. R-03 gives 3. */
export const extractSql = (cols: readonly string[], col: string) => replaceColumn(cols, col, `CAST(regexp_extract(${col}, '[0-9]+') AS INTEGER)`)

/** Replace values (spec 3.6): every `find` in the column becomes `with`. */
export const replaceSql = (cols: readonly string[], col: string, find: string, withText: string) => replaceColumn(cols, col, `replace(${col}, ${quoteString(find)}, ${quoteString(withText)})`)

/** The cast Change type writes; a value that does not fit becomes NULL, and the page shows that as [Error] (spec 3.6). */
export function typeExpr(col: string, to: TypeTo, comma: boolean): string {
  const text = comma ? `replace(${col}, ',', '.')` : col
  if (to === 'date') return `try_cast(${col} AS DATE)`
  if (to === 'whole') return comma ? `try_cast(try_cast(${text} AS DOUBLE) AS INTEGER)` : `try_cast(${col} AS INTEGER)`
  return `try_cast(${text} AS DECIMAL(12, 2))`
}
export const typeSql = (cols: readonly string[], col: string, to: TypeTo, comma: boolean) => replaceColumn(cols, col, typeExpr(col, to, comma))

/** The format of the slash dates the blank of P5 takes: strptime letters, slashes, dots, dashes and spaces only. */
export function checkFormat(format: string): string | null {
  const f = format.trim()
  if (!f) return 'Write the format of the slash dates, like %Y-%m-%d.'
  if (f.length > 30) return 'A date format is short: 30 characters at most.'
  if (!/^[%A-Za-z0-9/.: -]+$/.test(f)) return 'A date format has only the letters after %, and / . - between them.'
  return null
}

/**
 * P5's step: the three spellings in a CASE; the learner fills the format of the slash dates. try_strptime: a date that does not fit
 * is an error to see, not a crash. With `format2` (the Refresh step, spec 5.7) a fourth branch reads the dates written year first
 * with slashes; it stands before the slash branch, which would take them first.
 */
export function datesSql(cols: readonly string[], format: string, format2?: string): string {
  const year = format2 ? `
         WHEN sale_date LIKE '____/%' THEN try_strptime(sale_date, '${format2}')   -- 2026/07/03` : ''
  return replaceColumn(
    cols,
    'sale_date',
    `CAST(CASE${year}
         WHEN sale_date LIKE '%.%' THEN try_strptime(sale_date, '%d.%m.%Y')
         WHEN sale_date LIKE '%/%' THEN try_strptime(sale_date, '${format}')   -- 19/02/2024
         ELSE try_strptime(sale_date, '%Y-%m-%d')
       END AS DATE)`,
  )
}

export function latestSql(cols: readonly string[], key: string, order: string, newest: boolean): string {
  return `SELECT ${cols.join(', ')}
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ${key} ORDER BY ${order} ${newest ? 'DESC' : 'ASC'}) AS row_no
  FROM {prev}
)
WHERE row_no = 1`
}

/** P2's step with the blank written in (the pipeline's SQL, 3.4). */
export function dedupSql(cols: readonly string[], blank: string): string {
  return `SELECT ${cols.join(', ')}
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ${blank} ORDER BY raw_id) AS copy_no  -- 1 = first copy of a sale
  FROM {prev}
)
WHERE copy_no = 1`
}

/** The step a spec stands for, or null when the spec does not fit the source (unknown column, a blank the rules refuse). */
export function makeStep(source: BuildSourceId, spec: StepSpec): Step | null {
  const cols = CLEAN_COLUMNS[source]
  const col = (k: string) => (cols.includes(spec.params[k]) ? spec.params[k] : null)
  const base = { id: spec.id, kind: spec.kind, params: spec.params }
  switch (spec.kind) {
    case 'given':
      if (source !== 'sales') return null
      return spec.params.full === '1'
        ? { ...base, label: 'Changed type (given): dates, numbers, names', sql: GIVEN_FULL_SQL, given: true }
        : { ...base, label: 'Changed type (given): raw_id and source_file', sql: GIVEN_SQL, given: true }
    case 'distinct':
      return { ...base, label: 'Removed duplicates', sql: distinctSql(), given: false }
    case 'trim': {
      const c = col('column')
      return c ? { ...base, label: `Trimmed ${c}`, sql: trimSql(cols, c), given: false } : null
    }
    case 'upper': {
      const c = col('column')
      return c ? { ...base, label: `Uppercased ${c}`, sql: upperSql(cols, c), given: false } : null
    }
    case 'extract': {
      const c = col('column')
      return c ? { ...base, label: `Extracted the number from ${c}`, sql: extractSql(cols, c), given: false } : null
    }
    case 'latest': {
      const key = col('key')
      const order = col('order')
      const newest = spec.params.direction !== 'oldest'
      return key && order ? { ...base, label: `Kept the ${newest ? 'newest' : 'oldest'} row per ${key} (by ${order})`, sql: latestSql(cols, key, order, newest), given: false } : null
    }
    case 'type': {
      const c = col('column')
      const to = spec.params.to as TypeTo
      if (source !== 'sales' || !c || !(to in TYPE_WORD)) return null
      const comma = to !== 'date' && spec.params.sep === 'comma'
      return { ...base, label: `Changed type of ${c} to ${TYPE_WORD[to]}${comma ? ' (decimal separator: comma)' : ''}`, sql: typeSql(cols, c, to, comma), given: false }
    }
    case 'dates': {
      const format = (spec.params.format ?? '').trim()
      const format2 = (spec.params.format2 ?? '').trim()
      if (source !== 'sales' || checkFormat(format) || (format2 && checkFormat(format2))) return null
      return { ...base, label: 'Converted sale_date to a date (SQL)', sql: datesSql(cols, format, format2 || undefined), given: false }
    }
    case 'replace': {
      const c = col('column')
      const find = spec.params.find ?? ''
      const withText = spec.params.with ?? ''
      if (!c || !find || find.length > 60 || withText.length > 60) return null
      return { ...base, label: `Replaced ${find} with ${withText} in ${c}`, sql: replaceSql(cols, c, find, withText), given: false }
    }
    case 'dedup': {
      const blank = (spec.params.blank ?? '').trim()
      if (source !== 'sales' || checkBlank(blank)) return null
      return { ...base, label: 'Removed sales sent twice', sql: dedupSql(cols, blank), given: false }
    }
  }
}

/** The whole list of a source: the given step first (sales), then the learner's. Specs that do not fit are left out. */
export function stepsOf(source: BuildSourceId, specs: readonly StepSpec[]): Step[] {
  const given = specs.find((s) => s.kind === 'given' && s.params.full === '1') ?? GIVEN_SPEC
  const all = source === 'sales' ? [given, ...specs.filter((s) => s.kind !== 'given')] : specs.filter((s) => s.kind !== 'given')
  return all.map((s) => makeStep(source, s)).filter((s): s is Step => !!s)
}

const nameOf = (i: number) => (i === 0 ? 'bronze' : `step${i}`)

/** A step's SQL with `{prev}` replaced by the name of the step before it. */
export const shownSql = (steps: readonly Step[], i: number) => steps[i].sql.replace('{prev}', nameOf(i))

function chainCtes(source: BuildSourceId, steps: readonly Step[]): string {
  const s = sourceById(source)
  const indent = (t: string) => t.split('\n').map((l) => '    ' + l).join('\n')
  const ctes = [`bronze AS (SELECT * FROM ${SCHEMA}.${s.bronze})`, ...steps.map((_, i) => `step${i + 1} AS (\n${indent(shownSql(steps, i))}\n  )`)]
  return `WITH ${ctes.join(',\n     ')}`
}

/** The statement that rebuilds `clean_<source>` from bronze through the steps (2.6). */
export function chainSql(source: BuildSourceId, steps: readonly Step[]): string {
  return `CREATE OR REPLACE TABLE ${SCHEMA}.${sourceById(source).clean} AS
${chainCtes(source, steps)}
SELECT * FROM ${nameOf(steps.length)}`
}

/** One row of numbers: the rows of bronze, then the rows after step 1, step 2, and so on. */
export function countsSql(source: BuildSourceId, steps: readonly Step[]): string {
  const names = ['bronze', ...steps.map((_, i) => `step${i + 1}`)]
  return `${chainCtes(source, steps)}
SELECT ${names.map((n) => `(SELECT count(*) FROM ${n})`).join(', ')}`
}

/** The same numbers for the lines of one export file (the sales have `source_file` all the way): the Refresh journal shows what a step did to July. */
export function fileCountsSql(source: BuildSourceId, steps: readonly Step[], file: string): string {
  const names = ['bronze', ...steps.map((_, i) => `step${i + 1}`)]
  return `${chainCtes(source, steps)}
SELECT ${names.map((n) => `(SELECT count(*) FROM ${n} WHERE source_file = ${quoteString(file)})`).join(', ')}`
}

/**
 * One row: for each step of the list, how many rows it turned into [Error] (spec 3.6): rows where the value before was
 * there and the value after is NULL. Only Change type and P5's SQL can; every other step counts 0. Sales only (raw_id is the key).
 */
export function stepErrorsSql(steps: readonly Step[]): string {
  const names = ['bronze', ...steps.map((_, i) => `step${i + 1}`)]
  const cells = steps.map((st, i) => {
    const col = typedColumn(st)
    return col && i > 0 ? `(SELECT count(*) FROM ${names[i + 1]} a JOIN ${names[i]} p USING (raw_id) WHERE a.${col} IS NULL AND p.${col} IS NOT NULL)` : '0'
  })
  return `${chainCtes('sales', steps)}
SELECT ${cells.length ? cells.join(', ') : '0'}`
}

/** "3,110 rows → 3,000 rows"; one number when nothing changed. */
export function rowsChange(before: number, after: number): string {
  const n = (x: number) => `${x.toLocaleString('en-US')} ${x === 1 ? 'row' : 'rows'}`
  return before === after ? `${n(after)}, no change` : `${n(before)} → ${n(after)}`
}

// ---------------------------------------------------------------- changing the list

export function nextId(specs: readonly StepSpec[]): string {
  const n = Math.max(0, ...specs.map((s) => Number(/^s(\d+)$/.exec(s.id)?.[1] ?? 0)))
  return `s${n + 1}`
}

/** Adds a step at the end; P2's step replaces the one that is there. */
export function addSpec(specs: readonly StepSpec[], kind: StepKind, params: Record<string, string> = {}): StepSpec[] {
  const base = kind === 'dedup' ? specs.filter((s) => s.kind !== 'dedup') : specs
  // a second Change type (or the SQL of P5) on the same column takes the place of the first, in the same position: the failing step is fixed, not piled on
  const col = kind === 'dates' ? 'sale_date' : kind === 'type' ? params.column : null
  if (col) {
    const at = specs.findIndex((s) => typedColumn(s) === col)
    if (at >= 0) return specs.map((s, i) => (i === at ? { id: s.id, kind, params } : s))
  }
  return [...base, { id: nextId(specs), kind, params }]
}

/** The column a Change type or the date SQL turns into another type (null for any other step). */
export const typedColumn = (s: Pick<StepSpec, 'kind' | 'params'>): string | null => (s.kind === 'dates' ? 'sale_date' : s.kind === 'type' ? s.params.column ?? null : null)

export const removeSpec = (specs: readonly StepSpec[], id: string): StepSpec[] => specs.filter((s) => s.id !== id)

// ---------------------------------------------------------------- what is kept (state of the work)

export interface Peek {
  kpi: string
  chain: string
  chainRevenue: string
}

export interface BuildWork {
  /** see WORK_VERSION */
  v: number
  /** sources whose Connect was done (rebuilt when the page opens) */
  connected: BuildSourceId[]
  /** the learner's steps per source (not the given one) */
  steps: Record<BuildSourceId, StepSpec[]>
  /** the blank of P2 */
  blank: string
  /** the blank of P5: the format of the slash dates */
  format: string
  /** Clean cards passed, in order */
  passed: CleanId[]
  /** the Quick look numbers, kept to be shown again */
  peek: Peek | null
  /** the Dashboard blanks and passed tiles, the answers (src/core/buildDashboard.ts) */
  dash: DashWork
  /** the extra Clean card P7 (region ids as numbers): shown once the Model step asked for it, then done */
  p7: 'asked' | 'done' | null
  /** the extra Clean card P4 (names of the stores in the sales): asked for by the Model step when names find no customer */
  p4: 'asked' | 'done' | null
  /** the optional step More: the SQL and answers of the five questions, the pins (src/core/buildMore.ts) */
  more: MoreWork
  /** the optional step Refresh: how the sales read their folder, the new date format, the journal and the runs (src/core/buildRefresh.ts) */
  refresh: RefreshWork
  /** the info card P8 (odd values that are not errors) was read; it locks nothing */
  p8: boolean
}

/** The saved work's version: 2 since v0.33.0 (P4 to P6 are the learner's). Work saved without it has the first given step. */
export const WORK_VERSION = 2

export const emptyWork = (): BuildWork => ({ v: WORK_VERSION, connected: [], steps: { sales: [], customers: [], products: [], regions: [] }, blank: '', format: '', passed: [], peek: null, dash: emptyDash(), p7: null, p4: null, more: emptyMore(), refresh: emptyRefresh(), p8: false })

const KINDS: readonly StepKind[] = ['distinct', 'latest', 'trim', 'upper', 'dedup', 'extract', 'type', 'dates', 'replace']

/** Anything unreadable is dropped; a step that does not fit its source is dropped with it. */
export function readWork(raw: unknown): BuildWork {
  const w = emptyWork()
  if (!raw || typeof raw !== 'object') return w
  const r = raw as Record<string, unknown>
  if (Array.isArray(r.connected)) w.connected = SOURCE_IDS.filter((s) => (r.connected as unknown[]).includes(s))
  const steps = r.steps && typeof r.steps === 'object' ? (r.steps as Record<string, unknown>) : {}
  for (const id of SOURCE_IDS) {
    const list = Array.isArray(steps[id]) ? (steps[id] as unknown[]) : []
    const seen = new Set<string>()
    for (const item of list) {
      const s = item as Partial<StepSpec> | null
      if (s && s.kind === 'given') continue
      if (!s || typeof s.id !== 'string' || !s.id || seen.has(s.id) || !(KINDS as readonly string[]).includes(s.kind as string)) continue
      const params: Record<string, string> = {}
      if (s.params && typeof s.params === 'object') for (const [k, v] of Object.entries(s.params)) if (typeof v === 'string') params[k] = v
      const spec = { id: s.id, kind: s.kind as StepKind, params }
      if (!makeStep(id, spec)) continue
      seen.add(spec.id)
      w.steps[id].push(spec)
    }
  }
  if (typeof r.blank === 'string') w.blank = r.blank.slice(0, 200)
  if (typeof r.format === 'string') w.format = r.format.slice(0, 30)
  if (Array.isArray(r.passed)) w.passed = passedInOrder(r.passed as unknown[])
  const p = r.peek as Partial<Peek> | null | undefined
  if (p && typeof p.kpi === 'string' && typeof p.chain === 'string' && typeof p.chainRevenue === 'string') w.peek = { kpi: p.kpi, chain: p.chain, chainRevenue: p.chainRevenue }
  w.dash = readDash(r.dash)
  w.more = readMore(r.more)
  w.refresh = readRefresh(r.refresh)
  if (r.p8 === true) w.p8 = true
  if (r.p7 === 'asked' || r.p7 === 'done') w.p7 = r.p7
  if (r.p4 === 'asked' || r.p4 === 'done') w.p4 = r.p4
  // saved by v0.32.0 or before: sales were connected with the first given step, which typed dates, numbers and names. Keep that step, and P4 to P6 count as done.
  const saved = Array.isArray(steps.sales) ? (steps.sales as Partial<StepSpec>[]) : []
  const hadFull = saved.some((x) => x?.kind === 'given' && x.params?.full === '1')
  if (hadFull || (w.connected.includes('sales') && r.v !== WORK_VERSION)) {
    w.steps.sales.unshift(GIVEN_FULL_SPEC)
    if (w.passed.includes('P3')) w.passed = passedInOrder([...w.passed, 'P5', 'P6'])
  }
  return w
}

/** Passed cards with no gaps: a card counts only if every card before it passed. */
export function passedInOrder(list: readonly unknown[]): CleanId[] {
  const out: CleanId[] = []
  for (const id of CLEAN_IDS) {
    if (!list.includes(id)) break
    out.push(id)
  }
  return out
}

/** The card to work on: the first one not passed; null when all four are. */
export const activeCard = (passed: readonly CleanId[]): CleanId | null => CLEAN_IDS.find((c) => !passed.includes(c)) ?? null

export const cleanDone = (passed: readonly CleanId[]) => CLEAN_IDS.every((c) => passed.includes(c))

// ---------------------------------------------------------------- diagnoses (3.3 to 3.5)

export interface Diagnosis {
  ok: boolean
  /** the line to show; null when passed */
  line: string | null
}

export interface P1Facts {
  /** SKUs not written the standard way */
  c1: number
  /** SKUs sold in the files that products can't find */
  c2: number
  /** sales rows without a product */
  rowsWithoutProduct: number
  /** rows different from the reference, both ways */
  diff: number
  /** SKUs that are not in capitals, SKUs with edge spaces (as they are in the table) */
  lowerLeft: string[]
  spacesLeft: string[]
  /** columns other than sku_code that a Trim or Uppercase step was put on */
  otherColumns: string[]
}

export function diagnoseP1(f: P1Facts): Diagnosis {
  if (f.c1 === 0 && f.c2 === 0 && f.diff === 0) return { ok: true, line: null }
  if (f.c1 > 0 && f.otherColumns.length > 0) return { ok: false, line: BUILD_DIAGNOSIS.skuWrongColumn(f.otherColumns[0]) }
  if (f.spacesLeft.length === 0 && f.lowerLeft.length > 0) return { ok: false, line: BUILD_DIAGNOSIS.skuCase(f.lowerLeft) }
  if (f.lowerLeft.length === 0 && f.spacesLeft.length > 0) return { ok: false, line: BUILD_DIAGNOSIS.skuSpaces(f.spacesLeft) }
  if (f.c2 > 0) return { ok: false, line: BUILD_DIAGNOSIS.skuMissing(f.c2, f.rowsWithoutProduct) }
  return { ok: false, line: BUILD_DIAGNOSIS.generic }
}

export interface P2Facts {
  rows: number
  /** copies still in (the check) */
  twice: number
  /** rows different from the reference, both ways */
  diff: number
  blank: string
  /** the blank was refused by the engine, with the message */
  error: string | null
}

export function diagnoseP2(f: P2Facts): Diagnosis {
  if (f.error) return { ok: false, line: BUILD_DIAGNOSIS.syntax(f.error, CLEAN_COLUMNS.sales.slice()) }
  if (f.twice === 0 && f.diff === 0) return { ok: true, line: null }
  if (/\braw_id\b/i.test(f.blank)) return { ok: false, line: DIAGNOSIS_RAW_ID }
  if (f.twice === 0) return { ok: false, line: TOO_SHORT(f.rows, 3000) }
  return { ok: false, line: BUILD_DIAGNOSIS.twice(f.twice) }
}

export interface P3Facts {
  rows: number
  /** customers still in twice (the check) */
  twice: number
  /** rows of the table not in the reference / reference rows missing from the table */
  notInRef: number
  refMissing: number
  /** the learner's steps on customers */
  steps: StepSpec[]
  /** the first stale store (Kaiyo #1017): its city in the table, its current city and date in the reference */
  sample: { name: string; city: string; refCity: string; refDate: string } | null
}

export function diagnoseP3(f: P3Facts): Diagnosis {
  if (f.twice === 0 && f.notInRef === 0 && f.refMissing === 0) return { ok: true, line: null }
  if (f.twice > 0 && f.steps.some((s) => s.kind === 'distinct')) return { ok: false, line: BUILD_DIAGNOSIS.distinctKeepsBoth(f.twice) }
  if (f.twice === 0 && f.rows < 144) {
    const key = [...f.steps].reverse().find((s) => s.kind === 'latest')?.params.key ?? 'that column'
    return { ok: false, line: BUILD_DIAGNOSIS.keyTooWide(key, f.rows) }
  }
  if (f.twice === 0 && f.sample && f.sample.city !== f.sample.refCity) {
    return { ok: false, line: BUILD_DIAGNOSIS.keptOldest(f.sample.name, f.sample.city, f.sample.refCity, f.sample.refDate) }
  }
  if (f.twice > 0) return { ok: false, line: BUILD_DIAGNOSIS.stillTwice(f.twice) }
  return { ok: false, line: BUILD_DIAGNOSIS.generic }
}

// the pipeline's lines, imported, not copied (3.4)
const DIAGNOSIS_RAW_ID = DIAGNOSIS_TEXT.rawId
const TOO_SHORT = DIAGNOSIS_TEXT.tooShort

export interface P7Facts {
  rows: number
  /** region_id is a number now */
  isNumber: boolean
  /** rows different from the reference, both ways (0 when the type is not a number yet) */
  diff: number
}

export function diagnoseP7(f: P7Facts): Diagnosis {
  if (!f.isNumber) return { ok: false, line: BUILD_DIAGNOSIS.regionText }
  if (f.rows === 16 && f.diff === 0) return { ok: true, line: null }
  return { ok: false, line: BUILD_DIAGNOSIS.generic }
}

// ---------------------------------------------------------------- P5, P6, P4 (spec 3.6)

/** Sales that have the first given step (saved work from v0.32.0): P5 and P6 pass on their own after P3. */
export const hasFullGiven = (work: Pick<BuildWork, 'steps'>) => work.steps.sales.some((s) => s.kind === 'given' && s.params.full === '1')

/** The passed cards after `id` passed; work with the first given step has nothing to do in P5 and P6, so P3 takes them along. */
export function passCard(work: Pick<BuildWork, 'passed' | 'steps'>, id: CleanId): CleanId[] {
  const next: CleanId[] = [...work.passed, id]
  if (id === 'P3' && hasFullGiven(work)) next.push('P5', 'P6')
  return passedInOrder(next)
}

export interface P5Facts {
  /** sale_date is a date now */
  isDate: boolean
  /** dates that are [Error]: there in the file, NULL now */
  errors: number
  /** three of them as they are in the file */
  samples: string[]
  /** dates different from the expected table (rows both have) */
  diff: number
  /** the P5 SQL is in the list, with this format; null when the plain Change type (or nothing) is */
  format: string | null
}

export function diagnoseP5(f: P5Facts): Diagnosis {
  if (!f.isDate) return { ok: false, line: BUILD_DIAGNOSIS.dateText }
  const n = f.errors.toLocaleString('en-US')
  if (f.errors > 0) {
    if (f.format === null) return { ok: false, line: BUILD_DIAGNOSIS.datePlain(n, f.samples) }
    if (/%m\s*\/\s*%d/.test(f.format)) return { ok: false, line: BUILD_DIAGNOSIS.dateMonthFirst(n) }
    return { ok: false, line: BUILD_DIAGNOSIS.dateStill(n, f.samples) }
  }
  if (f.diff > 0) return { ok: false, line: BUILD_DIAGNOSIS.dateWrongDay(f.diff.toLocaleString('en-US')) }
  return { ok: true, line: null }
}

export interface P6Facts {
  /** the column is still text */
  revenueText: boolean
  unitsText: boolean
  revenueErrors: number
  unitsErrors: number
  /** values different from the expected table (rows both have) */
  diff: number
}

export function diagnoseP6(f: P6Facts): Diagnosis {
  const text = [f.revenueText && 'revenue', f.unitsText && 'units'].filter((c): c is string => !!c)
  if (text.length) return { ok: false, line: BUILD_DIAGNOSIS.numberText(text) }
  const n = (x: number) => x.toLocaleString('en-US')
  if (f.revenueErrors > 0 && f.unitsErrors > 0) return { ok: false, line: BUILD_DIAGNOSIS.numberComma([`${n(f.revenueErrors)} revenues`, `${n(f.unitsErrors)} units`]) }
  if (f.revenueErrors > 0) return { ok: false, line: BUILD_DIAGNOSIS.numberOne('revenue', n(f.revenueErrors)) }
  if (f.unitsErrors > 0) return { ok: false, line: BUILD_DIAGNOSIS.numberOne('units', n(f.unitsErrors)) }
  if (f.diff > 0) return { ok: false, line: BUILD_DIAGNOSIS.numberOff(n(f.diff)) }
  return { ok: true, line: null }
}

export interface P4Facts {
  /** sales whose name finds no customer, and one of those names */
  unmatched: number
  sample: string | null
  /** names with spaces at the edges, names with Itiba */
  spaces: number
  itiba: number
  /** names different from the expected table (rows both have) */
  diff: number
  /** columns other than customer_name that a Trim or Replace values step was put on */
  otherColumns: string[]
}

export function diagnoseP4(f: P4Facts): Diagnosis {
  if (f.unmatched === 0 && f.diff === 0) return { ok: true, line: null }
  const n = (x: number) => x.toLocaleString('en-US')
  if (f.otherColumns.length > 0 && (f.unmatched > 0 || f.spaces > 0)) return { ok: false, line: BUILD_DIAGNOSIS.namesWrongColumn(f.otherColumns[0]) }
  if (f.spaces > 0) return { ok: false, line: BUILD_DIAGNOSIS.namesSpaces(n(f.spaces)) }
  if (f.itiba > 0) return { ok: false, line: BUILD_DIAGNOSIS.namesItiba(n(f.unmatched || f.itiba), f.sample ?? 'Itiba #…') }
  if (f.unmatched > 0) return { ok: false, line: BUILD_DIAGNOSIS.namesLeft(n(f.unmatched), f.sample ?? '?') }
  return { ok: false, line: BUILD_DIAGNOSIS.generic }
}
