// The engine of the build-by-hand page (`#build=kaiyo-sales`): prepares schema `build_kaiyo`, registers the 33 files,
// connects a source, drops the work tables. Same port as the pipeline, so the page and the tests run the same code.
import { chainsKeyOff, diagnoseKpi, diagnoseLine, tileBlankProblem, tileRunSql, type TileDiagnosis } from '../core/buildDashboard'
import { compareResults, type ResultData } from '../core/check'
import { CLEAN_COLUMNS, chainSql, cleanDone, countsSql, diagnoseP1, diagnoseP2, diagnoseP3, diagnoseP4, diagnoseP5, diagnoseP6, diagnoseP7, stepErrorsSql, stepsOf, typedColumn, type BuildWork, type Diagnosis, type P1Facts, type P2Facts, type P3Facts, type P4Facts, type P5Facts, type P6Facts, type P7Facts, type Peek, type StepSpec } from '../core/buildSteps'
import { starStatements, typeFamily, type FoundFacts, type Link, type LinkFacts, type SideFacts, type Slot } from '../core/buildLinks'
import { readableError } from '../core/sqlPractice'
import { csvText } from '../core/csvText'
import { exportText, type SqlPort } from './pipelineRun'
import { BUILD_DASH_DIAGNOSIS, BUILD_SOURCES, CHECK_SQL, GIVEN_FULL_SQL, GIVEN_SQL, GOLD_SQL, REF_TILE_SQL, TILE_TABLE, type TileId, CONNECT_SQL, QUICK_LOOK_SQL, FILE_SQL, REF_SQL, SCHEMA, SOURCE_FOLDER, SOURCE_TABLES, T, WORK_TABLES, sourceById, type BuildSourceId } from '../data/build/kaiyoSales'

/** One preparation per port, shared by callers that arrive while it runs. */
const preparing = new WeakMap<SqlPort, Promise<string[]>>()

/**
 * Once per page open: the schema, `src_*` from Lab's parquet, `ref_*`, `file_*`, and the texts of 30 + 3 files.
 * Resolves with the names of the sales files.
 */
export function prepare(port: SqlPort, onStep?: (text: string) => void): Promise<string[]> {
  let p = preparing.get(port)
  if (!p) {
    p = prepareOnce(port, onStep)
    preparing.set(port, p)
    p.catch(() => preparing.delete(port))
  }
  return p
}

async function prepareOnce(port: SqlPort, onStep?: (text: string) => void): Promise<string[]> {
  onStep?.('Preparing the data…')
  await port.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`)
  for (const s of SOURCE_TABLES) {
    const name = await port.parquet(SOURCE_FOLDER, s.file)
    await port.query(`CREATE OR REPLACE TABLE ${T(s.table)} AS SELECT * FROM read_parquet('${name}')`)
  }
  for (const sql of REF_SQL) await port.query(sql)
  for (const sql of FILE_SQL) await port.query(sql)

  const files = (await port.query(`SELECT DISTINCT source_file FROM ${T('src_raw_sellout')} ORDER BY 1`)).rows.map((r) => String(r[0]))
  const names: string[] = []
  for (const file of files) {
    const rows = await port.query(
      `SELECT raw_id, sale_date, customer_name, sku_code, units, revenue FROM ${T('src_raw_sellout')} WHERE source_file = '${file.replace(/'/g, "''")}' ORDER BY raw_id`,
    )
    const name = `${SCHEMA}/sales/${file}`
    await port.registerText(name, exportText(rows.rows))
    names.push(name)
  }
  for (const s of BUILD_SOURCES) {
    if (!s.fileTable) continue
    const rows = await port.query(`SELECT ${s.columns.join(', ')} FROM ${T(s.fileTable)}`)
    await port.registerText(s.file, csvText(s.columns, rows.rows, s.delim))
  }
  return names
}

/** Connect: reads the source's file(s) into its bronze table; returns the rows. */
export async function connect(port: SqlPort, id: BuildSourceId): Promise<number> {
  const names = await prepare(port)
  const source = sourceById(id)
  await port.query(CONNECT_SQL(source, names))
  return Number((await port.query(`SELECT count(*) FROM ${T(source.bronze)}`)).rows[0][0])
}

/** Drops the work tables; the sources, references and files stay. */
export async function resetWork(port: SqlPort): Promise<void> {
  for (const t of WORK_TABLES) await port.query(`DROP TABLE IF EXISTS ${T(t)}`)
}

// ---------------------------------------------------------------- applied steps, previews, Quick look

