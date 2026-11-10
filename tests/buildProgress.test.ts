// Progress and demo of the build page (spec docs/build-kaiyo-sales-spec.md, "Progress and demo"): the saved run (Start over, My saved
// run), the demo slot that the learner's work never touches, "Fill this step" for every card, tile and question, and old saves.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BUILD_KEY, STEP_IDS, demoFromHash, emptyBuild, hashWithDemo, hashWithoutBuild, readBuild, saveBuild, type BuildState } from '../src/core/build'
import { fillBefore, fillBeforeTouchesTables, fillUnit, touchesTables, unitsOf, type FillUnit } from '../src/core/buildFill'
import { DEMO_KEY, SAVED_KEY, isEmptyRun, keptJson, loadSaved, loadSlot, readSaved, restoreNeedsConfirm, restoreSaved, runKey, sameRun, saveSlot, startOver, writeSaved } from '../src/core/buildProgress'
import { checkAnswer } from '../src/core/buildDashboard'
import { checkMoreAnswer } from '../src/core/buildMore'
import { cleanDone } from '../src/core/buildSteps'
import type { ResultData } from '../src/core/check'
import { ANSWERS, BUILD_SOURCES, MORE_IDS, TILE_IDS } from '../src/data/build/kaiyoSales'
import { RIGHT_SALES } from './buildSolved'
import { connect, prepare, resetWork, restore, runTile } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)

// a localStorage that works in node
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
beforeEach(() => store.clear())

const apply = (s: BuildState, units: FillUnit[]) => units.reduce(fillUnit, s)
const all = (): FillUnit[] => [...STEP_IDS, 'more' as const].flatMap(unitsOf)
const half = (): BuildState => fillBefore(emptyBuild(), 'model')

// ---------------------------------------------------------------- the saved run

describe('Start over and My saved run', () => {
  it('Start over keeps the run and clears the page', () => {
    const r = startOver(half(), null, 1000)
    expect(r.state).toEqual(emptyBuild())
    expect(r.saved?.at).toBe(1000)
    expect(sameRun(r.saved!.state, half())).toBe(true)
  })
  it('an empty page does not replace a good saved run, and a run that is the saved one keeps its date', () => {
    const saved = { at: 5, state: half() }
    expect(startOver(emptyBuild(), saved, 9).saved).toBe(saved)
    expect(startOver(half(), saved, 9).saved).toBe(saved)
    expect(startOver(fillBefore(emptyBuild(), 'dashboard'), saved, 9).saved?.at).toBe(9)
  })
  it('the saved run survives a round trip through the browser', () => {
    const run = fillBefore(emptyBuild(), 'answer')
    writeSaved({ at: 42, state: run })
    const back = loadSaved()!
    expect(back.at).toBe(42)
    expect(runKey(back.state)).toBe(runKey(run))
    expect(restoreSaved(back)).toEqual(readBuild(keptJson(run)))
  })
  it('restore asks only when the page holds work that is not the saved run', () => {
    const saved = { at: 1, state: half() }
    expect(restoreNeedsConfirm(emptyBuild(), saved)).toBe(false)
    expect(restoreNeedsConfirm(half(), saved)).toBe(false)
    expect(restoreNeedsConfirm({ ...half(), open: 'connect' }, saved)).toBe(false)
    expect(restoreNeedsConfirm(fillBefore(emptyBuild(), 'clean'), saved)).toBe(true)
  })
  it('unreadable saved runs are no saved run', () => {
    for (const raw of [null, '', 'x', '{}', '{"at":"a","state":{}}', '{"at":1}', '[]']) expect(readSaved(raw)).toBeNull()
    expect(isEmptyRun(emptyBuild())).toBe(true)
    expect(isEmptyRun(half())).toBe(false)
  })
})

// ---------------------------------------------------------------- the demo slot

