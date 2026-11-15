// The Power BI practice page (pass 1): the number reader, the truth of every task computed with DuckDB over the same CSV
// files the learner gets, the drills' zips, and the content rules. The CSV files in public/datasets/powerbi/ are what the
// Power BI bridge writes for the solved run (tests/fixtures/build/v1.json): the first test rebuilds them and compares;
// PBI_DATA_OUT=1 rewrites them.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { readBuild } from '../src/core/build'
import { csvText, shortName } from '../src/core/powerBi'
import {
  STAR,
  checkNumber,
  dataRows,
  drillFiles,
  drillStepsHtml,
  drillZip,
  fillTotal,
  isDrill,
  numberMessage,
  numberOf,
  orderVerdict,
  parseCsv,
  progressIds,
  readNumber,
  shuffledOrder,
  starFile,
  tasksA,
  withStar,
  type PbiDrill,
  type StarName,
  TOTAL_SQL,
} from '../src/core/powerBiPractice'
import { practiceFromHash, hashWithPractice } from '../src/core/sqlPractice'
import { BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { SECTIONS, SECTION_TASKS } from '../src/data/powerBiPractice'
import { connect, prepare, restore } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import { starTables } from '../src/db/powerBiRun'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)
const DIR = 'public/datasets/powerbi'
const csvs = Object.fromEntries(STAR.map((n) => [n, new Uint8Array(readFileSync(`${DIR}/${n}.csv`))])) as Record<StarName, Uint8Array>
const drills = SECTIONS.flatMap((s) => s.blocks.filter(isDrill).map((d) => ({ s, d })))
let conn: { query(sql: string): { toArray(): unknown[] } }
let port: SqlPort
const q = async (sql: string) => numberOf(resultRows(conn.query(withStar(sql)) as never).rows)

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  conn = db.connect()
  for (const n of STAR) db.registerFileBuffer(starFile(n), csvs[n].slice())
  port = {
    query: async (sql) => resultRows(conn.query(sql) as never) as ResultData,
    registerText: async (name, text) => void db.registerFileText(name, text),
    parquet: async (folder, file) => resolve('public/datasets', folder, file).split(String.fromCharCode(92)).join('/'),
  }
}, 240_000)

describe('the CSV files of the star', () => {
  it('are what the bridge writes for the solved run', async () => {
    const state = readBuild(readFileSync('tests/fixtures/build/v1.json', 'utf8'))
    await prepare(port)
    for (const s of BUILD_SOURCES) await connect(port, s.id)
    await restore(port, state.work, { links: state.links, star: state.star, done: true })
    const tables = await starTables(port)
    expect(tables.map((t) => shortName(t.table)).sort()).toEqual([...STAR].sort())
    for (const t of tables) {
      const text = csvText(t.columns.map((c) => c.name), t.rows)
      const name = shortName(t.table)
      if (process.env.PBI_DATA_OUT) writeFileSync(`${DIR}/${name}.csv`, text)
      else expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvs[name as StarName]), `${name}.csv differs from the bridge's: run with PBI_DATA_OUT=1`).toBe(text)
    }
  }, 240_000)

  it('have the sizes the design names: 3000 sales, 144 customers, 47 products', () => {
    expect([dataRows(csvs.fact_sales), dataRows(csvs.dim_customer), dataRows(csvs.dim_product)]).toEqual([3000, 144, 47])
  })
})

describe('reading a typed number', () => {
  const one = (s: string) => readNumber(s).map((r) => r.value)
  it('reads the formats a card can show', () => {
    expect(one('1234.56')).toEqual([1234.56])
    expect(one('1 234,56')).toEqual([1234.56])
    expect(one('1 234,56')).toEqual([1234.56])
    expect(one('1,234.56')).toEqual([1234.56])
    expect(one('1.234,56')).toEqual([1234.56])
    expect(one("1'234.56")).toEqual([1234.56])
    expect(one('1,234,567.5')).toEqual([1234567.5])
    expect(one('1.234.567,5')).toEqual([1234567.5])
    expect(one('3000')).toEqual([3000])
    expect(one('  42  ')).toEqual([42])
    expect(one('$1,234.56')).toEqual([1234.56])
    expect(one('-12.5')).toEqual([-12.5])
    expect(one('−12,5')).toEqual([-12.5])
  })
  it('reads Display units: K, M, B with their precision', () => {
    const r = readNumber('1.23K')[0]
    expect(r.value).toBeCloseTo(1230)
    expect(r.tol).toBeCloseTo(5)
    expect(r.units).toBe(true)
    expect(one('314.91k')).toEqual([314910])
    expect(readNumber('1.47M')[0].value).toBeCloseTo(1470000)
    expect(one('2B')).toEqual([2e9])
  })
  it('keeps both readings of an ambiguous single separator, and only then', () => {
    expect(one('1,234')).toEqual([1234, 1.234])
    expect(one('1.234')).toEqual([1.234, 1234])
    expect(one('12,5')).toEqual([12.5])
    expect(one('1.2345')).toEqual([1.2345])
    expect(one('0.123')).toEqual([0.123])
    expect(one('1,234,567')).toEqual([1234567])
  })
  it('does not read what is not a number', () => {
    for (const s of ['', '  ', 'abc', '1,2,3.4.5', '1..2', '12 34', '--1', 'K', '1.234,56,7', '12abc', ',', '%'] ) expect(readNumber(s), s).toEqual([])
  })
  it('reads percent with or without the sign', () => {
    expect(readNumber('11.8%')[0]).toMatchObject({ value: 11.8, percent: true })
    expect(readNumber('11.8')[0].percent).toBe(false)
  })
})