/** Rebuilds `clean_<source>` from bronze through the learner's steps (the given one first, for sales); returns its rows. */
export async function applySteps(port: SqlPort, id: BuildSourceId, specs: readonly StepSpec[]): Promise<number> {
  const source = sourceById(id)
  try {
    await port.query(chainSql(id, stepsOf(id, specs)))
  } catch (e) {
    throw new Error(readableError(String(e instanceof Error ? e.message : e)).split('\n')[0])
  }
  return Number((await port.query(`SELECT count(*) FROM ${T(source.clean)}`)).rows[0][0])
}

/** The first rows of a table of the schema (a bronze or clean table). */
export const previewTable = (port: SqlPort, table: string, limit = 10): Promise<ResultData> => port.query(`SELECT * FROM ${T(table)} LIMIT ${limit}`)

/** The first rows of a source's file as it is on the desk (before Connect); sales: the first export. */
export async function previewFile(port: SqlPort, id: BuildSourceId): Promise<ResultData> {
  const names = await prepare(port)
  const source = sourceById(id)
  const file = id === 'sales' ? names[0] : source.file
  const extra = id === 'sales' ? ', all_varchar = true' : ''
  return port.query(`SELECT * FROM read_csv(['${file.replace(/'/g, "''")}'], delim = '${source.delim}', header = true${extra}) LIMIT 10`)
}

/** Column names and types of a table of the schema. */
export async function describeTable(port: SqlPort, table: string): Promise<{ name: string; type: string }[]> {
  const r = await port.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = '${table}' ORDER BY ordinal_position`)
  return r.rows.map((row) => ({ name: String(row[0]), type: String(row[1]) }))
}

export interface GoldTable {
  table: string
  columns: { name: string; type: string }[]
}

/** The tables of the star as they are now (every `gold_*` of the schema), the fact first, with their columns. */
export async function goldTables(port: SqlPort): Promise<GoldTable[]> {
  const r = await port.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND starts_with(table_name, 'gold_') ORDER BY table_name, ordinal_position`,
  )
  const by = new Map<string, GoldTable>()
  for (const [t, c, d] of r.rows) {
    const g = by.get(String(t)) ?? { table: String(t), columns: [] }
    g.columns.push({ name: String(c), type: String(d) })
    by.set(g.table, g)
  }
  return [...by.values()].sort((a, b) => Number(/fact/.test(b.table)) - Number(/fact/.test(a.table)) || a.table.localeCompare(b.table))
}

/** Quick look: the two numbers on the files as they came (needs all four sources connected). */
export async function quickLook(port: SqlPort): Promise<Peek> {
  const kpi = String((await port.query(QUICK_LOOK_SQL.kpi)).rows[0][0])
  const chain = (await port.query(QUICK_LOOK_SQL.chain)).rows[0]
  return { kpi, chain: String(chain[0]), chainRevenue: String(chain[1]) }
}

/** The page opens again: connects what was connected and rebuilds the clean tables from the saved steps. */
export async function restore(port: SqlPort, work: BuildWork, model: { links: readonly Link[]; star: boolean; done: boolean } = { links: [], star: false, done: cleanDone(work.passed) }): Promise<void> {
  await prepare(port)
  for (const id of work.connected) {
    await connect(port, id)
    await applySteps(port, id, work.steps[id])
  }
  // the star as it was last built: from the learner's links, or the first version's for a Model step done before the links
  if (model.star) await buildStar(port, model.links)
  else if (model.done) await buildStar(port)
}

// ---------------------------------------------------------------- the checks of P1 to P3 (3.3 to 3.5)

export interface CheckChip {
  label: string
  value: number | string
  ok: boolean
}

export interface CheckReport extends Diagnosis {
  chips: CheckChip[]
}

const num = async (port: SqlPort, sql: string) => Number((await port.query(sql)).rows[0][0])
const strings = async (port: SqlPort, sql: string) => (await port.query(sql)).rows.map((r) => String(r[0]))

/** Rows of `table` not in `ref` and rows of `ref` not in `table`, on the source's columns (`EXCEPT ALL` both ways). */
export async function diffAgainstRef(port: SqlPort, id: BuildSourceId, ref: string): Promise<{ extra: number; missing: number }> {
  const cols = CLEAN_COLUMNS[id].join(', ')
  const clean = T(sourceById(id).clean)
  const extra = await num(port, `SELECT count(*) FROM (SELECT ${cols} FROM ${clean} EXCEPT ALL SELECT ${cols} FROM ${T(ref)})`)
  const missing = await num(port, `SELECT count(*) FROM (SELECT ${cols} FROM ${T(ref)} EXCEPT ALL SELECT ${cols} FROM ${clean})`)
  return { extra, missing }
}

