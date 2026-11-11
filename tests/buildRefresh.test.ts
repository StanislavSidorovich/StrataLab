// The optional step Refresh of the build page (spec docs/build-kaiyo-sales-spec.md 5.7) and the info card P8: the state, the step bar,
// the July file, the fill units, and the whole chain run on the real engine: the explicit list that ignores the new file, the pattern
// that reads it, the journal rows, the new date format that fails and the fix that passes, and R1.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { emptyBuild, isUnlocked, markDone, nextStep, openStep, readBuild, statusOf, STEP_IDS } from '../src/core/build'
import { RIGHT_BLANKS, fillBefore, fillUnit, touchesTables, unitsOf } from '../src/core/buildFill'
import { checkR1, emptyRefresh, nextRunNumber, pushRun, readRefresh, runGreen, runLine, statusText } from '../src/core/buildRefresh'
import { datesSql, emptyWork, makeStep, readWork, type BuildWork } from '../src/core/buildSteps'
import { BUILD_SOURCES, CONNECT_SQL, SALES_PATTERN, sourceById } from '../src/data/build/kaiyoSales'
import { EXPECTED_LINKS } from '../src/data/build/linkData'
import { JULY_COPIES, JULY_FILE, JULY_SALES, julyCents, julyFile } from '../src/data/build/julyExport'
import { R1_VALUE } from '../src/data/build/refreshData'
import { RIGHT_SALES } from './buildSolved'
import { applySteps, checkP2, connect, oddValues, prepare, runTile, salesLock } from '../src/db/buildRun'
import { runRefresh } from '../src/db/buildRefresh'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)

const finished = () => {
  let s = emptyBuild()
  for (const id of STEP_IDS) s = markDone({ ...s, done: STEP_IDS.slice(0, STEP_IDS.indexOf(id)) as never }, id)
  return s
}

// ---------------------------------------------------------------- the state and the step bar

describe('Refresh in the saved state', () => {
  it('work saved by v0.35.0 loads with the defaults: the list of 30 names, no runs, P8 unread', () => {
    const old = JSON.stringify({ done: ['connect'], open: 'clean', work: { v: 2, connected: ['sales'], more: { done: ['K1'] } } })
    const s = readBuild(old)
    expect(s.work.refresh).toEqual(emptyRefresh())
    expect(s.work.refresh.mode).toBe('list')
    expect(s.work.p8).toBe(false)
    expect(s.work.more.done).toEqual(['K1'])
    expect(readWork({ refresh: 5 }).refresh).toEqual(emptyRefresh())
  })
  it('keeps what was saved, repaired', () => {
    const row = { n: 1, stage: 'bronze', source: 'sales', step: 'Read', rowsIn: 3110, rowsOut: 3110, status: 'warning', count: 1, note: 'x', ms: 9 }
    const r = readRefresh({
      mode: 'pattern',
      format2: '%Y/%m/%d',
      runs: [{ n: 1, bronze: 1, clean: 1, errors: 0, warnings: 0 }, { n: 2, bronze: 'x' }, { n: 3, bronze: 3, clean: 3, errors: 21, warnings: 0 }],
      journal: [row, { n: 2, stage: 'nowhere', step: 'x', status: 'ok' }, 7],
      answer: { number: '64,508.87' },
      done: true,
    })
    expect(r.mode).toBe('pattern')
    expect(r.format2).toBe('%Y/%m/%d')
    expect(r.runs.map((x) => x.n)).toEqual([1, 3])
    expect(r.journal).toEqual([row])
    expect(r.answer.number).toBe('64,508.87')
    expect(r.done).toBe(true)
    expect(readRefresh({ mode: 'folder', done: 'yes' })).toEqual(emptyRefresh())
  })
  it('a full state survives a round trip', () => {
    const s = emptyBuild()
    s.work.refresh = { ...emptyRefresh(), mode: 'pattern', format2: '%Y/%m/%d', runs: [{ n: 1, bronze: 3110, clean: 3000, errors: 0, warnings: 1 }], done: true }
    s.work.p8 = true
    const back = readBuild(JSON.stringify(s))
    expect(back.work.refresh).toEqual(s.work.refresh)
    expect(back.work.p8).toBe(true)
  })
})

