// The engine of the warm-up pipeline (src/data/pipelines/storesByRegion.ts): one small CSV registered with the engine, four
// blocks run as SQL in the schema `pipe_tutorial`, and a look at what each step built. Same SqlPort as the real pipeline.
import type { Cell, ResultData } from '../core/check'
import { nextStatus, type StepStatus } from '../core/pipeline'
import { readableError } from '../core/sqlPractice'
import { TUT_FILE, TUT_SCHEMA, TUT_SQL, TUT_TABLES, tutBlock, type TutBlockId } from '../data/pipelines/storesByRegion'
import type { SqlPort } from './pipelineRun'

const preparing = new WeakMap<SqlPort, Promise<void>>()

const field = (v: Cell) => {
  if (v === null) return ''
  const s = String(v)
  return /[\s;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** The delimited text of the stores file: the customers as a distributor would send them. */
export function storesText(rows: Cell[][]): string {
  return ['customer_id;customer_name;customer_type;chain_name;region_id;is_active', ...rows.map((r) => r.map(field).join(';'))].join('\n') + '\n'
}

/** Once per page open: the schema, the regions, and the stores file registered as text. */
export function prepareTutorial(port: SqlPort): Promise<void> {
  let p = preparing.get(port)
  if (!p) {
    p = (async () => {
      await port.query(`CREATE SCHEMA IF NOT EXISTS ${TUT_SCHEMA}`)
      const customers = await port.parquet('quaera', 'dim_customer.parquet')
      const regions = await port.parquet('quaera', 'dim_region.parquet')
      await port.query(`CREATE OR REPLACE TABLE ${TUT_SCHEMA}.src_region AS SELECT region_id, region_name FROM read_parquet('${regions}')`)
      const rows = await port.query(`SELECT customer_id, customer_name, customer_type, chain_name, region_id, is_active FROM read_parquet('${customers}') ORDER BY customer_id`)
      await port.registerText(TUT_FILE, storesText(rows.rows))
    })()
    preparing.set(port, p)
    p.catch(() => preparing.delete(port))
  }
  return p
}

export async function resetTutorial(port: SqlPort): Promise<void> {
  for (const t of TUT_TABLES) await port.query(`DROP TABLE IF EXISTS ${TUT_SCHEMA}.${t}`)
}

export interface TutStep {
  block: TutBlockId
  status: StepStatus
  ms: number | null
  rows: number | null
  message: string
}

export interface TutPlacedStep {
  id: TutBlockId
  /** how it waits for the step before it; null for the first step */
  when: 'succeeded' | 'completed' | null
}

/** Runs the steps in order, each after the one before it as its setting says. A failure is a result, not a throw. */
export async function runTutorial(port: SqlPort, steps: TutPlacedStep[], onUpdate?: (j: TutStep[]) => void): Promise<TutStep[]> {
  const journal: TutStep[] = steps.map((s) => ({ block: s.id, status: 'queued', ms: null, rows: null, message: '' }))
  onUpdate?.([...journal])
  let previous: StepStatus | null = null
  for (const [i, s] of steps.entries()) {
    if (nextStatus(previous, s.when) === 'skip') {
      journal[i] = { ...journal[i], status: 'skipped', message: previous === 'failed' ? 'Skipped: the step before failed' : 'Skipped: the step before was skipped' }
    } else {
      journal[i] = { ...journal[i], status: 'running' }
      onUpdate?.([...journal])
      const t0 = performance.now()
      try {
        await port.query(TUT_SQL[s.id])
        const table = tutBlock(s.id)!.table
        const n = Number((await port.query(`SELECT count(*) FROM ${TUT_SCHEMA}.${table}`)).rows[0][0])
        journal[i] = { block: s.id, status: 'succeeded', ms: Math.round(performance.now() - t0), rows: n, message: `${table} has ${n.toLocaleString('en-US')} rows` }
      } catch (e) {
        const raw = readableError(String(e instanceof Error ? e.message : e)).split('\n')[0]
        const missing = /Table with name (\w+) does not exist/i.exec(raw)?.[1]
        journal[i] = { block: s.id, status: 'failed', ms: Math.round(performance.now() - t0), rows: null, message: missing ? `${tutBlock(s.id)!.label} reads ${missing}, which is not built yet. Move it after the step that builds it.` : raw }
      }
    }
    previous = journal[i].status
    onUpdate?.([...journal])
  }
  return journal
}

/** The first rows of a table the warm-up built, or null when it is not there. */
export async function previewTable(port: SqlPort, table: string, limit = 5): Promise<ResultData | null> {
  try {
    return await port.query(`SELECT * FROM ${TUT_SCHEMA}.${table} LIMIT ${limit}`)
  } catch {
    return null
  }
}