describe('checking a typed number', () => {
  const traps = [{ value: 521.54, says: 'AVERAGE skips blanks.' }]
  it('empty is not checked, unreadable says so', () => {
    expect(checkNumber('', 491.28)).toEqual({ kind: 'empty' })
    expect(checkNumber('   ', 491.28)).toEqual({ kind: 'empty' })
    expect(checkNumber('abc', 491.28)).toEqual({ kind: 'unreadable' })
    expect(numberMessage({ kind: 'unreadable' }).ok).toBe(false)
  })
  it('accepts every format of the right number', () => {
    for (const s of ['314906.13', '314,906.13', '314 906,13', '314.906,13', '314906,13', "314'906.13"]) expect(checkNumber(s, 314906.13), s).toEqual({ kind: 'right', rounded: false, units: false })
    expect(checkNumber('3000', 3000)).toEqual({ kind: 'right', rounded: false, units: false })
    expect(checkNumber('3,000', 3000)).toMatchObject({ kind: 'right' })
    expect(checkNumber('3.000', 3000)).toMatchObject({ kind: 'right' })
  })
  it('accepts a rounded value and says so; Display units get their own line', () => {
    expect(checkNumber('314.91K', 314906.13)).toEqual({ kind: 'right', rounded: true, units: true })
    expect(checkNumber('314906', 314906.13)).toEqual({ kind: 'right', rounded: true, units: false })
    expect(checkNumber('314906.1', 314906.13)).toMatchObject({ kind: 'right', rounded: true })
    expect(checkNumber('1.47M', 1473843.82)).toMatchObject({ kind: 'right', rounded: true, units: true })
    expect(numberMessage({ kind: 'right', rounded: true, units: true }).detail).toMatch(/Display units to None/)
    expect(numberMessage({ kind: 'right', rounded: false, units: false }).detail).toBe('')
  })
  it('does not accept a number that is too coarse to say anything, or a near miss', () => {
    expect(checkNumber('1.5M', 1473843.82)).toEqual({ kind: 'coarse' })
    expect(checkNumber('1M', 1473843.82).kind).toBe('coarse')
    expect(checkNumber('314906.14', 314906.13).kind).toBe('wrong')
    expect(checkNumber('491.3', 491.28)).toMatchObject({ kind: 'right', rounded: true })
    expect(checkNumber('491.4', 491.28).kind).toBe('wrong')
    expect(checkNumber('492', 491.28).kind).toBe('wrong')
    expect(checkNumber('45.4', 45).kind).toBe('wrong')
  })
  it('names a known trap', () => {
    expect(checkNumber('521.54', 491.28, { traps })).toEqual({ kind: 'trap', says: 'AVERAGE skips blanks.' })
    expect(checkNumber('521,54', 491.28, { traps }).kind).toBe('trap')
    expect(checkNumber('999', 491.28, { traps }).kind).toBe('wrong')
    // the right number wins over a trap that happens to be equal
    expect(checkNumber('491.28', 491.28, { traps: [{ value: 491.28, says: 'x' }] }).kind).toBe('right')
  })
  it('a negative where a positive is expected: the returns hint', () => {
    expect(checkNumber('-16528', 16528).kind).toBe('sign')
    expect(checkNumber('(16528)', 16528).kind).toBe('sign')
    expect(numberMessage({ kind: 'sign' }).detail).toMatch(/Returns are units < 0/)
    expect(checkNumber('-16528', -16528).kind).toBe('right')
    expect(checkNumber('-5', 0).kind).toBe('wrong')
  })
  it('percent: 11.8, 11.8% and 0.118 all count', () => {
    for (const s of ['11.8', '11.8%', '0.118', '11,8 %']) expect(checkNumber(s, 11.8, { percent: true }).kind, s).toBe('right')
    expect(checkNumber('12', 11.8, { percent: true }).kind).toBe('coarse')
    expect(checkNumber('13', 11.8, { percent: true }).kind).toBe('wrong')
  })
})