export async function factsP1(port: SqlPort, specs: readonly StepSpec[]): Promise<P1Facts> {
  const d = await diffAgainstRef(port, 'products', 'ref_products')
  return {
    c1: await num(port, CHECK_SQL.p1c1),
    c2: await num(port, CHECK_SQL.p1c2),
    rowsWithoutProduct: await num(port, CHECK_SQL.p1rows),
    diff: d.extra + d.missing,
    lowerLeft: await strings(port, `SELECT sku_code FROM ${T('clean_products')} WHERE sku_code <> upper(sku_code) ORDER BY product_id`),
    spacesLeft: await strings(port, `SELECT sku_code FROM ${T('clean_products')} WHERE sku_code <> trim(sku_code) ORDER BY product_id`),
    otherColumns: specs.filter((s) => (s.kind === 'trim' || s.kind === 'upper') && s.params.column !== 'sku_code').map((s) => s.params.column),
  }
}

export async function checkP1(port: SqlPort, specs: readonly StepSpec[]): Promise<CheckReport & { facts: P1Facts }> {
  const f = await factsP1(port, specs)
  const chips: CheckChip[] = [
    { label: 'SKUs not written the standard way', value: f.c1, ok: f.c1 === 0 },
    { label: 'SKUs sold that products cannot find', value: f.c2, ok: f.c2 === 0 },
    { label: 'Sales without a product', value: f.rowsWithoutProduct, ok: f.rowsWithoutProduct === 0 },
    { label: 'Rows different from the expected table', value: f.diff, ok: f.diff === 0 },
  ]
  return { ...diagnoseP1(f), chips, facts: f }
}

/**
 * Which sales stay: raw_ids of the clean sales not in the expected table, plus the expected ones missing. P2 is judged
 * on this, not on the values, because the dates and numbers are still text when P2 is done (they are P5 and P6).
 */
export async function diffSalesIds(port: SqlPort): Promise<number> {
  const clean = T('clean_sales')
  const ref = T('ref_sales')
  const extra = await num(port, `SELECT count(*) FROM (SELECT raw_id FROM ${clean} EXCEPT ALL SELECT raw_id FROM ${ref})`)
  const missing = await num(port, `SELECT count(*) FROM (SELECT raw_id FROM ${ref} EXCEPT ALL SELECT raw_id FROM ${clean})`)
  return extra + missing
}

export async function factsP2(port: SqlPort, blank: string, error: string | null): Promise<P2Facts> {
  return { rows: await num(port, `SELECT count(*) FROM ${T('clean_sales')}`), twice: await num(port, CHECK_SQL.p2), diff: await diffSalesIds(port), blank, error }
}

export async function checkP2(port: SqlPort, blank: string, error: string | null = null): Promise<CheckReport & { facts: P2Facts }> {
  const f = await factsP2(port, blank, error)
  const chips: CheckChip[] = [
    { label: 'Rows in clean sales', value: f.rows, ok: f.rows === 3000 },
    { label: 'Sales still in twice', value: f.twice, ok: f.twice === 0 },
    { label: 'Rows different from the expected table', value: f.diff, ok: f.diff === 0 },
  ]
  return { ...diagnoseP2(f), chips, facts: f }
}

export async function factsP3(port: SqlPort, specs: readonly StepSpec[]): Promise<P3Facts> {
  const d = await diffAgainstRef(port, 'customers', 'ref_customers')
  const s = (
    await port.query(
      `SELECT c.customer_name, c.city, r.city, CAST(r.updated_at AS VARCHAR) FROM ${T('clean_customers')} c JOIN ${T('ref_customers')} r USING (customer_id) WHERE c.customer_id = 17 ORDER BY c.updated_at LIMIT 1`,
    )
  ).rows[0]
  return {
    rows: await num(port, `SELECT count(*) FROM ${T('clean_customers')}`),
    twice: await num(port, CHECK_SQL.p3),
    notInRef: d.extra,
    refMissing: d.missing,
    steps: [...specs],
    sample: s ? { name: String(s[0]), city: String(s[1]), refCity: String(s[2]), refDate: String(s[3]) } : null,
  }
}

