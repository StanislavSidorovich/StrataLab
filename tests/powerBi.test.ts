// The Power BI bridge (v0.40.0): the zip made from the saved run v1 on the real parquet files in duckdb-node-blocking.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ResultData } from '../src/core/check'
import { readBuild } from '../src/core/build'
import { chainTotals, starSvg, checkNumbers, csvPath, csvText, exportBlocker, powerBiType, powerBiZip, shortName, starLinks, stepsHtml, type StarTable } from '../src/core/powerBi'
import { BUILD_SOURCES } from '../src/data/build/kaiyoSales'
import { connect, prepare, restore } from '../src/db/buildRun'
import { resultRows } from '../src/db/export'
import { starTables } from '../src/db/powerBiRun'
import type { SqlPort } from '../src/db/pipelineRun'

const require = createRequire(import.meta.url)
let port: SqlPort
let tables: StarTable[]
const state = readBuild(readFileSync('tests/fixtures/build/v1.json', 'utf8'))

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
  await restore(port, state.work, { links: state.links, star: state.star, done: true })
  tables = await starTables(port)
}, 240_000)

/** The file's text with its BOM kept (a TextDecoder drops it). */
const csvOf = (b: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(b)

/** A small CSV reader for the test: BOM off, quotes, LF. */
function parse(text: string): string[][] {
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (const ch of text.slice(1)) {
    if (q) {
      if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  return rows
}

describe('power bi zip', () => {
  it('holds the CSV of every star table, steps.html and README.txt', () => {
    const files = unzipSync(powerBiZip(tables, state.links))
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'data/dim_customer.csv', 'data/dim_product.csv', 'data/fact_sales.csv', 'steps.html'])
    expect(strFromU8(files['README.txt']).trim().split('\n')).toHaveLength(5)
  })

  it('the CSV parses back: header, ISO dates, points in numbers, the H1 2026 revenue is 314,906.13', async () => {
    const files = unzipSync(powerBiZip(tables, state.links))
    expect([...files['data/fact_sales.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const rows = parse(csvOf(files['data/fact_sales.csv']))
    expect(rows[0]).toEqual(['sale_date', 'customer_id', 'product_id', 'units', 'revenue'])
    expect(rows.length - 1).toBe(tables.find((t) => t.table === 'gold_fact_sales')!.rows.length)
    let sum = 0
    let empty = 0
    for (const r of rows.slice(1)) {
      expect(r[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (r[4] === '') { empty++; continue }
      expect(r[4]).toMatch(/^-?\d+(\.\d+)?$/)
      if (r[0] >= '2026-01-01' && r[0] < '2026-07-01') sum += Math.round(Number(r[4]) * 100)
    }
    expect(sum / 100).toBe(314906.13)
    // sales with no revenue are blank cells, as in the clean table (Power BI reads them as null)
    const ref = (await port.query('SELECT count(*) FROM build_kaiyo.ref_sales WHERE revenue IS NULL')).rows[0][0]
    expect(empty).toBe(Number(ref))
    expect(parse(csvOf(files['data/dim_customer.csv']))[0]).toContain('chain_name')
  })

  it('steps.html is one page without scripts or pictures, with F1 and F2 and the numbers of the Answer', () => {
    const html = stepsHtml(tables, state.links)
    expect(html).not.toMatch(/<script|<img|<link|src=|\son[a-z]+=/i)
    expect(html).toContain('fact_sales[customer_id]')
    expect(html).toContain('dim_product[product_id]')
    expect(html).toContain('Applied steps')
    const n = checkNumbers()
    expect([n.total, n.chain, n.chainValue]).toEqual(['314,906.13', 'Minori', '90,829.50'])
    expect(html).toContain('314,906.13')
    expect(html).toContain('Minori 90,829.50')
    expect(html).toContain('Revenue H1 2026')
  })

  it('steps.html v2: split step 4, display units, chain_name bars with the real chains, hints per check', async () => {
    const html = stepsHtml(tables, state.links)
    expect(html).toContain('4. Two measures and one column')
    expect(html).toContain('New column</b> (<b>not</b> New measure)')
    expect(html).toContain("A single value for column 'sale_date'")
    expect(html).toContain('mmm yyyy')
    expect(html).toContain('Date Hierarchy')
    expect(html).toContain('Categorical')
    expect(html).toContain('Display units: None')
    expect(html).toContain('<b>dim_customer[chain_name]</b>')
    expect(html).toContain('not <code>customer_name</code>')
    expect(html).toContain('delete any line that is not in this picture')
    const n = checkNumbers()
    expect(html).toContain(`${n.month} 2025 is the highest of 2025 at <b>${n.monthValue}</b>`)
    // the chains in the text are the real ones, computed from the exported tables, and the top one is the Answer's
    const chains = chainTotals(tables)
    expect(chains[0]).toEqual({ chain: n.chain, value: Number(n.chainValue.replace(/,/g, '')) })
    expect(html).toContain(`<b>${chains.length} bars</b>: ${chains.map((c) => c.chain).join(', ')}`)
    // each of the three checks says what goes wrong
    expect(html).toContain('314.91K')
    expect((html.match(/<br>If /g) ?? []).length).toBe(3)
    // step 2 lists only date and money columns
    expect(html).toContain('<code>fact_sales[sale_date]</code></td><td>Date</td>')
    expect(html).not.toContain('<code>fact_sales[customer_id]</code></td><td>')
    if (process.env.STEPS_OUT) (await import('node:fs')).writeFileSync(process.env.STEPS_OUT, html)
  })

  it('the star diagram is an inline SVG with one line per link, labelled * and 1, the column names on the lines', () => {
    const mls = starLinks(state.links, tables.map((t) => t.table))
    const svg = starSvg(tables, mls)
    expect(svg).toMatch(/^<svg role="img"/)
    expect(svg).toContain('<title id="star-t">')
    expect(svg).not.toMatch(/<script|<image/i)
    expect((svg.match(/<line /g) ?? []).length).toBe(mls.length)
    expect((svg.match(/>\*<\/text>/g) ?? []).length).toBe(mls.length)
    expect((svg.match(/>1<\/text>/g) ?? []).length).toBe(mls.length)
    for (const l of mls) expect(svg).toContain(l.many.column === l.one.column ? `>${l.many.column}</text>` : `${l.many.column} → ${l.one.column}`)
    for (const t of tables) expect(svg).toContain(shortName(t.table))
    expect(stepsHtml(tables, state.links)).toContain(svg)
  })
})

describe('power bi rules', () => {
  it('names files and types', () => {
    expect(csvPath('gold_dim_customer')).toBe('data/dim_customer.csv')
    expect(shortName('gold_fact_sales')).toBe('fact_sales')
    expect(powerBiType('DECIMAL(18,2)')).toBe('Decimal number')
    expect(powerBiType('INTEGER')).toBe('Whole number')
    expect(powerBiType('DATE')).toBe('Date')
    expect(powerBiType('VARCHAR')).toBe('Text')
  })
  it('writes BOM, quotes and empty nulls', () => {
    expect(csvText(['a', 'b'], [['x,y', null], [1.5, 'こんにちは']])).toBe('﻿a,b\n"x,y",\n1.5,こんにちは\n')
  })
  it('takes the learner links, else the expected ones, and only between exported tables', () => {
    expect(starLinks(state.links, tables.map((t) => t.table)).map((l) => l.id)).toEqual(['F1', 'F2'])
    expect(starLinks([], ['gold_fact_sales', 'gold_dim_product']).map((l) => l.id)).toEqual(['F2'])
  })
  it('is blocked until the star is there and no cell is [Error]', () => {
    expect(exportBlocker({ ready: false, errors: 0, tables: ['gold_fact_sales'] })).toMatch(/preparing/)
    expect(exportBlocker({ ready: true, errors: 2, tables: ['gold_fact_sales'] })).toMatch(/2 \[Error\] cells/)
    expect(exportBlocker({ ready: true, errors: 0, tables: [] })).toMatch(/not built/)
    expect(exportBlocker({ ready: true, errors: 0, tables: ['gold_fact_sales'] })).toBeNull()
  })
})
