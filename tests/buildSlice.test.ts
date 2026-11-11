// The slicers of the build dashboard (spec 5.6): the rewrite and the views on the real star, the tile SQL under a slicer,
// and K6, answered with the slicers only.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { NO_SLICE, notSliced, rewriteSql, sliceLine, sliceOn, sliceStatements, slicerAdds, toggleSlice, type SliceFilter, type SliceVariant } from '../src/core/buildSlice'
import { tileSql } from '../src/core/buildDashboard'
import { checkMoreAnswer } from '../src/core/buildMore'
import type { StepSpec } from '../src/core/buildSteps'
import type { ResultData } from '../src/core/check'
import { BUILD_SOURCES, MORE_QUESTIONS, moreQuestion } from '../src/data/build/kaiyoSales'
import { EXPECTED_LINKS } from '../src/data/build/linkData'
import { RIGHT_SALES } from './buildSolved'
import { applySteps, buildStar, connect, prepare, resetWork } from '../src/db/buildRun'
import { slicedSql, sliceValues, withSlice } from '../src/db/buildSlice'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)

describe('the filter', () => {
  it('a click selects, the same click clears, the other slicer stays', () => {
    let f = toggleSlice(NO_SLICE, 'chain', 'Minori')
    expect(f).toEqual({ chain: 'Minori', brand: null })
    f = toggleSlice(f, 'brand', 'Aqualis')
    expect(sliceLine(f)).toBe('Chain = Minori · Brand = Aqualis')
    f = toggleSlice(f, 'chain', 'Nagisa')
    expect(f.chain).toBe('Nagisa')
    expect(toggleSlice(toggleSlice(NO_SLICE, 'brand', 'Krosti'), 'brand', 'Krosti')).toEqual(NO_SLICE)
    expect(sliceOn(NO_SLICE)).toBe(false)
    expect(sliceLine(NO_SLICE)).toBeNull()
  })
})

describe('the rewrite', () => {
  it('renames the three tables, in any case, spaced or quoted', () => {
    const r = rewriteSql('SELECT 1 FROM BUILD_KAIYO.Gold_Fact_Sales f JOIN build_kaiyo . gold_dim_customer c ON 1=1 JOIN "build_kaiyo"."gold_dim_product" p ON 1=1')
    expect(r.sql).toBe('SELECT 1 FROM slice.gold_fact_sales f JOIN slice.gold_dim_customer c ON 1=1 JOIN slice.gold_dim_product p ON 1=1')
    expect(r.tables).toEqual(['gold_fact_sales', 'gold_dim_customer', 'gold_dim_product'])
  })
  it('the variant without the chain slicer reads slice_nochain', () => {
    expect(rewriteSql('SELECT * FROM build_kaiyo.gold_dim_customer', 'nochain').sql).toBe('SELECT * FROM slice_nochain.gold_dim_customer')
  })
  it('leaves other tables and look-alikes alone, and says "not sliced"', () => {
    expect(rewriteSql('SELECT * FROM build_kaiyo.clean_sales').sql).toBe('SELECT * FROM build_kaiyo.clean_sales')
    expect(notSliced('SELECT * FROM build_kaiyo.clean_sales')).toBe(true)
    expect(notSliced('SELECT * FROM build_kaiyo.gold_fact_sales_old')).toBe(true)
    expect(notSliced('SELECT * FROM x.build_kaiyo.gold_fact_sales')).toBe(true)
    expect(notSliced('SELECT * FROM build_kaiyo.gold_fact_sales')).toBe(false)
  })
  it('the SQL it runs shows the renamed tables and the WHERE of the views', () => {
    const text = slicerAdds(tileSql('chains', 'customer_id'), { chain: 'Minori', brand: "O'Brand" }, 'nochain')
    expect(text).toContain('build_kaiyo.gold_fact_sales → slice_nochain.gold_fact_sales')
    expect(text).toContain("brand = 'O''Brand'")
    expect(text).not.toContain("chain_name = 'Minori'")
    expect(slicerAdds('SELECT 1', NO_SLICE)).toMatch(/do not reach/)
  })
})

let port: SqlPort
const sp = (kind: StepSpec['kind'], params: Record<string, string> = {}, id = 's1'): StepSpec => ({ id, kind, params })
const run = async (sql: string): Promise<ResultData> => port.query(sql)
const sliced = (sql: string, f: SliceFilter, variant: SliceVariant = 'all') => withSlice(port, f, () => run(slicedSql(sql, variant)))
const star = () => buildStar(port, EXPECTED_LINKS.filter((e) => e.pass === 1).map((e) => ({ id: e.id, many: { ...e.many }, one: { ...e.one } })) as never)