describe('the step bar with Refresh', () => {
  it('is locked until Answer is done, then current, then done with R1; More is not needed', () => {
    const s = emptyBuild()
    expect(statusOf(s, 'refresh')).toBe('locked')
    expect(openStep(s, 'refresh')).toBe(s)
    const d = finished()
    expect(isUnlocked(d, 'refresh')).toBe(true)
    expect(statusOf(d, 'refresh')).toBe('current')
    const open = openStep(d, 'refresh')
    expect(open.open).toBe('refresh')
    expect(nextStep(open)).toBeNull()
    expect(markDone(open, 'refresh')).toBe(open)
    open.work.refresh.done = true
    expect(statusOf(open, 'refresh')).toBe('done')
  })
  it('the build stays five of five, and a saved Refresh that is still locked opens the current step', () => {
    expect(finished().done).toEqual([...STEP_IDS])
    expect(readBuild(JSON.stringify({ done: ['connect'], open: 'refresh' })).open).toBe('clean')
    expect(readBuild(JSON.stringify({ done: [...STEP_IDS], open: 'refresh' })).open).toBe('refresh')
  })
})

// ---------------------------------------------------------------- the July file

describe('the July file', () => {
  const input = { customers: ['Ichiba #1001', 'Minori #1015', 'Nagisa #1045'], skus: [{ sku: 'AQUA001', price: 40 }, { sku: 'FRUV001', price: 25 }, { sku: 'KROS001', price: 12 }], firstId: 3111 }
  it('is the same on every call (a fixed seed), with the numbers the spec gives', () => {
    const a = julyFile(input)
    expect(julyFile(input)).toEqual(a)
    expect(a.sales).toHaveLength(JULY_SALES)
    expect(a.copies).toBe(JULY_COPIES)
    expect(a.rows).toHaveLength(JULY_SALES + JULY_COPIES)
    expect(a.rows.map((r) => r[0])).toEqual(Array.from({ length: a.rows.length }, (_, i) => String(3111 + i)))
  })
  it('has no two true sales with the same date, store and SKU, and no date outside July', () => {
    const a = julyFile(input)
    expect(new Set(a.sales.map((s) => `${s.date}|${s.customer}|${s.sku}`)).size).toBe(a.sales.length)
    expect(a.sales.every((s) => s.date >= '2026-07-01' && s.date <= '2026-07-31')).toBe(true)
  })
  it('carries the known dirt (copies, decimal commas, the three spellings) and the new one', () => {
    const a = julyFile(input)
    const dates = a.rows.map((r) => String(r[1]))
    expect(dates.some((d) => /^2026-07-\d\d$/.test(d))).toBe(true)
    expect(dates.some((d) => /^\d\d\.07\.2026$/.test(d))).toBe(true)
    expect(dates.some((d) => /^\d\d\/07\/2026$/.test(d))).toBe(true)
    expect(dates.filter((d) => /^2026\/07\/\d\d$/.test(d))).toHaveLength(a.newFormatLines)
    expect(a.rows.some((r) => /^\d+,\d\d$/.test(String(r[5])))).toBe(true)
    expect(a.rows.some((r) => /^-?\d+,0$/.test(String(r[4])))).toBe(true)
    expect(a.sales.filter((s) => s.units !== null && s.units < 0)).toHaveLength(3)
    expect(julyCents(a)).toBe(a.sales.reduce((x, s) => x + (s.cents ?? 0), 0))
  })
})

