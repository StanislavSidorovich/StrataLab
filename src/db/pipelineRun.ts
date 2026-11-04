// The pipeline's engine (`#pipeline=kaiyo-sellout`): prepares the schema `pipe_kaiyo`, runs one block as its SQL,
// runs the whole pipeline, and runs the proofs. It talks to DuckDB through a small port, so the page (Lab's
// engine) and the tests (duckdb-node-blocking) run the same code.
import { compareResults, type Cell, type ResultData } from '../core/check'
import { nextStatus, proofs, runOrder, type Counts, type Facts, type PipelineState, type Proofs, type StepResult, type StepStatus, type TopRow } from '../core/pipeline'
import { readableError } from '../core/sqlPractice'
import {
  CHECK_KEYS_SQL,
  CHECK_ROWS_SQL,
  CHECK_UNIQUE_SQL,
  DIM_CUSTOMER_SQL,
  DIM_PRODUCT_SQL,
  FACT_SQL,
  REF_SILVER,
  REF_TOP,
  ROW_COUNT_SQL,
  SCHEMA,
  SILVER_COLUMNS,
  SOURCES,
  SOURCE_FOLDER,
  WORK_TABLES,
  copySql,
  refSilverSql,
  refTopSql,
  silverSql,
  topChainSql,
  type BlockId,
  type Settings,
  type WorkTable,
} from '../data/pipelines/kaiyoSellout'

export interface SqlPort {
  /** runs one statement; the result of a query as header and rows (dates and DECIMAL as text) */
  query(sql: string): Promise<ResultData>
  registerText(name: string, text: string): Promise<void>
  /** makes a dataset's Parquet file readable by `read_parquet(<name>)` */
  parquet(folder: string, file: string): Promise<string>
}

const T = (name: string) => `${SCHEMA}.${name}`

// ---------------------------------------------------------------- preparation

/** Names of the 30 monthly exports as registered with the engine. */
let registered: string[] = []
const prepared = new WeakSet<SqlPort>()

export const exportFiles = () => registered

/** Delimited text of one export: the raw lines of the distributor, `;` between fields, NULL as an empty field. */
export function exportText(rows: Cell[][]): string {
  const field = (v: Cell) => {
    if (v === null) return ''
    const s = String(v)
    return /[\s;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return ['raw_id;sale_date;customer_name;sku_code;units;revenue', ...rows.map((r) => r.map(field).join(';'))].join('\n') + '\n'
}

/**
 * Once per page open: the schema, the three source tables (tables, not views, so the page works offline after the
 * first load), the 30 exports cut from the raw rows by source file, and the reference silver and answer.
 */
export async function prepare(port: SqlPort, onStep?: (text: string) => void): Promise<void> {
  if (prepared.has(port)) return
  onStep?.('Preparing the data…')
  await port.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`)
  for (const s of SOURCES) {
    const name = await port.parquet(SOURCE_FOLDER, s.file)
    await port.query(`CREATE OR REPLACE TABLE ${T(s.table)} AS SELECT * FROM read_parquet('${name}')`)
  }
  const files = (await port.query(`SELECT DISTINCT source_file FROM ${T('src_raw_sellout')} ORDER BY 1`)).rows.map((r) => String(r[0]))
  registered = []
  for (const file of files) {
    const rows = await port.query(
      `SELECT raw_id, sale_date, customer_name, sku_code, units, revenue FROM ${T('src_raw_sellout')} WHERE source_file = '${file.replace(/'/g, "''")}' ORDER BY raw_id`,
    )
    const name = `${SCHEMA}/${file}`
    await port.registerText(name, exportText(rows.rows))
    registered.push(name)
  }
  await port.query(refSilverSql())
  await port.query(refTopSql())
  prepared.add(port)
}

/** Drops the work tables; the sources and the reference stay. */
export async function resetWork(port: SqlPort): Promise<void> {
  for (const t of WORK_TABLES) await port.query(`DROP TABLE IF EXISTS ${T(t)}`)
}

// ---------------------------------------------------------------- one step

const num = (v: Cell | undefined) => Number(v ?? 0)
const fmt = (n: number) => n.toLocaleString('en-US')
const money = (v: string) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function exists(port: SqlPort, table: string): Promise<boolean> {
  return num((await port.query(`SELECT count(*) FROM information_schema.tables WHERE table_schema = '${SCHEMA}' AND table_name = '${table}'`)).rows[0][0]) > 0
}

async function count(port: SqlPort, table: string): Promise<number> {
  return num((await port.query(`SELECT count(*) FROM ${T(table)}`)).rows[0][0])
}

