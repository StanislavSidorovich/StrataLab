// What the learner does in P5, P6 and P4 (spec 3.6), as saved steps, for the tests that need the sales as they are after Clean.
// Put them after P2's step ([dedup, ...SOLVED_SALES]) or alone (P2 not done); the numbers of spec section 7 hold either way.
import type { StepSpec } from '../src/core/buildSteps'

const sp = (id: string, kind: StepSpec['kind'], params: Record<string, string>): StepSpec => ({ id, kind, params })

/** P5 (the slash dates are day first), P6 (decimal commas), P4 (spaces, Itiba). */
export const SOLVED_SALES: StepSpec[] = [
  sp('f1', 'dates', { format: '%d/%m/%Y' }),
  sp('f2', 'type', { column: 'revenue', to: 'decimal', sep: 'comma' }),
  sp('f3', 'type', { column: 'units', to: 'whole', sep: 'comma' }),
  sp('f4', 'trim', { column: 'customer_name' }),
  sp('f5', 'replace', { column: 'customer_name', find: 'Itiba', with: 'Ichiba' }),
]

export const DEDUP_KEY = 'sale_date, customer_name, sku_code'
export const DEDUP_SALES = sp('s1', 'dedup', { blank: DEDUP_KEY })
/** P2, then P5, P6 and P4: the sales as the Right state has them (spec 7). */
export const RIGHT_SALES: StepSpec[] = [DEDUP_SALES, ...SOLVED_SALES]