describe('the date step with a fourth spelling', () => {
  it('writes the branch for year-first dates before the slash one', () => {
    const sql = datesSql(['raw_id', 'sale_date'], '%d/%m/%Y', '%Y/%m/%d')
    expect(sql.indexOf("LIKE '____/%'")).toBeGreaterThan(0)
    expect(sql.indexOf("LIKE '____/%'")).toBeLessThan(sql.indexOf("LIKE '%/%'"))
    expect(datesSql(['raw_id', 'sale_date'], '%d/%m/%Y')).not.toContain('____/')
  })
  it('a step with a format the rules refuse is dropped', () => {
    expect(makeStep('sales', { id: 'a', kind: 'dates', params: { format: '%d/%m/%Y', format2: '%Y/%m/%d' } })).not.toBeNull()
    expect(makeStep('sales', { id: 'a', kind: 'dates', params: { format: '%d/%m/%Y', format2: "'; DROP" } })).toBeNull()
  })
})

// ---------------------------------------------------------------- the fill units (demo mode)

describe('Fill for Refresh', () => {
  const ready = () => {
    const s = fillBefore(emptyBuild(), 'refresh')
    return s
  }
  it('three parts: the source, the date step, the answer; only the answer leaves the tables alone', () => {
    expect(unitsOf('refresh').map((u) => (u.step === 'refresh' ? u.part : ''))).toEqual(['source', 'date', 'answer'])
    expect(unitsOf('refresh').map(touchesTables)).toEqual([true, true, false])
  })
  it('Fill to here opens Refresh with everything before it done', () => {
    const s = ready()
    expect(s.open).toBe('refresh')
    expect(s.done).toEqual([...STEP_IDS])
    expect(s.work.refresh.mode).toBe('list')
  })
  it('source switches the pattern, date adds the format to the learner’s own step, answer passes R1', () => {
    let s = ready()
    s = fillUnit(s, { step: 'refresh', part: 'source' })
    expect(s.work.refresh.mode).toBe('pattern')
    s = fillUnit(s, { step: 'refresh', part: 'date' })
    const dates = s.work.steps.sales.filter((x) => x.kind === 'dates')
    expect(dates).toHaveLength(1)
    expect(dates[0].params).toEqual({ format: '%d/%m/%Y', format2: '%Y/%m/%d' })
    expect(s.work.refresh.format2).toBe('%Y/%m/%d')
    s = fillUnit(s, { step: 'refresh', part: 'answer' })
    expect(s.work.refresh.done).toBe(true)
    expect(checkR1(s.work.refresh.answer).ok).toBe(true)
    expect(statusOf(s, 'refresh')).toBe('done')
  })
})

// ---------------------------------------------------------------- R1 and the history

describe('R1 and the history', () => {
  const n = (number: string) => ({ pick: '', number })
  it('takes July with the lenient parser and gives a line to the known wrong ones', () => {
    expect(R1_VALUE).toBe(64508.87)
    expect(checkR1(n('64,508.87')).ok).toBe(true)
    expect(checkR1(n('64508,87')).ok).toBe(true)
    expect(checkR1(n('64508.4')).ok).toBe(true)
    expect(checkR1(n('68,594.44')).line).toMatch(/sent twice/)
    expect(checkR1(n('52,779.39')).line).toMatch(/\[Error\]/)
    expect(checkR1(n('68,659.14')).line).toMatch(/June/)
    expect(checkR1(n('314,906.13')).line).toMatch(/number tile/)
    expect(checkR1(n('abc')).line).toMatch(/Type the number/)
    expect(checkR1(n('12')).line).toMatch(/Not quite/)
  })
  it('keeps the last three runs and numbers the next one', () => {
    let runs = [] as ReturnType<typeof pushRun>
    for (let i = 1; i <= 4; i++) runs = pushRun(runs, { n: nextRunNumber(runs), bronze: 3110 + i, clean: 3000, errors: i === 2 ? 21 : 0, warnings: i === 1 ? 1 : 0 })
    expect(runs.map((r) => r.n)).toEqual([2, 3, 4])
    expect(nextRunNumber(runs)).toBe(5)
    expect(runLine({ n: 1, bronze: 3110, clean: 3000, errors: 0, warnings: 1 })).toBe('Run 1: 3,110 → 3,000 · a file not read')
    expect(runLine({ n: 2, bronze: 3222, clean: 3104, errors: 21, warnings: 0 })).toBe('Run 2: 3,222 → 3,104 · 21 [Error]')
    expect(runLine({ n: 3, bronze: 3222, clean: 3104, errors: 0, warnings: 0 })).toBe('Run 3: 3,222 → 3,104 · green')
    expect(statusText({ status: 'error', count: 21 })).toBe('error: 21 rows [Error]')
    expect(statusText({ status: 'warning', count: 1 })).toBe('warning: 1 file not read')
  })
})

