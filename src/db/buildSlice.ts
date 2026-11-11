// The engine part of the dashboard slicers (pure rules: src/core/buildSlice.ts). The views are replaced and the jobs that read
// them run one after the other in one queue, so a quick second click never reads views of the first one.
import { rewriteSql, sliceStatements, type SliceFilter, type SliceVariant } from '../core/buildSlice'
import { T } from '../data/build/kaiyoSales'
import type { SqlPort } from './pipelineRun'

let queue: Promise<unknown> = Promise.resolve()

/** Replaces the slice views for `filter`, then runs `job` (which reads them). Calls are served in order. */
export function withSlice<R>(port: SqlPort, filter: SliceFilter, job: () => Promise<R>): Promise<R> {
  const run = queue.then(async () => {
    for (const sql of sliceStatements(filter)) await port.query(sql)
    return job()
  })
  queue = run.catch(() => undefined)
  return run
}

/** The SQL as it runs under the slicers: the learner's text with the star's tables read from the slice. */
export const slicedSql = (sql: string, variant: SliceVariant = 'all'): string => rewriteSql(sql, variant).sql

export interface SliceValues {
  chains: string[]
  brands: string[]
}

/** The values of the two slicers, read from the dimension tables as they are. */
export async function sliceValues(port: SqlPort): Promise<SliceValues> {
  const names = async (sql: string) => (await port.query(sql)).rows.map((r) => String(r[0]))
  return {
    chains: await names(`SELECT DISTINCT chain_name FROM ${T('gold_dim_customer')} WHERE chain_name IS NOT NULL ORDER BY 1`),
    brands: await names(`SELECT DISTINCT brand FROM ${T('gold_dim_product')} WHERE brand IS NOT NULL ORDER BY 1`),
  }
}
