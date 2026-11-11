// The engine of the Refresh step (spec docs/build-kaiyo-sales-spec.md, 5.7): one Run executes the whole chain in order, bronze per
// source, clean per source (every applied step), the star, the dashboard tiles, and writes a journal line for each. The same code
// runs on the page and in the tests.
import { TILE_IDS, TILE_TABLE, T, GOLD_SQL, sourceById, type SalesMode } from '../data/build/kaiyoSales'
import { FOLDER_FILES, JULY_FILE, REFRESH_TEXT } from '../data/build/refreshData'
import { tileRunSql } from '../core/buildDashboard'
import { starStatements, type Link } from '../core/buildLinks'
import { nextRunNumber, type JournalRow, type RunSummary } from '../core/buildRefresh'
import { SOURCE_IDS, countsSql, fileCountsSql, stepsOf, typedColumn, type BuildWork } from '../core/buildSteps'
import { readableError } from '../core/sqlPractice'
import { applySteps, connect, salesLock, stepErrors } from './buildRun'
import type { SqlPort } from './pipelineRun'

const num = async (port: SqlPort, sql: string) => Number((await port.query(sql)).rows[0][0])
const msg = (e: unknown) => readableError(String(e instanceof Error ? e.message : e)).split('\n')[0]
const rowsOf = (port: SqlPort, table: string): Promise<number | null> => num(port, `SELECT count(*) FROM ${T(table)}`).catch(() => null)
const strings = async (port: SqlPort, sql: string) => (await port.query(sql)).rows.map((r) => String(r[0]))

export interface RefreshModel {
  links: readonly Link[]
  /** the star was built through the learner's links (else the first version's SQL) */
  star: boolean
}

export interface RefreshRun {
  rows: JournalRow[]
  summary: RunSummary
}

