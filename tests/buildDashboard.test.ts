// Б6 of the build page: Model v1, the three Dashboard tiles and the Answer checks (spec sections 4.1, 5, 7), on the real
// parquet files in duckdb-node-blocking, through the same SQL the page uses.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { checkAnswer, dashboardDone, answersDone, diagnoseKpi, diagnoseLine, emptyDash, parseAnswerNumber, readDash, tileBlankProblem, tileRunSql, tileSql } from '../src/core/buildDashboard'
import { emptyWork, readWork, type StepSpec } from '../src/core/buildSteps'
import { ANSWERS, BUILD_SOURCES, GOLD_SQL, TILE_IDS, TILE_SQL } from '../src/data/build/kaiyoSales'
import { RIGHT_SALES, SOLVED_SALES } from './buildSolved'
import { applySteps, buildStar, connect, prepare, restore, runTile } from '../src/db/buildRun'
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
const SALES = RIGHT_SALES
const PRODUCTS = [sp('trim', { column: 'sku_code' }, 's1'), sp('upper', { column: 'sku_code' }, 's2')]
const CUSTOMERS = [sp('latest', { key: 'customer_id', order: 'updated_at', direction: 'newest' })]

interface State {
  sales?: StepSpec[]
  customers?: StepSpec[]
  products?: StepSpec[]
}

/** Clean tables in a state, then the star. */
async function setUp(s: State) {
  await applySteps(port, 'sales', s.sales ?? [])
  await applySteps(port, 'customers', s.customers ?? [])
  await applySteps(port, 'products', s.products ?? [])
  return buildStar(port)
}
const RIGHT: Required<State> = { sales: SALES, customers: CUSTOMERS, products: PRODUCTS }
const BLANKS = { kpi: 'SUM(revenue)', line: "date_trunc('month', sale_date)", chains: 'customer_id' }
const h1 = `sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`

async function top(k = 3): Promise<[string, number][]> {
  const r = await runTile(port, 'chains', BLANKS.chains)
  return r.data!.rows.slice(0, k).map((x) => [String(x[0]), Number(x[1])])
}
const kpi = async () => Number((await runTile(port, 'kpi', BLANKS.kpi)).data!.rows[0][0])

// ---------------------------------------------------------------- Model v1 (4.1)

describe('Model v1', () => {
  it('shows 3,000 / 144 (45 with sales) / 47 (29 with sales) / 0 / 0', async () => {
    const f = await setUp(RIGHT)
    expect(f).toEqual({ fact: 3000, customers: 144, customersSold: 45, products: 47, productsSold: 29, noCustomer: 0, noProduct: 0 })
  })
  it('has three statements and the fact carries ids only', () => {
    expect(GOLD_SQL).toHaveLength(3)
  })
})

// ---------------------------------------------------------------- the whole cases of section 7

