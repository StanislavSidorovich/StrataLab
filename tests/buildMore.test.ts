// The optional step More of the build page (spec docs/build-kaiyo-sales-spec.md 5.5): the state, the step bar rules, the
// answer checks, and every question's solution run on the real star in duckdb-node-blocking.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { emptyBuild, isUnlocked, markDone, nextStep, openStep, readBuild, statusOf, STEP_IDS, STRIP_IDS } from '../src/core/build'
import { checkMoreAnswer, emptyMore, moreCount, moreDone, moreSqlProblem, pinnable, readMore, removePin, setPin } from '../src/core/buildMore'
import { emptyWork, readWork, type StepSpec } from '../src/core/buildSteps'
import type { ResultData } from '../src/core/check'
import { BUILD_SOURCES, MORE_IDS, MORE_QUESTIONS, moreQuestion } from '../src/data/build/kaiyoSales'
import { EXPECTED_LINKS } from '../src/data/build/linkData'
import { applySteps, buildStar, connect, prepare } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------- the state and the step bar

describe('More in the saved state', () => {
  it('an old save without More loads with the defaults', () => {
    const old = JSON.stringify({ done: ['connect'], open: 'clean', work: { connected: ['sales'], dash: { blanks: { kpi: 'SUM(revenue)', line: '', chains: '' }, tiles: ['kpi'] } } })
    const s = readBuild(old)
    expect(s.work.more).toEqual(emptyMore())
    expect(s.work.dash.tiles).toEqual(['kpi'])
    expect(readWork({}).more).toEqual(emptyWork().more)
    expect(readWork({ more: 5 }).more).toEqual(emptyMore())
  })
  it('keeps what was saved, repaired', () => {
    const m = readMore({
      sql: { K1: 'select 1', K9: 'x', K2: 7 },
      answers: { K1: { pick: '', number: '595' }, K2: { pick: 'Fruvia' } },
      done: ['K1', 'K7', 'K3'],
      solved: ['K3', 'K2'],
      pins: [{ q: 'K2', sql: 'select 2' }, { q: 'K2', sql: 'select 3' }, { q: 'K9', sql: 'x' }, { q: 'K1', sql: '  ' }],
    })
    expect(m.sql.K1).toBe('select 1')
    expect(m.sql.K2).toBe(moreQuestion('K2').start)
    expect(m.answers.K1.number).toBe('595')
    expect(m.answers.K2).toEqual({ pick: 'Fruvia', number: '' })
    expect(m.done).toEqual(['K1', 'K3'])
    expect(m.solved).toEqual(['K3'])
    expect(m.pins).toEqual([{ q: 'K2', sql: 'select 3' }])
  })
  it('a full state survives a round trip', () => {
    const s = emptyBuild()
    s.work.more = { ...emptyMore(), done: ['K1'], pins: [{ q: 'K1', sql: 'select 1 AS a, 2 AS b' }] }
    expect(readBuild(JSON.stringify(s)).work.more).toEqual(s.work.more)
  })
})

describe('the step bar', () => {
  const finished = () => {
    let s = emptyBuild()
    for (const id of STEP_IDS) s = markDone({ ...s, done: STEP_IDS.slice(0, STEP_IDS.indexOf(id)) as never }, id)
    return s
  }
  it('has the five and then the optional one', () => {
    expect(STRIP_IDS).toEqual([...STEP_IDS, 'more'])
    expect(STEP_IDS).toHaveLength(5)
  })
  it('More is locked until Answer is done, then current, then done with the five questions', () => {
    const s = emptyBuild()
    expect(statusOf(s, 'more')).toBe('locked')
    expect(openStep(s, 'more')).toBe(s)
    const d = finished()
    expect(isUnlocked(d, 'more')).toBe(true)
    expect(statusOf(d, 'more')).toBe('current')
    const open = openStep(d, 'more')
    expect(open.open).toBe('more')
    expect(nextStep(open)).toBeNull()
    expect(markDone(open, 'more')).toBe(open)
    open.work.more.done = [...MORE_IDS]
    expect(statusOf(open, 'more')).toBe('done')
  })
  it('the build stays five of five without More', () => {
    expect(finished().done).toEqual([...STEP_IDS])
  })
  it('a saved More that is still locked opens the current step instead', () => {
    expect(readBuild(JSON.stringify({ done: ['connect'], open: 'more' })).open).toBe('clean')
    expect(readBuild(JSON.stringify({ done: [...STEP_IDS], open: 'more' })).open).toBe('more')
  })
})

