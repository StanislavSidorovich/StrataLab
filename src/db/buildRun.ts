// The engine of the build-by-hand page (`#build=kaiyo-sales`): prepares schema `build_kaiyo`, registers the 33 files,
// connects a source, drops the work tables. Same port as the pipeline, so the page and the tests run the same code.
import { diagnoseKpi, diagnoseLine, tileBlankProblem, tileSql, type TileDiagnosis } from '../core/buildDashboard'
import { compareResults, type ResultData } from '../core/check'
import { CLEAN_COLUMNS, chainSql, cleanDone, diagnoseP1, diagnoseP2, diagnoseP3, stepsOf, type BuildWork, type Diagnosis, type P1Facts, type P2Facts, type P3Facts, type Peek, type StepSpec } from '../core/buildSteps'
import { readableError } from '../core/sqlPractice'
import { csvText } from '../core/csvText'
import { exportText, type SqlPort } from './pipelineRun'
import { BUILD_DASH_DIAGNOSIS, BUILD_SOURCES, CHECK_SQL, GOLD_SQL, REF_TILE_SQL, TILE_TABLE, type TileId, CONNECT_SQL, QUICK_LOOK_SQL, FILE_SQL, REF_SQL, SCHEMA, SOURCE_FOLDER, SOURCE_TABLES, T, WORK_TABLES, sourceById, type BuildSourceId } from '../data/build/kaiyoSales'

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

/** Quick look: the two numbers on the files as they came (needs all four sources connected). */
export async function quickLook(port: SqlPort): Promise<Peek> {
  const kpi = String((await port.query(QUICK_LOOK_SQL.kpi)).rows[0][0])
  const chain = (await port.query(QUICK_LOOK_SQL.chain)).rows[0]
  return { kpi, chain: String(chain[0]), chainRevenue: String(chain[1]) }
}

/** The page opens again: connects what was connected and rebuilds the clean tables from the saved steps. */
export async function restore(port: SqlPort, work: BuildWork): Promise<void> {
  await prepare(port)
  for (const id of work.connected) {
    await connect(port, id)
    await applySteps(port, id, work.steps[id])
  }
  if (cleanDone(work.passed)) await buildStar(port)
}

// ---------------------------------------------------------------- the checks of P1 to P3 (3.3 to 3.5)

export interface CheckChip {
  label: string
  value: number
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

export async function factsP2(port: SqlPort, blank: string, error: string | null): Promise<P2Facts> {
  const d = await diffAgainstRef(port, 'sales', 'ref_sales')
  return { rows: await num(port, `SELECT count(*) FROM ${T('clean_sales')}`), twice: await num(port, CHECK_SQL.p2), diff: d.extra + d.missing, blank, error }
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

/** Builds the three gold tables from the clean ones and counts them. */
export async function buildStar(port: SqlPort): Promise<StarFacts> {
  for (const sql of GOLD_SQL) await port.query(sql)
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
    await port.query(tileSql(id, blank))
  } catch (e) {
    error = readableError(String(e instanceof Error ? e.message : e)).split('\n')[0]
  }
  if (error) {
    const d = id === 'kpi' ? diagnoseKpi({ value: null, match: false, error, blank }) : id === 'line' ? diagnoseLine({ points: 0, distinct: 0, diff: 0, error, blank }) : { ok: false, line: error }
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
  return { ok, line: ok ? null : BUILD_DASH_DIAGNOSIS.chainsOff, data }
}