export async function checkP3(port: SqlPort, specs: readonly StepSpec[]): Promise<CheckReport & { facts: P3Facts }> {
  const f = await factsP3(port, specs)
  const chips: CheckChip[] = [
    { label: 'Customers still in twice', value: f.twice, ok: f.twice === 0 },
    { label: 'Rows not in the expected table', value: f.notInRef, ok: f.notInRef === 0 },
    { label: 'Expected rows missing', value: f.refMissing, ok: f.refMissing === 0 },
  ]
  return { ...diagnoseP3(f), chips, facts: f }
}

// ---------------------------------------------------------------- [Error] cells, P5, P6, P4 (spec 3.6)

/** The columns Change type can leave NULL on a value that was there: the three that arrive as text. */
export const ERROR_COLUMNS = ['sale_date', 'units', 'revenue'] as const
export type ErrorColumn = (typeof ERROR_COLUMNS)[number]

const BRONZE_JOIN = `${T('clean_sales')} c JOIN ${T('bronze_sales')} b ON CAST(b.raw_id AS INTEGER) = c.raw_id`

/** Per column: cells that are [Error], NULL now and there in the file. The clean table must exist. */
export async function salesErrors(port: SqlPort): Promise<Record<ErrorColumn, number>> {
  const r = (await port.query(`SELECT ${ERROR_COLUMNS.map((c) => `count(*) FILTER (WHERE c.${c} IS NULL AND b.${c} IS NOT NULL)`).join(', ')} FROM ${BRONZE_JOIN}`)).rows[0]
  return { sale_date: Number(r[0]), units: Number(r[1]), revenue: Number(r[2]) }
}

/**
 * What keeps the Dashboard locked (spec 3.6): [Error] cells, plus a column that is still text (a Change type step removed after Clean was done).
 * 0 when the sales are typed and clean.
 */
export async function salesLock(port: SqlPort): Promise<number> {
  const errs = Object.values(await salesErrors(port)).reduce((a, b) => a + b, 0)
  const cols = await describeTable(port, 'clean_sales')
  const family = (c: string) => typeFamily(cols.find((x) => x.name === c)?.type ?? '')
  const untyped = [family('sale_date') !== 'date', family('units') !== 'number', family('revenue') !== 'number'].filter(Boolean).length
  return errs + untyped
}

/** Rows with at least one [Error] cell. */
export const errorRows = async (port: SqlPort): Promise<number> =>
  num(port, `SELECT count(*) FROM ${BRONZE_JOIN} WHERE ${ERROR_COLUMNS.map((c) => `(c.${c} IS NULL AND b.${c} IS NOT NULL)`).join(' OR ')}`)

/** How many rows each step of the list turned into [Error] (0 for a step that cannot). */
export async function stepErrors(port: SqlPort, specs: readonly StepSpec[]): Promise<number[]> {
  const steps = stepsOf('sales', specs)
  if (!steps.some((s) => typedColumn(s))) return steps.map(() => 0)
  return (await port.query(stepErrorsSql(steps))).rows[0].map(Number)
}

export interface SalesPreview {
  data: ResultData
  /** the same shape as the rows: true where the cell is [Error] */
  errors: boolean[][]
  /** rows with an [Error] cell in the whole table */
  errorRows: number
}

/** The first rows of clean sales with the error mask; `onlyErrors` shows the rows that have one (Show error rows). */
export async function previewSales(port: SqlPort, onlyErrors: boolean, limit = 10): Promise<SalesPreview> {
  const cols = CLEAN_COLUMNS.sales
  const bad = ERROR_COLUMNS.map((c) => `(c.${c} IS NULL AND b.${c} IS NOT NULL)`)
  const r = await port.query(
    `SELECT ${cols.map((c) => `c.${c}`).join(', ')}, ${bad.map((b) => `CAST(${b} AS INTEGER)`).join(', ')} FROM ${BRONZE_JOIN} ${onlyErrors ? `WHERE ${bad.join(' OR ')}` : ''} ORDER BY c.raw_id LIMIT ${limit}`,
  )
  const idx = ERROR_COLUMNS.map((c) => cols.indexOf(c))
  const errors = r.rows.map((row) => cols.map((_, j) => { const k = idx.indexOf(j); return k >= 0 && Number(row[cols.length + k]) === 1 }))
  return { data: { ...r, header: [...cols], rows: r.rows.map((row) => row.slice(0, cols.length)) } as ResultData, errors, errorRows: await errorRows(port) }
}

const columnType = async (port: SqlPort, table: string, col: string) => (await describeTable(port, table)).find((c) => c.name === col)?.type ?? ''