describe('on the real star', () => {
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
    await applySteps(port, 'sales', RIGHT_SALES)
    await applySteps(port, 'customers', [sp('latest', { key: 'customer_id', order: 'updated_at', direction: 'newest' })])
    await applySteps(port, 'products', [sp('trim', { column: 'sku_code' }, 's1'), sp('upper', { column: 'sku_code' }, 's2')])
    await applySteps(port, 'regions', [sp('distinct', {}, 's1'), sp('extract', { column: 'region_id' }, 's2')])
    await star()
  }, 180_000)

  it('the slicer values come from the dimensions', async () => {
    const v = await sliceValues(port)
    expect(v.chains).toContain('Minori')
    expect(v.chains).toHaveLength(12)
    expect(v.brands).toHaveLength(9)
  })
  it('no filter: the tiles read the same numbers as without the slicer', async () => {
    const kpi = tileSql('kpi', 'SUM(revenue)')
    const plain = Number((await run(kpi)).rows[0][0])
    expect(Number((await sliced(kpi, NO_SLICE)).rows[0][0])).toBe(plain)
    expect(plain).toBeCloseTo(314906.13, 2)
  })
  it('Chain = Minori: the revenue tile is Minori, the chains tile (nochain) keeps every chain', async () => {
    const f = { chain: 'Minori', brand: null }
    expect(Number((await sliced(tileSql('kpi', 'SUM(revenue)'), f)).rows[0][0])).toBeCloseTo(90829.5, 2)
    const bars = (await sliced(tileSql('chains', 'customer_id'), f, 'nochain')).rows
    expect(bars).toHaveLength(5)
    expect(bars[0][0]).toBe('Minori')
    const own = (await sliced(tileSql('chains', 'customer_id'), f)).rows
    expect(own.map((r) => r[0])).toEqual(['Minori'])
  })
  it('the Brand slicer also acts on the chains bars', async () => {
    const bars = (await sliced(tileSql('chains', 'customer_id'), { chain: 'Minori', brand: 'Aqualis' }, 'nochain')).rows
    expect(bars.length).toBeGreaterThan(3)
    expect(Number(bars.find((r) => r[0] === 'Minori')![1])).toBeCloseTo(24519.83, 2)
  })
  it('K2 pinned: the brands under Chain = Minori', async () => {
    const r = (await sliced(moreQuestion('K2').solution, { chain: 'Minori', brand: null })).rows
    expect(r.map((x) => [x[0], Number(x[1])]).slice(0, 2)).toEqual([['Fruvia', 27013.69], ['Aqualis', 24519.83]])
  })
  it('a filter that matches nothing is an empty table, not an error', async () => {
    const r = await sliced(tileSql('chains', 'customer_id'), { chain: 'Prima', brand: 'Rhinolar' })
    expect(r.rows).toEqual([])
  })
  it('views are replaced one after the other: each job reads its own filter', async () => {
    const kpi = tileSql('kpi', 'SUM(revenue)')
    const all = await Promise.all([sliced(kpi, { chain: 'Minori', brand: null }), sliced(kpi, { chain: 'Nagisa', brand: null }), sliced(kpi, NO_SLICE)])
    const n = all.map((r) => Number(r.rows[0][0]))
    expect(n[0]).toBeCloseTo(90829.5, 2)
    expect(n[1]).toBeCloseTo(87647.48, 2)
    expect(n[2]).toBeCloseTo(314906.13, 2)
  })
  it('the star can be rebuilt while the views exist', async () => {
    await withSlice(port, { chain: 'Minori', brand: null }, async () => undefined)
    await star()
    expect(sliceStatements(NO_SLICE)).toHaveLength(8)
    expect(Number((await sliced(tileSql('kpi', 'SUM(revenue)'), { chain: 'Minori', brand: null })).rows[0][0])).toBeCloseTo(90829.5, 2)
  })
  it('K6: 24,519.83 with Chain = Minori and Brand = Aqualis, as the slicer says', async () => {
    const q = moreQuestion('K6')
    expect(q.slicers).toEqual({ chain: 'Minori', brand: 'Aqualis' })
    const v = Number((await sliced(tileSql('kpi', 'SUM(revenue)'), q.slicers!)).rows[0][0])
    expect(v).toBeCloseTo(q.right.value, 2)
    expect(checkMoreAnswer('K6', { pick: '', number: '24,519.83' }).ok).toBe(true)
    expect(checkMoreAnswer('K6', { pick: '', number: '90829.5' }).line).toMatch(/Brand slicer/)
    expect(checkMoreAnswer('K6', { pick: '', number: '80977.09' }).line).toMatch(/Chain slicer/)
    expect(MORE_QUESTIONS.at(-1)!.id).toBe('K6')
  })
  it('Start over drops the slices with the other work tables', async () => {
    await resetWork(port)
    await expect(run('SELECT * FROM slice.gold_fact_sales')).rejects.toThrow()
  })
})
