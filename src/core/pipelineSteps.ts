// "Step by step" for the real pipeline (`#pipeline=kaiyo-sellout`): one step at a time, and after each the first rows of the
// table it built, with a line on what changed. The rules here are pure; the queries that fill a snapshot are in
// src/db/pipelineSnapshot.ts. The engine rules (src/core/pipeline.ts) are not touched: this only decides what to show.
import type { Cell } from './check'
import { ALL_SLOTS, REQUIRED, type BlockId, type WorkTable } from '../data/pipelines/kaiyoSellout'
import { runOrder, slotOf, type PipelineState } from './pipeline'

// ---------------------------------------------------------------- the mode

export type Mode = 'step' | 'all'

export const MODE_KEY = 'stratalab.pipeline.mode'

/** The saved choice; none yet → step by step for someone who has not finished the pipeline, the whole board for someone who has. */
export function readMode(raw: string | null, solved: boolean): Mode {
  return raw === 'step' || raw === 'all' ? raw : solved ? 'all' : 'step'
}

// ---------------------------------------------------------------- the steps

/** The six steps, in the order a newcomer builds them (the same as the "Next" line). */
export const STEPS: BlockId[] = REQUIRED

/** The table each step builds, and what it is called on the strip. */
export const STEP_TABLE: Record<string, WorkTable> = {
  'copy-files': 'bronze_sellout_raw',
  'sql-silver': 'silver_sellout',
  'dim-customer': 'gold_dim_customer',
  'dim-product': 'gold_dim_product',
  'fact-sellout': 'gold_fact_sellout',
  'card-top-chain': 'report_top_chain',
}

export type StageId = 'source' | 'bronze' | 'silver' | 'gold' | 'report'
export const STAGE_ORDER: StageId[] = ['source', 'bronze', 'silver', 'gold', 'report']

/** The stage a step belongs to. */
export const STAGE_OF: Record<string, StageId> = {
  'copy-files': 'bronze',
  'sql-silver': 'silver',
  'dim-customer': 'gold',
  'dim-product': 'gold',
  'fact-sellout': 'gold',
  'card-top-chain': 'report',
}

/** The first step with no snapshot yet; null when all six are done. */
export function activeStep(done: Partial<Record<string, unknown>>): BlockId | null {
  return STEPS.find((b) => !done[b]) ?? null
}

/** The step to show for a stage: the latest one of that stage that is done. */
export function stepForStage(stage: StageId, done: Partial<Record<string, unknown>>): BlockId | null {
  return [...STEPS].reverse().find((b) => STAGE_OF[b] === stage && done[b]) ?? null
}

/** A stage is passed when every step of it is done. */
export const stagePassed = (stage: StageId, done: Partial<Record<string, unknown>>): boolean =>
  stage === 'source' ? true : STEPS.filter((b) => STAGE_OF[b] === stage).every((b) => done[b])

/**
 * The snapshots that still hold. After the story turns (the first pass becomes the fix) silver and everything built on it
 * is done again; bronze is the same in both. The old ones stay on the page to look at, but they no longer count as done.
 */
export function freshOnly<T extends { phase: string }>(snaps: Partial<Record<string, T>>, phase: string): Partial<Record<string, T>> {
  return Object.fromEntries(Object.entries(snaps).filter(([b, s]) => b === 'copy-files' || s?.phase === phase))
}

// ---------------------------------------------------------------- how much help: the fade

export type Help = 'show' | 'hint' | 'self'

/**
 * Show, then hint, then on your own. The first two steps place their block themselves (with a line on why); the middle
 * ones light up the slot and offer a hint; the last ones name only the goal and keep the hint folded.
 */
export function helpFor(index: number): Help {
  return index < 2 ? 'show' : index < 4 ? 'hint' : 'self'
}

/** A run up to and including `block`: the blocks placed after it stay on the board but do not run. */
export function prefixState(state: PipelineState, block: BlockId): PipelineState {
  const order = runOrder(state)
  const at = order.indexOf(block)
  if (at < 0) return state
  const later = new Set(order.slice(at + 1))
  const slots = { ...state.slots }
  for (const s of ALL_SLOTS) if (slots[s] && later.has(slots[s]!)) slots[s] = null
  return { ...state, slots }
}

/** The last required block of the run order, for "Run the rest". */
export const lastStep = (state: PipelineState): BlockId | null => {
  const placed = STEPS.filter((b) => slotOf(state, b) !== null)
  return placed.length ? placed[placed.length - 1] : null
}

// ---------------------------------------------------------------- what came out