// ---------------------------------------------------------------- the real engine

let port: SqlPort
const q = async (sql: string) => (await port.query(sql)).rows
const links = EXPECTED_LINKS.filter((e) => e.pass === 1).map((e) => ({ id: e.id, many: { ...e.many }, one: { ...e.one } })) as never

/** The learner's work after Answer: the right steps everywhere, the tiles built. */
function rightWork(): BuildWork {
  const w = emptyWork()
  w.connected = ['sales', 'customers', 'products', 'regions']
  w.steps.sales = RIGHT_SALES.map((s) => ({ ...s, params: { ...s.params } }))
  w.steps.customers = [{ id: 's1', kind: 'latest', params: { key: 'customer_id', order: 'updated_at', direction: 'newest' } }]
  w.steps.products = [{ id: 's1', kind: 'trim', params: { column: 'sku_code' } }, { id: 's2', kind: 'upper', params: { column: 'sku_code' } }]
  w.steps.regions = [{ id: 's1', kind: 'distinct', params: {} }, { id: 's2', kind: 'extract', params: { column: 'region_id' } }]
  w.dash.blanks = { ...RIGHT_BLANKS }
  w.dash.tiles = ['kpi', 'line', 'chains']
  return w
}

describe('Refresh on the real engine', () => {
  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    const conn = db.connect()
    port = {
      query: async (sql) => resultRows(conn.query(sql)) as never,
      registerText: async (name, text) => void db.registerFileText(name, text),
      parquet: async (folder, file) => resolve('public/datasets', folder, file).split(String.fromCharCode(92)).join('/'),
    }
    await prepare(port)
    for (const s of BUILD_SOURCES) await connect(port, s.id)
  }, 180_000)

  it('the Connect statement reads the 30 names, or the pattern', () => {
    const list = CONNECT_SQL(sourceById('sales'), ['a.csv', 'b.csv'], 'list')
    expect(list).toContain("['a.csv', 'b.csv']")
    const pattern = CONNECT_SQL(sourceById('sales'), ['a.csv'], 'pattern')
    expect(pattern).toContain(`read_csv('${SALES_PATTERN}'`)
    expect(pattern).not.toContain('a.csv')
  })

  it('the explicit list ignores the new file: 3,110 rows, 30 files, whatever the folder holds', async () => {
    await connect(port, 'sales', 'list')
    expect((await q('SELECT count(*), count(DISTINCT source_file) FROM build_kaiyo.bronze_sales'))[0].map(Number)).toEqual([3110, 30])
    expect((await q(`SELECT count(*) FROM build_kaiyo.bronze_sales WHERE source_file = '${JULY_FILE}'`))[0][0]).toBe(0)
  })

  it('the pattern reads it: 31 files, 3,222 rows (112 lines of July)', async () => {
    await connect(port, 'sales', 'pattern')
    expect((await q('SELECT count(*), count(DISTINCT source_file) FROM build_kaiyo.bronze_sales'))[0].map(Number)).toEqual([3222, 31])
    expect(Number((await q(`SELECT count(*) FROM build_kaiyo.bronze_sales WHERE source_file = '${JULY_FILE}'`))[0][0])).toBe(JULY_SALES + JULY_COPIES)
    await connect(port, 'sales', 'list')
  })

  it('P8: 174 revenues, 82 units and 106 returns in the clean sales of the 30 months', async () => {
    const w = rightWork()
    await applySteps(port, 'sales', w.steps.sales)
    expect(await oddValues(port)).toEqual({ noRevenue: 174, noUnits: 82, returns: 106 })
  })

  it('P8 needs typed columns: with the sales still text there is nothing to count', async () => {
    await applySteps(port, 'sales', [])
    expect(await oddValues(port)).toBeNull()
  })

  it('run 1 (the list): everything refreshes but bronze_sales stays at 3,110, and the journal says why', async () => {
    const w = rightWork()
    const run = await runRefresh(port, w, { links, star: true })
    const r = run.rows
    expect(r).toHaveLength(22)
    expect(r.map((x) => x.n)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(r[0]).toMatchObject({ stage: 'bronze', source: 'sales', rowsIn: 3110, rowsOut: 3110, status: 'warning', count: 1 })
    expect(r[0].note).toMatch(/the new file was not read/)
    expect(r.slice(1, 4).every((x) => x.stage === 'bronze' && x.status === 'ok')).toBe(true)
    const dedup = r.find((x) => x.step === 'Removed sales sent twice')!
    expect([dedup.rowsIn, dedup.rowsOut]).toEqual([3110, 3000])
    expect(r.filter((x) => x.stage === 'model').map((x) => x.rowsOut)).toEqual([144, 47, 3000])
    expect(r.filter((x) => x.stage === 'dashboard').map((x) => [x.rowsOut, x.status])).toEqual([[1, 'ok'], [30, 'ok'], [5, 'ok']])
    expect(run.summary).toEqual({ n: 1, bronze: 3110, clean: 3000, errors: 0, warnings: 1 })
    expect(runGreen(r)).toBe(false)
    expect(r.every((x) => x.ms >= 0)).toBe(true)
  })

  it('run 2 (the pattern): July comes in, the known dirt is cleaned by the same steps, the date step fails and the dashboard stays locked', async () => {
    const w = rightWork()
    w.refresh.mode = 'pattern'
    const seen: number[] = []
    const run = await runRefresh(port, w, { links, star: true }, (row) => seen.push(row.n))
    const r = run.rows
    expect(seen).toEqual(r.map((x) => x.n))
    expect(r[0]).toMatchObject({ stage: 'bronze', source: 'sales', rowsIn: 3110, rowsOut: 3222, status: 'ok' })
    const dedup = r.find((x) => x.step === 'Removed sales sent twice')!
    expect([dedup.rowsIn, dedup.rowsOut, dedup.status]).toEqual([3222, 3104, 'ok'])
    expect(dedup.note).toContain('July: 112 → 104')
    const date = r.find((x) => x.step === 'Converted sale_date to a date (SQL)')!
    expect([date.rowsIn, date.rowsOut, date.status, date.count]).toEqual([3104, 3104, 'error', 21])
    expect(date.note).toMatch(/2026\/07\//)
    // the other steps run on what is valid: decimal commas of July are read by the learner's own steps
    expect(r.find((x) => x.step.startsWith('Changed type of revenue'))!.status).toBe('ok')
    expect(r.filter((x) => x.stage === 'model' || x.stage === 'dashboard').every((x) => x.status === 'skipped')).toBe(true)
    expect(run.summary).toEqual({ n: 1, bronze: 3222, clean: 3104, errors: 21, warnings: 0 })
    expect(await salesLock(port)).toBe(21)
    expect(runGreen(r)).toBe(false)
  })

  it('run 3 (the date step has the new format): all green, 31 points on the line, the number tile stays at H1', async () => {
    const w = rightWork()
    w.refresh.mode = 'pattern'
    w.refresh.format2 = '%Y/%m/%d'
    w.steps.sales = w.steps.sales.map((s) => (s.kind === 'dates' ? { ...s, params: { ...s.params, format2: '%Y/%m/%d' } } : s))
    const run = await runRefresh(port, w, { links, star: true })
    expect(runGreen(run.rows)).toBe(true)
    expect(run.rows.map((x) => x.status)).toEqual(Array(22).fill('ok'))
    expect(run.summary).toEqual({ n: 1, bronze: 3222, clean: 3104, errors: 0, warnings: 0 })
    expect(await salesLock(port)).toBe(0)
    expect(run.rows.filter((x) => x.stage === 'model').map((x) => x.rowsOut)).toEqual([144, 47, 3104])
    expect(run.rows.filter((x) => x.stage === 'dashboard').map((x) => x.rowsOut)).toEqual([1, 31, 5])
    // the KPI says H1 because its WHERE says H1
    expect(String((await q('SELECT * FROM build_kaiyo.tile_kpi'))[0][0])).toBe('314906.13')
  })

  it('R1: July 2026 is 64,508.87 on the line, the generator and the table agree', async () => {
    const july = (await q(`SELECT revenue FROM build_kaiyo.tile_line WHERE CAST(month AS VARCHAR) LIKE '2026-07%'`))[0][0]
    expect(Number(july)).toBe(R1_VALUE)
    expect(checkR1({ pick: '', number: String(july) }).ok).toBe(true)
    // the true sales of the file, from the generator, give the same money
    const customers = (await q('SELECT DISTINCT customer_name FROM build_kaiyo.ref_sales ORDER BY 1')).map((r) => String(r[0]))
    const skus = (await q('SELECT DISTINCT s.sku_code, p.list_price FROM build_kaiyo.ref_sales s JOIN build_kaiyo.src_product p ON upper(trim(p.sku_code)) = s.sku_code ORDER BY 1')).map((r) => ({ sku: String(r[0]), price: Number(r[1]) }))
    const first = Number((await q('SELECT max(CAST(raw_id AS INTEGER)) + 1 FROM build_kaiyo.src_raw_sellout'))[0][0])
    const file = julyFile({ customers, skus, firstId: first })
    expect(julyCents(file)).toBe(Math.round(R1_VALUE * 100))
    expect(file.newFormatLines).toBe(23)
    // the wrong ones: the lines sent twice counted, and the sales with no date left out
    expect(Number((await q(`SELECT sum(CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2))) FROM build_kaiyo.bronze_sales WHERE source_file = '${JULY_FILE}'`))[0][0])).toBe(68594.44)
    expect(Number((await q(`SELECT sum(CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2))) FROM build_kaiyo.bronze_sales WHERE source_file = '${JULY_FILE}' AND sale_date NOT LIKE '2026/%'`))[0][0]) + 0).toBeGreaterThan(0)
    expect(Number((await q(`SELECT sum(revenue) FROM build_kaiyo.clean_sales c WHERE source_file = '${JULY_FILE}' AND raw_id NOT IN (SELECT CAST(raw_id AS INTEGER) FROM build_kaiyo.bronze_sales WHERE sale_date LIKE '2026/%')`))[0][0])).toBe(52779.39)
  })

  it('the checks of the earlier steps still pass with July in: the line tile and P2 judge the 30 months', async () => {
    const w = rightWork()
    expect((await runTile(port, 'line', w.dash.blanks.line)).ok).toBe(true)
    expect((await runTile(port, 'kpi', w.dash.blanks.kpi)).ok).toBe(true)
    expect((await runTile(port, 'chains', w.dash.blanks.chains)).ok).toBe(true)
    const p2 = await checkP2(port, 'sale_date, customer_name, sku_code')
    expect(p2.ok).toBe(true)
    expect(await q('SELECT count(*) FROM build_kaiyo.gold_fact_sales').then((r) => Number(r[0][0]))).toBe(3104)
  })

  it('P8 in the state with July is recounted, not copied from the 30 months', async () => {
    const odd = await oddValues(port)
    expect(odd).toEqual({ noRevenue: 175, noUnits: 83, returns: 109 })
  })

  it('a wrong format in the blank leaves the dates in error and the run red again', async () => {
    const w = rightWork()
    w.refresh.mode = 'pattern'
    w.steps.sales = w.steps.sales.map((s) => (s.kind === 'dates' ? { ...s, params: { ...s.params, format2: '%d/%m/%Y' } } : s))
    const run = await runRefresh(port, w, { links, star: true })
    expect(run.rows.find((x) => x.step.startsWith('Converted sale_date'))!.status).toBe('error')
    expect(runGreen(run.rows)).toBe(false)
  })
})
