// Hint level 2 on the Clean cards P1 to P3 (first pass): which header and which cells of the grid to point at.
// Pure; the grid is src/ui/build/StepsPanel.tsx. The cells are found in the rows on screen (the first 50), by the rule each card is about.

import type { BuildSourceId } from '../data/build/kaiyoSales'

export interface HintMark {
  source: BuildSourceId
  /** column headers to highlight */
  cols: readonly string[]
  /** `cells[i][j]`: the cell of row i, column j is one of the offending cells */
  cells: boolean[][]
  /** the first marked cell, to scroll into view; null when none is on screen */
  first: [number, number] | null
}

/** The cards that have a mark. */
export const MARKED_CARDS = ['P1', 'P2', 'P3'] as const

const KEY: Record<string, { source: BuildSourceId; cols: readonly string[]; cell: readonly string[] }> = {
  P1: { source: 'products', cols: ['sku_code'], cell: ['sku_code'] },
  P2: { source: 'sales', cols: ['sale_date', 'customer_name', 'sku_code'], cell: ['sale_date', 'customer_name', 'sku_code'] },
  P3: { source: 'customers', cols: ['customer_id', 'updated_at'], cell: ['customer_id', 'updated_at'] },
}

/** A SKU that is not written the standard way: a space at an edge, or a small letter. */
export const badSku = (v: unknown): boolean => typeof v === 'string' && (v !== v.trim() || v !== v.toUpperCase())

/** The mark of a card on the rows shown, or null when the card has none or its source is not on the grid. */
export function hintMark(card: string, source: BuildSourceId, header: readonly string[], rows: readonly (readonly unknown[])[]): HintMark | null {
  const k = KEY[card]
  if (!k || k.source !== source) return null
  const idx = header.map((h, j) => (k.cell.includes(h) ? j : -1)).filter((j) => j >= 0)
  const cells = rows.map((r) => r.map(() => false))
  if (card === 'P1') {
    const j = header.indexOf('sku_code')
    rows.forEach((r, i) => {
      if (j >= 0 && badSku(r[j])) cells[i][j] = true
    })
  } else {
    // P2: rows with the same date, store and SKU; P3: rows with the same customer_id. A copy is every row of such a group.
    const keyOf = (r: readonly unknown[]) => (card === 'P2' ? idx.map((j) => String(r[j])).join('\u0001') : String(r[header.indexOf('customer_id')]))
    const seen = new Map<string, number>()
    rows.forEach((r) => seen.set(keyOf(r), (seen.get(keyOf(r)) ?? 0) + 1))
    rows.forEach((r, i) => {
      if ((seen.get(keyOf(r)) ?? 0) > 1) idx.forEach((j) => (cells[i][j] = true))
    })
  }
  let first: [number, number] | null = null
  cells.some((r, i) => {
    const j = r.indexOf(true)
    if (j >= 0) first = [i, j]
    return j >= 0
  })
  return { source: k.source, cols: k.cols, cells, first }
}
