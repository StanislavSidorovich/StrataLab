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

// ---------------------------------------------------------------- for someone new to pipelines

export const LANE_COLOR: Record<LaneId, string> = { engineer: '#3b82f6', ae: '#a855f7', analyst: '#10b981' }

export const ROLE_NAME: Record<LaneId, string> = { engineer: 'data engineer', ae: 'analytics engineer', analyst: 'analyst' }

/** What a block does, whose job it is and what it is called in Microsoft Fabric. Shown on hover, focus and tap. */
export const BLOCK_TIPS: Record<BlockId, { does: string; fabric: string }> = {
  'copy-files': { does: 'Copies the distributor files, as they came, into the bronze table.', fabric: 'Copy data activity of a Data Factory pipeline, writing into a Lakehouse table.' },
  'clear-bronze': { does: 'Empties the bronze table so the next copy does not pile on top of the old rows.', fabric: 'Script or Stored procedure activity running a DELETE or TRUNCATE.' },
  'notify-team': { does: 'Tells the team the load is done. It does not touch any data.', fabric: 'Teams or Office 365 Outlook activity.' },
  'sql-silver': { does: 'Turns the raw text of bronze into silver: real dates, real numbers, trimmed names.', fabric: 'Notebook, Dataflow Gen2 or Stored procedure; here it is one SQL script.' },
  'check-unique': { does: 'Stops the run when two silver rows are the same sale.', fabric: 'Script or Lookup activity plus an If condition and a Fail activity; in dbt, a unique test.' },
  'check-rows': { does: 'Stops the run when silver has no rows at all.', fabric: 'Script or Lookup activity plus an If condition; in dbt, a row-count test.' },
  'check-keys': { does: 'Stops the run when a sale finds no store or no product in gold.', fabric: 'Script or Lookup activity plus an If condition; in dbt, a relationships test.' },
  'dim-customer': { does: 'Builds the stores table in gold: one row per store, with its chain.', fabric: 'Dataflow Gen2 or Stored procedure writing a gold table (Lakehouse or Warehouse).' },
  'dim-product': { does: 'Builds the products table in gold: one row per product.', fabric: 'Dataflow Gen2 or Stored procedure writing a gold table (Lakehouse or Warehouse).' },
  'fact-sellout': { does: 'Builds the sales table in gold, with a store and a product on every sale. It reads both dimensions, so they come first.', fabric: 'Stored procedure or Notebook writing the fact table of a star schema.' },
  'card-top-chain': { does: 'The answer for the Head of Sales: revenue per chain, January to June 2026.', fabric: 'A card and a bar visual in a Power BI report on the gold tables.' },
  'card-row-count': { does: 'Counts the sales in January to June 2026. Useful to find out what went wrong.', fabric: 'A card visual in a Power BI report.' },
}

export const WHEN_TIP = 'Runs when the previous step: Succeeded is the green "On success" arrow between two Fabric activities, Completed is the blue "On completion" arrow (it also runs after a failure).'

/** The blocks a working pipeline needs, in the order a newcomer builds them. */
export const REQUIRED: BlockId[] = ['copy-files', 'sql-silver', 'dim-customer', 'dim-product', 'fact-sellout', 'card-top-chain']

/** "Next: the …" for each required block, and the table it builds (for the line after a partial run). */
export const NEXT_TEXT: Record<string, string> = {
  'copy-files': 'the data engineer loads the raw files',
  'sql-silver': 'the analytics engineer turns the raw text into clean silver rows',
  'dim-customer': 'the analytics engineer builds the stores table',
  'dim-product': 'the analytics engineer builds the products table',
  'fact-sellout': 'the analytics engineer joins sales to stores and products in the fact table',
  'card-top-chain': 'the analyst puts the answer on a card',
}

export const LAYER_OF: Partial<Record<BlockId, string>> = {
  'copy-files': 'bronze',
  'sql-silver': 'silver',
  'dim-customer': 'gold',
  'dim-product': 'gold',
  'fact-sellout': 'gold',
  'card-top-chain': 'the report',
}

export const INTRO = {
  title: 'What is a pipeline?',
  lines: [
    'A pipeline is a chain of steps that turns raw files into one answer you can trust.',
    'Each step does one job and starts when the step before it is done, so you place the steps in order, from left to right.',
    'You build it once and it runs the same way every time, so nobody has to repeat the work by hand.',
  ],
  fabric: 'In Microsoft Fabric this is a Data Factory pipeline plus a Lakehouse (bronze/silver/gold); Azure Data Factory, Airflow and dbt work the same way.',
  stages: [
    { name: 'source', note: 'the distributor files', lane: null },
    { name: 'bronze', note: 'raw copy', lane: 'engineer' },
    { name: 'silver', note: 'cleaned', lane: 'ae' },
    { name: 'gold', note: 'ready to count', lane: 'ae' },
    { name: 'report', note: 'the answer', lane: 'analyst' },
  ] as { name: string; note: string; lane: LaneId | null }[],
}