describe('the truth of the tasks, computed over the CSV files', () => {
  const rows = (n: StarName) => parseCsv(new TextDecoder('utf-8').decode(csvs[n]))
  const fact = rows('fact_sales').slice(1)
  const cust = rows('dim_customer')
  const ci = (c: string) => cust[0].indexOf(c)
  const chain = new Map(cust.slice(1).map((r) => [r[ci('customer_id')], r[ci('chain_name')]]))
  const cents = (r: string[]) => Math.round(Number(r[4]) * 100)

  it('every query returns one number, starts with SELECT, and every trap differs from the truth', async () => {
    const sqls: { id: string; sql: string; traps: string[] }[] = []
    for (const s of SECTIONS) {
      for (const b of s.blocks) {
        if (b.kind === 'predict') sqls.push({ id: b.id, sql: b.sql, traps: (b.traps ?? []).map((t) => t.sql) })
        if (isDrill(b)) for (const c of b.checks) sqls.push({ id: `${b.id}:${c.id}`, sql: c.sql, traps: (c.traps ?? []).map((t) => t.sql) })
      }
    }
    expect(sqls.length).toBeGreaterThanOrEqual(12)
    for (const { id, sql, traps } of sqls) {
      const v = await q(sql)
      expect(Number.isFinite(v), id).toBe(true)
      expect(traps.length, `${id} has a trap`).toBeGreaterThan(0)
      for (const t of traps) expect(await q(t), `${id}: a trap must differ from the answer`).not.toBe(v)
    }
  })

  it('the drills\' numbers equal an independent sum over the parsed files', async () => {
    const total = fact.reduce((a, r) => a + (r[4] === '' ? 0 : cents(r)), 0) / 100
    const empty = fact.filter((r) => r[4] === '').length
    expect(await q('SELECT count(*) FROM fact_sales')).toBe(fact.length)
    expect(await q('SELECT count(*) FROM fact_sales WHERE revenue IS NULL')).toBe(empty)
    expect(empty).toBeGreaterThan(0)
    expect(await q(TOTAL_SQL)).toBe(total)
    expect(await q('SELECT round(sum(revenue) / count(*), 2) FROM fact_sales')).toBe(Math.round(total / fact.length * 100) / 100)
    expect(await q('SELECT round(avg(revenue), 2) FROM fact_sales')).toBe(Math.round(total / (fact.length - empty) * 100) / 100)
    expect(await q('SELECT count(DISTINCT customer_id) FROM fact_sales')).toBe(new Set(fact.map((r) => r[1])).size)
    expect(await q('SELECT sum(units) FROM fact_sales')).toBe(fact.reduce((a, r) => a + Number(r[3]), 0))
    expect(await q("SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-08'")).toBe(fact.filter((r) => r[0].startsWith('2025-08') && r[4] !== '').reduce((a, r) => a + cents(r), 0) / 100)
    const minori = fact.filter((r) => chain.get(r[1]) === 'Minori' && r[4] !== '').reduce((a, r) => a + cents(r), 0) / 100
    expect(await q("SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.chain_name = 'Minori'")).toBe(minori)
    const blank = fact.filter((r) => chain.get(r[1]) === '' && r[4] !== '').reduce((a, r) => a + cents(r), 0) / 100
    expect(await q('SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.chain_name IS NULL')).toBe(blank)
    const sold = new Set(fact.map((r) => r[1]))
    expect(await q('SELECT count(*) FROM dim_customer WHERE customer_id NOT IN (SELECT customer_id FROM fact_sales)')).toBe(cust.slice(1).filter((r) => !sold.has(r[ci('customer_id')])).length)
    // the numbers the Answer step of the build already holds (314,906.13 for Jan to Jun 2026, 64,592.75 in August 2025)
    expect(await q("SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'")).toBe(314906.13)
    expect(await q("SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-08'")).toBe(64592.75)
  })

  it('the traps of the drills really are the numbers they name', async () => {
    expect(await q('SELECT count(*) FROM (SELECT * FROM fact_sales LIMIT 1000) WHERE revenue IS NULL')).toBe(fact.slice(0, 1000).filter((r) => r[4] === '').length)
    expect(fact.slice(0, 1000).filter((r) => r[4] === '').length).toBeLessThan(fact.filter((r) => r[4] === '').length)
  })

  it('the snippet that shows the total shows the computed one', async () => {
    const snippet = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'spot' && b.id === 'md-same')
    expect(snippet && 'snippet' in snippet && snippet.snippet).toBeTruthy()
    const text = fillTotal((snippet as { snippet: string }).snippet, await q(TOTAL_SQL))
    expect(text).not.toContain('{{TOTAL}}')
    expect(text).toContain((await q(TOTAL_SQL)).toLocaleString('en-US', { minimumFractionDigits: 2 }))
  })
})

