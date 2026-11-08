// Applied steps of the build page (spec docs/build-kaiyo-sales-spec.md, 2.6 and 3.3 to 3.5): a step is a SELECT that reads
// `{prev}`; the clean table of a source is rebuilt from bronze through the whole list. Pure: the engine part is
// src/db/buildRun.ts. What is kept in localStorage is only {id, kind, params}; the SQL is written again on reading.
import { CLEAN_IDS, GIVEN_SQL, SCHEMA, sourceById, type BuildSourceId, type CleanId } from '../data/build/kaiyoSales'
import { checkBlank } from './pipeline'

export type StepKind = 'given' | 'distinct' | 'latest' | 'trim' | 'upper' | 'dedup'

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

// ---------------------------------------------------------------- the generators

/** The column list of the step before, with one column replaced by an expression. */
function replaceColumn(cols: readonly string[], col: string, expr: string): string {
  return `SELECT ${cols.map((c) => (c === col ? `${expr} AS ${c}` : c)).join(', ')}\nFROM {prev}`
}

export const distinctSql = () => 'SELECT DISTINCT * FROM {prev}'
export const trimSql = (cols: readonly string[], col: string) => replaceColumn(cols, col, `trim(${col})`)
export const upperSql = (cols: readonly string[], col: string) => replaceColumn(cols, col, `upper(${col})`)

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
      return source === 'sales' ? { ...base, label: 'Changed type (given): dates, numbers, names', sql: GIVEN_SQL, given: true } : null
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
    case 'latest': {
      const key = col('key')
      const order = col('order')
      const newest = spec.params.direction !== 'oldest'
      return key && order ? { ...base, label: `Kept the ${newest ? 'newest' : 'oldest'} row per ${key} (by ${order})`, sql: latestSql(cols, key, order, newest), given: false } : null
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
  const all = source === 'sales' ? [GIVEN_SPEC, ...specs.filter((s) => s.kind !== 'given')] : specs.filter((s) => s.kind !== 'given')
  return all.map((s) => makeStep(source, s)).filter((s): s is Step => !!s)
}

const nameOf = (i: number) => (i === 0 ? 'bronze' : `step${i}`)

/** A step's SQL with `{prev}` replaced by the name of the step before it. */
export const shownSql = (steps: readonly Step[], i: number) => steps[i].sql.replace('{prev}', nameOf(i))

/** The statement that rebuilds `clean_<source>` from bronze through the steps (2.6). */
export function chainSql(source: BuildSourceId, steps: readonly Step[]): string {
  const s = sourceById(source)
  const indent = (t: string) => t.split('\n').map((l) => '    ' + l).join('\n')
  const ctes = [`bronze AS (SELECT * FROM ${SCHEMA}.${s.bronze})`, ...steps.map((_, i) => `step${i + 1} AS (\n${indent(shownSql(steps, i))}\n  )`)]
  return `CREATE OR REPLACE TABLE ${SCHEMA}.${s.clean} AS\nWITH ${ctes.join(',\n     ')}\nSELECT * FROM ${nameOf(steps.length)}`
}

// ---------------------------------------------------------------- changing the list

export function nextId(specs: readonly StepSpec[]): string {
  const n = Math.max(0, ...specs.map((s) => Number(/^s(\d+)$/.exec(s.id)?.[1] ?? 0)))
  return `s${n + 1}`
}

/** Adds a step at the end; P2's step replaces the one that is there. */
export function addSpec(specs: readonly StepSpec[], kind: StepKind, params: Record<string, string> = {}): StepSpec[] {
  const base = kind === 'dedup' ? specs.filter((s) => s.kind !== 'dedup') : specs
  return [...base, { id: nextId(specs), kind, params }]
}

export const removeSpec = (specs: readonly StepSpec[], id: string): StepSpec[] => specs.filter((s) => s.id !== id)

// ---------------------------------------------------------------- what is kept (state of the work)

export interface Peek {
  kpi: string
  chain: string
  chainRevenue: string
}

export interface BuildWork {
  /** sources whose Connect was done (rebuilt when the page opens) */
  connected: BuildSourceId[]
  /** the learner's steps per source (not the given one) */
  steps: Record<BuildSourceId, StepSpec[]>
  /** the blank of P2 */
  blank: string
  /** Clean cards passed, in order */
  passed: CleanId[]
  /** the Quick look numbers, kept to be shown again */
  peek: Peek | null
}

export const emptyWork = (): BuildWork => ({ connected: [], steps: { sales: [], customers: [], products: [], regions: [] }, blank: '', passed: [], peek: null })

const KINDS: readonly StepKind[] = ['distinct', 'latest', 'trim', 'upper', 'dedup']

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
  if (Array.isArray(r.passed)) w.passed = passedInOrder(r.passed as unknown[])
  const p = r.peek as Partial<Peek> | null | undefined
  if (p && typeof p.kpi === 'string' && typeof p.chain === 'string' && typeof p.chainRevenue === 'string') w.peek = { kpi: p.kpi, chain: p.chain, chainRevenue: p.chainRevenue }
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