/** The reference silver against silver, both ways: rows silver has too many and rows it lacks. */
async function verdict(port: SqlPort) {
  const cols = SILVER_COLUMNS.join(', ')
  const extra = num((await port.query(`SELECT count(*) FROM (SELECT ${cols} FROM ${T('silver_sellout')} EXCEPT ALL SELECT ${cols} FROM ${REF_SILVER})`)).rows[0][0])
  const missing = num((await port.query(`SELECT count(*) FROM (SELECT ${cols} FROM ${REF_SILVER} EXCEPT ALL SELECT ${cols} FROM ${T('silver_sellout')})`)).rows[0][0])
  return { rows: await count(port, 'silver_sellout'), extra, missing }
}

type Done = Pick<StepResult, 'rows' | 'message'> & { fail?: boolean; verdict?: StepResult['verdict'] }

async function build(port: SqlPort, id: BlockId, s: Settings, state: PipelineState): Promise<Done> {
  switch (id) {
    case 'copy-files': {
      for (const sql of copySql(s, registered)) await port.query(sql)
      const n = await count(port, 'bronze_sellout_raw')
      return { rows: n, message: `${s.mode === 'append' ? 'Added' : 'Loaded'} ${s.files === 'latest' ? '1 file' : `${registered.length} files`}; bronze has ${fmt(n)} rows` }
    }
    case 'clear-bronze': {
      if (!(await exists(port, 'bronze_sellout_raw'))) return { rows: 0, message: 'Nothing to clear yet' }
      const n = await count(port, 'bronze_sellout_raw')
      await port.query(`DELETE FROM ${T('bronze_sellout_raw')}`)
      return { rows: n, message: `Removed ${fmt(n)} rows` }
    }
    case 'notify-team':
      return { rows: null, message: 'Posted: load finished' }
    case 'sql-silver': {
      await port.query(silverSql(state.blank.trim(), { dedup: state.dedup }))
      const v = await verdict(port)
      return {
        rows: v.rows,
        verdict: v,
        message: v.extra === 0 && v.missing === 0 ? `Silver matches the reference: ${fmt(v.rows)} rows` : `Silver has ${fmt(v.rows)} rows; ${fmt(v.extra)} too many, ${fmt(v.missing)} missing against the reference`,
      }
    }
    case 'check-unique': {
      const n = num((await port.query(CHECK_UNIQUE_SQL)).rows[0][0])
      return { rows: n, fail: n > 0, message: n > 0 ? `${fmt(n)} rows share a sale with another row` : 'One row per sale' }
    }
    case 'check-rows': {
      const n = num((await port.query(CHECK_ROWS_SQL)).rows[0][0])
      return { rows: n, fail: n === 0, message: n === 0 ? 'Silver is empty' : `Silver has ${fmt(n)} rows` }
    }
    case 'check-keys': {
      const n = num((await port.query(CHECK_KEYS_SQL)).rows[0][0])
      return { rows: n, fail: n > 0, message: n > 0 ? `${fmt(n)} sales find no store or product` : 'Every sale has its store and product' }
    }
    case 'dim-customer':
      await port.query(DIM_CUSTOMER_SQL)
      return { rows: await count(port, 'gold_dim_customer'), message: 'Stores built' }
    case 'dim-product':
      await port.query(DIM_PRODUCT_SQL)
      return { rows: await count(port, 'gold_dim_product'), message: 'Products built' }
    case 'fact-sellout':
      await port.query(FACT_SQL)
      return { rows: await count(port, 'gold_fact_sellout'), message: 'Sell-out fact built' }
    case 'card-top-chain': {
      await port.query(topChainSql(s.measure))
      const top = (await port.query(`SELECT chain_name, revenue FROM ${T('report_top_chain')}`)).rows[0]
      if (!top) return { rows: 'no rows', message: 'The card has nothing to show' }
      const shown = `${top[0]}, ${money(String(top[1]))}`
      return { rows: shown, message: `Top chain: ${shown}` }
    }
    case 'card-row-count': {
      await port.query(ROW_COUNT_SQL)
      const n = num((await port.query(`SELECT sales FROM ${T('report_row_count')}`)).rows[0][0])
      return { rows: n, message: `${fmt(n)} sales in Jan to Jun 2026` }
    }
  }
}

/** Runs one block; a failure is a result, not a throw. */
export async function runStep(port: SqlPort, id: BlockId, state: PipelineState): Promise<StepResult> {
  const t0 = performance.now()
  try {
    const done = await build(port, id, state.settings[id], state)
    return { block: id, status: done.fail ? 'failed' : 'succeeded', ms: Math.round(performance.now() - t0), rows: done.rows, message: done.message, verdict: done.verdict }
  } catch (e) {
    const raw = readableError(String(e instanceof Error ? e.message : e))
    const error = raw.split('\n')[0]
    const extra = id === 'sql-silver' ? `. The step reads these columns: ${SILVER_COLUMNS.join(', ')}.` : ''
    return { block: id, status: 'failed', ms: Math.round(performance.now() - t0), rows: null, message: error.replace(/[.!]+$/, '') + extra, error: raw }
  }
}