/** "Show me this lane": the blocks one lane needs, each with the reason it is there. The SQL blank is left to the learner. */
export const LANE_PLAN: Record<LaneId, { block: BlockId; caption: string }[]> = {
  engineer: [{ block: 'copy-files', caption: 'Copy all 30 files as delimited text, split by ";", first row is the header. Write mode Replace: a second run then gives the same rows instead of doubling them.' }],
  ae: [
    { block: 'sql-silver', caption: 'The SQL step types the raw text into dates and numbers. Its one blank is yours to fill.' },
    { block: 'dim-customer', caption: 'The stores table: one row per store, with its chain.' },
    { block: 'dim-product', caption: 'The products table: one row per product.' },
    { block: 'fact-sellout', caption: 'The fact joins every sale to its store and product, so it goes after both dimensions.' },
  ],
  analyst: [{ block: 'card-top-chain', caption: 'The card reads gold and shows the answer: revenue per chain, January to June 2026.' }],
}

// ---------------------------------------------------------------- session 2: the people, the Why texts, the twist

/** The pipeline's own text for a diagnosis: the key says which rule fired, so each line has a Why. */
export type DiagKey = 'delimiter' | 'binary' | 'header' | 'append' | 'latest' | 'clearAfter' | 'missing' | 'failed' | 'measure' | 'rawId' | 'doubled' | 'tooShort' | 'checkIgnored' | 'noCard' | 'generic'

/** Two or three sentences under "Why?" for each diagnosis line. */
export const WHY_TEXT: Record<DiagKey, string> = {
  delimiter:
    'A delimiter tells the reader where one field ends and the next begins. These files use semicolons, so a comma never appears between fields. Open one file in a text editor, look at its first line, and pick the character you see.',
  binary:
    'Binary copies each file as raw bytes, one blob per file, without looking inside. That is right for pictures or archives, not for a table you want to query. Choose delimited text so every line is split into columns.',
  header:
    'The first line of each file names the columns. If you say there is no header, that line becomes a data row and the columns get placeholder names. Later steps ask for sale_date by name and cannot find it.',
  append:
    'Append adds rows to what is already in the table, so running twice stacks two copies. A real pipeline runs again every night, so it has to be safe to run again. Empty the table first with Clear before Copy, or choose Replace, which rebuilds it each time.',
  latest:
    'Each file is one month and the question covers six. Loading only the latest file answers a smaller question than the one asked. Load all the files, so every month from January to June reaches bronze.',
  clearAfter:
    'Steps run in the order of the slots, left to right. Clear after Copy deletes the rows Copy has just loaded, and nothing is left for silver. Put Clear before Copy, or leave it out when Copy uses Replace.',
  missing:
    'Each step reads tables that earlier steps built. A step placed before its builder looks for a table that does not exist yet. Move it to the right of the step that builds that table: the order of the slots is the order of the run.',
  failed:
    "A step failed, so every step that waited for it was skipped. The message in the journal is the database's own words, and its first sentence usually names the table or the column. Fix that step and run again.",
  measure:
    'Counting distinct rows in the card hides the copies, but gold still holds them, and the next report that sums gold will be wrong again. Repeated sales belong in silver, where one step cleans them for every report after it.',
  rawId:
    'raw_id numbers the lines of a file, so two copies of one sale get different numbers and both stay. Two rows are the same sale when the facts about the sale match: when, where and what. Ask which columns a repeat shares with the original.',
  doubled:
    'The distributor sent some sales twice, so silver and gold count them twice, and a chain with more repeats climbs the table. A good pipeline recognises rows that are the same sale and keeps one of them. This is why a number from a pipeline is checked against a source you trust.',
  tooShort:
    'A key that is too short treats different sales as one and throws real rows away. The key should be as short as it can be and still tell two sales apart. Add a column and watch the row count change.',
  checkIgnored:
    'A check exists to stop bad data before it spreads. Set to Completed, the next step runs even after the check failed, so gold is built from rows the check rejected. Set the step after a check to Succeeded.',
  noCard:
    'The Head of Sales asked a question, and nothing in the pipeline answers it without the top chain card, however clean the tables are. Put the card in the Analyst lane, after the fact table.',
  generic: 'This proof did not pass. Open the journal, find the first step that failed or that built an unexpected number of rows, and read what it says.',
}

/** One line from each role when a run reaches its lane (no voice in the MVP). */
export const LANE_LINES: Record<LaneId, string> = {
  engineer: "The distributor's files are in. I copy them into bronze exactly as they came, nothing cleaned yet.",
  ae: 'I turn the raw text into real dates and numbers, build the stores and products tables, and join them to the sales.',
  analyst: 'Gold is ready. Here is the answer for the Head of Sales.',
}

/** The story: the first pass has no de-duplication, and the card contradicts the Head of Sales' own file. */
export const TWIST = {
  title: "The number doesn't match",
  ask: (mine: string) => `Your card says ${mine}. My file from the distributor portal says Minori leads with 90,829.50. Which one is right?`,
  askSame: 'That matches my file from the distributor portal. Now show me it holds when the pipeline runs twice.',
  next: 'Look at the data first: add "Check: one row per sale" after the SQL step and run again, or open the SQL step, where a new part and a blank have appeared.',
  prompt: 'Types only: the raw text becomes dates and numbers. Nothing else happens to the rows yet.',
  fixed: 'Now it matches: Minori, 90,829.50.',
}

export const RETURN_URL = 'https://quaera.app/#lab-done=pipeline:kaiyo-sellout'