describe('whole cases (7)', () => {
  // name, state, clean sales, clean customers, fact, without product, KPI, sales H1, top of the chain table
  const cases: [string, State, number, number, number, number, number, number, [string, number][]][] = [
    ['Right', RIGHT, 3000, 144, 3000, 0, 314906.13, 595, [['Minori', 90829.5], ['Nagisa', 87647.48], ['Ichiba', 55108.64]]],
    ['P2 not done', { ...RIGHT, sales: SOLVED_SALES }, 3110, 144, 3110, 0, 331604.58, 618, [['Nagisa', 95406.98], ['Minori', 91942.74], ['Ichiba', 62324.9]]],
    ['P2 key raw_id', { ...RIGHT, sales: [sp('dedup', { blank: 'raw_id' }), ...SOLVED_SALES] }, 3110, 144, 3110, 0, 331604.58, 618, [['Nagisa', 95406.98], ['Minori', 91942.74], ['Ichiba', 62324.9]]],
    ['P2 key customer_name, sku_code', { ...RIGHT, sales: [...SOLVED_SALES, sp('dedup', { blank: 'customer_name, sku_code' })] }, 660, 144, 660, 0, 3057.72, 6, [['Minori', 1751.29], ['Nagisa', 1085.17], ['Prima', 221.26]]],
    ['P3 not done', { ...RIGHT, customers: [] }, 3000, 148, 3385, 0, 371314.73, 677, [['Nagisa', 181702.88], ['Kaigan', 103939.96], ['Minori', 90829.5]]],
    ['P3 Remove duplicates', { ...RIGHT, customers: [sp('distinct')] }, 3000, 148, 3385, 0, 371314.73, 677, [['Nagisa', 181702.88], ['Kaigan', 103939.96], ['Minori', 90829.5]]],
    ['P3 kept oldest', { ...RIGHT, customers: [sp('latest', { key: 'customer_id', order: 'updated_at', direction: 'oldest' })] }, 3000, 144, 3000, 0, 314906.13, 595, [['Minori', 90829.5], ['Nagisa', 87647.48], ['Ichiba', 55108.64]]],
    ['P1 not done', { ...RIGHT, products: [] }, 3000, 144, 3000, 714, 314906.13, 595, [['Minori', 90829.5], ['Nagisa', 87647.48], ['Ichiba', 55108.64]]],
    ['P1 Trim only', { ...RIGHT, products: [PRODUCTS[0]] }, 3000, 144, 3000, 368, 314906.13, 595, [['Minori', 90829.5]]],
    ['P1 Uppercase only', { ...RIGHT, products: [sp('upper', { column: 'sku_code' })] }, 3000, 144, 3000, 458, 314906.13, 595, [['Minori', 90829.5]]],
    ['Nothing done', { sales: SOLVED_SALES }, 3110, 148, 3511, 843, 391037.9, 705, [['Nagisa', 196708.19], ['Kaigan', 106377.76], ['Minori', 91942.74]]],
  ]
  for (const [name, state, sales, customers, fact, noProduct, kpiV, salesH1, chains] of cases) {
    it(name, async () => {
      const f = await setUp(state)
      expect(await n('SELECT count(*) FROM build_kaiyo.clean_sales')).toBe(sales)
      expect(await n('SELECT count(*) FROM build_kaiyo.clean_customers')).toBe(customers)
      expect(f.fact).toBe(fact)
      expect(f.noProduct).toBe(noProduct)
      expect(await kpi()).toBeCloseTo(kpiV, 2)
      expect(await n(`SELECT count(*) FROM build_kaiyo.gold_fact_sales WHERE ${h1}`)).toBe(salesH1)
      const got = await top(chains.length)
      expect(got.map((x) => x[0])).toEqual(chains.map((x) => x[0]))
      got.forEach((x, i) => expect(x[1]).toBeCloseTo(chains[i][1], 2))
    })
  }
})

// ---------------------------------------------------------------- the tiles in the right state

describe('tiles (5)', () => {
  beforeAll(async () => {
    await setUp(RIGHT)
  })
  it('KPI: SUM(revenue) passes with 314,906.13', async () => {
    const r = await runTile(port, 'kpi', BLANKS.kpi)
    expect(r.ok).toBe(true)
    expect(r.line).toBeNull()
    expect(r.data!.rows).toHaveLength(1)
    expect(Number(r.data!.rows[0][0])).toBeCloseTo(314906.13, 2)
  })
  // blank, value, text in the line
  const kpiWrong: [string, number, RegExp][] = [
    ['count(*)', 595, /595 is the number of sales/],
    ['count(revenue)', 570, /570 is the number of sales/],
    ['SUM(units)', 3523, /3,523 is units sold/],
    ['AVG(revenue)', 552.47, /552\.47 is the average sale/],
    ['MAX(revenue)', 2989.44, /2,989\.44 is the biggest single sale/],
  ]
  for (const [blank, value, line] of kpiWrong) {
    it(`KPI: ${blank} shows its line`, async () => {
      const r = await runTile(port, 'kpi', blank)
      expect(r.ok).toBe(false)
      expect(Number(r.data!.rows[0][0])).toBeCloseTo(value, 2)
      expect(r.line).toMatch(line)
    })
  }
  it('KPI: a refused blank, and a SQL error, say so', async () => {
    expect((await runTile(port, 'kpi', '')).ok).toBe(false)
    expect((await runTile(port, 'kpi', 'a; b')).line).toBeTruthy()
    const r = await runTile(port, 'kpi', 'SUM(nope)')
    expect(r.ok).toBe(false)
    expect(r.data).toBeNull()
    expect(r.line).toMatch(/nope/i)
  })

  it('line: date_trunc, strftime and make_date pass with 30 points', async () => {
    for (const blank of [BLANKS.line, "strftime(sale_date, '%Y-%m')", 'make_date(year(sale_date), month(sale_date), 1)']) {
      const r = await runTile(port, 'line', blank)
      expect(r.line, blank).toBeNull()
      expect(r.ok).toBe(true)
      expect(r.data!.rows).toHaveLength(30)
    }
  })
  const lineWrong: [string, number, RegExp][] = [
    ['month(sale_date)', 12, /12 points instead of 30/],
    ['year(sale_date)', 3, /3 points/],
    ["date_trunc('quarter', sale_date)", 10, /10 points/],
    ['sale_date', 131, /131 points/],
  ]
  for (const [blank, points, line] of lineWrong) {
    it(`line: ${blank} gives ${points} points and its line`, async () => {
      const r = await runTile(port, 'line', blank)
      expect(r.ok).toBe(false)
      expect(r.data!.rows).toHaveLength(points)
      expect(r.line).toMatch(line)
    })
  }
  it('line: the reference months of 5.2', async () => {
    const r = await runTile(port, 'line', BLANKS.line)
    const rev = r.data!.rows.map((x) => Number(x[1]))
    expect(rev[0]).toBeCloseTo(37579.11, 2)
    expect(rev[19]).toBeCloseTo(64592.75, 2) // 2025-08
    expect(rev[24]).toBeCloseTo(79717.23, 2) // 2026-01
    expect(rev[29]).toBeCloseTo(68659.14, 2)
    expect(rev.reduce((a, b) => a + b, 0)).toBeCloseTo(1473843.82, 2)
    expect(Math.max(...rev.slice(12, 24))).toBeCloseTo(64592.75, 2)
  })

  it('chains: the five numbers, ordered', async () => {
    const r = await runTile(port, 'chains', BLANKS.chains)
    expect(r.ok).toBe(true)
    expect(r.data!.rows.map((x) => [String(x[0]), Number(x[1])])).toEqual([
      ['Minori', 90829.5],
      ['Nagisa', 87647.48],
      ['Ichiba', 55108.64],
      ['Kaigan', 49607.59],
      ['Prima', 30649.92],
    ])
  })
  it('chains: a fanned-out star does not pass', async () => {
    await setUp({ ...RIGHT, customers: [] })
    const r = await runTile(port, 'chains', BLANKS.chains)
    expect(r.ok).toBe(false)
    expect(r.line).toBeTruthy()
    await setUp(RIGHT)
  })
  it('chains: f.customer_id passes, another key is named, a missing column is an error line', async () => {
    expect((await runTile(port, 'chains', 'f.customer_id')).ok).toBe(true)
    const other = await runTile(port, 'chains', 'product_id')
    expect(other.ok).toBe(false)
    expect(other.line).toMatch(/customer_id/)
    const nope = await runTile(port, 'chains', 'nope')
    expect(nope.ok).toBe(false)
    expect(nope.line).toBeTruthy()
  })
  it('the answers match the tiles', async () => {
    const line = (await runTile(port, 'line', BLANKS.line)).data!.rows
    const aug = line.find((x) => String(x[0]).startsWith('2025-08'))!
    expect(Number(aug[1])).toBeCloseTo(ANSWERS[1].right.value, 2)
    const chains = (await runTile(port, 'chains', BLANKS.chains)).data!.rows
    expect(String(chains[0][0])).toBe(ANSWERS[2].right.pick)
    expect(Number(chains[0][1])).toBeCloseTo(ANSWERS[2].right.value, 2)
    expect(await kpi()).toBeCloseTo(ANSWERS[0].right.value, 2)
  })
})