/** Rows both the clean table and the expected one have, with another value in `col` (raw_id is the key). */
const valueDiff = (port: SqlPort, col: string) =>
  num(port, `SELECT count(*) FROM ${T('clean_sales')} c JOIN ${T('ref_sales')} r USING (raw_id) WHERE c.${col} IS DISTINCT FROM r.${col}`)

export async function checkP5(port: SqlPort, specs: readonly StepSpec[]): Promise<CheckReport & { facts: P5Facts }> {
  const isDate = typeFamily(await columnType(port, 'clean_sales', 'sale_date')) === 'date'
  const errors = isDate ? (await salesErrors(port)).sale_date : 0
  const samples = errors > 0 ? await strings(port, `SELECT DISTINCT b.sale_date FROM ${BRONZE_JOIN} WHERE c.sale_date IS NULL AND b.sale_date IS NOT NULL ORDER BY 1 LIMIT 3`) : []
  const diff = isDate ? await valueDiff(port, 'sale_date') : 0
  const dates = specs.find((s) => s.kind === 'dates')
  const f: P5Facts = { isDate, errors, samples, diff, format: dates ? (dates.params.format ?? '').trim() : null }
  const chips: CheckChip[] = [
    { label: 'sale_date is a date', value: isDate ? 'yes' : 'no', ok: isDate },
    { label: 'Errors', value: errors, ok: isDate && errors === 0 },
    { label: 'Dates different from the expected table', value: diff, ok: isDate && diff === 0 },
  ]
  if (isDate) {
    // the three spellings of the files, each counted as read
    const fam = (await port.query(
      `SELECT CASE WHEN b.sale_date LIKE '%.%' THEN 'dotted' WHEN b.sale_date LIKE '%/%' THEN 'slash' ELSE 'ISO' END AS f, count(*) AS n, count(c.sale_date) AS read FROM ${BRONZE_JOIN} GROUP BY 1 ORDER BY 1`,
    )).rows
    const read = fam.filter((x) => Number(x[1]) === Number(x[2])).length
    chips.push({ label: 'Spellings read', value: `${read} of ${fam.length}`, ok: read === fam.length })
  }
  return { ...diagnoseP5(f), chips, facts: f }
}

export async function checkP6(port: SqlPort): Promise<CheckReport & { facts: P6Facts }> {
  const [ut, rt] = await Promise.all([columnType(port, 'clean_sales', 'units'), columnType(port, 'clean_sales', 'revenue')])
  const unitsText = typeFamily(ut) !== 'number'
  const revenueText = typeFamily(rt) !== 'number'
  const err = await salesErrors(port)
  const diff = unitsText || revenueText ? 0 : (await valueDiff(port, 'units')) + (await valueDiff(port, 'revenue'))
  const f: P6Facts = { unitsText, revenueText, unitsErrors: unitsText ? 0 : err.units, revenueErrors: revenueText ? 0 : err.revenue, diff }
  const total = !revenueText && !unitsText ? await str(port, `SELECT CAST(sum(revenue) AS VARCHAR) FROM ${T('clean_sales')}`) : null
  const refTotal = await str(port, `SELECT CAST(sum(revenue) AS VARCHAR) FROM ${T('ref_sales')}`)
  const chips: CheckChip[] = [
    { label: 'revenue and units are numbers', value: unitsText || revenueText ? 'no' : 'yes', ok: !unitsText && !revenueText },
    { label: 'Errors in revenue', value: revenueText ? 0 : err.revenue, ok: !revenueText && err.revenue === 0 },
    { label: 'Errors in units', value: unitsText ? 0 : err.units, ok: !unitsText && err.units === 0 },
    { label: 'Revenue total matches the expected', value: total === null ? '–' : total === refTotal ? 'yes' : 'no', ok: total !== null && total === refTotal },
  ]
  return { ...diagnoseP6(f), chips, facts: f }
}

const str = async (port: SqlPort, sql: string): Promise<string | null> => {
  const v = (await port.query(sql)).rows[0][0]
  return v == null ? null : String(v)
}

