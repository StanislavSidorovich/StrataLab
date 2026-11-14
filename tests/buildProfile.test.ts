// The column profile of Clean (design 3): numbers on the real parquet files at the given step and after the solved path.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { pct, profileHints, type ColumnProfile } from '../src/core/buildProfile'
import type { StepSpec } from '../src/core/buildSteps'
import { BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { clearProfiles, connect, prepare, profileAt } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'
import { DEDUP_SALES, SOLVED_SALES } from './buildSolved'

const require = createRequire(import.meta.url)
let port: SqlPort

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  const conn = db.connect()
  port = {
    query: async (sql) => resultRows(conn.query(sql)) as ResultData,
    registerText: async (name, text) => void db.registerFileText(name, text),
    parquet: async (folder, file) => resolve('public/datasets', folder, file).split(String.fromCharCode(92)).join('/'),
  }
  await prepare(port)
  for (const s of BUILD_SOURCES) await connect(port, s.id)
}, 180_000)

const sp = (id: string, kind: StepSpec['kind'], params: Record<string, string> = {}): StepSpec => ({ id, kind, params })
const by = (p: ColumnProfile[]) => Object.fromEntries(p.map((c) => [c.col, c]))

const row = (p: ColumnProfile[], col: string) => by(p)[col]
const nums = (c: ColumnProfile) => [c.n, c.valid, c.errors, c.empty, c.distinct, c.distinctNorm, c.padded, c.lowered]

describe('profile numbers (real files)', () => {
  it('sales at the given step: text dates and numbers, 919 padded names, 84 and 179 empty', async () => {
    const p = await profileAt(port, 'sales', [], 1)
    expect(nums(row(p, 'sale_date'))).toEqual([3110, 3110, 0, 0, 504, 504, 0, 0])
    expect(nums(row(p, 'customer_name'))).toEqual([3110, 3110, 0, 0, 104, 52, 919, 3110])
    expect(nums(row(p, 'sku_code'))).toEqual([3110, 3110, 0, 0, 29, 29, 0, 0])
    expect(nums(row(p, 'units'))).toEqual([3110, 3026, 0, 84, 68, 68, 0, 0])
    expect(nums(row(p, 'revenue'))).toEqual([3110, 2931, 0, 179, 2800, 2800, 0, 0])
    expect(profileHints('sales', row(p, 'customer_name')).map((h) => h.text)).toEqual(['52 extra spellings', 'leading/trailing spaces'])
  })
  it('sales as loaded (step 0): the SKUs still carry the lowercase the given step tidies', async () => {
    const p = await profileAt(port, 'sales', [], 0)
    expect(nums(row(p, 'sku_code'))).toEqual([3110, 3110, 0, 0, 58, 29, 0, 1091])
  })
  it('sales after the solved path: dedup, dates, numbers, names', async () => {
    const specs = [DEDUP_SALES, ...SOLVED_SALES]
    const p = await profileAt(port, 'sales', specs, 1 + specs.length)
    expect(nums(row(p, 'sale_date'))).toEqual([3000, 3000, 0, 0, 131, 131, 0, 0])
    expect(nums(row(p, 'customer_name'))).toEqual([3000, 3000, 0, 0, 45, 45, 0, 3000])
    expect(nums(row(p, 'units'))).toEqual([3000, 2918, 0, 82, 52, 52, 0, 0])
    expect(nums(row(p, 'revenue'))).toEqual([3000, 2826, 0, 174, 2768, 2768, 0, 0])
    expect(p.every((c) => c.errors === 0)).toBe(true)
  })
  it('sales after plain Change type: the dates, revenues and units that cannot be read are errors (P5, P6)', async () => {
    const specs = [sp('d1', 'type', { column: 'sale_date', to: 'date', sep: 'point' }), sp('d2', 'type', { column: 'revenue', to: 'decimal', sep: 'point' }), sp('d3', 'type', { column: 'units', to: 'whole', sep: 'point' })]
    const p = await profileAt(port, 'sales', specs, 4)
    expect(nums(row(p, 'sale_date')).slice(0, 4)).toEqual([3110, 1543, 1567, 0])
    expect(nums(row(p, 'revenue')).slice(0, 4)).toEqual([3110, 1466, 1465, 179])
    expect(nums(row(p, 'units')).slice(0, 4)).toEqual([3110, 2913, 113, 84])
    // an earlier step of the same list shows the table before the typing: no errors yet
    expect(row(await profileAt(port, 'sales', specs, 1), 'sale_date').errors).toBe(0)
    expect(row(await profileAt(port, 'sales', specs, 2), 'sale_date').errors).toBe(1567)
    expect(row(await profileAt(port, 'sales', specs, 2), 'revenue').errors).toBe(0)
  })
  it('products as given (P1): four padded SKUs, three in lowercase, none the same after trim + upper', async () => {
    const p = await profileAt(port, 'products', [], 0)
    expect(nums(row(p, 'sku_code'))).toEqual([47, 47, 0, 0, 47, 47, 4, 3])
    expect(profileHints('products', row(p, 'sku_code')).map((h) => h.text)).toEqual(['3 in lowercase', 'leading/trailing spaces'])
    expect(profileHints('products', row(p, 'category'))).toEqual([])
    expect(profileHints('products', row(p, 'product_name'))).toEqual([])
  })
  it('customers as given (P3): 148 rows for 144 customers; chain_name empty 73', async () => {
    const p = await profileAt(port, 'customers', [], 0)
    expect(nums(row(p, 'customer_id')).slice(0, 6)).toEqual([148, 148, 0, 0, 144, 144])
    expect(nums(row(p, 'chain_name')).slice(0, 4)).toEqual([148, 75, 0, 73])
  })
  it('regions as given (W, P7): R-03 style ids read as text with digits inside', async () => {
    const p = await profileAt(port, 'regions', [], 0)
    expect(nums(row(p, 'region_id')).slice(0, 6)).toEqual([17, 17, 0, 0, 16, 16])
    expect(profileHints('regions', row(p, 'region_id')).map((h) => h.text)).toEqual(['digits inside text'])
    expect(profileHints('regions', row(p, 'region_name'))).toEqual([])
  })
  it('the same step is read once (cache by SQL text)', async () => {
    const a = await profileAt(port, 'regions', [], 0)
    expect(await profileAt(port, 'regions', [], 0)).toBe(a)
    clearProfiles()
  })
  it('pct never shows a real share as 0 or 100', () => {
    expect(pct(0, 10)).toBe('0%')
    expect(pct(1, 1000)).toBe('<1%')
    expect(pct(999, 1000)).toBe('>99%')
    expect(pct(10, 10)).toBe('100%')
  })
  it('hints', () => {
    const base = { col: 'sku_code', family: 'text', n: 10, nonNull: 10, distinct: 8, distinctNorm: 5, padded: 2, lowered: 0, blank: 0, mixedDigits: 0, errors: 0, empty: 0, valid: 10 } as ColumnProfile
    expect(profileHints('products', base).map((h) => h.text)).toEqual(['3 extra spellings', 'leading/trailing spaces'])
    expect(profileHints('regions', { ...base, col: 'region_id', distinct: 5, padded: 0, mixedDigits: 10 }).map((h) => h.text)).toEqual(['digits inside text'])
    expect(profileHints('products', { ...base, col: 'sku_code', distinct: 5, padded: 0, mixedDigits: 10 })).toEqual([])
    expect(profileHints('sales', { ...base, family: 'number' })).toEqual([])
  })
})
