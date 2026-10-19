import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEMO_COLUMNS, DEMO_SCHEMA, DEMO_SQL, DEMO_TABLES, PYTHON_STARTER, SEARCH_PATH_SQL, WELCOME_SQL } from '../src/data/demo'
import { demoToMigrate, type CatalogTable } from '../src/core/demoMigration'

const shop = (schema: string): CatalogTable[] => DEMO_TABLES.map((name) => ({ schema, name, kind: 'table', columns: DEMO_COLUMNS[name] }))

describe('Demo shop: its own schema', () => {
  it('DEMO_COLUMNS is what DEMO_SQL creates', () => {
    for (const t of DEMO_TABLES) {
      const start = DEMO_SQL.indexOf(`CREATE TABLE ${DEMO_SCHEMA}.${t} (`)
      expect(start, t).toBeGreaterThan(-1)
      const body = DEMO_SQL.slice(start, DEMO_SQL.indexOf('\n);', start))
      const cols = body
        .split('\n')
        .map((l) => /^\s{2}(\w+)\s+[A-Z]/.exec(l)?.[1])
        .filter((c): c is string => !!c && !['PRIMARY'].includes(c))
      expect(cols, t).toEqual(DEMO_COLUMNS[t])
    }
  })
  it('creates, fills and queries only demo.<table>, and touches nothing in main', () => {
    expect(DEMO_SQL).toMatch(/CREATE SCHEMA IF NOT EXISTS demo/)
    expect(DEMO_SQL).not.toMatch(/(CREATE TABLE|DROP TABLE IF EXISTS|INSERT INTO|REFERENCES|FROM) (?!demo\.|range|\()\w/)
    expect(WELCOME_SQL).toContain('FROM demo.orders')
    expect(PYTHON_STARTER).toContain('lab.table("demo.orders")')
    expect(SEARCH_PATH_SQL).toBe("SET search_path = 'main,demo'")
  })
})

describe('Demo shop: moving the old one from main', () => {
  it('moves the four tables of an old database, once', () => {
    expect(demoToMigrate(shop('main'))).toEqual(DEMO_TABLES)
    expect(demoToMigrate([...shop('main'), ...shop('demo')])).toEqual([])
  })
  it('leaves a database alone that has the new shop already, or nothing', () => {
    expect(demoToMigrate(shop('demo'))).toEqual([])
    expect(demoToMigrate([])).toEqual([])
  })
  it('does not touch the user’s own tables with the same names', () => {
    const mine = shop('main').map((t) => (t.name === 'orders' ? { ...t, columns: ['id', 'total'] } : t))
    expect(demoToMigrate(mine)).toEqual([])
    expect(demoToMigrate(shop('main').slice(0, 3))).toEqual([])
    expect(demoToMigrate(shop('main').map((t) => (t.name === 'orders' ? { ...t, kind: 'view' as const } : t)))).toEqual([])
  })
  it('compares column names without caring about case', () => {
    expect(demoToMigrate(shop('main').map((t) => ({ ...t, columns: t.columns.map((c) => c.toUpperCase()) })))).toEqual(DEMO_TABLES)
  })
})

const require = createRequire(import.meta.url)

describe('Demo shop: bare names still work (search_path, in a real DuckDB)', () => {
  let conn: { query: (sql: string) => { numRows: number; get: (i: number) => Record<string, unknown> | null } }
  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    conn = db.connect()
    conn.query(DEMO_SQL)
    conn.query(SEARCH_PATH_SQL)
  }, 60_000)
  const n = (sql: string) => Number(conn.query(sql).get(0)?.n)

  it('demo.orders and a bare orders are the same table', () => {
    expect(n('SELECT count(*) AS n FROM demo.orders')).toBe(1500)
    expect(n('SELECT count(*) AS n FROM orders')).toBe(1500)
    expect(n('SELECT count(*) AS n FROM orders o JOIN order_items i USING (order_id) JOIN products p USING (product_id)')).toBeGreaterThan(1500)
  })
  it('a table of the user’s own in main wins over the shop’s, and new tables land in main', () => {
    conn.query('CREATE TABLE customers AS SELECT 1 AS id')
    expect(n('SELECT count(*) AS n FROM customers')).toBe(1)
    expect(n('SELECT count(*) AS n FROM demo.customers')).toBe(200)
    expect(n("SELECT count(*) AS n FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = 'customers'")).toBe(1)
    conn.query('DROP TABLE customers')
    expect(n('SELECT count(*) AS n FROM customers')).toBe(200)
  })
})
