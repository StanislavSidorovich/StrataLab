// Spec 3.6 of the build page: P5 dates, P6 decimal commas, P4 names. A Change type that fails shows [Error] cells (NULL where the file had a
// value); the card says why; the fix replaces the failing step. Real parquet files in duckdb-node-blocking, the same SQL the page uses.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readBuild, isUnlocked } from '../src/core/build'
import type { ResultData } from '../src/core/check'
import { GIVEN_FULL_SPEC, addSpec, checkFormat, diagnoseP4, diagnoseP5, diagnoseP6, emptyWork, hasFullGiven, makeStep, passCard, readWork, stepErrorsSql, stepsOf, typeSql, type StepSpec } from '../src/core/buildSteps'
import { BUILD_DIAGNOSIS, BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { applySteps, checkP4, checkP5, checkP6, connect, diffAgainstRef, errorRows, prepare, previewSales, salesErrors, salesLock, stepErrors } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'
import { DEDUP_SALES, RIGHT_SALES, SOLVED_SALES } from './buildSolved'

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
    parquet: async (folder, file) => resolve('public/datasets', folder, file).split(String.fromCharCode(92)).join('/'),
  }
  await prepare(port)
  for (const s of BUILD_SOURCES) await connect(port, s.id)
  await applySteps(port, 'customers', [{ id: 's1', kind: 'latest', params: { key: 'customer_id', order: 'updated_at', direction: 'newest' } }])
}, 180_000)

const sp = (id: string, kind: StepSpec['kind'], params: Record<string, string> = {}): StepSpec => ({ id, kind, params })
const DATE = (format?: string) => (format ? sp('d1', 'dates', { format }) : sp('d1', 'type', { column: 'sale_date', to: 'date', sep: 'point' }))
const REV = (comma: boolean) => sp('d2', 'type', { column: 'revenue', to: 'decimal', sep: comma ? 'comma' : 'point' })
const UNITS = (comma: boolean) => sp('d3', 'type', { column: 'units', to: 'whole', sep: comma ? 'comma' : 'point' })
const TRIM = sp('d4', 'trim', { column: 'customer_name' })
const ITIBA = sp('d5', 'replace', { column: 'customer_name', find: 'Itiba', with: 'Ichiba' })

// ---------------------------------------------------------------- pure

