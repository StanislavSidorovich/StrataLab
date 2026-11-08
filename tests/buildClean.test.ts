// Б4 of the build page: applied steps, Connect with the Quick look, Watch, and (Б4b) the checks of P1 to P3, on the real
// parquet files in duckdb-node-blocking, through the same SQL the page uses.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { CLEAN_COLUMNS, addSpec, chainSql, dedupSql, emptyWork, latestSql, makeStep, readWork, removeSpec, shownSql, stepsOf, trimSql, upperSql, type StepSpec } from '../src/core/buildSteps'
import { readBuild } from '../src/core/build'
import { resultRows } from '../src/db/export'
import { applySteps, connect, prepare, quickLook, restore } from '../src/db/buildRun'
import type { SqlPort } from '../src/db/pipelineRun'
import { BUILD_SOURCES, WATCH_STEPS } from '../src/data/build/kaiyoSales'

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

// ---------------------------------------------------------------- the generators (pure)

describe('step generators', () => {
  const cols = CLEAN_COLUMNS.products
  it('keep the column list and change only the chosen column', () => {
    expect(trimSql(cols, 'sku_code')).toBe('SELECT product_id, trim(sku_code) AS sku_code, product_name, brand, category, list_price\nFROM {prev}')
    expect(upperSql(cols, 'sku_code')).toBe('SELECT product_id, upper(sku_code) AS sku_code, product_name, brand, category, list_price\nFROM {prev}')
    expect(upperSql(cols, 'brand')).toContain('upper(brand) AS brand')
    expect(upperSql(cols, 'brand')).toContain('product_id, sku_code, product_name, upper(brand) AS brand')
  })
  it('writes Keep latest row per key as the spec shows it', () => {
    expect(latestSql(CLEAN_COLUMNS.customers, 'customer_id', 'updated_at', true)).toBe(`SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active, updated_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) AS row_no
  FROM {prev}
)
WHERE row_no = 1`)
    expect(latestSql(CLEAN_COLUMNS.customers, 'customer_id', 'updated_at', false)).toContain('updated_at ASC')
  })
  it('writes the P2 step with the blank in', () => {
    expect(dedupSql(CLEAN_COLUMNS.sales, 'sale_date, customer_name, sku_code')).toContain('PARTITION BY sale_date, customer_name, sku_code ORDER BY raw_id')
  })
})

describe('chainSql and the list of steps', () => {
  it('puts the given step first on sales only', () => {
    expect(stepsOf('sales', []).map((s) => s.kind)).toEqual(['given'])
    expect(stepsOf('regions', []).map((s) => s.kind)).toEqual([])
    expect(stepsOf('sales', [{ id: 's1', kind: 'given', params: {} }]).map((s) => s.kind)).toEqual(['given'])
  })
  it('chains each step on the one before it', () => {
    const steps = stepsOf('products', [addSpec([], 'trim', { column: 'sku_code' })[0], { id: 's2', kind: 'upper', params: { column: 'sku_code' } }])
    const sql = chainSql('products', steps)
    expect(sql).toContain('CREATE OR REPLACE TABLE build_kaiyo.clean_products AS')
    expect(sql).toContain('bronze AS (SELECT * FROM build_kaiyo.bronze_products)')
    expect(sql).toContain('FROM bronze')
    expect(sql).toContain('FROM step1')
    expect(sql.trimEnd().endsWith('SELECT * FROM step2')).toBe(true)
    expect(shownSql(steps, 1)).toContain('FROM step1')
    expect(chainSql('regions', [])).toContain('SELECT * FROM bronze')
  })
  it('adds, replaces the P2 step, and removes', () => {
    let s: StepSpec[] = addSpec([], 'trim', { column: 'sku_code' })
    s = addSpec(s, 'dedup', { blank: 'a' })
    s = addSpec(s, 'dedup', { blank: 'b' })
    expect(s.map((x) => x.kind)).toEqual(['trim', 'dedup'])
    expect(s[1].params.blank).toBe('b')
    expect(new Set(s.map((x) => x.id)).size).toBe(2)
    expect(removeSpec(s, s[0].id).map((x) => x.kind)).toEqual(['dedup'])
  })
  it('refuses a step that does not fit its source', () => {
    expect(makeStep('products', { id: 's1', kind: 'trim', params: { column: 'nope' } })).toBeNull()
    expect(makeStep('customers', { id: 's1', kind: 'dedup', params: { blank: 'a' } })).toBeNull()
    expect(makeStep('sales', { id: 's1', kind: 'dedup', params: { blank: 'a;b' } })).toBeNull()
    expect(makeStep('sales', { id: 's1', kind: 'dedup', params: { blank: '' } })).toBeNull()
  })
})

