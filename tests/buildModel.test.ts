// Б5a of the build page: every row of docs/build-linking-screen.md 4.3 through `linkFacts` on the real parquet files in
// duckdb-node-blocking, with the clean tables built by the page's own SQL in each state; and the star made from the links.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { diagnoseLink, type DiagKey, type LinkDiagnosis, type LinkFacts, type Slot } from '../src/core/buildLinks'
import type { StepSpec } from '../src/core/buildSteps'
import { EXPECTED_LINKS, type Pass } from '../src/data/build/linkData'
import { BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { applySteps, buildStar, checkP7, connect, linkFacts, linkPeek, prepare, runTile } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)

let port: SqlPort
const n = async (sql: string) => Number((await port.query(sql)).rows[0][0])

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
}, 180_000)

const sp = (kind: StepSpec['kind'], params: Record<string, string> = {}, id = 's1'): StepSpec => ({ id, kind, params })
interface State {
  sales: StepSpec[]
  customers: StepSpec[]
  products: StepSpec[]
  regions: StepSpec[]
}
const RIGHT: State = {
  sales: [sp('dedup', { blank: 'sale_date, customer_name, sku_code' })],
  customers: [sp('latest', { key: 'customer_id', order: 'updated_at', direction: 'newest' })],
  products: [sp('trim', { column: 'sku_code' }, 's1'), sp('upper', { column: 'sku_code' }, 's2')],
  regions: [sp('distinct', {}, 's1'), sp('extract', { column: 'region_id' }, 's2')],
}
async function setUp(s: State) {
  for (const id of ['sales', 'customers', 'products', 'regions'] as const) await applySteps(port, id, s[id])
}
const slot = (t: string, c: string): Slot => ({ table: t, column: c })
async function check(many: Slot, one: Slot, pass: Pass = 1): Promise<{ f: LinkFacts; d: LinkDiagnosis }> {
  const f = await linkFacts(port, many, one)
  return { f, d: diagnoseLink(f, pass) }
}
const cs = (c: string) => slot('clean_sales', c)
const cc = (c: string) => slot('clean_customers', c)
const cp = (c: string) => slot('clean_products', c)
const cr = (c: string) => slot('clean_regions', c)

describe('pass 1 in the right state (4.3)', () => {
  beforeAll(() => setUp(RIGHT), 60_000)

  it('L1: 3,000 rows, 144 customers, nothing unmatched, 99 unused', async () => {
    const { f, d } = await check(cs('customer_name'), cc('customer_name'))
    expect(d.key).toBe('pass')
    expect([f.many.rows, f.one.rows, f.one.distinct, f.found!.unmatchedRows, f.found!.joinRows, f.found!.oneUnused]).toEqual([3000, 144, 144, 0, 3000, 99])
    expect(d.notes[0]).toMatch(/^99 of 144 customers have no sales/)
  })
  it('L2: 3,000 rows, 47 products, 18 unused', async () => {
    const { f, d } = await check(cs('sku_code'), cp('sku_code'))
    expect(d.key).toBe('pass')
    expect([f.one.rows, f.one.distinct, f.found!.unmatchedRows, f.found!.joinRows, f.found!.oneUnused]).toEqual([47, 47, 0, 3000, 18])
    expect(d.notes[0]).toMatch(/^18 of 47 products have no sales/)
  })
  it('L3 after P7: 144 rows, 16 regions, passes', async () => {
    const { f, d } = await check(cc('region_id'), cr('region_id'))
    expect(d.key).toBe('pass')
    expect([f.many.rows, f.one.rows, f.found!.unmatchedRows, f.found!.joinRows, f.found!.oneUnused]).toEqual([144, 16, 0, 144, 0])
    expect(d.notes).toEqual([])
  })
  it('the three swapped: wrongWay with the numbers of 4.3', async () => {
    const a = await check(cc('customer_name'), cs('customer_name'))
    expect(a.d.key).toBe('wrongWay')
    expect([a.f.one.rows, a.f.one.distinct, a.f.found!.unmatchedRows]).toEqual([3000, 45, 99])
    expect(a.d.line).toMatch(/^sales\.customer_name repeats: 3,000 rows, only 45 different values/)
    const b = await check(cp('sku_code'), cs('sku_code'))
    expect(b.d.key).toBe('wrongWay')
    expect([b.f.one.distinct, b.f.found!.unmatchedRows]).toEqual([29, 18])
    const c = await check(cr('region_id'), cc('region_id'))
    expect(c.d.key).toBe('wrongWay')
    expect([c.f.one.rows, c.f.one.distinct, c.f.found!.unmatchedRows]).toEqual([144, 16, 0])
  })
  it('wrong columns: noMatch with samples, a type mismatch, unmatched on cities', async () => {
    const chain = await check(cs('customer_name'), cc('chain_name'))
    expect(chain.d.key).toBe('noMatch')
    expect([chain.f.one.rows, chain.f.one.distinct, chain.f.found!.unmatchedRows, chain.f.found!.unmatchedValues, chain.f.found!.joinRows, chain.f.found!.oneUnused]).toEqual([71, 12, 3000, 45, 0, 12])
    expect(chain.d.line).toMatch(/^Not one row of sales\.customer_name finds a partner in customers\.chain_name: 'Ichiba #1026'/)
    expect(chain.d.line).toMatch(/against 'Bazario', 'Farmalux', 'Hakobu'/)
    const city = await check(cs('customer_name'), cc('city'))
    expect(city.d.key).toBe('noMatch')
    expect([city.f.one.rows, city.f.one.distinct, city.f.found!.oneUnused]).toEqual([144, 31, 31])
    const name = await check(cs('sku_code'), cp('product_name'))
    expect(name.d.key).toBe('noMatch')
    expect([name.f.found!.unmatchedValues, name.f.found!.oneUnused]).toEqual([29, 47])
    const types = await check(cc('region_id'), cr('region_name'))
    expect(types.d.key).toBe('typeMismatch')
    expect(types.f.found).toBeNull()
    expect(types.d.chips[2].state).toBe('skip')
    const cities = await check(cc('city'), cr('region_name'))
    expect(cities.d.key).toBe('unmatched')
    expect([cities.f.found!.unmatchedRows, cities.f.found!.unmatchedValues, cities.f.found!.joinRows, cities.f.found!.oneUnused]).toEqual([89, 21, 55, 6])
  })
  it('two ids by chance in pass 1 are caught by Right pair too', async () => {
    const { d } = await check(cp('product_id'), cc('customer_id'))
    expect(d.ok).toBe(false)
    expect(['sameByChance', 'unmatched']).toContain(d.key)
  })
  it('the same table is refused', async () => {
    expect((await check(cs('customer_name'), cs('sku_code'))).d.key).toBe('sameTable')
  })
  it('P7 check passes in the right state', async () => {
    const r = await checkP7(port)
    expect(r.ok).toBe(true)
    expect(r.facts).toEqual({ rows: 16, isNumber: true, diff: 0 })
  })
})

