// The warm-up pipeline (stores by region): run on the real parquet files in duckdb-node-blocking through the same SQL the page uses.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { resultRows } from '../src/db/export'
import type { SqlPort } from '../src/db/pipelineRun'
import { prepareTutorial, resetTutorial, runTutorial, storesText, type TutPlacedStep } from '../src/db/tutorialRun'
import { TUT_BLOCKS, TUT_LANES, WATCH_CAPTIONS } from '../src/data/pipelines/storesByRegion'

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
    registerText: async (name, text) => {
      db.registerFileText(name, text)
    },
    parquet: async (folder, file) => resolve('public/datasets', folder, file).replace(/\\/g, '/'),
  }
  await prepareTutorial(port)
}, 120_000)

const all = (when: TutPlacedStep['when'] = 'succeeded'): TutPlacedStep[] => TUT_BLOCKS.map((b, i) => ({ id: b.id, when: i === 0 ? null : when }))
const one = async (sql: string) => (await port.query(sql)).rows[0][0]

describe('warm-up pipeline', () => {
  it('has one block per step, in lanes that exist, each with a caption', () => {
    expect(TUT_BLOCKS).toHaveLength(4)
    for (const b of TUT_BLOCKS) {
      expect(TUT_LANES.some((l) => l.id === b.lane)).toBe(true)
      expect(WATCH_CAPTIONS[b.id].length).toBeGreaterThan(20)
      expect(`${b.does}${b.fabric}${WATCH_CAPTIONS[b.id]}`).not.toMatch(/[—–]/)
    }
  })
  it('writes a field with a space in quotes and NULL as nothing', () => {
    expect(storesText([[1, ' Setouchi Co. ', null]])).toBe('customer_id;customer_name;customer_type;chain_name;region_id;is_active\n1;" Setouchi Co. ";\n')
  })
  it('runs the four steps: the file as text, active stores, stores per region, the card', async () => {
    await resetTutorial(port)
    const j = await runTutorial(port, all())
    expect(j.map((r) => r.status)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded'])
    const customers = Number(await one(`SELECT count(*) FROM read_parquet('${await port.parquet('quaera', 'dim_customer.parquet')}')`))
    expect(j[0].rows).toBe(customers)
    const active = Number(await one(`SELECT count(*) FROM read_parquet('${await port.parquet('quaera', 'dim_customer.parquet')}') WHERE is_active = 1 AND customer_type <> 'distributor'`))
    expect(j[1].rows).toBeGreaterThan(0)
    expect(Number(await one('SELECT sum(stores) FROM pipe_tutorial.gold_stores_by_region'))).toBe(active)
    expect(Number(await one('SELECT stores FROM pipe_tutorial.report_regions LIMIT 1'))).toBe(Number(await one('SELECT max(stores) FROM pipe_tutorial.gold_stores_by_region')))
  })
  it('runs only what is placed: the first lane gives bronze and nothing after it', async () => {
    await resetTutorial(port)
    const j = await runTutorial(port, all().slice(0, 1))
    expect(j[0].status).toBe('succeeded')
    expect(Number(await one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'pipe_tutorial' AND table_name = 'bronze_stores'"))).toBe(1)
    expect(Number(await one("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'pipe_tutorial' AND table_name = 'silver_stores'"))).toBe(0)
  })
  it('a step placed before its builder fails and names what to move, and the rest are skipped', async () => {
    await resetTutorial(port)
    const order = [TUT_BLOCKS[0], TUT_BLOCKS[2], TUT_BLOCKS[1], TUT_BLOCKS[3]].map((b, i): TutPlacedStep => ({ id: b.id, when: i === 0 ? null : 'succeeded' }))
    const j = await runTutorial(port, order)
    expect(j.map((r) => r.status)).toEqual(['succeeded', 'failed', 'skipped', 'skipped'])
    expect(j[1].message).toMatch(/silver_stores, which is not built yet/)
  })
  it('Completed lets the next step run after a failure', async () => {
    await resetTutorial(port)
    const order: TutPlacedStep[] = [
      { id: 'count-regions', when: null },
      { id: 'copy-stores', when: 'completed' },
    ]
    const j = await runTutorial(port, order)
    expect(j.map((r) => r.status)).toEqual(['failed', 'succeeded'])
  })
})
