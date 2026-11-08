// Б2 of the build-by-hand page: the files and the references (spec docs/build-kaiyo-sales-spec.md, 2.1 to 2.5),
// on the real parquet files in duckdb-node-blocking, as tests/pipeline.test.ts does.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { csvText } from '../src/core/csvText'
import { resultRows } from '../src/db/export'
import { connect, prepare, resetWork } from '../src/db/buildRun'
import { prepare as preparePipeline } from '../src/db/pipelineRun'
import type { SqlPort } from '../src/db/pipelineRun'
import { BUILD_SOURCES, CONNECT_SQL, WORK_TABLES, sourceById } from '../src/data/build/kaiyoSales'

const require = createRequire(import.meta.url)

describe('csvText', () => {
  it('writes a header, NULL as empty, numbers as they are', () => {
    expect(csvText(['a', 'b', 'c'], [[1, null, 'x'], [38, 2.5, '2026-01-31']])).toBe('a,b,c\n1,,x\n38,2.5,2026-01-31\n')
  })
  it('quotes edge spaces, the delimiter, quotes and line breaks', () => {
    expect(csvText(['s'], [['FRUV002 '], [' KROS001'], ['a,b'], ['say "hi"'], ['l1\nl2'], ['mid space']])).toBe('s\n"FRUV002 "\n" KROS001"\n"a,b"\n"say ""hi"""\n"l1\nl2"\nmid space\n')
  })
  it('quotes the other delimiter only when it is the delimiter', () => {
    expect(csvText(['s'], [['a,b'], ['a;b']], ';')).toBe('s\na,b\n"a;b"\n')
  })
})

let port: SqlPort
const texts = new Map<string, string>()
let calls = 0

const n = async (sql: string) => Number((await port.query(sql)).rows[0][0])

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  const conn = db.connect()
  port = {
    query: async (sql) => resultRows(conn.query(sql)) as ResultData,
    registerText: async (name, text) => {
      calls++
      texts.set(name, text)
      db.registerFileText(name, text)
    },
    parquet: async (folder, file) => resolve('public/datasets', folder, file).replace(/\\/g, '/'),
  }
  await prepare(port)
}, 180_000)

describe('build files: prepare', () => {
  it('registers 33 texts and a second call reuses the first', async () => {
    expect(calls).toBe(33)
    expect([...texts.keys()].filter((k) => k.startsWith('build_kaiyo/sales/export_'))).toHaveLength(30)
    const a = prepare(port)
    const b = prepare(port)
    expect(a).toBe(b)
    await a
    expect(calls).toBe(33)
  })

  it('has the rows of the files and of the references', async () => {
    expect([await n('SELECT count(*) FROM build_kaiyo.src_raw_sellout'), await n('SELECT count(*) FROM build_kaiyo.file_customers'), await n('SELECT count(*) FROM build_kaiyo.file_products'), await n('SELECT count(*) FROM build_kaiyo.file_regions')]).toEqual([3110, 148, 47, 17])
    expect([await n('SELECT count(*) FROM build_kaiyo.ref_sales'), await n('SELECT count(*) FROM build_kaiyo.ref_customers'), await n('SELECT count(*) FROM build_kaiyo.ref_products'), await n('SELECT count(*) FROM build_kaiyo.ref_regions')]).toEqual([3000, 144, 47, 16])
    for (const s of BUILD_SOURCES) expect(s.fileRows === s.cleanRows || s.fileRows > s.cleanRows).toBe(true)
  })

  it('writes the 30 sales texts as the pipeline does', async () => {
    await preparePipeline(port)
    const mine = [...texts.entries()].filter(([k]) => k.startsWith('build_kaiyo/sales/'))
    expect(mine).toHaveLength(30)
    for (const [k, text] of mine) {
      const theirs = texts.get('pipe_kaiyo/' + k.slice('build_kaiyo/sales/'.length))
      expect(theirs, k).toBeDefined()
      expect(text, k).toBe(theirs)
    }
  })
})