describe('state repair', () => {
  it('starts afresh on junk', () => {
    expect(readWork(null)).toEqual(emptyWork())
    expect(readWork('x')).toEqual(emptyWork())
    expect(readWork({ connected: 5, steps: 7, passed: 'W' })).toEqual(emptyWork())
  })
  it('keeps good steps and drops the rest', () => {
    const w = readWork({
      connected: ['sales', 'bogus', 'regions'],
      steps: {
        products: [
          { id: 's1', kind: 'trim', params: { column: 'sku_code' } },
          { id: 's1', kind: 'upper', params: { column: 'sku_code' } },
          { id: 's2', kind: 'trim', params: { column: 'nope' } },
          { id: 's3', kind: 'bogus', params: {} },
          { id: 's4', kind: 'upper', params: { column: 'sku_code', extra: 5 } },
        ],
        sales: [{ id: 's1', kind: 'given', params: {} }],
      },
      blank: 'x'.repeat(500),
      passed: ['W', 'P2'],
    })
    expect(w.connected).toEqual(['sales', 'regions'])
    expect(w.steps.products.map((s) => s.id)).toEqual(['s1', 's4'])
    expect(w.steps.sales).toEqual([])
    expect(w.blank).toHaveLength(200)
    expect(w.passed).toEqual(['W'])
  })
  it('lives inside the saved build', () => {
    const raw = JSON.stringify({ done: ['connect'], open: 'clean', work: { connected: ['sales'], steps: { regions: [{ id: 's1', kind: 'distinct', params: {} }] } } })
    const s = readBuild(raw)
    expect(s.open).toBe('clean')
    expect(s.work.connected).toEqual(['sales'])
    expect(s.work.steps.regions).toHaveLength(1)
    expect(readBuild(JSON.stringify({ done: [] })).work).toEqual(emptyWork())
  })
})

// ---------------------------------------------------------------- the engine

describe('Connect and Quick look', () => {
  it('gives sales the given step: 3,110 rows, real types', async () => {
    expect(await applySteps(port, 'sales', [])).toBe(3110)
    expect(await n('SELECT count(*) FROM build_kaiyo.clean_sales WHERE sale_date IS NULL')).toBe(0)
  })
  it('shows the dirty numbers of spec sections 7 and 11', async () => {
    const q = await quickLook(port)
    expect(Number(q.kpi)).toBeCloseTo(391037.9, 2)
    expect(q.chain).toBe('Nagisa')
    expect(Number(q.chainRevenue)).toBeCloseTo(196708.19, 2)
  })
})

describe('Watch (3.2): the numbers of every step', () => {
  it('counts 17, finds R-03 twice, compares two equal rows', async () => {
    expect(await n(WATCH_STEPS[0].sql!)).toBe(17)
    const find = (await port.query(WATCH_STEPS[1].sql!)).rows
    expect(find).toHaveLength(1)
    expect(String(find[0][0])).toBe('R-03')
    expect(Number(find[0][1])).toBe(2)
    const cmp = (await port.query(WATCH_STEPS[2].sql!)).rows
    expect(cmp).toHaveLength(2)
    expect(cmp[0]).toEqual(cmp[1])
  })
  it('fixes with Remove duplicates: 16 rows, check 0; running twice changes nothing', async () => {
    const specs = addSpec([], 'distinct')
    expect(await applySteps(port, 'regions', specs)).toBe(16)
    expect(await applySteps(port, 'regions', specs)).toBe(16)
    expect(await n(WATCH_STEPS[4].sql!)).toBe(0)
  })
  it('has a caption and (but the fix) an SQL for each of the five steps', () => {
    expect(WATCH_STEPS).toHaveLength(5)
    expect(WATCH_STEPS.filter((s) => s.sql === null)).toHaveLength(1)
    for (const s of WATCH_STEPS) expect(s.caption.length).toBeGreaterThan(20)
  })
})

describe('restore', () => {
  it('connects again what was connected and rebuilds the steps', async () => {
    const w = readWork({ connected: ['regions', 'products'], steps: { regions: [{ id: 's1', kind: 'distinct', params: {} }], products: [{ id: 's1', kind: 'trim', params: { column: 'sku_code' } }] } })
    await restore(port, w)
    expect(await n('SELECT count(*) FROM build_kaiyo.clean_regions')).toBe(16)
    expect(await n(`SELECT count(*) FROM build_kaiyo.clean_products WHERE sku_code <> trim(sku_code)`)).toBe(0)
  })
  it('turns a SQL error into a short message', async () => {
    await expect(applySteps(port, 'sales', [{ id: 's1', kind: 'dedup', params: { blank: 'no_such_column' } }])).rejects.toThrow(/no_such_column/i)
  })
})
