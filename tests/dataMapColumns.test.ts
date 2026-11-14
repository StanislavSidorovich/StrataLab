// The "The data" panel of both practice books lists each table's columns by hand.
// This test reads the real parquet schemas (DuckDB-WASM in Node) and fails when a list drifts:
// a missing, extra or reordered column. Fix the list in src/data/{sqlPractice,pyPractice}/s00-data.ts.
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DATA_MAP as SQL_MAP } from '../src/data/sqlPractice/s00-data'
import { DATA_MAP as PY_MAP } from '../src/data/pyPractice/s00-data'

const require = createRequire(import.meta.url)
const dir = resolve('public/datasets/quaera')

describe('data map columns match the parquet files', () => {
  const real: Record<string, string[]> = {}

  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    const conn = db.connect()
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.parquet'))) {
      const path = resolve(dir, f).replace(/\\/g, '/')
      const rows = conn.query(`SELECT name FROM parquet_schema('${path}') WHERE num_children IS NULL`).toArray() as { name: string }[]
      real[f.replace(/\.parquet$/, '')] = rows.map((r) => r.name)
    }
  }, 60_000)

  for (const [book, map] of [['SQL', SQL_MAP], ['Python', PY_MAP]] as const) {
    it(`${book} practice lists every column of each table, in file order`, () => {
      const tables = map.blocks.flatMap((b) => (b.kind === 'tables' ? b.tables : []))
      expect(tables.length).toBeGreaterThan(0)
      for (const t of tables) {
        expect(real[t.name], `${t.name} has no parquet file`).toBeDefined()
        expect(t.columns, t.name).toEqual(real[t.name])
      }
    })
  }
})