export async function checkP4(port: SqlPort, specs: readonly StepSpec[]): Promise<CheckReport & { facts: P4Facts }> {
  const miss = `FROM ${T('clean_sales')} s WHERE NOT EXISTS (SELECT 1 FROM ${T('clean_customers')} c WHERE c.customer_name = s.customer_name)`
  const unmatched = await num(port, `SELECT count(*) ${miss}`)
  const f: P4Facts = {
    unmatched,
    sample: unmatched > 0 ? (await strings(port, `SELECT DISTINCT s.customer_name ${miss} ORDER BY 1 LIMIT 1`))[0] : null,
    spaces: await num(port, `SELECT count(*) FROM ${T('clean_sales')} WHERE customer_name <> trim(customer_name)`),
    itiba: await num(port, `SELECT count(*) FROM ${T('clean_sales')} WHERE customer_name LIKE '%Itiba%'`),
    diff: await valueDiff(port, 'customer_name'),
    otherColumns: specs.filter((s) => (s.kind === 'trim' || s.kind === 'replace') && s.params.column !== 'customer_name').map((s) => s.params.column),
  }
  const chips: CheckChip[] = [
    { label: 'Sales whose name finds no customer', value: f.unmatched, ok: f.unmatched === 0 },
    { label: 'Names with spaces at the edges', value: f.spaces, ok: f.spaces === 0 },
    { label: 'Names different from the expected table', value: f.diff, ok: f.diff === 0 },
  ]
  return { ...diagnoseP4(f), chips, facts: f }
}

// ---------------------------------------------------------------- Model v1 (4.1)

export interface StarFacts {
  fact: number
  customers: number
  customersSold: number
  products: number
  productsSold: number
  /** fact rows with no customer / no product */
  noCustomer: number
  noProduct: number
}

/** Builds the three gold tables from the clean ones (through the learner's links, or the first version's SQL) and counts them. */
export async function buildStar(port: SqlPort, links?: readonly Link[]): Promise<StarFacts> {
  for (const sql of (links && starStatements(links)) || GOLD_SQL) await port.query(sql)
  return starFacts(port)
}

/** The numbers of the star as it is now (after a build, or after a reload rebuilt it). */
export async function starFacts(port: SqlPort): Promise<StarFacts> {
  return {
    fact: await num(port, `SELECT count(*) FROM ${T('gold_fact_sales')}`),
    customers: await num(port, `SELECT count(*) FROM ${T('gold_dim_customer')}`),
    customersSold: await num(port, `SELECT count(DISTINCT customer_id) FROM ${T('gold_fact_sales')}`),
    products: await num(port, `SELECT count(*) FROM ${T('gold_dim_product')}`),
    productsSold: await num(port, `SELECT count(DISTINCT product_id) FROM ${T('gold_fact_sales')}`),
    noCustomer: await num(port, `SELECT count(*) FROM ${T('gold_fact_sales')} WHERE customer_id IS NULL`),
    noProduct: await num(port, `SELECT count(*) FROM ${T('gold_fact_sales')} WHERE product_id IS NULL`),
  }
}

// ---------------------------------------------------------------- Dashboard tiles (5.1 to 5.3)

/** The reference star and tiles, built from `ref_*` (once per port; they do not depend on the learner). */
const refBuilt = new WeakSet<SqlPort>()
export async function refTiles(port: SqlPort): Promise<void> {
  if (refBuilt.has(port)) return
  await prepare(port)
  for (const sql of REF_TILE_SQL) await port.query(sql)
  refBuilt.add(port)
}

export interface TileRun extends TileDiagnosis {
  /** what the tile shows (null when the SQL failed or was refused) */
  data: ResultData | null
}

/** Runs a tile's SQL with the blank written in, reads the table it made and judges it against the reference. */
export async function runTile(port: SqlPort, id: TileId, blank: string): Promise<TileRun> {
  const refused = tileBlankProblem(id, blank)
  if (refused) return { ok: false, line: refused, data: null }
  await refTiles(port)
  const table = T(TILE_TABLE[id])
  let error: string | null = null
  try {
    await port.query(tileRunSql(id, blank))
  } catch (e) {
    error = readableError(String(e instanceof Error ? e.message : e)).split('\n')[0]
  }
  if (error) {
    const d = id === 'kpi' ? diagnoseKpi({ value: null, match: false, error, blank }) : id === 'line' ? diagnoseLine({ points: 0, distinct: 0, diff: 0, error, blank }) : { ok: false, line: BUILD_DASH_DIAGNOSIS.syntax(error) }
    return { ...d, data: null }
  }
  const data = await port.query(`SELECT * FROM ${table}`)
  if (id === 'kpi') {
    const match = await num(port, `SELECT count(*) FROM ${table} t, ${T('ref_tile_kpi')} r WHERE t.revenue = r.revenue`)
    const rows = await num(port, `SELECT count(*) FROM ${table}`)
    const value = data.rows[0]?.[0]
    return { ...diagnoseKpi({ value: value == null ? null : String(value), match: match === 1 && rows === 1, error: null, blank }), data }
  }
  if (id === 'line') {
    const ref = T('ref_tile_line')
    const extra = await num(port, `SELECT count(*) FROM (SELECT revenue FROM ${table} EXCEPT ALL SELECT revenue FROM ${ref})`)
    const missing = await num(port, `SELECT count(*) FROM (SELECT revenue FROM ${ref} EXCEPT ALL SELECT revenue FROM ${table})`)
    const points = await num(port, `SELECT count(*) FROM ${table}`)
    const distinct = await num(port, `SELECT count(DISTINCT month) FROM ${table}`)
    return { ...diagnoseLine({ points, distinct, diff: extra + missing, error: null, blank }), data }
  }
  const expected = await port.query(`SELECT chain_name, revenue FROM ${T('ref_tile_chains')}`)
  const ok = compareResults(data, expected, true).ok
  return { ok, line: ok ? null : chainsKeyOff(blank) ? BUILD_DASH_DIAGNOSIS.chainsKey : BUILD_DASH_DIAGNOSIS.chainsOff, data }
}

