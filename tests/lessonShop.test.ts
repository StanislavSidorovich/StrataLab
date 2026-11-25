// The demo shop plan (`#lesson=sql&plan=shop`): the questions' shape, and every option's query run on the real demo rows (the same
// way Lab runs it: T-SQL translated by sqlglot, executed by DuckDB). The right option answers; each wrong one fails or answers
// differently, so a click on it shows an error or a visibly different result.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { compareResults, type ResultData } from '../src/core/check'
import { LEVELS, PLAN_PRESETS, isShopKey, parsePlan, planFromHash, planKey, tablesNamed } from '../src/core/lesson'
import { planSchema } from '../src/ui/LessonPlanSlides'
import { sourceText } from '../src/core/lessonResults'
import { emptyCounts, isSlideKey, phoneStart, phoneStatus } from '../src/core/voting'
import { fabricNotes } from '../src/core/sqlPractice'
import { resultRows } from '../src/db/export'
import { DEMO_COLUMNS, DEMO_SQL, DEMO_TABLES } from '../src/data/demo'
import { SHOP_KEYS, SHOP_TABLES } from '../src/data/shopTables'
import { SHOP_VOTES } from '../src/data/lessonVotes/shop'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'

const require = createRequire(import.meta.url)

describe('demo shop plan: shape', () => {
  it('has six questions with four options each, one of them right', () => {
    expect(SHOP_VOTES).toHaveLength(6)
    SHOP_VOTES.forEach((q, i) => {
      expect(q.id).toBe(`d${i + 1}`)
      expect(q.options, q.id).toHaveLength(4)
      expect(q.right >= 0 && q.right < 4, q.id).toBe(true)
      expect(LEVELS).toContain(q.level)
      expect(q.question.length, q.id).toBeGreaterThan(20)
      expect(q.why.length, q.id).toBeGreaterThan(20)
      expect(new Set(q.options.map((o) => o.text)).size, `${q.id}: option texts differ`).toBe(4)
      for (const o of q.options) {
        expect(o.why.length, q.id).toBeGreaterThan(10)
        expect(o.sql, `${q.id}: every option has a query`).toBeTruthy()
        if (o.mssql) expect(o.mssql, q.id).toMatch(/^Msg \d+/)
        expect(o.sql, q.id).not.toMatch(/\blimit\b/i)
        expect(fabricNotes(o.sql!), `${q.id}: ${o.text}`).toEqual([])
        expect(o.sql, q.id).not.toMatch(/quaera\./) // the demo shop only
      }
    })
  })
  it('puts the right answer on three letters at least, not on one', () => {
    expect(new Set(SHOP_VOTES.map((q) => q.right)).size).toBeGreaterThanOrEqual(3)
  })
  it('one topic each, the six asked for', () => {
    expect(new Set(SHOP_VOTES.map((q) => q.topic)).size).toBe(6)
  })
})

describe('demo shop plan: the preset and the link', () => {
  it('is the schema, six votes, the two fill questions and the results', () => {
    expect(PLAN_PRESETS.shop).toBe('s,d1,d2,d3,d4,d5,d6,f1,f2,r')
    const r = planFromHash('#lesson=sql&plan=shop', { warm: 30, shop: SHOP_VOTES.length, fill: 2, votes: {}, tasks: {} })!
    expect(r.items.map(planKey).join(',')).toBe(PLAN_PRESETS.shop)
    expect(r.skipped).toEqual([])
  })
  it('skips a shop question that does not exist', () => {
    const r = planFromHash('#lesson=sql&plan=d1,d9', { warm: 30, shop: SHOP_VOTES.length, votes: {}, tasks: {} })!
    expect(r.items.map(planKey)).toEqual(['d1'])
    expect(r.skipped).toEqual(['d9'])
    expect(planFromHash('#lesson=sql&plan=d1', { warm: 30, votes: {}, tasks: {} })!.skipped).toEqual(['d1']) // a catalog without shop
  })
  it('reads d<n> only as written', () => {
    expect(parsePlan('d3,d3,D4').items.map(planKey)).toEqual(['d3', 'd4'])
    expect(parsePlan('d0,dx,d').bad).toEqual(['d0', 'dx', 'd'])
  })
  it('tells a phone which questions are the shop’s', () => {
    for (const k of ['d1', 'd6', 'f1', 's:shop']) expect(isShopKey(k), k).toBe(true)
    for (const k of ['w1', 'v2', 's', 'r', 'd', 'df', null, undefined, '']) expect(isShopKey(k), String(k)).toBe(false)
  })
})