describe('the zip of a drill', () => {
  it('has the three CSV files untouched, steps.html, the start notes and the README', () => {
    expect(drills.length).toBe(3)
    for (const { s, d } of drills) {
      const number = String(s.n)
      const files = unzipSync(drillZip(d, csvs, number))
      expect(Object.keys(files).sort()).toEqual(['README.txt', 'data/dim_customer.csv', 'data/dim_product.csv', 'data/fact_sales.csv', 'start/start-from-scratch.txt', 'steps.html'])
      for (const n of STAR) expect(Buffer.from(files[`data/${n}.csv`]).equals(Buffer.from(csvs[n])), `${n}.csv is byte for byte`).toBe(true)
      expect([...files['data/fact_sales.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      expect(strFromU8(files['README.txt'])).toContain('steps.html')
      expect(Object.keys(drillFiles(d, csvs, number))).toHaveLength(6)
    }
  })

  it('steps.html: one page, no scripts, bridge style, v2 lessons, the checks, and none of the answers', async () => {
    for (const { s, d } of drills) {
      const number = String(s.n)
      const html = drillStepsHtml(d, csvs, number)
      expect(html, d.id).not.toMatch(/<script|<img|<link|src=|\son[a-z]+=|\{\{/i)
      expect(html).toContain('<div class="check">')
      expect(html).toContain('type your numbers into Lab')
      expect(html).toContain(`Drill ${number}: ${d.title}`)
      expect((html.match(/<br>If /g) ?? []).length, 'one "If" line per check').toBe(d.checks.length)
      expect(d.ifWrong.length).toBe(d.checks.length)
      // the page teaches how to check but never gives the answer
      for (const c of d.checks) {
        const v = await q(c.sql)
        for (const text of [v.toLocaleString('en-US', { minimumFractionDigits: 2 }), v.toFixed(2), v.toLocaleString('en-US')]) if (v >= 1000 || !Number.isInteger(v)) expect(html, `${d.id}:${c.id} must not print ${text}`).not.toContain(text)
      }
    }
  })

  it('later drills say how to start from scratch in 2 minutes, the first one starts with the files', () => {
    const [d1, d3, d4] = drills.map((x) => x.d)
    expect(drillStepsHtml(d1, csvs, '1')).not.toContain('From scratch')
    const h3 = drillStepsHtml(d3, csvs, '3')
    expect(h3).toContain('From scratch, about 2 minutes')
    expect(h3).toContain('Text/CSV')
    const h4 = drillStepsHtml(d4, csvs, '4')
    expect(h4).toContain('From scratch, about 2 minutes')
    expect(h4).toContain('fact_sales[customer_id]')
    expect(h4).toContain('dim_product[product_id]')
    const start = strFromU8(unzipSync(drillZip(d4, csvs, '4'))['start/start-from-scratch.txt'])
    expect(start).toMatch(/^Start from scratch/)
    expect(start).toContain('1. ')
    expect(start).toContain('2. ')
    expect(start).not.toContain('<')
  })

  it('the model drill has the star picture and exactly the two links; the measures drill has the v2 lessons', () => {
    const [, d3, d4] = drills.map((x) => x.d)
    const h3 = drillStepsHtml(d3, csvs, '3')
    expect(h3).toMatch(/<svg role="img"/)
    expect((h3.match(/<line /g) ?? []).length).toBe(2)
    expect(h3).toContain('delete any line that is not in this picture')
    expect(h3).toContain('Many to one (*:1)')
    expect(h3).toContain('not <code>customer_name</code>')
    const h4 = drillStepsHtml(d4 as PbiDrill, csvs, '4')
    expect(h4).toContain('New column</b> (<b>not</b> New measure)')
    expect(h4).toContain("A single value for column 'sale_date'")
    expect(h4).toContain('Display units: None')
    expect(h4).toContain('Month = FORMAT(fact_sales[sale_date], "yyyy-mm")')
  })
})

describe('the content', () => {
  it('has sections 1, 3 and 4 complete and 2, 5 to 8 as coming next', () => {
    expect(SECTIONS.map((s) => [s.n, !!s.soon])).toEqual([[1, false], [2, true], [3, false], [4, false], [5, true], [6, true], [7, true], [8, true]])
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length)
    for (const s of SECTIONS.filter((x) => !x.soon)) {
      const a = tasksA(s)
      expect(a.length, s.id).toBeGreaterThanOrEqual(3)
      expect(a.length, s.id).toBeLessThanOrEqual(5)
      expect(s.blocks.filter(isDrill)).toHaveLength(1)
      expect(s.blocks[s.blocks.length - 1].kind, 'the drill is last').toBe('drill')
    }
    expect(SECTION_TASKS.map((s) => s.id)).toEqual(['get-data', 'model', 'measures'])
  })

  it('has unique ids, one right option that exists, a reason for every wrong one, hints, and a trap for every number', () => {
    const ids = SECTIONS.flatMap((s) => progressIds(s))
    expect(new Set(ids).size).toBe(ids.length)
    const kinds = new Set(SECTIONS.flatMap((s) => tasksA(s).map((t) => t.kind)))
    expect([...kinds].sort()).toEqual(['order', 'pick', 'predict', 'spot'])
    for (const s of SECTIONS) {
      for (const t of tasksA(s)) {
        expect(t.hints.length, t.id).toBeGreaterThanOrEqual(1)
        expect(t.explain.length, t.id).toBeGreaterThan(20)
        if (t.kind === 'pick' || t.kind === 'spot') {
          expect(t.options.filter((o) => o.id === t.right)).toHaveLength(1)
          expect(new Set(t.options.map((o) => o.id)).size).toBe(t.options.length)
          for (const o of t.options) if (o.id !== t.right) expect(o.why.length, `${t.id}:${o.id} says why not`).toBeGreaterThan(10)
          expect(t.options.length).toBeGreaterThanOrEqual(3)
        }
        if (t.kind === 'order') expect(t.steps.length).toBeGreaterThanOrEqual(3)
      }
      for (const d of s.blocks.filter(isDrill)) {
        expect(d.zip).toMatch(/^kaiyo-powerbi-\d-[a-z-]+\.zip$/)
        expect(d.hints.length).toBeGreaterThanOrEqual(2)
        expect(d.checks.length).toBeGreaterThanOrEqual(2)
        for (const c of d.checks) expect(c.traps?.length, `${d.id}:${c.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('layer A numbers are asked as numbers: a predict task names no answer in its question', async () => {
    for (const t of SECTIONS.flatMap(tasksA)) {
      if (t.kind !== 'predict') continue
      const v = await q(t.sql)
      expect(t.question, t.id).not.toContain(v.toLocaleString('en-US'))
    }
  })
})

describe('order tasks and the address', () => {
  it('a shuffle is never the right order and is the same for the same task', () => {
    for (const s of SECTIONS) for (const t of tasksA(s)) if (t.kind === 'order') {
      const a = shuffledOrder(t.steps.length, t.id)
      expect([...a].sort()).toEqual(t.steps.map((_, i) => i))
      expect(a.some((v, i) => v !== i)).toBe(true)
      expect(shuffledOrder(t.steps.length, t.id)).toEqual(a)
    }
    for (let n = 2; n < 8; n++) for (const seed of ['a', 'b', 'gd-order']) expect(shuffledOrder(n, seed).some((v, i) => v !== i)).toBe(true)
  })
  it('judges an order: how many are in place and the first that is not', () => {
    expect(orderVerdict([0, 1, 2, 3])).toEqual({ ok: true, inPlace: 4, firstWrong: null })
    expect(orderVerdict([0, 2, 1, 3])).toEqual({ ok: false, inPlace: 2, firstWrong: 1 })
  })
  it('#practice=powerbi is read, with and without a section', () => {
    expect(practiceFromHash('#practice=powerbi')).toEqual({ kind: 'powerbi', at: null })
    expect(practiceFromHash('#practice=powerbi&at=model')).toEqual({ kind: 'powerbi', at: 'model' })
    expect(practiceFromHash('#practice=powerbix')).toBeNull()
    expect(hashWithPractice('#ds=quaera', 'model', 'powerbi')).toBe('#practice=powerbi&at=model&ds=quaera')
  })
  it('parses a CSV: BOM, quotes, CRLF, a last line without a line break', () => {
    expect(parseCsv('﻿a,b\r\n1,"x,y"\r\n"q""r",\n3,4')).toEqual([['a', 'b'], ['1', 'x,y'], ['q"r', ''], ['3', '4']])
  })
})