// ---------------------------------------------------------------- P7: region ids as numbers (spec 2.6, linking screen 8)

export async function checkP7(port: SqlPort): Promise<CheckReport & { facts: P7Facts }> {
  const cols = await describeTable(port, 'clean_regions')
  const isNumber = typeFamily(cols.find((c) => c.name === 'region_id')?.type ?? '') === 'number'
  const d = isNumber ? await diffAgainstRef(port, 'regions', 'ref_regions') : { extra: 0, missing: 0 }
  const f: P7Facts = { rows: await num(port, `SELECT count(*) FROM ${T('clean_regions')}`), isNumber, diff: d.extra + d.missing }
  const chips: CheckChip[] = [
    { label: 'region_id is a number', value: isNumber ? 'yes' : 'no', ok: isNumber },
    { label: 'Rows different from the expected table', value: f.diff, ok: f.diff === 0 && isNumber },
  ]
  return { ...diagnoseP7(f), chips, facts: f }
}

// ---------------------------------------------------------------- the linking screen: facts of a pair (4.4)

const ident = (cols: { name: string }[], name: string) => {
  if (!cols.some((c) => c.name === name)) throw new Error(`No column ${name} in the table.`)
  return name
}

async function sideFacts(port: SqlPort, slot: Slot): Promise<SideFacts> {
  const cols = await describeTable(port, slot.table)
  const c = ident(cols, slot.column)
  const type = cols.find((x) => x.name === c)!.type
  const r = (
    await port.query(
      `SELECT count(*), count(${c}), count(DISTINCT ${c}), CAST(min(${c}) AS VARCHAR), CAST(max(${c}) AS VARCHAR),
              (SELECT count(*) FROM (SELECT ${c} FROM ${T(slot.table)} WHERE ${c} IS NOT NULL GROUP BY 1 HAVING count(*) > 1))
       FROM ${T(slot.table)}`,
    )
  ).rows[0]
  const samples = await strings(port, `SELECT DISTINCT ${c} FROM ${T(slot.table)} WHERE ${c} IS NOT NULL ORDER BY 1 LIMIT 3`)
  return { slot, type, total: Number(r[0]), rows: Number(r[1]), distinct: Number(r[2]), min: r[3] == null ? null : String(r[3]), max: r[4] == null ? null : String(r[4]), repeated: Number(r[5]), samples }
}

/** The numbers behind the four chips for "many refers to one" (4.4). Found is skipped when the types differ. */
export async function linkFacts(port: SqlPort, many: Slot, one: Slot): Promise<LinkFacts> {
  const [m, o] = await Promise.all([sideFacts(port, many), sideFacts(port, one)])
  const fm = typeFamily(m.type)
  if (fm !== typeFamily(o.type) || fm === 'other') return { many: m, one: o, found: null }
  const mt = T(many.table)
  const ot = T(one.table)
  const mc = many.column
  const oc = one.column
  const hasRevenue = (await describeTable(port, many.table)).some((c) => c.name === 'revenue' && typeFamily(c.type) === 'number')
  const miss = `FROM ${mt} m WHERE m.${mc} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${ot} o WHERE o.${oc} = m.${mc})`
  const u = (await port.query(`SELECT count(*), count(DISTINCT m.${mc})${hasRevenue ? ', CAST(sum(m.revenue) AS VARCHAR)' : ''} ${miss}`)).rows[0]
  const found: FoundFacts = {
    unmatchedRows: Number(u[0]),
    unmatchedValues: Number(u[1]),
    unmatchedRevenue: hasRevenue && u[2] != null && Number(u[0]) > 0 ? String(u[2]) : null,
    unmatchedSamples: Number(u[0]) > 0 ? await strings(port, `SELECT DISTINCT m.${mc} ${miss} ORDER BY 1 LIMIT 3`) : [],
    joinRows: await num(port, `SELECT count(*) FROM ${mt} m JOIN ${ot} o ON o.${oc} = m.${mc}`),
    oneUnused: await num(port, `SELECT count(DISTINCT o.${oc}) FROM ${ot} o WHERE NOT EXISTS (SELECT 1 FROM ${mt} m WHERE m.${mc} = o.${oc})`),
  }
  return { many: m, one: o, found }
}