// ---------------------------------------------------------------- the pins and the SQL guard

describe('pins', () => {
  it('one per question, in question order, removable', () => {
    let p = setPin([], { q: 'K4', sql: 'a' })
    p = setPin(p, { q: 'K2', sql: 'b' })
    p = setPin(p, { q: 'K4', sql: 'c' })
    expect(p).toEqual([{ q: 'K2', sql: 'b' }, { q: 'K4', sql: 'c' }])
    expect(removePin(p, 'K2')).toEqual([{ q: 'K4', sql: 'c' }])
  })
  it('a result is pinnable with a label and a number', () => {
    expect(pinnable([{ name: 'a', kind: 'text' }, { name: 'b', kind: 'number' }])).toBe(true)
    expect(pinnable([{ name: 'a', kind: 'date' }, { name: 'b', kind: 'number' }])).toBe(true)
    expect(pinnable([{ name: 'a', kind: 'number' }, { name: 'b', kind: 'number' }])).toBe(false)
    expect(pinnable([{ name: 'a', kind: 'text' }])).toBe(false)
    expect(pinnable([{ name: 'a', kind: 'text' }, { name: 'b', kind: 'number' }, { name: 'c', kind: 'number' }])).toBe(false)
  })
})

describe('the SQL guard', () => {
  it('lets a SELECT through, with comments and a closing semicolon', () => {
    expect(moreSqlProblem('SELECT 1')).toBeNull()
    expect(moreSqlProblem('-- note\nselect 1;')).toBeNull()
    expect(moreSqlProblem('/* x */ WITH a AS (SELECT 1) SELECT * FROM a')).toBeNull()
  })
  it('refuses the rest', () => {
    expect(moreSqlProblem('  ')).toMatch(/Write a query/)
    expect(moreSqlProblem('-- only a comment')).toMatch(/Write a query/)
    expect(moreSqlProblem('SELECT ____ FROM t')).toMatch(/Fill in/)
    expect(moreSqlProblem('SELECT 1; SELECT 2')).toMatch(/One query/)
    expect(moreSqlProblem('DROP TABLE build_kaiyo.gold_fact_sales')).toMatch(/only reads/)
    expect(moreSqlProblem('DELETE FROM x')).toMatch(/only reads/)
  })
  it('the start text of K1 asks for the blank, the others are comments only', () => {
    expect(moreSqlProblem(moreQuestion('K1').start)).toMatch(/Fill in/)
    for (const id of ['K2', 'K3', 'K4', 'K5'] as const) expect(moreSqlProblem(moreQuestion(id).start)).toMatch(/Write a query/)
  })
})

// ---------------------------------------------------------------- the answers