describe('demo shop plan: the schema slide', () => {
  it('describes exactly the four demo tables and their columns', () => {
    expect(SHOP_TABLES.map((t) => t.name).sort()).toEqual([...DEMO_TABLES].sort())
    for (const t of SHOP_TABLES) expect(t.columns, t.name).toEqual(DEMO_COLUMNS[t.name])
    expect(SHOP_KEYS).toEqual(['order_items.order_id → orders.order_id'])
  })
  it('names demo.<table> after FROM and JOIN', () => {
    expect(tablesNamed('SELECT 1 FROM demo.customers c JOIN demo.orders o ON 1=1', ['customers', 'orders', 'products'])).toEqual(['customers', 'orders'])
  })
  it('shows the four demo tables with their links for the shop plan, not Kaiyo’s', () => {
    const t = planSchema(parsePlan(PLAN_PRESETS.shop).items)
    expect(t.map((x) => x.name).sort()).toEqual([...DEMO_TABLES].sort())
    const links = t.flatMap((x) => x.links.map((l) => `${x.name}.${l.from}→${l.to}`)).sort()
    expect(links).toEqual(['order_items.order_id→orders', 'order_items.product_id→products', 'orders.customer_id→customers'])
  })
})

describe('demo shop plan: on the data', () => {
  let py: PyodideInterface
  let duck: { query: (sql: string) => Parameters<typeof resultRows>[0] }
  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    duck = db.connect()
    for (const s of DEMO_SQL.split(';\n').map((x) => x.trim()).filter(Boolean)) duck.query(s)
    py = await loadPyodide()
    py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
    py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  }, 180_000)

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
  const one = (sql: string) => (attempt(sql) as ResultData).rows[0][0]

  it('the right option answers with rows; every wrong option fails or answers differently', () => {
    for (const q of SHOP_VOTES) {
      const good = attempt(q.options[q.right].sql!)
      expect(isError(good) ? good.error : 'ok', `${q.id}: right option`).toBe('ok')
      const answer = good as ResultData
      expect(answer.rows.length, `${q.id}: right option gives rows`).toBeGreaterThan(0)
      q.options.forEach((o, i) => {
        if (i === q.right) return
        const got = attempt(o.sql!)
        if (isError(got)) return
        expect(compareResults(got, answer, false).ok, `${q.id}: option ${'ABCD'[i]} (${o.text}) gives the right answer`).toBe(false)
      })
    }
  }, 60_000)

  it('an SQL Server line is given only to options that really fail here', () => {
    for (const q of SHOP_VOTES)
      q.options.forEach((o, i) => {
        if (!o.mssql) return
        expect(isError(attempt(o.sql!)), `${q.id} ${'ABCD'[i]} has an SQL Server message but runs`).toBe(true)
      })
  }, 60_000)

  it('the numbers the questions and options state are the data’s', () => {
    expect(Number(one('SELECT COUNT(*) FROM demo.customers'))).toBe(200)
    expect(Number(one("SELECT COUNT(*) FROM demo.customers c WHERE NOT EXISTS (SELECT 1 FROM demo.orders o WHERE o.customer_id = c.customer_id AND o.status = 'returned')"))).toBe(74)
    expect(Number(one("SELECT COUNT(*) FROM demo.orders WHERE status = 'returned'"))).toBe(202)
    expect(Number(one("SELECT COUNT(*) FROM demo.orders WHERE status = 'delivered'"))).toBe(871)
    expect(Number(one("SELECT COUNT(DISTINCT customer_id) FROM demo.orders WHERE status = 'delivered'"))).toBe(197)
    // the full-name trap of d5 needs customers who share a name
    expect(Number(one('SELECT COUNT(*) - COUNT(DISTINCT full_name) FROM demo.customers'))).toBeGreaterThan(0)
  })
})

describe('demo shop plan: phones and the results slide', () => {
  it('a schema slide key is no question: the phone has nothing to vote on', () => {
    const room = (q_key: string | null) => ({ ...phoneStart(), room: { q_key, q_label: 'Step 1 of 8', open: true, counts: emptyCounts(), total: 0 } })
    expect(phoneStatus(room('s:shop'))).toBe('none')
    expect(phoneStatus(room('s'))).toBe('none')
    expect(phoneStatus(room('d1'))).toBe('open')
    expect(phoneStatus(room('r'))).toBe('results')
    expect(isSlideKey('s:shop')).toBe(true)
    expect(isSlideKey('d1')).toBe(false)
  })
  it('says "1 phone", not "1 phones"', () => {
    expect(sourceText(1, 'phones')).toBe('phone')
    expect(sourceText(2, 'phones')).toBe('phones')
    expect(sourceText(0, 'phones')).toBe('phones')
    expect(sourceText(1, 'hands')).toBe('hand')
    expect(sourceText(7, 'hands')).toBe('hands')
  })
})