describe('the new steps (pure)', () => {
  it('writes Change type with try_cast, and the comma as a replace', () => {
    const cols = ['raw_id', 'source_file', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue']
    expect(typeSql(cols, 'sale_date', 'date', false)).toBe('SELECT raw_id, source_file, try_cast(sale_date AS DATE) AS sale_date, customer_name, sku_code, units, revenue\nFROM {prev}')
    expect(typeSql(cols, 'revenue', 'decimal', true)).toContain("try_cast(replace(revenue, ',', '.') AS DECIMAL(12, 2)) AS revenue")
    expect(typeSql(cols, 'units', 'whole', false)).toContain('try_cast(units AS INTEGER) AS units')
    expect(typeSql(cols, 'units', 'whole', true)).toContain("try_cast(try_cast(replace(units, ',', '.') AS DOUBLE) AS INTEGER) AS units")
  })
  it('writes the date SQL with the learner\'s format in the slash line only', () => {
    const s = makeStep('sales', sp('d1', 'dates', { format: '%d/%m/%Y' }))!
    expect(s.sql).toContain("WHEN sale_date LIKE '%/%' THEN try_strptime(sale_date, '%d/%m/%Y')")
    expect(s.sql).toContain("WHEN sale_date LIKE '%.%' THEN try_strptime(sale_date, '%d.%m.%Y')")
    expect(makeStep('sales', sp('d1', 'dates', { format: "x'; drop" }))).toBeNull()
    expect(makeStep('sales', sp('d1', 'dates', { format: '' }))).toBeNull()
    expect(makeStep('customers', sp('d1', 'dates', { format: '%d/%m/%Y' }))).toBeNull()
    expect(checkFormat('%d/%m/%Y')).toBeNull()
    expect(checkFormat('')).toBeTruthy()
    expect(checkFormat("%d'")).toBeTruthy()
  })
  it('writes Replace values with quoted strings', () => {
    const s = makeStep('sales', sp('r1', 'replace', { column: 'customer_name', find: "It'iba", with: 'Ichiba' }))!
    expect(s.sql).toContain("replace(customer_name, 'It''iba', 'Ichiba') AS customer_name")
    expect(makeStep('sales', sp('r1', 'replace', { column: 'customer_name', find: '', with: 'x' }))).toBeNull()
  })
  it('a second Change type on the same column, or the date SQL, takes the place of the first', () => {
    let s: StepSpec[] = addSpec([], 'type', { column: 'sale_date', to: 'date', sep: 'point' })
    s = addSpec(s, 'trim', { column: 'customer_name' })
    s = addSpec(s, 'type', { column: 'revenue', to: 'decimal', sep: 'point' })
    s = addSpec(s, 'dates', { format: '%d/%m/%Y' })
    expect(s.map((x) => x.kind)).toEqual(['dates', 'trim', 'type'])
    s = addSpec(s, 'type', { column: 'revenue', to: 'decimal', sep: 'comma' })
    expect(s.map((x) => [x.kind, x.params.sep])).toEqual([['dates', undefined], ['trim', undefined], ['type', 'comma']])
    expect(new Set(s.map((x) => x.id)).size).toBe(3)
  })
  it('diagnoses P5, P6, P4 from the facts', () => {
    const base = { isDate: true, errors: 0, samples: [], diff: 0, format: null }
    expect(diagnoseP5({ ...base, isDate: false }).line).toBe(BUILD_DIAGNOSIS.dateText)
    expect(diagnoseP5({ ...base, errors: 1510, samples: ['19.02.2024'] }).line).toBe(BUILD_DIAGNOSIS.datePlain('1,510', ['19.02.2024']))
    expect(diagnoseP5({ ...base, errors: 400, format: '%m/%d/%Y' }).line).toBe(BUILD_DIAGNOSIS.dateMonthFirst('400'))
    expect(diagnoseP5({ ...base, errors: 764, samples: ['19/02/2024'], format: '%d/%m/%y' }).line).toBe(BUILD_DIAGNOSIS.dateStill('764', ['19/02/2024']))
    expect(diagnoseP5(base).ok).toBe(true)
    const six = { revenueText: false, unitsText: false, revenueErrors: 0, unitsErrors: 0, diff: 0 }
    expect(diagnoseP6({ ...six, unitsText: true }).line).toBe(BUILD_DIAGNOSIS.numberText(['units']))
    expect(diagnoseP6({ ...six, revenueErrors: 1412, unitsErrors: 112 }).line).toBe(BUILD_DIAGNOSIS.numberComma(['1,412 revenues', '112 units']))
    expect(diagnoseP6({ ...six, unitsErrors: 112 }).line).toBe(BUILD_DIAGNOSIS.numberOne('units', '112'))
    expect(diagnoseP6(six).ok).toBe(true)
    const four = { unmatched: 0, sample: null, spaces: 0, itiba: 0, diff: 0, otherColumns: [] }
    expect(diagnoseP4(four).ok).toBe(true)
    expect(diagnoseP4({ ...four, unmatched: 261, sample: 'Itiba #1026', itiba: 261 }).line).toBe(BUILD_DIAGNOSIS.namesItiba('261', 'Itiba #1026'))
    expect(diagnoseP4({ ...four, unmatched: 5, spaces: 5, otherColumns: ['sku_code'] }).line).toBe(BUILD_DIAGNOSIS.namesWrongColumn('sku_code'))
  })
  it('counts the errors of a step only for Change type and the date SQL', () => {
    const steps = stepsOf('sales', [TRIM, DATE(), REV(false)])
    const sql = stepErrorsSql(steps)
    expect(sql).toMatch(/SELECT 0, 0, \(SELECT count\(\*\) FROM step3 a JOIN step2 p USING \(raw_id\) WHERE a\.sale_date IS NULL AND p\.sale_date IS NOT NULL\), \(SELECT count\(\*\) FROM step4 a JOIN step3 p USING \(raw_id\) WHERE a\.revenue IS NULL AND p\.revenue IS NOT NULL\)$/)
  })
})

// ---------------------------------------------------------------- P5: dates

describe('P5: dates', () => {
  it('as the files came, sale_date is text: the card says to press Change type', async () => {
    await applySteps(port, 'sales', [])
    const r = await checkP5(port, [])
    expect(r.facts.isDate).toBe(false)
    expect(r.line).toBe(BUILD_DIAGNOSIS.dateText)
  })
  it('Change type with Date fails on 1,567 of the 3,110 rows (1,510 of the 3,000 after P2)', async () => {
    await applySteps(port, 'sales', [DATE()])
    expect((await salesErrors(port)).sale_date).toBe(1567)
    expect(await errorRows(port)).toBe(1567)
    const r = await checkP5(port, [DATE()])
    expect([r.ok, r.facts.errors]).toEqual([false, 1567])
    expect(r.line).toBe(BUILD_DIAGNOSIS.datePlain('1,567', r.facts.samples))
    expect(r.facts.samples).toHaveLength(3)
    expect(r.facts.samples.every((s) => /[./]/.test(s))).toBe(true)
    expect(await stepErrors(port, [DATE()])).toEqual([0, 1567])
    await applySteps(port, 'sales', [DEDUP_SALES, DATE()])
    expect((await salesErrors(port)).sale_date).toBe(1510)
    expect(await stepErrors(port, [DEDUP_SALES, DATE()])).toEqual([0, 0, 1510])
  })
  it('the preview marks the error cells, and Show error rows keeps only rows that have one', async () => {
    await applySteps(port, 'sales', [DATE()])
    const all = await previewSales(port, false)
    expect(all.data.header).toEqual(['raw_id', 'source_file', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue'])
    const dateAt = 2
    all.data.rows.forEach((row, i) => expect(all.errors[i][dateAt]).toBe(row[dateAt] === null))
    const only = await previewSales(port, true)
    expect(only.data.rows.length).toBe(10)
    expect(only.errors.every((r) => r[dateAt])).toBe(true)
    expect(only.errorRows).toBe(1567)
  })
  it('the month-first format has its own line: 19/02/2024 has no month 19', async () => {
    const steps = [DEDUP_SALES, DATE('%m/%d/%Y')]
    await applySteps(port, 'sales', steps)
    const r = await checkP5(port, steps)
    expect(r.ok).toBe(false)
    expect(r.facts.errors).toBeGreaterThan(0)
    expect(r.facts.errors).toBeLessThan(764)
    expect(r.line).toBe(BUILD_DIAGNOSIS.dateMonthFirst(r.facts.errors.toLocaleString('en-US')))
    expect(r.chips.find((c) => c.label === 'Errors')!.ok).toBe(false)
  })
  it('a format that reads nothing of the slash dates names how many are left', async () => {
    const steps = [DEDUP_SALES, DATE('%d/%m/%y')]
    await applySteps(port, 'sales', steps)
    const r = await checkP5(port, steps)
    expect(r.facts.errors).toBe(await n("SELECT count(*) FROM build_kaiyo.bronze_sales b JOIN build_kaiyo.clean_sales c ON CAST(b.raw_id AS INTEGER) = c.raw_id WHERE b.sale_date LIKE '%/%'"))
    expect(r.line).toBe(BUILD_DIAGNOSIS.dateStill(r.facts.errors.toLocaleString('en-US'), r.facts.samples))
  })
  it('day first passes: 0 errors, the dates equal the expected table, three spellings read', async () => {
    const steps = [DEDUP_SALES, DATE('%d/%m/%Y')]
    await applySteps(port, 'sales', steps)
    const r = await checkP5(port, steps)
    expect([r.ok, r.line, r.facts.errors, r.facts.diff]).toEqual([true, null, 0, 0])
    expect(r.chips.find((c) => c.label === 'Spellings read')!.value).toBe('3 of 3')
    expect(await errorRows(port)).toBe(0)
  })
  it('the SQL step takes the place of the failing one in the list, and the table is then free of errors', async () => {
    const failing = [DEDUP_SALES, DATE()]
    const fixed = addSpec(failing, 'dates', { format: '%d/%m/%Y' })
    expect(fixed.map((s) => s.kind)).toEqual(['dedup', 'dates'])
    await applySteps(port, 'sales', fixed)
    expect((await checkP5(port, fixed)).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- P6: decimal commas

describe('P6: decimal commas', () => {
  it('as the files came, revenue and units are text', async () => {
    await applySteps(port, 'sales', [])
    const r = await checkP6(port)
    expect(r.line).toBe(BUILD_DIAGNOSIS.numberText(['revenue', 'units']))
  })
  it('Change type with the point fails on 1,465 revenues and 113 units (1,412 and 112 after P2)', async () => {
    await applySteps(port, 'sales', [REV(false), UNITS(false)])
    expect(await salesErrors(port)).toEqual({ sale_date: 0, units: 113, revenue: 1465 })
    const r = await checkP6(port)
    expect(r.line).toBe(BUILD_DIAGNOSIS.numberComma(['1,465 revenues', '113 units']))
    await applySteps(port, 'sales', [DEDUP_SALES, REV(false), UNITS(false)])
    expect(await salesErrors(port)).toEqual({ sale_date: 0, units: 112, revenue: 1412 })
    expect(await stepErrors(port, [DEDUP_SALES, REV(false), UNITS(false)])).toEqual([0, 0, 1412, 112])
  })
  it('one column fixed names the other', async () => {
    await applySteps(port, 'sales', [REV(true), UNITS(false)])
    expect((await checkP6(port)).line).toBe(BUILD_DIAGNOSIS.numberOne('units', '113'))
    await applySteps(port, 'sales', [REV(false), UNITS(true)])
    expect((await checkP6(port)).line).toBe(BUILD_DIAGNOSIS.numberOne('revenue', '1,465'))
  })
  it('with the comma as the separator: 0 errors, the revenue total equals the expected one', async () => {
    const steps = [DEDUP_SALES, REV(true), UNITS(true)]
    await applySteps(port, 'sales', steps)
    const r = await checkP6(port)
    expect([r.ok, r.line]).toEqual([true, null])
    expect(r.chips.find((c) => c.label === 'Revenue total matches the expected')!.value).toBe('yes')
    expect(await n('SELECT sum(revenue) FROM build_kaiyo.clean_sales')).toBeCloseTo(1473843.82, 2)
  })
  it('Decimal for the units is accepted too: the values are the same', async () => {
    await applySteps(port, 'sales', [DEDUP_SALES, REV(true), sp('d3', 'type', { column: 'units', to: 'decimal', sep: 'comma' })])
    expect((await checkP6(port)).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- P4: names (asked for by the Model step)

describe('P4: names', () => {
  const base = [DEDUP_SALES, DATE('%d/%m/%Y'), REV(true), UNITS(true)]
  it('raw names: the spaces are named first', async () => {
    await applySteps(port, 'sales', base)
    const r = await checkP4(port, base)
    expect(r.ok).toBe(false)
    expect(r.facts.spaces).toBe(889)
    expect(r.line).toBe(BUILD_DIAGNOSIS.namesSpaces('889'))
  })
  it('Trim leaves the Itiba rows, which have their own line', async () => {
    const steps = [...base, TRIM]
    await applySteps(port, 'sales', steps)
    const r = await checkP4(port, steps)
    expect(r.facts.spaces).toBe(0)
    expect(r.facts.unmatched).toBeGreaterThan(200)
    expect(r.facts.unmatched).toBeLessThanOrEqual(261)
    expect(r.facts.sample).toMatch(/^Itiba #/)
    expect(r.line).toBe(BUILD_DIAGNOSIS.namesItiba(r.facts.unmatched.toLocaleString('en-US'), r.facts.sample!))
  })
  it('Trim and Replace values pass: nobody left without a customer, the names equal the expected table', async () => {
    const steps = [...base, TRIM, ITIBA]
    await applySteps(port, 'sales', steps)
    const r = await checkP4(port, steps)
    expect([r.ok, r.facts.unmatched, r.facts.spaces, r.facts.diff]).toEqual([true, 0, 0, 0])
  })
  it('Replace values without Trim still stops on the spaces; the wrong column is named', async () => {
    const steps = [...base, ITIBA]
    await applySteps(port, 'sales', steps)
    expect((await checkP4(port, steps)).line).toBe(BUILD_DIAGNOSIS.namesSpaces('889'))
    const wrong = [...base, sp('d4', 'trim', { column: 'sku_code' })]
    await applySteps(port, 'sales', wrong)
    expect((await checkP4(port, wrong)).line).toBe(BUILD_DIAGNOSIS.namesWrongColumn('sku_code'))
  })
  it('the sales of the right state equal the expected table on every column, both ways', async () => {
    await applySteps(port, 'sales', RIGHT_SALES)
    const d = await diffAgainstRef(port, 'sales', 'ref_sales')
    expect([d.extra, d.missing]).toEqual([0, 0])
    await applySteps(port, 'sales', [...SOLVED_SALES])
    expect(await n('SELECT count(*) FROM build_kaiyo.clean_sales')).toBe(3110)
  })
  it('with P4 to P6 done first, the key of the spec table gives the old numbers: 660, 2049, 2350', async () => {
    const counts: [string, number][] = [['customer_name, sku_code', 660], ['sale_date, sku_code', 2049], ['sale_date, customer_name', 2350]]
    for (const [blank, rows] of counts) {
      await applySteps(port, 'sales', [...SOLVED_SALES, sp('s1', 'dedup', { blank })])
      expect(await n('SELECT count(*) FROM build_kaiyo.clean_sales'), blank).toBe(rows)
    }
  })
})

// ---------------------------------------------------------------- work saved by v0.32.0

describe('work saved by v0.32.0 (the first given step did everything)', () => {
  const old = {
    connected: ['sales', 'customers', 'products', 'regions'],
    steps: { sales: [{ id: 's1', kind: 'dedup', params: { blank: 'sale_date, customer_name, sku_code' } }], customers: [], products: [], regions: [] },
    passed: ['W', 'P1', 'P2', 'P3'],
  }
  it('keeps the first given step and counts P5 and P6 as done', () => {
    const w = readWork(old)
    expect(w.steps.sales).toEqual([GIVEN_FULL_SPEC, old.steps.sales[0]])
    expect(hasFullGiven(w)).toBe(true)
    expect(w.passed).toEqual(['W', 'P1', 'P2', 'P3', 'P5', 'P6'])
    expect(w.p4).toBeNull()
    const again = readWork(JSON.parse(JSON.stringify(w)))
    expect(again.steps.sales).toEqual(w.steps.sales)
    expect(again.passed).toEqual(w.passed)
  })
  it('opens through the saved build: Clean is done, and the step list shows the given step', () => {
    const s = readBuild(JSON.stringify({ done: ['connect', 'clean'], open: 'model', work: old }))
    expect(s.done).toEqual(['connect', 'clean'])
    expect(stepsOf('sales', s.work.steps.sales).map((x) => x.label)).toEqual(['Changed type (given): dates, numbers, names', 'Removed sales sent twice'])
  })
  it('work stopped before P3 passes P5 and P6 together with P3', () => {
    const w = readWork({ ...old, passed: ['W', 'P1'] })
    expect(w.passed).toEqual(['W', 'P1'])
    expect(passCard({ passed: w.passed, steps: w.steps }, 'P2')).toEqual(['W', 'P1', 'P2'])
    expect(passCard({ passed: ['W', 'P1', 'P2'], steps: w.steps }, 'P3')).toEqual(['W', 'P1', 'P2', 'P3', 'P5', 'P6'])
  })
  it('new work does not get the first given step, and does not skip P5 and P6', () => {
    const fresh = readWork({ v: 2, connected: ['sales'], steps: {}, passed: ['W', 'P1', 'P2', 'P3'] })
    expect(fresh.steps.sales).toEqual([])
    expect(fresh.passed).toEqual(['W', 'P1', 'P2', 'P3'])
    expect(passCard({ passed: ['W', 'P1', 'P2'], steps: fresh.steps }, 'P3')).toEqual(['W', 'P1', 'P2', 'P3'])
    expect(readWork({ connected: [], steps: {} }).steps.sales).toEqual([])
    expect(emptyWork().v).toBe(2)
  })
  it('the tables are right with the first given step: no errors, P5 and P6 pass', async () => {
    const steps = readWork(old).steps.sales
    await applySteps(port, 'sales', steps)
    expect(await salesErrors(port)).toEqual({ sale_date: 0, units: 0, revenue: 0 })
    expect((await checkP5(port, steps)).ok).toBe(true)
    expect((await checkP6(port)).ok).toBe(true)
    expect((await checkP4(port, steps)).ok).toBe(true)
    const d = await diffAgainstRef(port, 'sales', 'ref_sales')
    expect([d.extra, d.missing]).toEqual([0, 0])
  })
})

// ---------------------------------------------------------------- the Dashboard lock

describe('the Dashboard stays locked while the sales have errors', () => {
  const done = { done: ['connect', 'clean', 'model'] as never[], open: 'model' as const, work: emptyWork(), links: [], star: true, v1: false }
  it('opens with no errors, locks with some', () => {
    expect(isUnlocked({ ...done, errors: 0 }, 'dashboard')).toBe(true)
    expect(isUnlocked({ ...done, errors: 3 }, 'dashboard')).toBe(false)
    expect(isUnlocked({ ...done, errors: 3 }, 'model')).toBe(true)
  })
  it('counts [Error] cells and columns still text, 0 for sales typed and clean', async () => {
    await applySteps(port, 'sales', [])
    expect(await salesLock(port)).toBe(3)
    await applySteps(port, 'sales', [DATE()])
    expect(await salesLock(port)).toBe(1567 + 2)
    await applySteps(port, 'sales', RIGHT_SALES)
    expect(await salesLock(port)).toBe(0)
    await applySteps(port, 'sales', readWork({ connected: ['sales'], steps: {} }).steps.sales)
    expect(await salesLock(port)).toBe(0)
  })
  it('the number is not saved', () => {
    const s = readBuild(JSON.stringify({ ...done, errors: 9, work: emptyWork() }))
    expect(s.errors).toBe(0)
  })
})
