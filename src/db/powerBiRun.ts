// Reads the star the learner built (every `gold_*` table of build_kaiyo) for the Power BI bridge (src/core/powerBi.ts).
// Same port and same formatter as every other export, so the CSV text is what Export as CSV would write.
import type { StarTable } from '../core/powerBi'
import { T } from '../data/build/kaiyoSales'
import { goldTables } from './buildRun'
import type { SqlPort } from './pipelineRun'

export async function starTables(port: SqlPort): Promise<StarTable[]> {
  const out: StarTable[] = []
  for (const g of await goldTables(port)) {
    const r = await port.query(`SELECT * FROM ${T(g.table)}`)
    out.push({ table: g.table, columns: g.columns, rows: r.rows })
  }
  return out
}
