// The first data pipeline (`#pipeline=kaiyo-sellout`, docs/pipeline-mvp-spec.md): lanes, slots, the
// twelve blocks, and the SQL each block runs as a function of its settings. Pure text: the engine that runs it
// is src/db/pipelineRun.ts, the rules are src/core/pipeline.ts.
import { quoteString } from '../../core/sql'

export const PIPELINE_ID = 'kaiyo-sellout'
export const SCHEMA = 'pipe_kaiyo'

export type LaneId = 'engineer' | 'ae' | 'analyst'

export interface Lane {
  id: LaneId
  label: string
  layer: string
  slots: number
}

export const LANES: Lane[] = [
  { id: 'engineer', label: 'Data engineer', layer: 'files → bronze', slots: 4 },
  { id: 'ae', label: 'Analytics engineer', layer: 'bronze → silver → gold, quality checks', slots: 8 },
  { id: 'analyst', label: 'Analyst', layer: 'gold → answer', slots: 3 },
]

export const slotId = (lane: LaneId, i: number) => `${lane}-${i}`
export const ALL_SLOTS: string[] = LANES.flatMap((l) => Array.from({ length: l.slots }, (_, i) => slotId(l.id, i)))
export const laneOfSlot = (slot: string): LaneId => slot.slice(0, slot.lastIndexOf('-')) as LaneId

export type BlockId =
  | 'copy-files'
  | 'clear-bronze'
  | 'notify-team'
  | 'sql-silver'
  | 'check-unique'
  | 'check-rows'
  | 'check-keys'
  | 'dim-customer'
  | 'dim-product'
  | 'fact-sellout'
  | 'card-top-chain'
  | 'card-row-count'

export interface Block {
  id: BlockId
  lane: LaneId
  label: string
}

export const BLOCKS: Block[] = [
  { id: 'copy-files', lane: 'engineer', label: 'Copy distributor files' },
  { id: 'clear-bronze', lane: 'engineer', label: 'Clear bronze table' },
  { id: 'notify-team', lane: 'engineer', label: 'Post "load finished" to the team chat' },
  { id: 'sql-silver', lane: 'ae', label: 'SQL step: silver sales' },
  { id: 'check-unique', lane: 'ae', label: 'Check: one row per sale' },
  { id: 'check-rows', lane: 'ae', label: 'Check: silver is not empty' },
  { id: 'check-keys', lane: 'ae', label: 'Check: every sale finds its store and product' },
  { id: 'dim-customer', lane: 'ae', label: 'Dimension: stores' },
  { id: 'dim-product', lane: 'ae', label: 'Dimension: products' },
  { id: 'fact-sellout', lane: 'ae', label: 'Fact: sell-out' },
  { id: 'card-top-chain', lane: 'analyst', label: 'Card: top chain, Jan to Jun 2026' },
  { id: 'card-row-count', lane: 'analyst', label: 'Card: number of sales, Jan to Jun 2026' },
]

export const blockById = (id: string): Block | undefined => BLOCKS.find((b) => b.id === id)

export type When = 'succeeded' | 'completed'

export interface Settings {
  /** "Runs when the previous step": null until chosen */
  when: When | null
  // copy-files
  files: 'all' | 'latest'
  format: 'text' | 'binary'
  delim: ';' | ','
  header: boolean
  /** null until chosen */
  mode: 'replace' | 'append' | null
  // card-top-chain
  measure: 'sum' | 'distinct'
}

export const defaultSettings = (): Settings => ({ when: null, files: 'all', format: 'text', delim: ';', header: true, mode: null, measure: 'sum' })

/** The tables the pipeline builds; "Start from scratch" drops them and keeps the `src_` and `ref_` ones. */
export const WORK_TABLES = ['bronze_sellout_raw', 'silver_sellout', 'gold_dim_customer', 'gold_dim_product', 'gold_fact_sellout', 'report_top_chain', 'report_row_count'] as const
export type WorkTable = (typeof WORK_TABLES)[number]

/** The block that builds each table: a step that reads a table not built yet is told which block to move. */
export const BUILDER: Record<WorkTable, BlockId> = {
  bronze_sellout_raw: 'copy-files',
  silver_sellout: 'sql-silver',
  gold_dim_customer: 'dim-customer',
  gold_dim_product: 'dim-product',
  gold_fact_sellout: 'fact-sellout',
  report_top_chain: 'card-top-chain',
  report_row_count: 'card-row-count',
}

const T = (name: string) => `${SCHEMA}.${name}`

