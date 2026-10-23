// A SQL Server script as PowerDesigner writes it (tests/fixtures/powerdesigner-sqlserver.sql, made up for
// this test) goes through the real translator and runs in DuckDB-WASM, as the T-SQL tab does.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { SQLGLOT_VERSION, type TranslatedStatement } from '../src/dialects/tsql'
import { foldKeys, runOrder } from '../src/core/pdScript'
import { qualifyDrops } from '../src/core/scriptDataset'

const require = createRequire(import.meta.url)
const SCRIPT = readFileSync('tests/fixtures/powerdesigner-sqlserver.sql', 'utf8').replace(/\r\n/g, '\n')

let py: PyodideInterface
let duck: { query: (sql: string) => { numRows: number; toArray: () => { toJSON: () => Record<string, unknown> }[] } }

function translate(script: string): TranslatedStatement[] {
  py.globals.set('_script', script)
  return foldKeys(JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')))
}

beforeAll(async () => {
  py = await loadPyodide()
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  duck = db.connect()
}, 60_000)

const rows = (sql: string) => duck.query(sql).toArray().map((r) => r.toJSON())
const runScript = (statements: TranslatedStatement[]) => runOrder(statements).forEach((s) => duck.query(s))

describe('PowerDesigner SQL Server script', () => {
  it('reads every statement and leaves nothing it cannot run', () => {
    const st = translate(SCRIPT)
    expect(st.filter((s) => s.error)).toEqual([])
    expect(st.filter((s) => s.target === '').length).toBe(4 + 4) // the four guarded foreign key drops and the four folded ALTERs
  })

  it('runs, twice in a row (the guarded drops make the second run start clean)', () => {
    const st = translate(SCRIPT)
    runScript(st)
    runScript(st)
    expect(rows("SELECT table_name FROM duckdb_tables() ORDER BY 1").map((r) => r.table_name)).toEqual(['CUSTOMER', 'ORDERS', 'ORDER_LINE', 'PRODUCT'])
    expect(rows("SELECT index_name FROM duckdb_indexes() ORDER BY 1").map((r) => r.index_name)).toEqual(['PLACES_FK'])
  })

  it('keeps the foreign keys, so they still block', () => {
    duck.query("INSERT INTO CUSTOMER (FULL_NAME, JOINED_ON) VALUES ('Ana', '2026-01-01')")
    expect(() => duck.query("INSERT INTO ORDERS (IDCUSTOMER, ORDER_DATE, STATUS) VALUES (999, '2026-01-02', 'Open')")).toThrow(/foreign key|Constraint/i)
    expect(() => duck.query('DELETE FROM CUSTOMER')).not.toThrow()
    expect(rows("SELECT count(*)::int AS n FROM duckdb_constraints() WHERE constraint_type = 'FOREIGN KEY'")[0].n).toBe(4)
  })

  it('numbers IDENTITY columns by itself', () => {
    duck.query("INSERT INTO CUSTOMER (FULL_NAME, JOINED_ON) VALUES ('Bo', '2026-01-03'), ('Cy', '2026-01-04')")
    const ids = rows('SELECT IDCUSTOMER::int AS IDCUSTOMER FROM CUSTOMER ORDER BY 1').map((r) => Number(r.IDCUSTOMER))
    expect(ids[1] - ids[0]).toBe(1)
  })

  it('keeps the descriptions as comments', () => {
    expect(rows("SELECT comment FROM duckdb_columns() WHERE table_name = 'ORDERS' AND column_name = 'STATUS'")[0].comment).toBe('Open, Paid, Shipped')
    expect(rows("SELECT comment FROM duckdb_tables() WHERE table_name = 'PRODUCT'")[0].comment).toBe('Items we sell')
  })

  it('runs the tables with the referenced ones first and the drops the other way round', () => {
    const order = runOrder(translate(SCRIPT))
    const at = (re: RegExp) => order.findIndex((s) => re.test(s))
    expect(at(/DROP TABLE IF EXISTS ORDER_LINE/)).toBeLessThan(at(/DROP TABLE IF EXISTS ORDERS/))
    expect(at(/DROP TABLE IF EXISTS ORDERS/)).toBeLessThan(at(/DROP TABLE IF EXISTS CUSTOMER/))
    expect(at(/DROP TABLE IF EXISTS CUSTOMER/)).toBeLessThan(at(/CREATE TABLE CUSTOMER/))
    expect(at(/CREATE TABLE CUSTOMER/)).toBeLessThan(at(/CREATE TABLE ORDERS/))
    expect(at(/CREATE TABLE ORDERS/)).toBeLessThan(at(/CREATE TABLE ORDER_LINE/))
    expect(at(/CREATE TABLE ORDER_LINE/)).toBeLessThan(at(/CREATE INDEX PLACES_FK/))
  })


  it('runs into a dataset: the tables land in its schema and the search path comes back', () => {
    duck.query('CREATE SCHEMA ds')
    duck.query('CREATE SCHEMA demo')
    duck.query("SET search_path = 'ds'")
    runOrder(translate(SCRIPT)).forEach((s) => duck.query(qualifyDrops(s, 'ds')))
    duck.query("SET search_path = 'main,demo'")
    expect(rows("SELECT schema_name, count(*)::int AS n FROM duckdb_tables() WHERE schema_name IN ('main', 'ds') GROUP BY 1 ORDER BY 1")).toEqual([{ schema_name: 'ds', n: 4 }, { schema_name: 'main', n: 4 }])
    // the foreign keys are inside the dataset and still block
    expect(() => duck.query("INSERT INTO ds.ORDERS (IDCUSTOMER, ORDER_DATE, STATUS) VALUES (999, '2026-01-02', 'Open')")).toThrow(/foreign key|Constraint/i)
  })

  it('leaves an ordinary script alone', () => {
    const st = translate('CREATE TABLE a (id INT PRIMARY KEY)\nGO\nINSERT INTO a VALUES (1)')
    expect(st.every((s) => s.rank === undefined)).toBe(true)
    expect(runOrder(st).length).toBe(2)
  })
})
