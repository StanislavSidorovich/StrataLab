// A4 of the Answer step: do the five chains add up to the revenue tile? Reads the star as the learner built it (never a slice:
// the Answer step is the whole dashboard) and splits the half-year's revenue by what the sale's customer is. Pure rules: src/core/buildReview.ts.
import type { ReconFacts } from "../core/buildReview"
import { T } from '../data/build/kaiyoSales'
import type { SqlPort } from './pipelineRun'

const H1 = `f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'`

const cents = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100

/** Revenue of January to June 2026 split into: customers with a chain (the bars), customers with no chain, sales with no customer. */
export async function reconFacts(port: SqlPort): Promise<ReconFacts> {
  const r = await port.query(`SELECT
  SUM(f.revenue),
  SUM(CASE WHEN c.chain_name IS NOT NULL THEN f.revenue END),
  SUM(CASE WHEN c.customer_id IS NOT NULL AND c.chain_name IS NULL THEN f.revenue END),
  SUM(CASE WHEN c.customer_id IS NULL THEN f.revenue END),
  count(CASE WHEN c.customer_id IS NOT NULL AND c.chain_name IS NULL THEN 1 END),
  count(CASE WHEN c.customer_id IS NULL THEN 1 END)
FROM ${T('gold_fact_sales')} f
LEFT JOIN ${T('gold_dim_customer')} c ON c.customer_id = f.customer_id
WHERE ${H1}`)
  const [total, chained, noChain, noCustomer, noChainSales, noCustomerSales] = r.rows[0]
  return { total: cents(total), chained: cents(chained), noChain: cents(noChain), noCustomer: cents(noCustomer), noChainSales: Number(noChainSales ?? 0), noCustomerSales: Number(noCustomerSales ?? 0) }
}
