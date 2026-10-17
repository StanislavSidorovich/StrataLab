// A query plan (Explain, stage 6): DuckDB's and PostgreSQL's EXPLAIN … FORMAT JSON read into one
// tree of steps, each with a plain-language name and hint, rows, own time and its share of the
// time, plus a few tips a learner can act on (the slowest step, a join that pairs every row with
// every row, a join that multiplies rows, a full read that an index could avoid).
import { splitStatements } from './ddlPlan'

export type PlanEngine = 'duckdb' | 'postgres'

export type StepKind =
  | 'scan'
  | 'index'
  | 'filter'
  | 'columns'
  | 'hash-join'
  | 'loop-join'
  | 'range-join'
  | 'subquery'
  | 'hash'
  | 'group'
  | 'total'
  | 'window'
  | 'sort'
  | 'top'
  | 'limit'
  | 'distinct'
  | 'union'
  | 'cte'
  | 'memory'
  | 'values'
  | 'write'
  | 'other'

export interface PlanNode {
  /** the engine's own name: HASH_JOIN, Hash Join */
  op: string
  kind: StepKind
  title: string
  /** what it works on, in one line: the table, the join condition, the groups */
  summary: string
  details: [string, string][]
  /** rows the step passed on (EXPLAIN ANALYZE), or null */
  rows: number | null
  /** rows the planner expected, when it says */
  estimate: number | null
  /** rows read from a table, when more than were kept */
  scanned: number | null
  /** the step's own time in ms, without its inputs' */
  ms: number | null
  /** own time as a part of the whole plan's, 0–1 */
  share: number
  children: PlanNode[]
}

export interface Plan {
  engine: PlanEngine
  /** run (EXPLAIN ANALYZE): real rows and times; else the planner's estimates */
  analyzed: boolean
  root: PlanNode
  /** the steps' own times added up, ms */
  totalMs: number | null
  /** steps hidden as internal (DuckDB's column shuffling) */
  hidden: number
}

// ------------------------------------------------------------------ what to explain

/** The statement to explain: the last of a script (as Run shows the last result). */
export function lastStatement(sql: string): { statement: string; count: number } {
  const all = splitStatements(sql)
  return { statement: all[all.length - 1] ?? '', count: all.length }
}

