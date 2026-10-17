// How many rows of a result come into the page. A `SELECT *` on millions of rows would hold them all
// in memory twice (DuckDB's copy, then the grid's) and could stall the tab, so a run reads the result
// in batches and stops at the limit (src/db/engine.ts `queryLimited`); “Show more” runs it again with
// a higher one.
import { splitStatements } from './ddlPlan'
import { readsOnly } from './plan'

/** Rows a run brings in unless the user asks for more. */
export const ROW_LIMIT = 10_000

/** The steps “Show more” offers after a result was cut at `limit`. */
export function moreLimits(limit: number): number[] {
  return [100_000, 1_000_000, Infinity].filter((n) => n > limit).slice(0, 2)
}

/** Anything Arrow-like: a batch of rows that can be cut. */
export interface Batch {
  numRows: number
  slice(begin?: number, end?: number): this
}

/**
 * The first `limit` rows of a stream of batches, and whether it had more. Reading stops as soon as
 * that is known: one batch past the limit at most, so the rest of the result is never made.
 */
export async function takeRows<B extends Batch>(batches: AsyncIterable<B>, limit: number): Promise<{ batches: B[]; rows: number; more: boolean }> {
  const kept: B[] = []
  let rows = 0
  for await (const batch of batches) {
    if (batch.numRows === 0) continue
    if (rows >= limit) return { batches: kept, rows, more: true }
    const room = limit - rows
    if (batch.numRows > room) {
      kept.push(batch.slice(0, room))
      return { batches: kept, rows: limit, more: true }
    }
    kept.push(batch)
    rows += batch.numRows
  }
  return { batches: kept, rows, more: false }
}

/** “Show more” may run the tab again by itself only when nothing in it changes data. */
export function safeToRerun(sql: string): boolean {
  const statements = splitStatements(sql)
  return statements.length > 0 && statements.every(readsOnly)
}

/** “10,000” / “all” for the buttons and the note. */
export function limitLabel(limit: number): string {
  return Number.isFinite(limit) ? limit.toLocaleString('en-US') : 'all'
}
