// A4 of the Answer step (do the chain bars add up to the revenue tile?) and A5 (the line for the Head of Sales). Pure: the
// engine part is src/db/buildRecon.ts, the screen src/ui/build/ReviewChecks.tsx, the text src/data/build/reviewChecks.ts.
import { A5_LINES, A5_REVIEW, A5_RIGHT, type A4Pick, type A5Pick } from '../data/build/reviewChecks'

export interface ReconFacts {
  /** revenue of January to June 2026 (the revenue tile) */
  total: number
  /** sales of customers that have a chain (the five bars) */
  chained: number
  /** sales of customers that have no chain */
  noChain: number
  /** sales with no customer at all */
  noCustomer: number
  noChainSales: number
  noCustomerSales: number
}

export const money2 = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What the bars add up to against the tile: `exact`, `less` or `more` (to the cent). */
export function reconTruth(f: ReconFacts): A4Pick {
  const gap = Math.round((f.total - f.chained) * 100)
  return gap === 0 ? 'exact' : gap > 0 ? 'less' : 'more'
}

export interface A4Review {
  ok: boolean
  /** the reconciliation, one line per part */
  lines: string[]
}

/** The reconciliation shown after the pick: the bars, the tile, the gap and where it sits. */
export function reviewA4(pick: A4Pick, f: ReconFacts): A4Review {
  const truth = reconTruth(f)
  const gap = Math.round((f.total - f.chained) * 100) / 100
  const lines = [`The five bars add up to ${money2(f.chained)}. The tile says ${money2(f.total)}. The difference is ${money2(gap)}.`]
  if (truth === 'exact') lines.push('Every sale belongs to a customer with a chain.')
  else {
    const parts: string[] = []
    if (f.noChainSales > 0) parts.push(`${f.noChainSales} sales (${money2(f.noChain)}) of customers that have no chain: the tile counts them, the bars only show chains`)
    if (f.noCustomerSales > 0) parts.push(`${f.noCustomerSales} sales (${money2(f.noCustomer)}) with no customer at all, which the join to the customers drops`)
    lines.push(`It sits in ${parts.join(' and ')}.`)
    lines.push('Returns are inside both numbers, so they are not the gap. Put a line under the bars that says so, or the first question will be where the rest went.')
  }
  lines.push('This is the whole dashboard, no slicers: with a Brand slicer on, the same gap shows for that brand only.')
  return { ok: pick === truth, lines }
}

export const reviewA5 = (pick: A5Pick): { ok: boolean; line: string } => A5_REVIEW[pick]

/** Both extras read from the saved picks; anything else is '' (not picked). */
export const readPick = <T extends string>(v: unknown, allowed: readonly T[]): T | '' => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : '')

export const A4_PICKS: readonly A4Pick[] = ['exact', 'less', 'more']
export const A5_PICKS: readonly A5Pick[] = A5_LINES.map((l) => l.value)
export const A5_OK = (pick: A5Pick | ''): boolean => pick === A5_RIGHT
