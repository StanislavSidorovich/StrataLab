// The warm-up questions of lesson mode: their shape, and every option's query run on the real Kaiyo rows (the same way
// Lab runs it: T-SQL translated by sqlglot, executed by DuckDB). The right option answers; each wrong one fails or
// answers differently, so a click on it shows an error or a visibly different result.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { compareResults, type ResultData } from '../src/core/check'
import { LEVELS } from '../src/core/lesson'
import { fabricNotes } from '../src/core/sqlPractice'
import { resultRows } from '../src/db/export'
import { datasetById } from '../src/data/datasets'
import { WARMUP } from '../src/data/lessonVotes/warmup'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'

const require = createRequire(import.meta.url)

describe('warm-up: shape', () => {
  it('has 30 questions with four options each, one of them right', () => {
    expect(WARMUP).toHaveLength(30)
    expect(new Set(WARMUP.map((q) => q.id)).size).toBe(30)
    WARMUP.forEach((q, i) => {
      expect(q.id).toBe(`w${i + 1}`)
      expect(q.options, q.id).toHaveLength(4)
      expect(q.right >= 0 && q.right < 4, q.id).toBe(true)
      expect(LEVELS).toContain(q.level)
      expect(q.topic.length, q.id).toBeGreaterThan(3)
      expect(q.question.length, q.id).toBeGreaterThan(20)
      expect(q.why.length, q.id).toBeGreaterThan(20)
      expect(new Set(q.options.map((o) => o.text)).size, `${q.id}: option texts differ`).toBe(4)
      for (const o of q.options) {
        expect(o.why.length, q.id).toBeGreaterThan(10)
        if (o.mssql) expect(o.mssql, q.id).toMatch(/^Msg \d+/)
      }
    })
  })
  it('puts the right answer on every letter, not always on one', () => {
    const where = new Set(WARMUP.map((q) => q.right))
    expect(where.size).toBe(4)
    for (let l = 0; l < 4; l++) expect(WARMUP.filter((q) => q.right === l).length).toBeGreaterThanOrEqual(4)
  })
  it('mixes the levels', () => {
    expect(WARMUP.filter((q) => q.level === 'easy').length).toBeGreaterThanOrEqual(8)
    expect(WARMUP.filter((q) => q.level === 'tricky').length).toBeGreaterThanOrEqual(3)
  })
  it('writes every query as T-SQL for Fabric: TOP, never LIMIT', () => {
    for (const q of WARMUP)
      for (const o of q.options) {
        if (!o.sql) continue
        expect(o.sql, q.id).not.toMatch(/\blimit\b/i)
        expect(fabricNotes(o.sql), `${q.id}: ${o.text}`).toEqual([])
      }
  })
  it('gives the right option a query, and a tag for the wrong ones only where SQL Server is known', () => {
    for (const q of WARMUP) {
      expect(q.options[q.right].sql, q.id).toBeTruthy()
      expect(q.options[q.right].mssql, q.id).toBeUndefined()
    }
  })
})

describe('warm-up: on the data', () => {
  let py: PyodideInterface
  let duck: { query: (sql: string) => Parameters<typeof resultRows>[0] }
  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    duck = db.connect()
    duck.query('CREATE SCHEMA quaera')
    for (const t of datasetById('quaera')!.tables) duck.query(`CREATE TABLE quaera."${t.name}" AS SELECT * FROM read_parquet('${resolve('public/datasets/quaera', t.file).replace(/\\/g, '/')}')`)
    py = await loadPyodide()
    py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
    py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  }, 180_000)

  /** The result, or the error text: what a click on an option shows. */
  function attempt(sql: string): ResultData | { error: string } {
    py.globals.set('_script', sql)
    const t = JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')) as TranslatedStatement[]
    if (t.some((s) => s.error)) return { error: t.find((s) => s.error)!.error! }
    try {
      return resultRows(duck.query(duckdbScript(t)))
    } catch (e) {
      return { error: String(e) }
    }
  }
  const isError = (r: ReturnType<typeof attempt>): r is { error: string } => 'error' in r

  it('the right option answers (with rows); every wrong option fails or answers differently', () => {
    for (const q of WARMUP) {
      const good = attempt(q.options[q.right].sql!)
      expect(isError(good) ? good.error : 'ok', `${q.id}: right option`).toBe('ok')
      const answer = good as ResultData
      expect(answer.rows.length === 0, `${q.id}: right option gives ${answer.rows.length} rows`).toBe(!!q.empty)
      q.options.forEach((o, i) => {
        if (i === q.right || !o.sql) return
        const got = attempt(o.sql)
        if (isError(got)) return
        expect(compareResults(got, answer, false).ok, `${q.id}: option ${'ABCD'[i]} (${o.text}) gives the right answer`).toBe(false)
      })
    }
  }, 60_000)

  it('an SQL Server line is given only to options that really fail here', () => {
    for (const q of WARMUP)
      q.options.forEach((o, i) => {
        if (!o.mssql) return
        expect(o.sql, `${q.id} ${'ABCD'[i]}`).toBeTruthy()
        expect(isError(attempt(o.sql!)), `${q.id} ${'ABCD'[i]} has an SQL Server message but runs`).toBe(true)
      })
  }, 60_000)

  it('the numbers the options and questions state are the data’s', () => {
    const one = (sql: string) => (attempt(sql) as ResultData).rows[0][0]
    expect(Number(one('SELECT COUNT(*) FROM quaera.fact_sellout'))).toBe(118449)
    expect(Number(one('SELECT COUNT(promo_id) FROM quaera.fact_sellout'))).toBe(23849)
    expect(Number(one('SELECT COUNT(DISTINCT promo_id) FROM quaera.fact_sellout'))).toBe(89)
    expect(Number(one('SELECT COUNT(*) FROM quaera.fact_sellout WHERE promo_id = 5'))).toBe(870)
    expect(Number(one('SELECT COUNT(*) FROM quaera.dim_customer'))).toBe(144)
    expect(Number(one('SELECT COUNT(*) FROM quaera.dim_product'))).toBe(47)
    expect(Number(one('SELECT COUNT(*) FROM quaera.dim_region'))).toBe(16)
    expect(Number(one('SELECT COUNT(DISTINCT brand) FROM quaera.dim_product'))).toBe(9)
    expect(Number(one('SELECT COUNT(DISTINCT customer_id) FROM quaera.fact_sellout'))).toBe(132)
    expect(Number(one('SELECT COUNT(*) FROM quaera.dim_customer WHERE chain_name IS NULL'))).toBe(73)
    const fan = (attempt('SELECT COUNT(*), COUNT(DISTINCT c.customer_id) FROM quaera.dim_customer AS c JOIN quaera.dim_rep AS r ON r.region_id = c.region_id') as ResultData).rows[0]
    expect(fan.map(Number)).toEqual([291, 127])
    expect(Number(one('SELECT COUNT(*) FROM (SELECT DISTINCT customer_id, week_start FROM quaera.fact_sellout) AS t'))).toBe(17035)
    expect(Number(one('SELECT COUNT(*) FROM quaera.dim_customer AS c WHERE NOT EXISTS (SELECT 1 FROM quaera.dim_customer AS o WHERE o.served_by_distributor_id = c.customer_id)'))).toBe(132)
  })
})