const queued = (id: BlockId): StepResult => ({ block: id, status: 'queued', ms: null, rows: null, message: '' })

/**
 * Runs the pipeline once on the current state (no reset): each step after the one before it, as its setting says.
 * `onUpdate` hears the whole journal after every change.
 */
export async function runAll(port: SqlPort, state: PipelineState, onUpdate?: (journal: StepResult[]) => void): Promise<StepResult[]> {
  const order = runOrder(state)
  const journal = order.map(queued)
  onUpdate?.([...journal])
  let previous: StepStatus | null = null
  for (const [i, id] of order.entries()) {
    if (nextStatus(previous, state.settings[id].when) === 'skip') {
      journal[i] = { block: id, status: 'skipped', ms: null, rows: null, message: previous === 'failed' ? 'Skipped: the step before failed' : 'Skipped: the step before was skipped' }
    } else {
      journal[i] = { ...queued(id), status: 'running' }
      onUpdate?.([...journal])
      journal[i] = await runStep(port, id, state)
    }
    previous = journal[i].status
    onUpdate?.([...journal])
  }
  return journal
}

// ---------------------------------------------------------------- proofs

/** Row counts of the work tables (null: not built) and the card's first row. */
export async function snapshot(port: SqlPort): Promise<{ counts: Counts; top: TopRow | null }> {
  const counts: Counts = {}
  for (const t of WORK_TABLES) counts[t as WorkTable] = (await exists(port, t)) ? await count(port, t) : null
  let top: TopRow | null = null
  if (counts.report_top_chain) {
    const r = (await port.query(`SELECT chain_name, revenue FROM ${T('report_top_chain')}`)).rows[0]
    if (r) top = { chain: String(r[0]), revenue: String(r[1]) }
  }
  return { counts, top }
}

export interface CheckReport {
  proofs: Proofs
  run1: StepResult[]
  run2: StepResult[]
  counts1: Counts
  counts2: Counts
  /** the card as it stands after run 2: the five chains */
  answer: ResultData | null
  /** gold after run 2 */
  gold: { rows: number | null; noKey: number | null; dupGroups: number | null }
  solved: boolean
}

/** Drops the work tables, runs the pipeline twice, and judges what is left (spec section 4). */
export async function checkPipeline(port: SqlPort, state: PipelineState, onUpdate?: (journal: StepResult[], run: 1 | 2) => void): Promise<CheckReport> {
  await resetWork(port)
  const run1 = await runAll(port, state, (j) => onUpdate?.(j, 1))
  const s1 = await snapshot(port)
  const run2 = await runAll(port, state, (j) => onUpdate?.(j, 2))
  const s2 = await snapshot(port)

  const reference = await port.query(`SELECT chain_name, revenue FROM ${REF_TOP} ORDER BY revenue DESC`)
  const answer = s2.counts.report_top_chain != null ? await port.query(`SELECT chain_name, revenue FROM ${T('report_top_chain')}`) : null
  const answerOk = answer !== null && compareResults(answer, reference, true).ok

  const bronze = s1.counts.bronze_sellout_raw != null ? (await port.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = 'bronze_sellout_raw' ORDER BY ordinal_position`)).rows.map((r) => String(r[0])) : null
  let dupGroups: number | null = null
  let noKey: number | null = null
  if (s2.counts.gold_fact_sellout != null) {
    noKey = num((await port.query(CHECK_KEYS_SQL)).rows[0][0])
    dupGroups = num((await port.query(`SELECT count(*) FROM (SELECT 1 FROM ${T('gold_fact_sellout')} GROUP BY sale_date, customer_id, product_id HAVING count(*) > 1)`)).rows[0][0])
  }
  const facts: Facts = {
    order: runOrder(state),
    settings: state.settings,
    blank: state.blank,
    run1,
    run2,
    bronzeColumns: bronze,
    counts1: s1.counts,
    counts2: s2.counts,
    top1: s1.top,
    top2: s2.top,
    refRows: await count(port, 'ref_silver_sellout'),
    ref: reference.rows.map((r) => ({ chain: String(r[0]), revenue: String(r[1]) })),
    dupGroups,
    noKey,
  }
  const result = proofs(facts, answerOk)
  return { proofs: result, run1, run2, counts1: s1.counts, counts2: s2.counts, answer, gold: { rows: s2.counts.gold_fact_sellout ?? null, noKey, dupGroups }, solved: result.answer.ok && result.again.ok && result.clean.ok }
}