describe('build files: Connect', () => {
  it('connects the four sources with the row counts and types of 2.5', async () => {
    const rows: Record<string, number> = {}
    for (const s of BUILD_SOURCES) rows[s.id] = await connect(port, s.id)
    expect(rows).toEqual({ sales: 3110, customers: 148, products: 47, regions: 17 })
    const types = async (t: string) => (await port.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'build_kaiyo' AND table_name = '${t}' ORDER BY ordinal_position`)).rows.map((r) => `${r[0]}:${r[1]}`)
    expect(await types('bronze_sales')).toEqual(['raw_id', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue', 'source_file'].map((c) => `${c}:VARCHAR`))
    expect(await types('bronze_customers')).toEqual(['customer_id:BIGINT', 'customer_name:VARCHAR', 'customer_type:VARCHAR', 'chain_name:VARCHAR', 'region_id:BIGINT', 'city:VARCHAR', 'is_active:BIGINT', 'updated_at:DATE'])
    expect(await types('bronze_products')).toEqual(['product_id:BIGINT', 'sku_code:VARCHAR', 'product_name:VARCHAR', 'brand:VARCHAR', 'category:VARCHAR', 'list_price:BIGINT'])
    expect(await types('bronze_regions')).toEqual(['region_id:VARCHAR', 'region_name:VARCHAR', 'macro_region:VARCHAR'])
  })

  it('reads each file back equal to its file table (EXCEPT ALL both ways = 0)', async () => {
    for (const id of ['customers', 'products', 'regions'] as const) {
      const s = sourceById(id)
      const cols = s.columns.join(', ')
      expect(await n(`SELECT count(*) FROM (SELECT ${cols} FROM build_kaiyo.${s.bronze} EXCEPT ALL SELECT ${cols} FROM build_kaiyo.${s.fileTable})`), `${id} extra`).toBe(0)
      expect(await n(`SELECT count(*) FROM (SELECT ${cols} FROM build_kaiyo.${s.fileTable} EXCEPT ALL SELECT ${cols} FROM build_kaiyo.${s.bronze})`), `${id} missing`).toBe(0)
    }
  })

  it('reads sales back equal to the raw rows (raw_id as INTEGER)', async () => {
    const mine = `SELECT CAST(raw_id AS INTEGER) AS raw_id, source_file, sale_date, customer_name, sku_code, units, revenue FROM build_kaiyo.bronze_sales`
    const raw = `SELECT CAST(raw_id AS INTEGER) AS raw_id, source_file, sale_date, customer_name, sku_code, units, revenue FROM build_kaiyo.src_raw_sellout`
    expect(await n(`SELECT count(*) FROM (${mine} EXCEPT ALL ${raw})`)).toBe(0)
    expect(await n(`SELECT count(*) FROM (${raw} EXCEPT ALL ${mine})`)).toBe(0)
    expect(await n(`SELECT count(DISTINCT source_file) FROM build_kaiyo.bronze_sales`)).toBe(30)
    expect(await n(`SELECT count(*) FROM build_kaiyo.bronze_sales WHERE NOT regexp_full_match(source_file, 'export_[0-9]{4}-[0-9]{2}[.]csv')`)).toBe(0)
  })

  it('keeps the edge spaces of products and the stale customers', async () => {
    expect(await n(`SELECT count(*) FROM build_kaiyo.bronze_products WHERE sku_code <> trim(sku_code)`)).toBe(4)
    expect(await n(`SELECT count(*) FROM build_kaiyo.bronze_products WHERE sku_code <> upper(sku_code)`)).toBe(3)
    expect(await n(`SELECT count(*) FROM (SELECT customer_id FROM build_kaiyo.bronze_customers GROUP BY 1 HAVING count(*) > 1)`)).toBe(4)
    expect(await n(`SELECT count(*) FROM build_kaiyo.bronze_regions WHERE region_id = 'R-03'`)).toBe(2)
  })

  it('writes a Connect statement with explicit names and no glob', () => {
    const sql = CONNECT_SQL(sourceById('sales'), ['a/b.csv', "o'k.csv"])
    expect(sql).toContain("['a/b.csv', 'o''k.csv']")
    expect(sql).not.toContain('*.csv')
  })
})

describe('build files: resetWork', () => {
  it('drops the work tables and keeps src, ref and file', async () => {
    await resetWork(port)
    const left = (await port.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'build_kaiyo' ORDER BY 1`)).rows.map((r) => String(r[0]))
    for (const t of WORK_TABLES) expect(left).not.toContain(t)
    expect(left.filter((t) => /^(src|ref|file)_/.test(t))).toHaveLength(4 + 4 + 3)
    expect(await connect(port, 'regions')).toBe(17)
  })
})
