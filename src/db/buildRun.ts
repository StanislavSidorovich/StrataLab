// The engine of the build-by-hand page (`#build=kaiyo-sales`): prepares schema `build_kaiyo`, registers the 33 files,
// connects a source, drops the work tables. Same port as the pipeline, so the page and the tests run the same code.
import { csvText } from '../core/csvText'
import { exportText, type SqlPort } from './pipelineRun'
import { BUILD_SOURCES, CONNECT_SQL, FILE_SQL, REF_SQL, SCHEMA, SOURCE_FOLDER, SOURCE_TABLES, T, WORK_TABLES, sourceById, type BuildSourceId } from '../data/build/kaiyoSales'

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