describe('the demo slot', () => {
  it('writing the demo run leaves the learner own run and the saved run alone', () => {
    const own = fillBefore(emptyBuild(), 'model')
    saveBuild(own)
    writeSaved({ at: 1, state: own })
    const before = [store.get(BUILD_KEY), store.get(SAVED_KEY)]
    saveSlot(DEMO_KEY, apply(emptyBuild(), all()))
    saveBuild(emptyBuild(), DEMO_KEY)
    expect([store.get(BUILD_KEY), store.get(SAVED_KEY)]).toEqual(before)
    expect(runKey(loadSlot(BUILD_KEY))).toBe(runKey(own))
    expect(isEmptyRun(loadSlot(DEMO_KEY))).toBe(true)
  })
  it('and the other way round', () => {
    saveSlot(DEMO_KEY, half())
    saveBuild(emptyBuild())
    expect(isEmptyRun(loadSlot(DEMO_KEY))).toBe(false)
  })
  it('#build=kaiyo-sales&demo=1 opens in demo mode, and closing the build forgets it', () => {
    expect(demoFromHash('#build=kaiyo-sales&demo=1')).toBe(true)
    expect(demoFromHash('#demo=1&build=kaiyo-sales')).toBe(true)
    expect(demoFromHash('#build=kaiyo-sales')).toBe(false)
    expect(demoFromHash('#demo=1')).toBe(false)
    expect(hashWithDemo('#build=kaiyo-sales', true)).toBe('#build=kaiyo-sales&demo=1')
    expect(hashWithDemo('#build=kaiyo-sales&demo=1', false)).toBe('#build=kaiyo-sales')
    expect(hashWithDemo('#build=kaiyo-sales&demo=1', true)).toBe('#build=kaiyo-sales&demo=1')
    expect(hashWithoutBuild('#build=kaiyo-sales&demo=1')).toBe('')
  })
})

// ---------------------------------------------------------------- Fill this step

describe('Fill this step', () => {
  it('fills every unit in the order of the page and finishes Connect to Answer, then More', () => {
    const s = apply(emptyBuild(), all())
    expect(s.done).toEqual([...STEP_IDS])
    expect(s.work.connected).toHaveLength(4)
    expect(cleanDone(s.work.passed)).toBe(true)
    expect(s.star).toBe(true)
    expect(s.links.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'F1', 'F2'])
    expect(s.work.dash.tiles).toEqual([...TILE_IDS])
    expect(s.work.dash.answered).toEqual(ANSWERS.map((a) => a.id))
    expect(s.work.more.done).toEqual([...MORE_IDS])
  })
  it('each card puts in its own steps: the same ones as the solved sales of the tests', () => {
    const s = apply(emptyBuild(), unitsOf('connect').concat(unitsOf('clean'), unitsOf('model')))
    expect(s.work.steps.sales.map((x) => [x.kind, JSON.stringify(x.params)])).toEqual(RIGHT_SALES.map((x) => [x.kind, JSON.stringify(x.params)]))
    expect(s.work.steps.products.map((x) => x.kind)).toEqual(['trim', 'upper'])
    expect(s.work.steps.customers.map((x) => x.kind)).toEqual(['latest'])
    expect(s.work.steps.regions.map((x) => x.kind)).toEqual(['distinct', 'extract'])
    expect(s.work.blank).toBe('sale_date, customer_name, sku_code')
    expect(s.work.format).toBe('%d/%m/%Y')
    expect([s.work.p4, s.work.p7]).toEqual(['done', 'done'])
  })
  it('one card at a time: P1 passes only P1 and adds only its steps', () => {
    let s = apply(emptyBuild(), [...unitsOf('connect'), { step: 'clean', card: 'W' }])
    s = fillUnit(s, { step: 'clean', card: 'P1' })
    expect(s.work.passed).toEqual(['W', 'P1'])
    expect(s.work.steps.sales).toEqual([])
    expect(s.work.steps.products).toHaveLength(2)
    // pressed twice, the steps are not piled up
    expect(fillUnit(s, { step: 'clean', card: 'P1' }).work.steps.products).toHaveLength(2)
  })
  it('a try of the learner on the same problem is replaced, not kept beside it', () => {
    let s = apply(emptyBuild(), unitsOf('connect'))
    s = { ...s, work: { ...s.work, steps: { ...s.work.steps, customers: [{ id: 's1', kind: 'distinct', params: {} }] } } }
    s = fillUnit(s, { step: 'clean', card: 'P3' })
    expect(s.work.steps.customers.map((x) => x.kind)).toEqual(['latest'])
  })
  it('a tile puts its blank in and passes only that tile; an answer puts in the right answer', () => {
    let s = fillBefore(emptyBuild(), 'dashboard')
    s = fillUnit(s, { step: 'dashboard', tile: 'line' })
    expect(s.work.dash.tiles).toEqual(['line'])
    expect(s.work.dash.blanks.line).toContain('date_trunc')
    expect(s.done).not.toContain('dashboard')
    for (const q of ANSWERS) {
      const a = fillUnit(emptyBuild(), { step: 'answer', q: q.id }).work.dash.answers[q.id]
      expect(checkAnswer(q.id, a).ok).toBe(true)
    }
    for (const id of MORE_IDS) {
      const m = fillUnit(emptyBuild(), { step: 'more', q: id }).work.more
      expect(checkMoreAnswer(id, m.answers[id]).ok).toBe(true)
      expect(m.done).toEqual([id])
      expect(m.solved).toEqual([])
    }
  })
  it('Fill to here fills every step before and opens the step', () => {
    expect(fillBefore(emptyBuild(), 'connect')).toEqual(emptyBuild())
    const s = fillBefore(emptyBuild(), 'dashboard')
    expect(s.open).toBe('dashboard')
    expect(s.done).toEqual(['connect', 'clean', 'model'])
    expect(s.work.dash.tiles).toEqual([])
    const m = fillBefore(emptyBuild(), 'more')
    expect(m.done).toEqual([...STEP_IDS])
    expect(m.open).toBe('more')
    expect(touchesTables({ step: 'answer', q: 'A1' })).toBe(false)
    expect(touchesTables({ step: 'clean', card: 'P1' })).toBe(true)
    expect(fillBeforeTouchesTables('answer')).toBe(true)
    expect(fillBeforeTouchesTables('more')).toBe(true)
    expect(fillBeforeTouchesTables('clean')).toBe(true)
  })
  it('the states survive being saved and read again', () => {
    const s = apply(emptyBuild(), all())
    expect(runKey(readBuild(keptJson(s)))).toBe(runKey(s))
  })
})