export interface Snapshot {
  block: BlockId
  table: WorkTable
  header: string[]
  /** the first rows, as text */
  rows: Cell[][]
  /** the cells to light up, same shape as `rows` */
  marks: boolean[][]
  total: number
  /** one line: what changed against the step before */
  change: string
  /** what the lit cells mean */
  legend: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Bronze, the cells that are still untidy: a date that is not yyyy-mm-dd, a name with spaces round it, a lower-case SKU, a comma for a point. */
export function dirtyMarks(header: string[], rows: Cell[][]): boolean[][] {
  const at = (name: string) => header.indexOf(name)
  const [d, n, s, u, r] = ['sale_date', 'customer_name', 'sku_code', 'units', 'revenue'].map(at)
  return rows.map((row) =>
    row.map((c, i) => {
      if (c === null) return false
      const t = String(c)
      if (i === d) return !ISO_DATE.test(t)
      if (i === n) return t !== t.trim()
      if (i === s) return t !== t.trim().toUpperCase()
      if (i === u || i === r) return t.includes(',')
      return false
    }),
  )
}

/** Silver against the same rows in bronze (by raw_id): a cell is lit when its text is not what bronze had. */
export function changedMarks(header: string[], rows: Cell[][], before: Map<number, Cell[]>, beforeHeader: string[]): boolean[][] {
  const id = header.indexOf('raw_id')
  return rows.map((row) => {
    const old = id >= 0 ? before.get(Number(row[id])) : undefined
    return row.map((c, i) => {
      if (!old) return false
      const j = beforeHeader.indexOf(header[i])
      return j >= 0 && String(old[j] ?? '') !== String(c ?? '')
    })
  })
}

/** Lights up whole columns by name. */
export const columnMarks = (header: string[], rows: Cell[][], names: string[]): boolean[][] => rows.map((r) => r.map((_, i) => names.includes(header[i])))

export const countMarks = (marks: boolean[][]): number => marks.reduce((n, r) => n + r.filter(Boolean).length, 0)

// ---------------------------------------------------------------- the line "what changed", from facts of the data

export interface BronzeFacts {
  rows: number
  files: number
  header: string[]
  /** sale_date written with dots, with slashes, as yyyy-mm-dd, as yyyy-m-d (no leading zero), or any other way */
  dots: number
  slashes: number
  iso: number
  loose: number
  other: number
  /** names with spaces round them */
  spaced: number
}

const SIX = ['raw_id', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue']

export function bronzeChange(f: BronzeFacts): string {
  const head = `${fmt(f.rows)} rows from ${plural(f.files, 'file')}, copied as they came. `
  if (!SIX.every((c) => f.header.includes(c))) {
    return `${head}The files have the columns ${SIX.join(', ')}; this table has ${f.header.length === 1 ? `one column, ${f.header[0]}` : `${plural(f.header.length, 'column')}: ${f.header.slice(0, 4).join(', ')}${f.header.length > 4 ? ', …' : ''}`}.`
  }
  const dates = [`${fmt(f.iso)} as 2024-03-11`, `${fmt(f.loose)} as 2024-3-11, no leading zero`, `${fmt(f.dots)} with dots`, `${fmt(f.slashes)} with slashes`, ...(f.other ? [`${fmt(f.other)} some other way`] : [])].join(', ')
  return `${head}Every column is still text. Dates are written in several ways (${dates}); ${fmt(f.spaced)} store names have spaces round them.`
}

export interface SilverFacts {
  rows: number
  /** rows of bronze, null when there is no bronze */
  bronzeRows: number | null
  /** the repeat-removal part is in this pass */
  dedup: boolean
  /** lit cells and cells shown */
  changed: number
  shown: number
}

export function silverChange(f: SilverFacts): string {
  const typed = 'Dates are real dates, units and revenue real numbers, names trimmed, SKUs in upper case.'
  const lit = f.shown ? ` ${fmt(f.changed)} of the ${fmt(f.shown)} cells shown are lit: the ones whose text changed.` : ''
  if (f.bronzeRows === null) return `${fmt(f.rows)} rows. ${typed}${lit}`
  if (f.rows === f.bronzeRows) return `Same ${fmt(f.rows)} rows as bronze${f.dedup ? ': no row was left out' : ''}. ${typed}${lit}`
  if (f.rows < f.bronzeRows) return `${fmt(f.bronzeRows - f.rows)} fewer rows than bronze (${fmt(f.bronzeRows)} → ${fmt(f.rows)}). ${typed}${lit}`
  return `${fmt(f.rows)} rows against ${fmt(f.bronzeRows)} in bronze. ${typed}${lit}`
}

export function dimCustomerChange(f: { rows: number }): string {
  return `A new table next to silver, built from the store list: ${plural(f.rows, 'store')}, one row each.`
}

export function dimProductChange(f: { rows: number }): string {
  return `A new table next to silver, built from the product list: ${plural(f.rows, 'product')}, one row each, with the SKU that silver's sales carry.`
}

export function factChange(f: { rows: number; silverRows: number | null; noKey: number }): string {
  const rows = f.silverRows === null ? `${fmt(f.rows)} rows` : f.rows === f.silverRows ? `${fmt(f.rows)} rows, the same as silver` : `${fmt(f.rows)} rows against ${fmt(f.silverRows)} in silver`
  const keys = f.noKey === 0 ? ' Every sale found its store and product.' : ` ${plural(f.noKey, 'sale')} found no store or product.`
  return `${rows}. The store name and the SKU became customer_id and product_id (lit), the keys of the two dimensions.${keys}`
}

export function cardChange(f: { rows: number; factRows: number | null }): string {
  const from = f.factRows === null ? 'The sales' : `${fmt(f.factRows)} sales`
  return `${from} became ${plural(f.rows, 'row')}, one per chain: revenue added up (lit) from January to June 2026, biggest first.`
}

export const LEGEND: Record<string, string> = {
  'copy-files': 'Lit: text that silver will have to tidy.',
  'sql-silver': 'Lit: cells whose text changed since bronze.',
  'fact-sellout': 'Lit: the new keys.',
  'card-top-chain': 'Lit: the sum.',
}