/** The sources: the three Kaiyo tables the pipeline starts from (Lab's own parquet files). */
export const SOURCES = [
  { table: 'src_raw_sellout', file: 'staging_raw_sellout.parquet' },
  { table: 'src_customer', file: 'dim_customer.parquet' },
  { table: 'src_product', file: 'dim_product.parquet' },
] as const

export const SOURCE_FOLDER = 'quaera'

// ---------------------------------------------------------------- the SQL step with one blank

export const CORRECT_KEY = 'sale_date, customer_name, sku_code'
export const SILVER_COLUMNS = ['raw_id', 'source_file', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue']

/** The template as shown, the blank written as `____`. */
export function silverTemplate(): { before: string; after: string } {
  const [before, after] = silverSql('\u0000', { source: T('bronze_sellout_raw'), target: T('silver_sellout') }).split('\u0000')
  return { before, after }
}

/**
 * The SQL step. `dedup: false` is the first pass of the story (session 2): types only, no numbering and no filter.
 * `source` and `target` let the engine build the reference silver from the raw rows directly.
 */
export function silverSql(blank: string, o: { source?: string; target?: string; dedup?: boolean } = {}): string {
  const source = o.source ?? T('bronze_sellout_raw')
  const target = o.target ?? T('silver_sellout')
  const typed = `WITH typed AS (
  SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    CAST(CASE
      WHEN sale_date LIKE '%.%' THEN strptime(sale_date, '%d.%m.%Y')
      WHEN sale_date LIKE '%/%' THEN strptime(sale_date, '%d/%m/%Y')
      ELSE strptime(sale_date, '%Y-%m-%d')
    END AS DATE) AS sale_date,
    replace(trim(customer_name), 'Itiba', 'Ichiba') AS customer_name,  -- one chain, two spellings
    upper(trim(sku_code)) AS sku_code,
    CAST(CAST(replace(units, ',', '.') AS DOUBLE) AS INTEGER) AS units,
    CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2)) AS revenue
  FROM ${source}
)`
  if (o.dedup === false) {
    return `CREATE OR REPLACE TABLE ${target} AS
${typed}
SELECT raw_id, source_file, sale_date, customer_name, sku_code, units, revenue
FROM typed;`
  }
  return `CREATE OR REPLACE TABLE ${target} AS
${typed},
numbered AS (
  SELECT typed.*,
         ROW_NUMBER() OVER (PARTITION BY ${blank} ORDER BY raw_id) AS copy_no  -- 1 = first copy of a sale
  FROM typed
)
SELECT raw_id, source_file, sale_date, customer_name, sku_code, units, revenue
FROM numbered
WHERE copy_no = 1;`
}

export const SILVER_PROMPT = 'Some sales arrived twice. Keep one row per sale: what makes two rows the same sale?'
export const SILVER_HINTS = ['Two copies of one sale share the date, the store and the SKU. Only raw_id differs.', 'List those columns, separated by commas.']

// ---------------------------------------------------------------- the other blocks

const FACT_SQL = `CREATE OR REPLACE TABLE ${T('gold_fact_sellout')} AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM ${T('silver_sellout')} s
LEFT JOIN ${T('gold_dim_customer')} c ON c.customer_name = s.customer_name
LEFT JOIN ${T('gold_dim_product')} p ON p.sku_code = s.sku_code`

export const DIM_CUSTOMER_SQL = `CREATE OR REPLACE TABLE ${T('gold_dim_customer')} AS
SELECT customer_id, customer_name, chain_name, customer_type, region_id FROM ${T('src_customer')}`

export const DIM_PRODUCT_SQL = `CREATE OR REPLACE TABLE ${T('gold_dim_product')} AS
SELECT product_id, sku_code, product_name, brand, category FROM ${T('src_product')}`

export { FACT_SQL }

const H1 = `>= DATE '2026-01-01' AND `

/** The top chain card: Sum of revenue, or over distinct rows. */
export function topChainSql(measure: 'sum' | 'distinct', o: { fact?: string; customer?: string; target?: string } = {}): string {
  const fact = o.fact ?? (measure === 'distinct' ? `(SELECT DISTINCT * FROM ${T('gold_fact_sellout')})` : T('gold_fact_sellout'))
  return `CREATE OR REPLACE TABLE ${o.target ?? T('report_top_chain')} AS
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM ${fact} f
JOIN ${o.customer ?? T('gold_dim_customer')} c ON c.customer_id = f.customer_id
WHERE f.sale_date ${H1}f.sale_date < DATE '2026-07-01'
  AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC`
}

/** The reference answer, built from the reference silver and the source stores, not from the learner's tables. */
export const REF_SILVER = T('ref_silver_sellout')
export const REF_TOP = T('ref_report_top_chain')
export const refSilverSql = () => silverSql(CORRECT_KEY, { source: T('src_raw_sellout'), target: REF_SILVER })
export const refTopSql = () =>
  topChainSql('sum', {
    fact: `(SELECT s.sale_date, c.customer_id, s.revenue FROM ${REF_SILVER} s JOIN ${T('src_customer')} c ON c.customer_name = s.customer_name)`,
    customer: T('src_customer'),
    target: REF_TOP,
  })

export const ROW_COUNT_SQL = `CREATE OR REPLACE TABLE ${T('report_row_count')} AS
SELECT count(*) AS sales FROM ${T('gold_fact_sellout')}
WHERE sale_date ${H1}sale_date < DATE '2026-07-01'`

export const CHECK_UNIQUE_SQL = `SELECT count(*) - count(DISTINCT (sale_date, customer_name, sku_code)) FROM ${T('silver_sellout')}`
export const CHECK_ROWS_SQL = `SELECT count(*) FROM ${T('silver_sellout')}`
export const CHECK_KEYS_SQL = `SELECT count(*) FROM ${T('gold_fact_sellout')} WHERE customer_id IS NULL OR product_id IS NULL`

/** The copy step's statements, from its settings and the registered file names. */
export function copySql(s: Pick<Settings, 'files' | 'format' | 'delim' | 'header' | 'mode'>, files: string[]): string[] {
  const used = s.files === 'latest' ? files.slice(-1) : files
  const list = `[${used.map(quoteString).join(', ')}]`
  const select =
    s.format === 'binary'
      ? `SELECT parse_filename(filename) AS source_file, content FROM read_blob(${list})`
      : `SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(${list}, delim = ${quoteString(s.delim)}, header = ${s.header}, all_varchar = true, filename = true)`
  const table = T('bronze_sellout_raw')
  if (s.mode === 'append')
    return [`CREATE TABLE IF NOT EXISTS ${table} AS\n${select} LIMIT 0`, `INSERT INTO ${table} BY NAME\n${select}`]
  return [`CREATE OR REPLACE TABLE ${table} AS\n${select}`]
}

// ---------------------------------------------------------------- the diagnosis lines (spec 4.1)

export const DIAGNOSIS_TEXT = {
  delimiter: 'The files are split by semicolons. Read with a comma, every line is one long field.',
  binary: 'Binary copies each file as one blob: 30 rows, no columns. Read the files as delimited text.',
  header: "The first line of each file holds the column names. Without a header row it became data, and silver can't find `sale_date`.",
  append: (n: number, a: number, b: number) => `The second run added the same ${fmt(n)} rows again: bronze went ${fmt(a)} → ${fmt(b)}. Append needs Clear before it, or use Replace.`,
  latest: (n: number) => `Only export_2026-06.csv was loaded: ${fmt(n)} rows, one month. The question needs January to June.`,
  clearAfter: 'Clear ran after Copy and emptied bronze: nothing reached silver.',
  missing: (block: string, table: string, builder: string) => `${block} reads ${table}, which isn't built yet at this point. Move it after ${builder}.`,
  failed: (block: string, error: string) => `${block} failed: ${error}`,
  rawId: 'raw_id numbers the lines of an export, so each copy has its own. Partition by what makes a sale one sale.',
  doubled: (n: number, chain: string, wrong: string, right: string | null) =>
    right ? `${fmt(n)} sales arrived twice in the files. They put ${chain} first: ${wrong} instead of ${right}.` : `${fmt(n)} sales arrived twice in the files and are still in silver.`,
  tooShort: (n: number, of: number) => `The key is too short: different sales were merged, silver kept ${fmt(n)} of ${fmt(of)}.`,
  measure: (n: number) => `The card is right, but gold still holds ${fmt(n)} doubled sales and every other report reads them. Fix it in silver, not in the measure.`,
  checkIgnored: 'The check failed, but the next steps ran anyway (after Completed). Gold was built from rows the check rejected.',
  noCard: 'No answer reached the Head of Sales: the analyst lane needs the Top chain card.',
  checkStopped: "The check stopped the run before bad rows reached gold. That's its job.",
  generic: "This proof didn't pass. The journal shows which step stopped, or what it built.",
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export const PROOF_TITLES = ['The answer is right', 'Safe to run again', 'Gold is clean'] as const