// ---------------------------------------------------------------- loading old saved states

describe('old saved states still load', () => {
  it('a state saved before the Progress menu is the learner own run, and no saved run or demo is invented', () => {
    const old = JSON.stringify({ done: ['connect'], open: 'clean', work: { connected: ['sales', 'customers', 'products', 'regions'] }, links: [], star: false })
    store.set(BUILD_KEY, old)
    const s = loadSlot(BUILD_KEY)
    expect(s.done).toEqual(['connect'])
    expect(s.open).toBe('clean')
    expect(loadSaved()).toBeNull()
    expect(isEmptyRun(loadSlot(DEMO_KEY))).toBe(true)
  })
  it('a v0.32 run (first given step) can be started over and restored as it was', () => {
    const old = JSON.stringify({
      done: ['connect', 'clean'],
      open: 'model',
      work: { connected: ['sales', 'customers', 'products', 'regions'], steps: { sales: [{ id: 'given', kind: 'given', params: { full: '1' } }] }, passed: ['W', 'P1', 'P2', 'P3'] },
    })
    const s = readBuild(old)
    const r = startOver(s, null, 7)
    expect(restoreSaved(r.saved!).work.steps.sales[0].params.full).toBe('1')
    expect(restoreSaved(r.saved!).work.passed).toEqual(['W', 'P1', 'P2', 'P3', 'P5', 'P6'])
  })
  it('garbage in a slot is an empty run', () => {
    store.set(DEMO_KEY, '{nope')
    expect(isEmptyRun(loadSlot(DEMO_KEY))).toBe(true)
  })
})

// ---------------------------------------------------------------- the filled states on the real engine

describe('a filled state is a right state on the engine', () => {
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

  it('Fill to the Dashboard gives the right star after a reset and a restore, and every filled tile passes', async () => {
    const s = fillBefore(emptyBuild(), 'dashboard')
    await resetWork(port)
    await restore(port, s.work, { links: s.links, star: s.star, done: s.done.includes('model') })
    expect(await n('SELECT count(*) FROM build_kaiyo.clean_sales')).toBe(3000)
    expect(await n('SELECT count(*) FROM build_kaiyo.clean_customers')).toBe(144)
    expect(await n('SELECT count(*) FROM build_kaiyo.gold_fact_sales')).toBe(3000)
    expect(await n('SELECT count(*) FROM build_kaiyo.gold_fact_sales WHERE customer_id IS NULL OR product_id IS NULL')).toBe(0)
    for (const id of TILE_IDS) {
      const filled = fillUnit(s, { step: 'dashboard', tile: id })
      const r = await runTile(port, id, filled.work.dash.blanks[id])
      expect(r.ok, id).toBe(true)
    }
  }, 120_000)

  it('the demo run does not leave its tables to the learner own run: a reset and restore of an empty run leaves no gold table', async () => {
    await resetWork(port)
    await restore(port, emptyBuild().work)
    expect(await n(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'build_kaiyo' AND table_name LIKE 'gold_%'`)).toBe(0)
    expect(await n(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'build_kaiyo' AND table_name LIKE 'clean_%'`)).toBe(0)
  }, 60_000)
})