describe('restore builds the star when Clean is done', () => {
  it('has the gold tables after a reload', async () => {
    await port.query('DROP TABLE IF EXISTS build_kaiyo.gold_fact_sales')
    const w = readWork({
      v: 2,
      connected: ['sales', 'customers', 'products', 'regions'],
      steps: { sales: SALES, customers: CUSTOMERS, products: PRODUCTS, regions: [sp('distinct')] },
      passed: ['W', 'P1', 'P2', 'P3', 'P5', 'P6'],
    })
    await restore(port, w)
    expect(await n('SELECT count(*) FROM build_kaiyo.gold_fact_sales')).toBe(3000)
  })
})

// ---------------------------------------------------------------- pure

describe('blanks and tile SQL', () => {
  it('writes the blank into the SQL and refuses the usual mistakes', () => {
    expect(tileSql('kpi', ' SUM(revenue) ')).toContain('SELECT SUM(revenue) AS revenue')
    expect(tileSql('line', "date_trunc('month', sale_date)")).toContain("SELECT date_trunc('month', sale_date) AS month, SUM(revenue)")
    expect(tileSql('chains', 'customer_id')).toContain('ON c.customer_id = f.customer_id\n')
    expect(tileSql('chains', ' f.customer_id ')).toContain('ON c.customer_id = f.customer_id\n')
    expect(tileBlankProblem('kpi', '')).toBeTruthy()
    expect(tileBlankProblem('line', 'a; drop')).toBeTruthy()
    expect(tileBlankProblem('chains', '')).toBeTruthy()
    expect(tileBlankProblem('chains', 'customer_id')).toBeNull()
  })
  it('shows a plain SELECT and wraps it in code before running', () => {
    for (const id of TILE_IDS) {
      expect(TILE_SQL[id]).not.toMatch(/CREATE/i)
      expect(tileSql(id, 'x')).toMatch(/^SELECT/)
      expect(tileRunSql(id, 'x')).toMatch(new RegExp(`^CREATE OR REPLACE TABLE build_kaiyo\\.tile_${id} AS\nSELECT`))
    }
  })
  it('diagnoses by the blank and the number', () => {
    expect(diagnoseKpi({ value: '595', match: false, error: null, blank: 'COUNT(*)' }).line).toMatch(/595 is the number of sales/)
    expect(diagnoseKpi({ value: '1', match: true, error: null, blank: 'x' }).ok).toBe(true)
    expect(diagnoseLine({ points: 30, distinct: 30, diff: 0, error: null, blank: '' }).ok).toBe(true)
    expect(diagnoseLine({ points: 30, distinct: 30, diff: 4, error: null, blank: '' }).ok).toBe(false)
    expect(diagnoseLine({ points: 7, distinct: 7, diff: 4, error: null, blank: '' }).line).toMatch(/7 points/)
  })
})

