// The engine of the build-by-hand page (`#build=kaiyo-sales`): prepares schema `build_kaiyo`, registers the 33 files,
// connects a source, drops the work tables. Same port as the pipeline, so the page and the tests run the same code.
import type { ResultData } from '../core/check'
import { chainSql, stepsOf, type BuildWork, type Peek, type StepSpec } from '../core/buildSteps'
import { readableError } from '../core/sqlPractice'
import { csvText } from '../core/csvText'
import { exportText, type SqlPort } from './pipelineRun'
import { BUILD_SOURCES, CONNECT_SQL, QUICK_LOOK_SQL, FILE_SQL, REF_SQL, SCHEMA, SOURCE_FOLDER, SOURCE_TABLES, T, WORK_TABLES, sourceById, type BuildSourceId } from '../data/build/kaiyoSales'

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
}
