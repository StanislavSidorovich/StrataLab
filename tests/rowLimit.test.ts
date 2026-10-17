import { describe, expect, it } from 'vitest'
import { ROW_LIMIT, limitLabel, moreLimits, safeToRerun, takeRows } from '../src/core/rowLimit'

/** A stand-in for an Arrow record batch: rows `from`…`from + n - 1`. */
class Rows {
  constructor(
    readonly from: number,
    readonly numRows: number,
  ) {}
  slice(begin = 0, end = this.numRows) {
    return new Rows(this.from + begin, Math.min(end, this.numRows) - begin) as this
  }
}

/** Batches of `size` rows up to `total`, counting how many were read. */
function stream(total: number, size: number) {
  const seen = { batches: 0 }
  async function* gen() {
    for (let from = 0; from < total; from += size) {
      seen.batches++
      yield new Rows(from, Math.min(size, total - from))
    }
  }
  return { batches: gen(), seen }
}

describe('row limit', () => {
  it('keeps every row of a result under the limit', async () => {
    const { batches } = stream(5000, 2048)
    const r = await takeRows(batches, ROW_LIMIT)
    expect(r.rows).toBe(5000)
    expect(r.more).toBe(false)
    expect(r.batches.map((b) => b.numRows)).toEqual([2048, 2048, 904])
  })

  it('cuts the batch that crosses the limit and stops reading', async () => {
    const { batches, seen } = stream(1_000_000, 2048)
    const r = await takeRows(batches, 10_000)
    expect(r.rows).toBe(10_000)
    expect(r.more).toBe(true)
    expect(r.batches.reduce((n, b) => n + b.numRows, 0)).toBe(10_000)
    expect(r.batches.at(-1)).toMatchObject({ from: 8192, numRows: 1808 })
    expect(seen.batches).toBe(5)
  })

  it('reads one more batch to tell “exactly the limit” from “more”', async () => {
    const exact = await takeRows(stream(4096, 2048).batches, 4096)
    expect(exact).toMatchObject({ rows: 4096, more: false })
    const over = await takeRows(stream(4097, 2048).batches, 4096)
    expect(over).toMatchObject({ rows: 4096, more: true })
  })

  it('skips empty batches and handles a result with no rows', async () => {
    async function* gen() {
      yield new Rows(0, 0)
      yield new Rows(0, 3)
      yield new Rows(3, 0)
    }
    expect(await takeRows(gen(), 10)).toMatchObject({ rows: 3, more: false })
    expect(await takeRows(stream(0, 2048).batches, 10)).toMatchObject({ rows: 0, more: false, batches: [] })
  })

  it('reads everything with no limit', async () => {
    const r = await takeRows(stream(50_000, 2048).batches, Infinity)
    expect(r).toMatchObject({ rows: 50_000, more: false })
  })

  it('offers the next two steps up', () => {
    expect(moreLimits(10_000)).toEqual([100_000, 1_000_000])
    expect(moreLimits(100_000)).toEqual([1_000_000, Infinity])
    expect(moreLimits(1_000_000)).toEqual([Infinity])
    expect(limitLabel(100_000)).toBe('100,000')
    expect(limitLabel(Infinity)).toBe('all')
  })

  it('runs again by itself only a query that only reads', () => {
    expect(safeToRerun('SELECT * FROM orders')).toBe(true)
    expect(safeToRerun('-- big\nWITH t AS (SELECT 1) SELECT * FROM t; FROM orders;')).toBe(true)
    expect(safeToRerun("SELECT 'please delete' AS note")).toBe(true)
    expect(safeToRerun('CREATE TABLE t AS SELECT 1; SELECT * FROM t')).toBe(false)
    expect(safeToRerun('INSERT INTO t VALUES (1); SELECT * FROM t')).toBe(false)
    expect(safeToRerun('')).toBe(false)
  })
})
