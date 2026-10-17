// Runs the data generator's plan (src/core/generate.ts) in DuckDB, table by table, and counts
// what each one got.
import { checkpoint, query } from './engine'
import { GEN_STAGE, type GenPlan } from '../core/generate'
import { qualifiedName } from '../core/sql'

export interface GenOutcome {
  table: string
  asked: number
  added: number
  error?: string
}

const rowsIn = async (schema: string, table: string) => Number((await query(`SELECT count(*)::BIGINT AS n FROM ${qualifiedName(schema, table)}`)).get(0)?.n ?? 0)

export async function runGeneration(plan: GenPlan, onStep: (i: number) => void): Promise<GenOutcome[]> {
  const out: GenOutcome[] = []
  try {
    for (const [i, step] of plan.steps.entries()) {
      onStep(i)
      const before = await rowsIn(step.schema ?? 'main', step.table)
      try {
        for (const sql of step.sql) await query(sql)
        out.push({ table: step.table, asked: step.count, added: (await rowsIn(step.schema ?? 'main', step.table)) - before })
      } catch (e) {
        out.push({ table: step.table, asked: step.count, added: 0, error: String(e instanceof Error ? e.message : e).split('\n')[0] })
      }
    }
  } finally {
    await query(`DROP TABLE IF EXISTS ${GEN_STAGE}`).catch(() => {})
    await checkpoint()
  }
  return out
}