const READS = /^\s*\(*\s*(select|with|from|values|table|pivot|unpivot)\b/i
const CHANGES = /\b(insert|update|delete|merge|create|drop|alter|copy|truncate|attach|detach|import|export|install|load|set|call|checkpoint|vacuum)\b/i

/** Only reads: safe to run for EXPLAIN ANALYZE. Anything that could change data is only planned. */
export function readsOnly(statement: string): boolean {
  if (!READS.test(statement)) return false
  // Words inside strings and quoted names don't count ('please delete', "update").
  const bare = statement.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""')
  return !CHANGES.test(bare)
}

/** The EXPLAIN statement for an engine. */
export function explainStatement(statement: string, analyze: boolean): string {
  return `EXPLAIN (${analyze ? 'ANALYZE, ' : ''}FORMAT JSON) ${statement}`
}

// ------------------------------------------------------------------ the steps

interface StepInfo {
  title: string
  /** one sentence: what the step does */
  hint: string
}

const STEPS: Record<StepKind, StepInfo> = {
  scan: { title: 'Read a table', hint: 'Reads the rows of a table. A WHERE condition on its columns is checked right here, while reading.' },
  index: { title: 'Read through an index', hint: 'Finds the matching rows through an index, without reading the whole table.' },
  filter: { title: 'Keep matching rows', hint: 'Drops the rows that fail the condition (WHERE, HAVING or a join condition).' },
  columns: { title: 'Compute columns', hint: 'Works out the columns and expressions of SELECT. Usually cheap.' },
  'hash-join': { title: 'Join (hash)', hint: 'Puts one input into a lookup table by the ON key, then looks up each row of the other. The usual fast way to join on =.' },
  'loop-join': { title: 'Join (every row with every row)', hint: 'Compares each row of one input with each row of the other. Fine for small inputs, slow for big ones: often the ON has no = or is missing.' },
  'range-join': { title: 'Join (on a range or sorted)', hint: 'Sorts both inputs and walks them side by side; used for <, >, BETWEEN conditions, or when both are already sorted.' },
  subquery: { title: 'Subquery that uses the outer query', hint: 'Runs a subquery that refers to the outer query once for all its values, not once per row.' },
  hash: { title: 'Build the lookup table', hint: 'Prepares the lookup table that the hash join above it searches.' },
  group: { title: 'Group (GROUP BY)', hint: 'Puts rows with the same GROUP BY values together and works out SUM, COUNT… for each group.' },
  total: { title: 'Total over all rows', hint: 'Works out the aggregates (SUM, COUNT…) over all rows into one row: there is no GROUP BY.' },
  window: { title: 'Window function (OVER)', hint: 'Works out functions like ROW_NUMBER() or SUM() OVER (…) for each row, looking at the rows around it.' },
  sort: { title: 'Sort (ORDER BY)', hint: 'Sorts all the rows. The more rows, the more it costs.' },
  top: { title: 'Top rows (ORDER BY … LIMIT)', hint: 'Keeps only the first N rows in order while reading, without sorting everything.' },
  limit: { title: 'Stop after N rows (LIMIT)', hint: 'Passes on the first rows and stops the steps below once it has enough.' },
  distinct: { title: 'Remove duplicates (DISTINCT)', hint: 'Keeps one row of each set of equal rows.' },
  union: { title: 'Put results together (UNION)', hint: 'Adds the rows of several queries one after another.' },
  cte: { title: 'Named subquery (WITH)', hint: 'A WITH query, worked out once and read by the steps that name it.' },
  memory: { title: 'Keep rows in memory', hint: 'Keeps rows it has seen so that a step above can read them again without redoing the work.' },
  values: { title: 'Rows written in the query', hint: 'Rows that come from the query itself (VALUES, SELECT without FROM) or from an earlier step.' },
  write: { title: 'Change a table', hint: 'Writes the rows into the table (INSERT, UPDATE, DELETE, CREATE TABLE … AS).' },
  other: { title: '', hint: '' },
}

/** DuckDB names in capitals with underscores; PostgreSQL's “Hash Join” becomes HASH_JOIN. */
const key = (op: string) => op.trim().toUpperCase().replace(/[\s-]+/g, '_')

const KINDS: [RegExp, StepKind][] = [
  [/^SUBQUERY_SCAN$/, 'other'],
  [/^(INDEX_SCAN|INDEX_ONLY_SCAN|BITMAP_INDEX_SCAN|BITMAP_HEAP_SCAN)$/, 'index'],
  [/^(CTE_SCAN|CTE|MATERIALIZED_CTE|RECURSIVE_CTE|RECURSIVE_CTE_SCAN|WORKTABLE_SCAN|RECURSIVE_UNION)$/, 'cte'],
  [/^(DELIM_SCAN|LEFT_DELIM_JOIN|RIGHT_DELIM_JOIN|DELIM_JOIN|DEPENDENT_JOIN)$/, 'subquery'],
  [/^(COLUMN_DATA_SCAN|DUMMY_SCAN|CHUNK_SCAN|EMPTY_RESULT|VALUES_SCAN|RESULT|EXPRESSION_SCAN)$/, 'values'],
  [/SCAN|READ_|^RANGE$|^GENERATE_SERIES$/, 'scan'],
  [/^(HASH_JOIN)$/, 'hash-join'],
  [/^(NESTED_LOOP_JOIN|NESTED_LOOP|BLOCKWISE_NL_JOIN|CROSS_PRODUCT|POSITIONAL_JOIN)$/, 'loop-join'],
  [/^(PIECEWISE_MERGE_JOIN|IE_JOIN|MERGE_JOIN|ASOF_JOIN)$/, 'range-join'],
  [/^HASH$/, 'hash'],
  [/^(HASH_GROUP_BY|PERFECT_HASH_GROUP_BY|PARTITIONED_AGGREGATE|HASHAGGREGATE|GROUPAGGREGATE|GROUP|MIXEDAGGREGATE)$/, 'group'],
  [/^(UNGROUPED_AGGREGATE|SIMPLE_AGGREGATE)$/, 'total'],
  [/WINDOW|^WINDOWAGG$/, 'window'],
  [/^(ORDER_BY|SORT|INCREMENTAL_SORT)$/, 'sort'],
  [/^TOP_N$/, 'top'],
  [/LIMIT|^STREAMING_SAMPLE$/, 'limit'],
  [/^(UNIQUE|DISTINCT|HASH_DISTINCT|SETOP|HASHSETOP)$/, 'distinct'],
  [/^(UNION|APPEND|MERGE_APPEND)$/, 'union'],
  [/^(MATERIALIZE|MEMOIZE)$/, 'memory'],
  [/^(INSERT|UPDATE|DELETE|CREATE_TABLE_AS|BATCH_CREATE_TABLE_AS|MODIFYTABLE|BATCH_INSERT|MERGE_INTO)$/, 'write'],
  [/^FILTER$/, 'filter'],
  [/^PROJECTION$/, 'columns'],
]

/** What a step is, from its name (and PostgreSQL's Aggregate strategy). */
export function stepKind(op: string, strategy?: string): StepKind {
  const k = key(op)
  if (k === 'AGGREGATE') return strategy === 'Plain' ? 'total' : 'group'
  return KINDS.find(([re]) => re.test(k))?.[1] ?? 'other'
}

export function stepHint(kind: StepKind): string {
  return STEPS[kind].hint
}

/** “HASH_JOIN” → “Hash join”, for steps we have no name for. */
const pretty = (op: string) => {
  const s = op.trim().replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function titleOf(kind: StepKind, op: string, info: Record<string, string>): string {
  if (kind === 'write') {
    const what = (info.Operation ?? key(op).replace(/^BATCH_/, '').replace(/_/g, ' ')).toLowerCase()
    if (what.includes('create')) return 'Create a table from the rows'
    return { insert: 'Insert rows', update: 'Update rows', delete: 'Delete rows', merge: 'Merge rows' }[what] ?? STEPS.write.title
  }
  if (kind === 'other') return pretty(op)
  return STEPS[kind].title
}

/** `memory.main.orders` → `orders`; a dataset keeps its schema: `chinook.track`. */
export function shortTable(name: string): string {
  const parts = name.split('.')
  if (parts.length >= 3) parts.shift()
  if (parts.length === 2 && (parts[0] === 'main' || parts[0] === 'public')) parts.shift()
  return parts.join('.')
}

const text = (v: unknown): string => (Array.isArray(v) ? v.map(text).join(', ') : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function summaryOf(kind: StepKind, info: Record<string, string>): string {
  const table = info.Table ?? info['Relation Name'] ?? info.Function ?? info['CTE Name'] ?? ''
  const where = info.Filters ?? info.Filter ?? info['Index Cond'] ?? info['Recheck Cond'] ?? ''
  const on = info.Conditions ?? info['Hash Cond'] ?? info['Merge Cond'] ?? info['Join Filter'] ?? ''
  const join = info['Join Type'] ? `${info['Join Type'].toUpperCase()}${on ? ': ' : ''}` : ''
  switch (kind) {
    case 'scan':
    case 'index':
    case 'cte':
    case 'write':
      return [table && shortTable(table), info['Index Name'] && `index ${info['Index Name']}`, where && `where ${where}`].filter(Boolean).join(' · ')
    case 'hash-join':
    case 'loop-join':
    case 'range-join':
    case 'subquery':
      return join + on
    case 'filter':
      return info.Expression ?? where
    case 'group':
    case 'total':
      return [info.Groups ?? info['Group Key'], info.Aggregates].filter(Boolean).join(' · ')
    case 'sort':
      return info['Order By'] ?? info['Sort Key'] ?? ''
    case 'top':
      return [info.Top && `first ${info.Top}`, info['Order By'] && `by ${info['Order By']}`].filter(Boolean).join(' ')
    case 'columns':
    case 'window':
      return plumbing(info.Projections) ? '' : (info.Projections ?? '')
    default:
      return table ? shortTable(table) : ''
  }
}

/** DuckDB's own column shuffling: `#0`, `__internal_compress_…(#1, 0)`. */
const plumbing = (projections: string | undefined) =>
  projections != null && projections.replace(/__internal_\w+\([^()]*\)/g, '#0').split(',').every((p) => /^\s*#\d+\s*$/.test(p))

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function node(op: string, info: Record<string, string>, rows: number | null, estimate: number | null, scanned: number | null, ms: number | null, children: PlanNode[], strategy?: string): PlanNode {
  const kind = stepKind(op, strategy)
  return { op: op.trim(), kind, title: titleOf(kind, op, info), summary: summaryOf(kind, info), details: Object.entries(info), rows, estimate, scanned, ms, share: 0, children }
}

// ------------------------------------------------------------------ DuckDB

interface DuckJson {
  name?: string
  operator_name?: string
  operator_type?: string
  operator_timing?: number
  operator_cardinality?: number
  operator_rows_scanned?: number
  extra_info?: Record<string, unknown>
  children?: DuckJson[]
}

function duckNode(j: DuckJson, analyzed: boolean): PlanNode {
  const extra = { ...(j.extra_info ?? {}) }
  const estimate = num(extra['Estimated Cardinality'])
  delete extra['Estimated Cardinality']
  const info: Record<string, string> = {}
  // `memory.main.o.amount` → `o.amount`; a dataset's `stratalab.chinook.track` → `chinook.track`.
  for (const [k, v] of Object.entries(extra)) if (text(v) !== '') info[k] = k === 'Table' ? text(v) : text(v).replace(/\b(?:memory|stratalab)\.(?:main\.)?(?=[A-Za-z_"])/g, '')
  const rows = analyzed ? num(j.operator_cardinality) : null
  const read = analyzed ? num(j.operator_rows_scanned) : null
  const ms = analyzed && j.operator_timing != null ? j.operator_timing * 1000 : null
  // `#1` is the input's second column: named from the step below when it lists its columns.
  const below = j.children?.length === 1 ? j.children[0].extra_info?.Projections : undefined
  if (Array.isArray(below))
    for (const k of ['Groups', 'Aggregates', 'Order By', 'Expression', 'Projections'])
      if (info[k]) info[k] = info[k].replace(/#(\d+)/g, (m, i) => (typeof below[+i] === 'string' && !/^#\d+$|__internal_/.test(below[+i]) ? below[+i] : m))
  for (const k of ['Aggregates', 'Projections']) if (info[k]) info[k] = info[k].replace(/\bcount_star\(\)/g, 'count(*)')
  return node(j.operator_name ?? j.name ?? '?', info, rows, estimate, read && rows != null && read > rows ? read : null, ms, (j.children ?? []).map((c) => duckNode(c, analyzed)))
}

/**
 * DuckDB's JSON: EXPLAIN gives a list of root steps; EXPLAIN ANALYZE gives the profile, whose
 * one child is an EXPLAIN_ANALYZE step over the plan.
 */
export function parseDuckPlan(json: string, analyzed: boolean): Plan {
  const data = JSON.parse(json) as DuckJson | DuckJson[]
  let top: DuckJson = Array.isArray(data) ? data[0] : data
  if (!top) throw new Error('DuckDB returned an empty plan')
  while (!Array.isArray(data) && top.children?.length === 1 && (!top.operator_name || top.operator_name === 'EXPLAIN_ANALYZE')) top = top.children[0]
  return finish({ engine: 'duckdb', analyzed, root: duckNode(top, analyzed), totalMs: null, hidden: 0 })
}

// ------------------------------------------------------------------ PostgreSQL

type PgJson = Record<string, unknown> & { 'Node Type': string; Plans?: PgJson[] }

const PG_SKIP = new Set([
  'Node Type', 'Plans', 'Parallel Aware', 'Async Capable', 'Startup Cost', 'Total Cost', 'Plan Rows', 'Plan Width', 'Actual Startup Time',
  'Actual Total Time', 'Actual Rows', 'Actual Loops', 'Disabled', 'Parent Relationship', 'Strategy', 'Partial Mode', 'Inner Unique',
])

function pgNode(j: PgJson, analyzed: boolean): PgNodeWithTotal {
  const info: Record<string, string> = {}
  for (const [k, v] of Object.entries(j)) if (!PG_SKIP.has(k) && !/Blocks$/.test(k) && text(v) !== '') info[k] = text(v)
  if (j.Alias && j.Alias !== j['Relation Name']) info['Relation Name'] = `${j['Relation Name'] ?? ''} ${j.Alias}`.trim()
  delete info.Alias
  const loops = num(j['Actual Loops']) ?? 1
  const rows = analyzed ? (num(j['Actual Rows']) ?? 0) * loops : null
  const removed = analyzed ? (num(j['Rows Removed by Filter']) ?? 0) * loops : 0
  const total = analyzed ? (num(j['Actual Total Time']) ?? 0) * loops : null
  const children = (j.Plans ?? []).map((c) => pgNode(c, analyzed))
  const own = total == null ? null : Math.max(0, total - children.reduce((s, c) => s + (c.total ?? 0), 0))
  const n = node(j['Node Type'], info, rows, num(j['Plan Rows']), rows != null && removed > 0 ? rows + removed : null, own, children, text(j.Strategy))
  return Object.assign(n, { total })
}
type PgNodeWithTotal = PlanNode & { total: number | null }

/** PostgreSQL's JSON: `[{ "Plan": {…}, "Execution Time": … }]`, as text or already parsed. */
export function parsePgPlan(json: unknown, analyzed: boolean): Plan {
  const data = (typeof json === 'string' ? JSON.parse(json) : json) as { Plan?: PgJson }[]
  const top = data?.[0]?.Plan
  if (!top) throw new Error('PostgreSQL returned an empty plan')
  const strip = (n: PgNodeWithTotal): PlanNode => {
    const { total: _, ...rest } = n
    return { ...rest, children: n.children.map((c) => strip(c as PgNodeWithTotal)) }
  }
  return finish({ engine: 'postgres', analyzed, root: strip(pgNode(top, analyzed)), totalMs: null, hidden: 0 })
}

// ------------------------------------------------------------------ both

function finish(plan: Plan): Plan {
  const total = plan.analyzed ? sum(plan.root, (n) => n.ms ?? 0) : null
  const share = (n: PlanNode): PlanNode => ({ ...n, share: total && n.ms != null ? n.ms / total : 0, children: n.children.map(share) })
  return { ...plan, root: share(plan.root), totalMs: total }
}

function sum(n: PlanNode, f: (n: PlanNode) => number): number {
  return f(n) + n.children.reduce((s, c) => s + sum(c, f), 0)
}

export function countSteps(n: PlanNode): number {
  return sum(n, () => 1)
}

/** Every step, top first. */
export function allSteps(n: PlanNode): PlanNode[] {
  return [n, ...n.children.flatMap(allSteps)]
}

/** DuckDB's internal steps (columns shuffled between two steps) left out; their time stays in the total. */
export function withoutInternal(plan: Plan): Plan {
  let hidden = 0
  const walk = (n: PlanNode): PlanNode => {
    const kids = n.children.map(walk)
    if (n.kind === 'columns' && kids.length === 1 && plumbing(n.details.find(([k]) => k === 'Projections')?.[1])) {
      hidden++
      return kids[0]
    }
    return { ...n, children: kids }
  }
  const root = walk(plan.root)
  return { ...plan, root, hidden }
}

// ------------------------------------------------------------------ tips

export interface PlanTip {
  text: string
  /** worth a second look (a slow pattern), rather than information */
  warn: boolean
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const name = (n: PlanNode) => `“${n.title}”${n.summary ? ` (${n.summary.length > 60 ? n.summary.slice(0, 57) + '…' : n.summary})` : ''}`

/** What a learner can take from the plan, most useful first. */
export function planTips(plan: Plan): PlanTip[] {
  const tips: PlanTip[] = []
  const steps = allSteps(plan.root)
  if (plan.analyzed && plan.totalMs != null && plan.totalMs >= 1) {
    const slowest = steps.reduce((a, b) => ((b.ms ?? 0) > (a.ms ?? 0) ? b : a))
    if (slowest.share >= 0.4) tips.push({ text: `Most of the time (${Math.round(slowest.share * 100)}%) goes to ${name(slowest)}.`, warn: false })
  }
  for (const n of steps) {
    const inputs = n.children.map((c) => c.rows ?? c.estimate ?? 0)
    // A PostgreSQL nested loop over an index looks up each row: cheap, and its rows add up over the loops.
    if (n.kind === 'loop-join' && inputs.length === 2 && inputs[0] * inputs[1] >= 1_000_000 && !n.children.some((c) => c.kind === 'index' || c.kind === 'memory'))
      tips.push({ text: `${name(n)} pairs ${fmt(inputs[0])} × ${fmt(inputs[1])} rows. Check the ON condition: joining on = with a key lets the database use a hash join.`, warn: true })
    if (plan.analyzed && (n.kind === 'hash-join' || n.kind === 'range-join') && n.rows != null && inputs.length === 2 && n.rows >= 100 && n.rows > 1.5 * Math.max(...inputs))
      tips.push({ text: `${name(n)} gave ${fmt(n.rows)} rows, more than either input (${fmt(inputs[0])} and ${fmt(inputs[1])}): the key repeats on both sides, so rows are matched more than once. A SUM or COUNT after this join may count things twice.`, warn: true })
    if (plan.engine === 'postgres' && plan.analyzed && n.kind === 'scan' && n.scanned != null && n.rows != null && n.scanned >= 10_000 && n.rows <= n.scanned * 0.1) {
      const table = n.details.find(([k]) => k === 'Relation Name')?.[1]?.split(' ')[0]
      tips.push({ text: `PostgreSQL read all ${fmt(n.scanned)} rows${table ? ` of ${table}` : ''} to keep ${fmt(n.rows)}. An index on the filtered column (CREATE INDEX) could let it read only those.`, warn: true })
    }
  }
  return tips
}
