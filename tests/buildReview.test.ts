// A4 and A5 of the Answer step: the reconciliation on the real parquet files, and the rules of the picks.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { reconTruth, reviewA4, reviewA5, type ReconFacts } from '../src/core/buildReview'
import { readDash } from '../src/core/buildDashboard'
import { BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { RIGHT_SALES } from './buildSolved'
import { applySteps, buildStar, connect, prepare } from '../src/db/buildRun'
import { reconFacts } from '../src/db/buildRecon'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

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
    parquet: async (folder, file) => resolve('public/datasets', folder, file).replace(/\\/g, '/'),
  }
  await prepare(port)
  for (const s of BUILD_SOURCES) await connect(port, s.id)
  await applySteps(port, 'sales', RIGHT_SALES)
  await applySteps(port, 'customers', [{ id: 's1', kind: 'latest', params: { key: 'customer_id', order: 'updated_at', direction: 'newest' } }])
  await applySteps(port, 'products', [{ id: 's1', kind: 'trim', params: { column: 'sku_code' } }, { id: 's2', kind: 'upper', params: { column: 'sku_code' } }])
  await buildStar(port)
}, 180_000)

describe('A4: do the chains add up to the tile?', () => {
  it('reads 314,906.13 in all, 313,843.13 in the bars, 1,063.00 in 7 sales of customers with no chain', async () => {
    const f = await reconFacts(port)
    expect(f).toEqual({ total: 314906.13, chained: 313843.13, noChain: 1063, noCustomer: 0, noChainSales: 7, noCustomerSales: 0 })
    expect(reconTruth(f)).toBe('less')
  })
  it('judges the pick and says where the gap sits', async () => {
    const f = await reconFacts(port)
    expect(reviewA4('less', f).ok).toBe(true)
    expect(reviewA4('exact', f).ok).toBe(false)
    expect(reviewA4('more', f).ok).toBe(false)
    const text = reviewA4('exact', f).lines.join(' ')
    expect(text).toContain('313,843.13')
    expect(text).toContain('314,906.13')
    expect(text).toContain('1,063.00')
    expect(text).toContain('7 sales')
  })
  it('counts sales with no customer too, and a perfect match', () => {
    const f: ReconFacts = { total: 100, chained: 60, noChain: 30, noCustomer: 10, noChainSales: 3, noCustomerSales: 2 }
    expect(reviewA4('less', f).lines.join(' ')).toContain('no customer at all')
    const same: ReconFacts = { total: 100, chained: 100, noChain: 0, noCustomer: 0, noChainSales: 0, noCustomerSales: 0 }
    expect(reconTruth(same)).toBe('exact')
    expect(reviewA4('exact', same).ok).toBe(true)
  })
})

describe('A5: the line for the Head of Sales', () => {
  it('only the line with the right period and a supported finding is right', () => {
    expect(reviewA5('full').ok).toBe(true)
    expect(reviewA5('quarter').ok).toBe(false)
    expect(reviewA5('carries').ok).toBe(false)
    expect(reviewA5('quarter').line).toMatch(/period/i)
    expect(reviewA5('carries').line).toMatch(/conclusion/i)
  })
  it('the picks are kept in the dashboard work and unreadable ones dropped', () => {
    expect(readDash({ review: { a4: 'less', a5: 'full' } }).review).toEqual({ a4: 'less', a5: 'full' })
    expect(readDash({ review: { a4: 'maybe', a5: 3 } }).review).toEqual({ a4: '', a5: '' })
    expect(readDash({}).review).toEqual({ a4: '', a5: '' })
  })
})
