// Runs T-SQL on the real demo and Kaiyo rows the way Lab does (sqlglot translates, DuckDB executes), for the lesson tests.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { loadPyodide } from 'pyodide'
import type { ResultData } from '../../src/core/check'
import { resultRows } from '../../src/db/export'
import { datasetById } from '../../src/data/datasets'
import { DEMO_SQL } from '../../src/data/demo'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../../src/dialects/tsql'

const require = createRequire(import.meta.url)

export type Attempt = ResultData | { error: string }
export const isError = (r: Attempt): r is { error: string } => 'error' in r

export interface Runner {
  /** the result of a T-SQL script, or the error text */
  attempt: (sql: string) => Attempt
  /** the first cell of a query's first row (for numbers a question states) */
  one: (sql: string) => ResultData['rows'][0][0]
}

export async function makeRunner(): Promise<Runner> {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  const duck: { query: (sql: string) => Parameters<typeof resultRows>[0] } = db.connect()
  for (const s of DEMO_SQL.split(';\n').map((x) => x.trim()).filter(Boolean)) duck.query(s)
  duck.query('CREATE SCHEMA quaera')
  for (const t of datasetById('quaera')!.tables) duck.query(`CREATE TABLE quaera."${t.name}" AS SELECT * FROM read_parquet('${resolve('public/datasets/quaera', t.file).replace(/\\/g, '/')}')`)
  const py = await loadPyodide()
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  const attempt = (sql: string): Attempt => {
    py.globals.set('_script', sql)
    const t = JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')) as TranslatedStatement[]
    if (t.some((s) => s.error)) return { error: t.find((s) => s.error)!.error! }
    try {
      return resultRows(duck.query(duckdbScript(t)))
    } catch (e) {
      return { error: String(e) }
    }
  }
  return { attempt, one: (sql) => (attempt(sql) as ResultData).rows[0][0] }
}