describe('L3 before P7', () => {
  it('region_id is text: typeMismatch (BIGINT / VARCHAR), the fix points at Clean, P7 does not pass', async () => {
    await setUp({ ...RIGHT, regions: [sp('distinct', {}, 's1')] })
    const { f, d } = await check(cc('region_id'), cr('region_id'))
    expect(d.key).toBe('typeMismatch')
    expect(d.fix).toEqual({ kind: 'region' })
    expect([f.many.type, f.one.type, f.one.total]).toEqual(['BIGINT', 'VARCHAR', 16])
    expect(d.line).toMatch(/^customers\.region_id is a number \(BIGINT\) and regions\.region_id is text \(VARCHAR\): 1 and R-01 can't be compared\./)
    const r = await checkP7(port)
    expect(r.ok).toBe(false)
    expect(r.line).toMatch(/still text/)
  })
})

describe('spoiled states (4.3)', () => {
  it('L1 before P3: notUnique, 148 rows 144 values, 3,000 become 3,385', async () => {
    await setUp({ ...RIGHT, customers: [] })
    const { f, d } = await check(cs('customer_name'), cc('customer_name'))
    expect(d.key).toBe('notUnique')
    expect([f.one.rows, f.one.distinct, f.one.repeated, f.found!.joinRows, f.found!.oneUnused]).toEqual([148, 144, 4, 3385, 99])
    expect(d.line).toMatch(/4 values appear more than once, so 3,000 sales would become 3,385/)
    expect(d.fix).toEqual({ kind: 'clean', source: 'customers' })
    const peek = (await linkPeek(port, cs('customer_name'), cc('customer_name')))!
    expect(peek.rows).toBe(3385)
    expect(peek.top[0][0]).toBe('Nagisa')
  })
  it('L2 before P1: 714 sales (6 SKUs) find no product, 392,540.33 left out', async () => {
    await setUp({ ...RIGHT, products: [] })
    const { f, d } = await check(cs('sku_code'), cp('sku_code'))
    expect(d.key).toBe('unmatched')
    expect([f.found!.unmatchedRows, f.found!.unmatchedValues, f.found!.joinRows, f.found!.oneUnused]).toEqual([714, 6, 2286, 24])
    expect(Number(f.found!.unmatchedRevenue)).toBeCloseTo(392540.33, 2)
    expect(d.line).toMatch(/^714 sales found no product \(6 different values: /)
    expect(d.line).toMatch(/392,540\.33 of revenue would be left out/)
    expect(d.fix).toEqual({ kind: 'clean', source: 'products' })
  })
})

describe('pass 2 and the star made from the links (6)', () => {
  const LINKS = EXPECTED_LINKS.filter((e) => e.pass === 1).map((e) => ({ id: e.id, many: { ...e.many }, one: { ...e.one } }))
  beforeAll(async () => {
    await setUp(RIGHT)
  }, 60_000)

  it('Build the star gives 3,000 / 144 (45) / 47 (29) / 0 / 0 and a region on every customer', async () => {
    const s = await buildStar(port, LINKS)
    expect(s).toEqual({ fact: 3000, customers: 144, customersSold: 45, products: 47, productsSold: 29, noCustomer: 0, noProduct: 0 })
    expect(await n('SELECT count(region_name) FROM build_kaiyo.gold_dim_customer')).toBe(144)
    const cols = (await port.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'build_kaiyo' AND table_name = 'gold_dim_customer' ORDER BY ordinal_position`)).rows.map((r) => String(r[0]))
    expect(cols).toEqual(['customer_id', 'customer_name', 'customer_type', 'chain_name', 'region_id', 'city', 'region_name', 'macro_region'])
  })
  it('the tiles read the same numbers as before', async () => {
    const kpi = await runTile(port, 'kpi', 'SUM(revenue)')
    expect(kpi.ok).toBe(true)
    expect(Number(kpi.data!.rows[0][0])).toBeCloseTo(314906.13, 2)
    const chains = await runTile(port, 'chains', '')
    expect(chains.ok).toBe(true)
    expect(chains.data!.rows.slice(0, 3).map((r) => String(r[0]))).toEqual(['Minori', 'Nagisa', 'Ichiba'])
    expect(Number(chains.data!.rows[0][1])).toBeCloseTo(90829.5, 2)
    expect((await runTile(port, 'line', "date_trunc('month', sale_date)")).ok).toBe(true)
  })
  const g = (t: string, c: string) => slot(`gold_${t}`, c)
  it('F1 and F2 pass with 99 and 18 unused; Minori first with F1', async () => {
    const a = await check(g('fact_sales', 'customer_id'), g('dim_customer', 'customer_id'), 2)
    expect(a.d.key).toBe('pass')
    expect([a.f.many.rows, a.f.one.rows, a.f.found!.unmatchedRows, a.f.found!.oneUnused]).toEqual([3000, 144, 0, 99])
    expect(a.d.expected?.id).toBe('F1')
    const peek = (await linkPeek(port, g('fact_sales', 'customer_id'), g('dim_customer', 'customer_id')))!
    expect(peek.top[0][0]).toBe('Minori')
    expect(Number(peek.top[0][1])).toBeCloseTo(90829.5, 2)
    const b = await check(g('fact_sales', 'product_id'), g('dim_product', 'product_id'), 2)
    expect(b.d.key).toBe('pass')
    expect(b.f.found!.oneUnused).toBe(18)
    expect(b.d.expected?.id).toBe('F2')
  })
  it('F1 and F2 swapped: wrongWay', async () => {
    const a = await check(g('dim_customer', 'customer_id'), g('fact_sales', 'customer_id'), 2)
    expect(a.d.key).toBe('wrongWay')
    expect([a.f.one.rows, a.f.one.distinct, a.f.found!.unmatchedRows]).toEqual([3000, 45, 99])
    const b = await check(g('dim_product', 'product_id'), g('fact_sales', 'product_id'), 2)
    expect(b.d.key).toBe('wrongWay')
    expect([b.f.one.distinct, b.f.found!.unmatchedRows]).toEqual([29, 18])
  })
  it('F-y: customer_id against the products finds 501 sales (10 ids) missing, 220,484.87', async () => {
    const { f, d } = await check(g('fact_sales', 'customer_id'), g('dim_product', 'product_id'), 2)
    expect(d.key).toBe('unmatched')
    expect([f.found!.unmatchedRows, f.found!.unmatchedValues, f.found!.joinRows, f.found!.oneUnused]).toEqual([501, 10, 2499, 12])
    expect(Number(f.found!.unmatchedRevenue)).toBeCloseTo(220484.87, 2)
  })
  it('F-x: product_id against customer_id passes every data check, Right pair stops it, the peek shows the money', async () => {
    const { f, d } = await check(g('fact_sales', 'product_id'), g('dim_customer', 'customer_id'), 2)
    expect(d.key).toBe('sameByChance')
    expect(d.ok).toBe(false)
    expect([f.found!.unmatchedRows, f.found!.joinRows, f.found!.oneUnused]).toEqual([0, 3000, 115])
    expect(d.chips.map((c) => c.state)).toEqual(['pass', 'pass', 'pass', 'fail'])
    const peek = (await linkPeek(port, g('fact_sales', 'product_id'), g('dim_customer', 'customer_id')))!
    expect(peek.top.map((t) => t[0])).toEqual(['no chain', 'Minori', 'Nagisa'])
    expect(peek.top.map((t) => Number(t[1]))[0]).toBeCloseTo(180981.76, 2)
    expect(Number(peek.top[1][1])).toBeCloseTo(80039.21, 2)
    expect(Number(peek.top[2][1])).toBeCloseTo(16967.16, 2)
  })
  it('a pair that is not a sales table has no peek', async () => {
    expect(await linkPeek(port, cc('region_id'), cr('region_id'))).toBeNull()
  })
  it('every DiagKey is reachable above', () => {
    const keys: DiagKey[] = ['sameTable', 'typeMismatch', 'noMatch', 'wrongWay', 'notUnique', 'unmatched', 'sameByChance', 'pass']
    expect(keys).toHaveLength(8)
  })
})