/** Runs everything in order and returns the journal. `onRow` is told each line as it is written (the page shows them one by one). */
export async function runRefresh(port: SqlPort, work: BuildWork, model: RefreshModel, onRow?: (row: JournalRow) => void): Promise<RefreshRun> {
  const rows: JournalRow[] = []
  const add = (r: Omit<JournalRow, 'n'>) => {
    const row = { ...r, n: rows.length + 1 }
    rows.push(row)
    onRow?.(row)
  }
  const timed = async <T,>(f: () => Promise<T>): Promise<[T, number]> => {
    const t = performance.now()
    const v = await f()
    return [v, Math.max(1, Math.round(performance.now() - t))]
  }
  const mode: SalesMode = work.refresh.mode

  // ---- bronze: every source read again from its file(s)
  let julyIn = false
  for (const id of SOURCE_IDS) {
    const s = sourceById(id)
    const before = await rowsOf(port, s.bronze)
    try {
      const [after, ms] = await timed(() => connect(port, id, mode))
      if (id === 'sales') {
        const read = await num(port, `SELECT count(DISTINCT source_file) FROM ${T(s.bronze)}`)
        julyIn = (await num(port, `SELECT count(*) FROM ${T(s.bronze)} WHERE source_file = '${JULY_FILE}'`)) > 0
        const step = mode === 'pattern' ? 'Read every file in the folder' : 'Read the list of 30 files'
        if (read < FOLDER_FILES) add({ stage: 'bronze', source: id, step, rowsIn: before, rowsOut: after, status: 'warning', count: FOLDER_FILES - read, note: `${read} of ${FOLDER_FILES} files read: ${REFRESH_TEXT.notRead}`, ms })
        else add({ stage: 'bronze', source: id, step, rowsIn: before, rowsOut: after, status: 'ok', count: 0, note: `${read} files read`, ms })
      } else {
        add({ stage: 'bronze', source: id, step: `Read ${s.label}`, rowsIn: before, rowsOut: after, status: 'ok', count: 0, note: '', ms })
      }
    } catch (e) {
      add({ stage: 'bronze', source: id, step: `Read ${s.label}`, rowsIn: before, rowsOut: null, status: 'error', count: 0, note: msg(e), ms: 0 })
    }
  }

  // ---- clean: every applied step of every source
  let broken = rows.some((r) => r.status === 'error')
  for (const id of SOURCE_IDS) {
    const specs = work.steps[id]
    const steps = stepsOf(id, specs)
    if (broken) {
      add({ stage: 'clean', source: id, step: `Clean ${sourceById(id).label}`, rowsIn: null, rowsOut: null, status: 'skipped', count: 0, note: 'Not run: a source did not load.', ms: 0 })
      continue
    }
    try {
      await applySteps(port, id, specs)
    } catch (e) {
      add({ stage: 'clean', source: id, step: `Clean ${sourceById(id).label}`, rowsIn: null, rowsOut: null, status: 'error', count: 0, note: msg(e), ms: 0 })
      broken = true
      continue
    }
    // rows in and out of every step; ms is the time of the query that counted it (the whole chain up to that step)
    const counts: number[] = []
    const times: number[] = []
    for (let i = 0; i <= steps.length; i++) {
      const [c, ms] = await timed(async () => (await port.query(countsSql(id, steps.slice(0, i)))).rows[0].map(Number))
      counts[i] = c[i]
      times[i] = ms
    }
    const errs = id === 'sales' ? await stepErrors(port, specs) : steps.map(() => 0)
    const july = id === 'sales' && julyIn ? (await port.query(fileCountsSql('sales', steps, JULY_FILE))).rows[0].map(Number) : null
    for (let i = 1; i <= steps.length; i++) {
      const st = steps[i - 1]
      const bad = errs[i - 1] ?? 0
      let note = ''
      if (bad > 0) {
        const col = typedColumn(st)
        const sample = col ? await strings(port, `SELECT DISTINCT b.${col} FROM ${T('clean_sales')} c JOIN ${T('bronze_sales')} b ON CAST(b.raw_id AS INTEGER) = c.raw_id WHERE c.${col} IS NULL AND b.${col} IS NOT NULL ORDER BY 1 LIMIT 2`).catch(() => []) : []
        note = `${col} in error${sample.length ? `, like ${sample.map((x) => `'${x}'`).join(', ')}` : ''}`
      }
      if (july && july[i] !== july[i - 1]) note = [note, `July: ${july[i - 1]} → ${july[i]} (−${july[i - 1] - july[i]})`].filter(Boolean).join(' · ')
      add({ stage: 'clean', source: id, step: st.label, rowsIn: counts[i - 1], rowsOut: counts[i], status: bad > 0 ? 'error' : 'ok', count: bad, note, ms: times[i] })
    }
  }

  // ---- the Dashboard stays locked while the sales have [Error] cells (spec 3.6): the star and the tiles do not run on them
  const salesBad = rows.filter((r) => r.stage === 'clean' && r.status === 'error').length
  let lock = 0
  if (!broken) lock = await salesLock(port).catch(() => 0)
  const stop = broken || salesBad > 0 || lock > 0
  const why = broken ? 'Not run: an earlier stage failed.' : `Not run: the sales have ${lock > 0 ? `${lock.toLocaleString('en-US')} [Error] or untyped cells` : '[Error] cells'}.`

  // ---- the star
  const statements = (model.star && starStatements(model.links)) || GOLD_SQL
  for (const sql of statements) {
    const table = /TABLE\s+\S+?\.(gold_\w+)/.exec(sql)?.[1] ?? 'gold'
    const from = table === 'gold_fact_sales' ? 'clean_sales' : table === 'gold_dim_customer' ? 'clean_customers' : 'clean_products'
    if (stop) {
      add({ stage: 'model', source: null, step: `Build ${table}`, rowsIn: null, rowsOut: null, status: 'skipped', count: 0, note: why, ms: 0 })
      continue
    }
    try {
      const [, ms] = await timed(() => port.query(sql))
      add({ stage: 'model', source: null, step: `Build ${table}`, rowsIn: await rowsOf(port, from), rowsOut: await rowsOf(port, table), status: 'ok', count: 0, note: '', ms })
    } catch (e) {
      add({ stage: 'model', source: null, step: `Build ${table}`, rowsIn: null, rowsOut: null, status: 'error', count: 0, note: msg(e), ms: 0 })
    }
  }

  // ---- the dashboard tiles the learner built
  const starOk = !stop && rows.every((r) => r.status !== 'error')
  for (const id of TILE_IDS) {
    const step = `Tile ${id}`
    if (!starOk) {
      add({ stage: 'dashboard', source: null, step, rowsIn: null, rowsOut: null, status: 'skipped', count: 0, note: stop ? why : 'Not run: the star failed.', ms: 0 })
    } else if (!work.dash.tiles.includes(id)) {
      add({ stage: 'dashboard', source: null, step, rowsIn: null, rowsOut: null, status: 'skipped', count: 0, note: 'Not built yet.', ms: 0 })
    } else {
      try {
        const [, ms] = await timed(() => port.query(tileRunSql(id, work.dash.blanks[id])))
        add({ stage: 'dashboard', source: null, step, rowsIn: await rowsOf(port, 'gold_fact_sales'), rowsOut: await rowsOf(port, TILE_TABLE[id]), status: 'ok', count: 0, note: '', ms })
      } catch (e) {
        add({ stage: 'dashboard', source: null, step, rowsIn: null, rowsOut: null, status: 'error', count: 0, note: msg(e), ms: 0 })
      }
    }
  }

  const summary: RunSummary = {
    n: nextRunNumber(work.refresh.runs),
    bronze: (await rowsOf(port, 'bronze_sales')) ?? 0,
    clean: (await rowsOf(port, 'clean_sales')) ?? 0,
    errors: rows.filter((r) => r.status === 'error').reduce((a, r) => a + r.count, 0) || (rows.some((r) => r.status === 'error') ? 1 : 0),
    warnings: rows.filter((r) => r.status === 'warning').length,
  }
  return { rows, summary }
}