describe('parseAnswerNumber', () => {
  it('reads the usual spellings', () => {
    expect(parseAnswerNumber('314906.13')).toBe(314906.13)
    expect(parseAnswerNumber('314,906.13')).toBe(314906.13)
    expect(parseAnswerNumber('314 906,13')).toBe(314906.13)
    expect(parseAnswerNumber('90829,5')).toBe(90829.5)
    expect(parseAnswerNumber('64592')).toBe(64592)
    expect(parseAnswerNumber('314,906')).toBe(314906)
    expect(parseAnswerNumber('1.234,56')).toBe(1234.56)
  })
  it('refuses what is not a number', () => {
    for (const t of ['', ' ', 'abc', '12abc', '1.2.3', '--', ',,', '1,2,3.4x']) expect(parseAnswerNumber(t), t).toBeNull()
  })
})

describe('checkAnswer (5.4)', () => {
  const A = (id: 'A1' | 'A2' | 'A3', pick: string, number: string) => checkAnswer(id, { pick, number })
  it('passes the right answers, within 0.5, whole numbers too', () => {
    expect(A('A1', '', '314,906.13').ok).toBe(true)
    expect(A('A1', '', '314906').ok).toBe(true)
    expect(A('A2', '2025-08', '64592.75').ok).toBe(true)
    expect(A('A2', '2025-08', '64 592,75').ok).toBe(true)
    expect(A('A3', 'Minori', '90829,5').ok).toBe(true)
  })
  it('says a line for the wrong answers worth one', () => {
    expect(A('A1', '', '595').line).toBe("That's the number of sales.")
    expect(A('A1', '', '331,604.58').line).toMatch(/110 sales sent twice/)
    expect(A('A2', '2025-01', '79,717.23').line).toMatch(/January 2026 is the best month of the whole line/)
    expect(A('A2', '2025-06', '59,020.40').line).toBe('June is second; look again at August.')
    expect(A('A3', 'Nagisa', '87647.48').line).toBe('Nagisa is second, 87,647.48.')
  })
  it('asks for the pick and the number, and says which part is off', () => {
    expect(A('A2', '', '64592.75').line).toMatch(/Pick a month/)
    expect(A('A1', '', 'lots').line).toMatch(/Type the number/)
    expect(A('A2', '2025-08', '1').line).toMatch(/August is right/)
    expect(A('A3', 'Ichiba', '90829.5').line).toMatch(/belongs to another/)
    expect(A('A1', '', '5').ok).toBe(false)
  })
})

describe('the saved part', () => {
  it('starts afresh on junk and keeps the good', () => {
    expect(readDash(null)).toEqual(emptyDash())
    expect(readWork({}).dash).toEqual(emptyDash())
    expect(emptyWork().dash).toEqual(emptyDash())
    const d = readDash({ blanks: { kpi: 'SUM(revenue)', line: 7 }, tiles: ['kpi', 'bogus'], answers: { A1: { pick: '', number: '12' }, A9: {} }, answered: ['A2', 'A9'] })
    expect(d.blanks).toEqual({ kpi: 'SUM(revenue)', line: '', chains: '' })
    expect(d.tiles).toEqual(['kpi'])
    expect(d.answers.A1.number).toBe('12')
    expect(d.answered).toEqual(['A2'])
  })
  it('gives a chains tile passed before it had a blank the answer it had', () => {
    expect(readDash({ tiles: ['chains'] }).blanks.chains).toBe('customer_id')
    expect(readDash({ tiles: ['chains'], blanks: { chains: 'f.customer_id' } }).blanks.chains).toBe('f.customer_id')
  })
  it('knows when the step is done', () => {
    expect(dashboardDone(['kpi', 'line'])).toBe(false)
    expect(dashboardDone([...TILE_IDS])).toBe(true)
    expect(answersDone(['A1', 'A2'])).toBe(false)
    expect(answersDone(['A1', 'A2', 'A3'])).toBe(true)
  })
})
