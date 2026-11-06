// The first rows of what a step built, with the cells to light up and the line on what changed (src/core/pipelineSteps.ts
// has the rules). Reads the tables of `pipe_kaiyo` after a run; it never writes.
import type { Cell } from '../core/check'
import {
  STEP_TABLE,
  LEGEND,
  bronzeChange,
  cardChange,
  changedMarks,
  columnMarks,
  countMarks,
  dimCustomerChange,
  dimProductChange,
  dirtyMarks,
  factChange,
  silverChange,
  type Snapshot,
} from '../core/pipelineSteps'
import { SCHEMA, type BlockId } from '../data/pipelines/kaiyoSellout'
import type { SqlPort } from './pipelineRun'

const T = (name: string) => `${SCHEMA}.${name}`
const SHOWN = 8
const num = (v: Cell | undefined) => Number(v ?? 0)

async function exists(port: SqlPort, table: string): Promise<boolean> {
  return num((await port.query(`SELECT count(*) FROM information_schema.tables WHERE table_schema = '${SCHEMA}' AND table_name = '${table}'`)).rows[0][0]) > 0
}

async function countOf(port: SqlPort, table: string): Promise<number | null> {
  return (await exists(port, table)) ? num((await port.query(`SELECT count(*) FROM ${T(table)}`)).rows[0][0]) : null
}

/** How each table is put in order for "the first rows"; the second is for a table that lacks the first's column. */
const ORDER: Record<string, string[]> = {
  bronze_sellout_raw: ['TRY_CAST(raw_id AS INTEGER)', ''],
  silver_sellout: ['raw_id', ''],
  gold_dim_customer: ['customer_id', ''],
  gold_dim_product: ['product_id', ''],
  gold_fact_sellout: ['sale_date, customer_id, product_id', ''],
  report_top_chain: ['revenue DESC', ''],
}

/** Cells are shown as text and cut short: a binary copy would otherwise put a whole file in a cell. */
const clip = (c: Cell): Cell => (typeof c === 'string' && c.length > 60 ? c.slice(0, 57) + '…' : c)

async function firstRows(port: SqlPort, table: string): Promise<{ header: string[]; rows: Cell[][] }> {
  let last: unknown
  for (const order of ORDER[table] ?? ['']) {
    try {
      const r = await port.query(`SELECT * FROM ${T(table)}${order ? ` ORDER BY ${order}` : ''} LIMIT ${SHOWN}`)
      return { header: r.header, rows: r.rows.map((row) => row.map(clip)) }
    } catch (e) {
      last = e
    }
  }
  throw last
}

/** Everything about bronze the line needs, counted over the whole table. */
async function bronzeFacts(port: SqlPort, header: string[], rows: number) {
  const base = { rows, files: 0, header, dots: 0, slashes: 0, iso: 0, loose: 0, other: 0, spaced: 0 }
  if (!header.includes('source_file')) base.files = 0
  else base.files = num((await port.query(`SELECT count(DISTINCT source_file) FROM ${T('bronze_sellout_raw')}`)).rows[0][0])
  if (!header.includes('sale_date')) return base
  const r = (
    await port.query(`SELECT
      count(*) FILTER (WHERE sale_date LIKE '%.%'),
      count(*) FILTER (WHERE sale_date LIKE '%/%'),
      count(*) FILTER (WHERE regexp_full_match(sale_date, '\\d{4}-\\d{2}-\\d{2}')),
      count(*) FILTER (WHERE regexp_full_match(sale_date, '\\d{4}-\\d{1,2}-\\d{1,2}')),
      ${header.includes('customer_name') ? `count(*) FILTER (WHERE customer_name <> trim(customer_name))` : '0'}
    FROM ${T('bronze_sellout_raw')}`)
  ).rows[0]
  const [dots, slashes, iso, dashed, spaced] = r.map(num)
  return { ...base, dots, slashes, iso, loose: dashed - iso, other: rows - dots - slashes - dashed, spaced }
}

/** What the table `block` built looks like now: its first rows, the lit cells, the line on what changed. */
export async function takeSnapshot(port: SqlPort, block: BlockId, o: { dedup: boolean }): Promise<Snapshot | null> {
  const table = STEP_TABLE[block]
  if (!table) return null
  const total = await countOf(port, table)
  if (total === null) return null
  const { header, rows } = await firstRows(port, table)
  const out = { block, table, header, rows, total, legend: LEGEND[block] ?? null }
  switch (block) {
    case 'copy-files':
      return { ...out, marks: dirtyMarks(header, rows), change: bronzeChange(await bronzeFacts(port, header, total)) }
    case 'sql-silver': {
      const bronzeRows = await countOf(port, 'bronze_sellout_raw')
      const before = new Map<number, Cell[]>()
      let beforeHeader: string[] = []
      const ids = rows.map((r) => r[header.indexOf('raw_id')]).filter((x) => x !== null && x !== undefined)
      if (bronzeRows !== null && ids.length) {
        try {
          const b = await port.query(`SELECT * FROM ${T('bronze_sellout_raw')} WHERE TRY_CAST(raw_id AS INTEGER) IN (${ids.map(Number).join(', ')})`)
          beforeHeader = b.header
          const k = b.header.indexOf('raw_id')
          for (const r of b.rows) before.set(Number(r[k]), r)
        } catch {
          /* bronze without raw_id: nothing to compare with, nothing is lit */
        }
      }
      const marks = changedMarks(header, rows, before, beforeHeader)
      return { ...out, marks, change: silverChange({ rows: total, bronzeRows, dedup: o.dedup, changed: countMarks(marks), shown: rows.length * header.length }) }
    }
    case 'dim-customer':
      return { ...out, marks: rows.map((r) => r.map(() => false)), change: dimCustomerChange({ rows: total }) }
    case 'dim-product':
      return { ...out, marks: rows.map((r) => r.map(() => false)), change: dimProductChange({ rows: total }) }
    case 'fact-sellout': {
      const noKey = num((await port.query(`SELECT count(*) FROM ${T('gold_fact_sellout')} WHERE customer_id IS NULL OR product_id IS NULL`)).rows[0][0])
      return { ...out, marks: columnMarks(header, rows, ['customer_id', 'product_id']), change: factChange({ rows: total, silverRows: await countOf(port, 'silver_sellout'), noKey }) }
    }
    case 'card-top-chain':
      return { ...out, marks: columnMarks(header, rows, ['revenue']), change: cardChange({ rows: total, factRows: await countOf(port, 'gold_fact_sellout') }) }
    default:
      return null
  }
}