describe('answer checks', () => {
  const n = (number: string, pick = '') => ({ pick, number })
  it('K1', () => {
    expect(checkMoreAnswer('K1', n('595')).ok).toBe(true)
    expect(checkMoreAnswer('K1', n('595.4')).ok).toBe(true)
    expect(checkMoreAnswer('K1', n('618')).line).toMatch(/sent twice/)
    expect(checkMoreAnswer('K1', n('570')).line).toMatch(/count\(\*\)/)
    expect(checkMoreAnswer('K1', n('314,906.13')).line).toMatch(/revenue/)
    expect(checkMoreAnswer('K1', n('abc')).line).toMatch(/Type the number/)
    expect(checkMoreAnswer('K1', n('12')).line).toMatch(/Not quite/)
  })
  it('K2', () => {
    expect(checkMoreAnswer('K2', n('100,004.67', 'Fruvia')).ok).toBe(true)
    expect(checkMoreAnswer('K2', n('100004,67', 'Fruvia')).ok).toBe(true)
    expect(checkMoreAnswer('K2', n('80,977.09', 'Aqualis')).line).toMatch(/Aqualis is second/)
    expect(checkMoreAnswer('K2', n('100,004.67')).line).toMatch(/Pick a brand/)
    expect(checkMoreAnswer('K2', n('50', 'Fruvia')).line).toMatch(/Fruvia is right/)
  })
  it('K3 takes the size of the returns, with or without the sign', () => {
    expect(checkMoreAnswer('K3', n('217')).ok).toBe(true)
    expect(checkMoreAnswer('K3', n('-217')).ok).toBe(true)
    expect(checkMoreAnswer('K3', n('43')).line).toMatch(/return lines/)
    expect(checkMoreAnswer('K3', n('6,497')).line).toMatch(/taken off/)
    expect(checkMoreAnswer('K3', n('6714')).line).toMatch(/units sold/)
  })
  it('K4', () => {
    expect(checkMoreAnswer('K4', n('44,845.38', 'Okinawa')).ok).toBe(true)
    expect(checkMoreAnswer('K4', n('35,819.43', 'Aichi')).line).toMatch(/Aichi is second/)
  })
  it('K5', () => {
    expect(checkMoreAnswer('K5', n('22,383.37', 'Minori #1015')).ok).toBe(true)
    expect(checkMoreAnswer('K5', n('19,893.72', 'Minori #1027')).line).toMatch(/#1027 is second/)
  })
  it('each pick list holds the right pick', () => {
    for (const q of MORE_QUESTIONS) if (q.options) expect(q.options.map((o) => o.value)).toContain(q.right.pick)
    expect(moreDone({ done: [...MORE_IDS] })).toBe(true)
    expect(moreCount({ done: ['K1', 'K4'] })).toBe(2)
  })
})

// ---------------------------------------------------------------- the numbers, on the real star (spec 5.5)

let port: SqlPort
const sp = (kind: StepSpec['kind'], params: Record<string, string> = {}, id = 's1'): StepSpec => ({ id, kind, params })
const run = async (sql: string): Promise<ResultData> => port.query(sql)

describe('the questions on the real star', () => {
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
    await applySteps(port, 'sales', [sp('dedup', { blank: 'sale_date, customer_name, sku_code' })])
    await applySteps(port, 'customers', [sp('latest', { key: 'customer_id', order: 'updated_at', direction: 'newest' })])
    await applySteps(port, 'products', [sp('trim', { column: 'sku_code' }, 's1'), sp('upper', { column: 'sku_code' }, 's2')])
    await applySteps(port, 'regions', [sp('distinct', {}, 's1'), sp('extract', { column: 'region_id' }, 's2')])
    const links = EXPECTED_LINKS.filter((e) => e.pass === 1).map((e) => ({ id: e.id, many: { ...e.many }, one: { ...e.one } }))
    await buildStar(port, links as never)
  }, 180_000)

  const first = async (id: (typeof MORE_IDS)[number]) => (await run(moreQuestion(id).solution)).rows[0]

  it('K1: 595 sales (570 have a revenue)', async () => {
    expect(Number((await first('K1'))[0])).toBe(595)
    expect(Number((await run(`SELECT count(revenue) FROM build_kaiyo.gold_fact_sales WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`)).rows[0][0])).toBe(570)
  })
  it('K2: Fruvia 100,004.67, then Aqualis 80,977.09 and Krosti 67,550.59', async () => {
    const r = (await run(moreQuestion('K2').solution)).rows
    expect(r.slice(0, 3).map((x) => [x[0], Number(x[1])])).toEqual([['Fruvia', 100004.67], ['Aqualis', 80977.09], ['Krosti', 67550.59]])
    expect(r.map((x) => String(x[0]))).toEqual(expect.arrayContaining(['Milvara', 'Nettora']))
  })
  it('K3: 217 units back in 2025 on 43 lines; 6,497 net and 6,714 sold are the traps', async () => {
    expect(Number((await first('K3'))[0])).toBe(217)
    const y = `sale_date >= DATE '2025-01-01' AND sale_date < DATE '2026-01-01'`
    expect((await run(`SELECT count(*) FROM build_kaiyo.gold_fact_sales WHERE units < 0 AND ${y}`)).rows[0][0]).toBe(43)
    expect(Number((await run(`SELECT SUM(units) FROM build_kaiyo.gold_fact_sales WHERE ${y}`)).rows[0][0])).toBe(6497)
    expect(Number((await run(`SELECT SUM(units) FROM build_kaiyo.gold_fact_sales WHERE units > 0 AND ${y}`)).rows[0][0])).toBe(6714)
  })
  it('K4: Okinawa 44,845.38 with one join (region_name is on the customers), Aichi second', async () => {
    const r = (await run(moreQuestion('K4').solution)).rows
    expect(r.slice(0, 2).map((x) => [x[0], Number(x[1])])).toEqual([['Okinawa', 44845.38], ['Aichi', 35819.43]])
    expect(r).toHaveLength(16)
    // a first-version star has no region_name: the same answer through clean_regions
    const v1 = await run(`SELECT r.region_name, SUM(f.revenue) FROM build_kaiyo.gold_fact_sales f JOIN build_kaiyo.gold_dim_customer c ON c.customer_id = f.customer_id JOIN build_kaiyo.clean_regions r ON r.region_id = c.region_id WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01' GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)
    expect([v1.rows[0][0], Number(v1.rows[0][1])]).toEqual(['Okinawa', 44845.38])
  })
  it('K5: Minori #1015 22,383.37 in 2025, #1027 second with 19,893.72; twelve Minori stores', async () => {
    const r = await first('K5')
    expect([r[0], Number(r[1])]).toEqual(['Minori #1015', 22383.37])
    const all = await run(moreQuestion('K5').solution.replace('LIMIT 1', 'LIMIT 2'))
    expect(all.rows.map((x) => [x[0], Number(x[1])])).toEqual([['Minori #1015', 22383.37], ['Minori #1027', 19893.72]])
    expect(Number((await run(`SELECT count(*) FROM build_kaiyo.gold_dim_customer WHERE chain_name = 'Minori'`)).rows[0][0])).toBe(12)
    expect(moreQuestion('K5').options).toHaveLength(12)
  })
  it('the lists of brands and prefectures are the ones in the star', async () => {
    const brands = (await run('SELECT DISTINCT brand FROM build_kaiyo.gold_dim_product ORDER BY 1')).rows.map((x) => x[0])
    expect(moreQuestion('K2').options!.map((o) => o.value)).toEqual(brands)
    const regions = (await run('SELECT DISTINCT region_name FROM build_kaiyo.gold_dim_customer ORDER BY 1')).rows.map((x) => x[0])
    expect(moreQuestion('K4').options!.map((o) => o.value)).toEqual(regions)
    const stores = (await run(`SELECT customer_name FROM build_kaiyo.gold_dim_customer WHERE chain_name = 'Minori' ORDER BY 1`)).rows.map((x) => x[0])
    expect(moreQuestion('K5').options!.map((o) => o.value)).toEqual(stores)
  })
  it('K1 on a star with P2 not done gives 618, the wrong answer worth a line', async () => {
    await applySteps(port, 'sales', [])
    await buildStar(port, EXPECTED_LINKS.filter((e) => e.pass === 1).map((e) => ({ id: e.id, many: { ...e.many }, one: { ...e.one } })) as never)
    expect(Number((await first('K1'))[0])).toBe(618)
  })
})