export interface ChainPeek {
  /** rows after the join */
  rows: number
  /** the top three chains, January to June 2026 */
  top: [string, string][]
}

/** Decision 5 of the hub: what this pair would do to the chain table (needs sales in the many table and chain_name in the one). */
export async function linkPeek(port: SqlPort, many: Slot, one: Slot): Promise<ChainPeek | null> {
  const [mc, oc] = await Promise.all([describeTable(port, many.table), describeTable(port, one.table)])
  const has = (cols: { name: string }[], n: string) => cols.some((c) => c.name === n)
  if (!has(mc, 'sale_date') || !has(mc, 'revenue') || !has(oc, 'chain_name') || !has(mc, many.column) || !has(oc, one.column)) return null
  const from = `FROM ${T(many.table)} m JOIN ${T(one.table)} o ON o.${one.column} = m.${many.column}`
  const rows = await num(port, `SELECT count(*) ${from}`)
  if (rows === 0) return null
  const r = await port.query(
    `SELECT coalesce(o.chain_name, 'no chain'), CAST(sum(m.revenue) AS VARCHAR) ${from}
     WHERE m.sale_date >= DATE '2026-01-01' AND m.sale_date < DATE '2026-07-01' GROUP BY 1 ORDER BY sum(m.revenue) DESC, 1 LIMIT 3`,
  )
  return { rows, top: r.rows.map((x) => [String(x[0]), String(x[1])]) }
}

// ---------------------------------------------------------------- Clean: how many rows each step leaves, and the rows it is about

/** Rows of the source's bronze table, then after each step of the list (the given step first for sales). */
export async function stepCounts(port: SqlPort, id: BuildSourceId, specs: readonly StepSpec[]): Promise<number[]> {
  return (await port.query(countsSql(id, stepsOf(id, specs)))).rows[0].map(Number)
}

export interface AffectedRows {
  /** the rows of the problem as they are in the file (after the given step for sales) */
  file: ResultData
  /** the same rows in the clean table now */
  now: ResultData
  /** how many sales / stores the problem is about */
  groups: number
}

const SALE_KEY = 'sale_date, customer_name, sku_code'
/** Four copies of the problem are enough to see it: the first four by key. */
const SHOWN_GROUPS = 4

/** P2: the sales sent twice. P3: the stores in customers.csv twice. Both from the rows as they came, and as the clean table has them. */
export async function affectedRows(port: SqlPort, card: 'P2' | 'P3'): Promise<AffectedRows> {
  if (card === 'P3') {
    const dup = `SELECT customer_id FROM ${T('bronze_customers')} GROUP BY customer_id HAVING count(*) > 1`
    const rows = (table: string) => port.query(`SELECT * FROM ${T(table)} WHERE customer_id IN (${dup}) ORDER BY customer_id, updated_at`)
    return { file: await rows('bronze_customers'), now: await rows('clean_customers'), groups: await num(port, `SELECT count(*) FROM (${dup})`) }
  }
  // the rows "as they came": through the given step the clean table has (the first version's also typed the dates)
  const typed = (await describeTable(port, 'clean_sales')).find((c) => c.name === 'sale_date')?.type === 'DATE'
  const given = (typed ? GIVEN_FULL_SQL : GIVEN_SQL).replace('{prev}', T('bronze_sales'))
  const dup = `SELECT ${SALE_KEY} FROM g GROUP BY ${SALE_KEY} HAVING count(*) > 1`
  const rows = (from: string) =>
    port.query(
      `WITH g AS (${given}), d AS (${dup} ORDER BY ${SALE_KEY} LIMIT ${SHOWN_GROUPS})
       SELECT t.* FROM ${from} t JOIN d USING (${SALE_KEY}) ORDER BY ${SALE_KEY}, raw_id`,
    )
  return { file: await rows('g'), now: await rows(T('clean_sales')), groups: await num(port, `WITH g AS (${given}) SELECT count(*) FROM (${dup})`) }
}
