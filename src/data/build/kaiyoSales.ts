// Data of the build-by-hand page `#build=kaiyo-sales` (spec docs/build-kaiyo-sales-spec.md, sections 2.1 to 2.5):
// the four sources, the SQL that makes the files and the references, and the Connect statements.
import { SOURCE_FOLDER, silverSql } from '../pipelines/kaiyoSellout'

export const SCHEMA = 'build_kaiyo'
export { SOURCE_FOLDER }
export const T = (name: string) => `${SCHEMA}.${name}`

/** Lab's parquet files the page starts from. */
export const SOURCE_TABLES = [
  { table: 'src_raw_sellout', file: 'staging_raw_sellout.parquet' },
  { table: 'src_customer', file: 'dim_customer.parquet' },
  { table: 'src_product', file: 'dim_product.parquet' },
  { table: 'src_region', file: 'dim_region.parquet' },
] as const

export type BuildSourceId = 'sales' | 'customers' | 'products' | 'regions'

export interface BuildSource {
  id: BuildSourceId
  /** shown on the desk */
  label: string
  delim: ',' | ';'
  /** the columns of the file, in order */
  columns: readonly string[]
  /** the file table the text is written from (null for sales: they are cut from src_raw_sellout) */
  fileTable: string | null
  /** registered file name; sales are a folder of files */
  file: string
  bronze: string
  clean: string
  /** rows in the file / rows in the clean version */
  fileRows: number
  cleanRows: number
}

export const BUILD_SOURCES: readonly BuildSource[] = [
  { id: 'sales', label: 'sales/', delim: ';', columns: ['raw_id', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue'], fileTable: null, file: `${SCHEMA}/sales/`, bronze: 'bronze_sales', clean: 'clean_sales', fileRows: 3110, cleanRows: 3000 },
  { id: 'customers', label: 'customers.csv', delim: ',', columns: ['customer_id', 'customer_name', 'customer_type', 'chain_name', 'region_id', 'city', 'is_active', 'updated_at'], fileTable: 'file_customers', file: `${SCHEMA}/customers.csv`, bronze: 'bronze_customers', clean: 'clean_customers', fileRows: 148, cleanRows: 144 },
  { id: 'products', label: 'products.csv', delim: ',', columns: ['product_id', 'sku_code', 'product_name', 'brand', 'category', 'list_price'], fileTable: 'file_products', file: `${SCHEMA}/products.csv`, bronze: 'bronze_products', clean: 'clean_products', fileRows: 47, cleanRows: 47 },
  { id: 'regions', label: 'regions.csv', delim: ',', columns: ['region_id', 'region_name', 'macro_region'], fileTable: 'file_regions', file: `${SCHEMA}/regions.csv`, bronze: 'bronze_regions', clean: 'clean_regions', fileRows: 17, cleanRows: 16 },
]

export const sourceById = (id: BuildSourceId): BuildSource => BUILD_SOURCES.find((s) => s.id === id)!

/** Tables dropped by "Start from scratch"; src_*, ref_* and file_* stay. */
export const WORK_TABLES = [
  'bronze_sales', 'bronze_customers', 'bronze_products', 'bronze_regions',
  'clean_sales', 'clean_customers', 'clean_products', 'clean_regions',
  'gold_dim_customer', 'gold_dim_product', 'gold_fact_sales',
  'tile_kpi', 'tile_line', 'tile_chains',
] as const

// ---------------------------------------------------------------- references (2.4)

/** The reference sales: the pipeline's reference silver, from the raw rows (3,000 rows). */
export const REF_SALES_SQL = silverSql('sale_date, customer_name, sku_code', { source: T('src_raw_sellout'), target: T('ref_sales') })

export const REF_SQL = [
  REF_SALES_SQL,
  `CREATE OR REPLACE TABLE ${T('ref_customers')} AS
SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active,
       DATE '2025-07-01' + CAST((customer_id * 37) % 360 AS INTEGER) AS updated_at
FROM ${T('src_customer')}`,
  `CREATE OR REPLACE TABLE ${T('ref_products')} AS
SELECT product_id, sku_code, product_name, brand, category, list_price FROM ${T('src_product')}`,
  `CREATE OR REPLACE TABLE ${T('ref_regions')} AS
SELECT region_id, region_name, macro_region FROM ${T('src_region')}`,
] as const

// ---------------------------------------------------------------- the files (2.2)

export const FILE_SQL = [
  `CREATE OR REPLACE TABLE ${T('file_customers')} AS
WITH stale(customer_id, old_city, old_region_id) AS (
  VALUES (45, 'Fukuoka', 11), (52, 'Kawasaki', 2), (17, 'Shizuoka', 13), (25, 'Osaka', 3)
)
SELECT * FROM (
  SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active, updated_at
  FROM ${T('ref_customers')}
  UNION ALL
  SELECT r.customer_id, r.customer_name, r.customer_type, r.chain_name, s.old_region_id, s.old_city, r.is_active, r.updated_at - 400
  FROM ${T('ref_customers')} r JOIN stale s USING (customer_id)
) ORDER BY customer_id, updated_at`,
  `CREATE OR REPLACE TABLE ${T('file_products')} AS
WITH bad(product_id, sku) AS (
  VALUES (2, 'aqua002'), (8, 'FRUV002 '), (13, ' KROS001'), (20, 'nett002'), (24, 'MILV001  '), (27, ' milv004')
)
SELECT p.product_id, coalesce(b.sku, p.sku_code) AS sku_code, p.product_name, p.brand, p.category, p.list_price
FROM ${T('ref_products')} p LEFT JOIN bad b USING (product_id)
ORDER BY p.product_id`,
  `CREATE OR REPLACE TABLE ${T('file_regions')} AS
SELECT * FROM (
  SELECT 'R-' || lpad(CAST(region_id AS VARCHAR), 2, '0') AS region_id, region_name, macro_region FROM ${T('ref_regions')}
  UNION ALL
  SELECT 'R-03', region_name, macro_region FROM ${T('ref_regions')} WHERE region_id = 3
) ORDER BY region_id`,
] as const

// ---------------------------------------------------------------- Connect (2.5)

const quoteName = (n: string) => `'${n.replace(/'/g, "''")}'`

/** The Connect statement of a source. `names` are the registered sales files (ignored for the other three). */
export function CONNECT_SQL(source: BuildSource, names: readonly string[]): string {
  if (source.id === 'sales') {
    return `CREATE OR REPLACE TABLE ${T(source.bronze)} AS
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv([${names.map(quoteName).join(', ')}], delim = ';', header = true, all_varchar = true, filename = true)`
  }
  return `CREATE OR REPLACE TABLE ${T(source.bronze)} AS
SELECT * FROM read_csv([${quoteName(source.file)}], delim = '${source.delim}', header = true)`
}

// ---------------------------------------------------------------- the given step (3.1) and Quick look

/** The sales of the given step "Changed type" (3.1), as the SQL that makes them, with `{prev}` for the table before it. */
export const GIVEN_SQL = `SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    CAST(CASE
      WHEN sale_date LIKE '%.%' THEN strptime(sale_date, '%d.%m.%Y')
      WHEN sale_date LIKE '%/%' THEN strptime(sale_date, '%d/%m/%Y')   -- 19/02/2024: day first
      ELSE strptime(sale_date, '%Y-%m-%d')
    END AS DATE) AS sale_date,
    replace(trim(customer_name), 'Itiba', 'Ichiba') AS customer_name,  -- spaces; one chain, two spellings
    upper(trim(sku_code)) AS sku_code,                                 -- nett005 and NETT005 are one SKU
    CAST(CAST(replace(units, ',', '.') AS DOUBLE) AS INTEGER) AS units, -- decimal commas
    CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2)) AS revenue
FROM {prev}`

/**
 * Right after Connect, on the files as they came (only the given step applied): the revenue of January to June 2026 and
 * the first chain. The learner is asked to remember them; the numbers are the "Nothing done" row of spec section 7.
 */
export const QUICK_LOOK_SQL = {
  kpi: `WITH sales AS (
${GIVEN_SQL.replace('{prev}', T('bronze_sales'))}
)
SELECT SUM(s.revenue) AS revenue
FROM sales s
LEFT JOIN ${T('bronze_customers')} c ON c.customer_name = s.customer_name
WHERE s.sale_date >= DATE '2026-01-01' AND s.sale_date < DATE '2026-07-01'`,
  chain: `WITH sales AS (
${GIVEN_SQL.replace('{prev}', T('bronze_sales'))}
),
fact AS (
  SELECT s.sale_date, c.customer_id, s.revenue
  FROM sales s
  LEFT JOIN ${T('bronze_customers')} c ON c.customer_name = s.customer_name
)
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM fact f
JOIN ${T('bronze_customers')} c ON c.customer_id = f.customer_id
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01' AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC
LIMIT 1`,
} as const

export const QUICK_LOOK_TEXT = {
  title: 'Quick look',
  lead: 'All four files are in. Before cleaning anything, a first look at the sales as they came: two numbers for the Head of Sales.',
  kpiLabel: 'Revenue, January to June 2026',
  chainLabel: 'First chain, January to June 2026',
  remember: 'Remember these numbers. After the cleaning you will see them again.',
}

// ---------------------------------------------------------------- Clean: cards, hints, Watch (3.2 to 3.5)

export type CleanId = 'W' | 'P1' | 'P2' | 'P3'
export const CLEAN_IDS: readonly CleanId[] = ['W', 'P1', 'P2', 'P3']

export interface CleanCard {
  id: CleanId
  source: BuildSourceId
  title: string
  text: string
  hints: readonly string[]
}

export const CLEAN_CARDS: readonly CleanCard[] = [
  { id: 'W', source: 'regions', title: 'Watch: a prefecture twice', text: 'One problem, solved in front of you. Press Next to see each step.', hints: [] },
  {
    id: 'P1',
    source: 'products',
    title: 'Wrong SKUs in products.csv',
    text: "6 of the 29 SKUs in the sales files can't be found in products.csv as written.",
    hints: [
      "Put AQUA002 from the sales next to aqua002 here. To the computer these are different words, and so are 'FRUV002 ' and 'FRUV002'.",
      'Two buttons on sku_code: Trim, then Uppercase.',
    ],
  },
  {
    id: 'P2',
    source: 'sales',
    title: 'Sales sent twice',
    text: 'Some sales arrived twice: the same line in the same export. Keep one row per sale: what makes two rows the same sale?',
    hints: ['Two copies of one sale share the date, the store and the SKU. Only raw_id differs.', 'List those columns, separated by commas.'],
  },
  {
    id: 'P3',
    source: 'customers',
    title: 'Stores twice in customers.csv',
    text: '4 stores are in customers.csv twice. Each needs exactly one row, or every sale of theirs will be counted twice.',
    hints: [
      'Look at the two rows of Nagisa #1045: the city differs, and so does updated_at. Which one is the store today?',
      'Keep latest row per key: key customer_id, order by updated_at, newest.',
    ],
  },
]

export const cleanCard = (id: CleanId) => CLEAN_CARDS.find((c) => c.id === id)!

/** The six SKUs of P1 as they are in the file, spaces drawn as a visible mark. */
export const P1_SKUS = ['aqua002', 'FRUV002␣', '␣KROS001', 'nett002', 'MILV001␣␣', '␣milv004']

export const GIVEN_NOTE = 'Lab did the routine part. Open it to see what it fixed; the problems below are yours.'
export const P3_NOTE = 'This is the pattern you wrote in sales by hand. Here the order decides which copy stays.'

export interface WatchStep {
  title: string
  /** shown and run (null: the button step) */
  sql: string | null
  caption: string
}

export const WATCH_STEPS: readonly WatchStep[] = [
  {
    title: 'Count',
    sql: `SELECT count(*) AS rows FROM ${T('bronze_regions')}`,
    caption: 'regions.csv has 17 rows. Kaiyo sells in 16 prefectures. One row is too many, or a prefecture is new.',
  },
  {
    title: 'Find',
    sql: `SELECT region_id, count(*) AS rows FROM ${T('bronze_regions')} GROUP BY region_id HAVING count(*) > 1`,
    caption: 'Group by the key and keep groups with more than one row: R-03 is there twice.',
  },
  {
    title: 'Compare',
    sql: `SELECT * FROM ${T('bronze_regions')} WHERE region_id = 'R-03'`,
    caption: 'The two rows match in every column. That is one row sent twice, safe to drop.',
  },
  {
    title: 'Fix',
    sql: null,
    caption: 'The button wrote the SQL for you and added a step to the list. The file itself is never changed: steps run on a copy.',
  },
  {
    title: 'Check',
    sql: `SELECT count(*) - count(DISTINCT region_id) AS broken FROM ${T('clean_regions')}`,
    caption: "A check is a query that should return 0. Zero rows broken: the fix worked. You'll write checks like this for the next problems.",
  },
]

export const WATCH_CLOSING = 'Remove duplicates only helps when the rows match in every column. When they differ somewhere, it keeps both: you will meet that in customers.'

// ---------------------------------------------------------------- the checks (3.3 to 3.5)

export const CHECK_SQL = {
  p1c1: `SELECT count(*) FROM ${T('clean_products')} WHERE sku_code <> upper(trim(sku_code))`,
  p1c2: `SELECT count(DISTINCT s.sku_code) FROM ${T('clean_sales')} s
WHERE NOT EXISTS (SELECT 1 FROM ${T('clean_products')} p WHERE p.sku_code = s.sku_code)`,
  p1rows: `SELECT count(*) FROM ${T('clean_sales')} s
WHERE NOT EXISTS (SELECT 1 FROM ${T('clean_products')} p WHERE p.sku_code = s.sku_code)`,
  p2: `SELECT count(*) - count(DISTINCT (sale_date, customer_name, sku_code)) FROM ${T('clean_sales')}`,
  p3: `SELECT count(*) - count(DISTINCT customer_id) FROM ${T('clean_customers')}`,
} as const

/** Lines shown by the diagnosis (3.3 to 3.5). */
export const BUILD_DIAGNOSIS = {
  skuCase: (left: string[]) => `Spaces are gone, but ${left.length} SKUs are still lower case: ${left.join(', ')}. Sales write them in capitals.`,
  skuSpaces: (left: string[]) => `Capitals are right, but ${left.length} SKUs still have spaces at the edges: ${left.map((s) => `'${s}'`).join(', ')}.`,
  skuWrongColumn: (col: string) => `The step changed ${col}. The column that has to match the sales is sku_code.`,
  skuMissing: (n: number, rows: number) => `${n} SKUs sold in the files still find no product: ${rows.toLocaleString('en-US')} sales would have no brand or category.`,
  twice: (n: number) => `${n} sales are still in twice. Two copies share the date, the store and the SKU.`,
  syntax: (error: string, cols: string[]) => `${error}. The step reads these columns: ${cols.join(', ')}.`,
  distinctKeepsBoth: (n: number) => `Remove duplicates kept both rows of ${n} stores: they differ in city, region_id and updated_at. Choose which row is current.`,
  keptOldest: (name: string, oldCity: string, city: string, date: string) =>
    `You kept the older row: ${name} is in ${oldCity} in your table, but its latest row (${date}) says ${city}.`,
  keyTooWide: (col: string, n: number) => `One row per ${col} left ${n} of 144 customers. The key is what names one customer: customer_id.`,
  stillTwice: (n: number) => `${n} customers are still in twice.`,
  generic: "The table doesn't match the expected one yet. Compare it with the rows in the preview.",
} as const

// ---------------------------------------------------------------- Model v1 (4.1)

/** The star built for the learner (4.1): two dimensions and the fact that carries their ids. */
export const GOLD_SQL = [
  `CREATE OR REPLACE TABLE ${T('gold_dim_customer')} AS
SELECT customer_id, customer_name, customer_type, chain_name, region_id, city FROM ${T('clean_customers')}`,
  `CREATE OR REPLACE TABLE ${T('gold_dim_product')} AS
SELECT product_id, sku_code, product_name, brand, category FROM ${T('clean_products')}`,
  `-- the sales carry names and SKUs; the fact carries ids, looked up through the dimensions
CREATE OR REPLACE TABLE ${T('gold_fact_sales')} AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM ${T('clean_sales')} s
LEFT JOIN ${T('gold_dim_customer')} c ON c.customer_name = s.customer_name
LEFT JOIN ${T('gold_dim_product')} p ON p.sku_code = s.sku_code`,
] as const

export const MODEL_TEXT = {
  lead: 'The cleaned tables are linked into a star: sales in the middle, customers and products around them. Lab built it for you this time; you will link the keys yourself in a later version.',
  link1: 'customer_name in the sales → customer_id',
  link2: 'sku_code in the sales → product_id',
  note: 'Customers and products without sales are normal: a dimension lists everything, the fact only what was sold.',
  noRegions: 'Regions are not in this star yet: their ids are still text (R-03) while customers use numbers.',
} as const

// ---------------------------------------------------------------- Dashboard (5.1 to 5.3)

export const TILE_IDS = ['kpi', 'line', 'chains'] as const
export type TileId = (typeof TILE_IDS)[number]

/** The tiles' SQL; `____` is the blank of the first two. */
export const TILE_SQL: Record<TileId, string> = {
  kpi: `CREATE OR REPLACE TABLE ${T('tile_kpi')} AS
SELECT ____ AS revenue
FROM ${T('gold_fact_sales')}
WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`,
  line: `CREATE OR REPLACE TABLE ${T('tile_line')} AS
SELECT ____ AS month, SUM(revenue) AS revenue
FROM ${T('gold_fact_sales')}
GROUP BY 1
ORDER BY 1`,
  chains: `CREATE OR REPLACE TABLE ${T('tile_chains')} AS
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM ${T('gold_fact_sales')} f
JOIN ${T('gold_dim_customer')} c ON c.customer_id = f.customer_id
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'
  AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC`,
}

/** The table each tile builds. */
export const TILE_TABLE: Record<TileId, string> = { kpi: 'tile_kpi', line: 'tile_line', chains: 'tile_chains' }

export interface TileCard {
  id: TileId
  title: string
  prompt: string
  hints: readonly string[]
}

export const TILE_CARDS: readonly TileCard[] = [
  {
    id: 'kpi',
    title: 'Revenue, January to June 2026',
    prompt: 'One number for the Head of Sales: how much did we sell from January to June 2026?',
    hints: ['Revenue of many sales together is their sum.', 'SUM(revenue)'],
  },
  {
    id: 'line',
    title: 'Revenue by month',
    prompt: 'A line of revenue month by month, January 2024 to June 2026. What goes on the time axis?',
    hints: [
      'Each point is one month of one year: March 2025 and March 2026 are different points.',
      "date_trunc('month', sale_date) turns every date into the first day of its month.",
    ],
  },
  {
    id: 'chains',
    title: 'Revenue by chain, January to June 2026',
    prompt: 'No blank here: the SQL is given. Run it and read the table.',
    hints: [],
  },
]

export const tileCard = (id: TileId) => TILE_CARDS.find((t) => t.id === id)!

/** The reference star and tiles, built from the `ref_*` tables (the checks compare with these; the "Right" row of 7). */
export const REF_TILE_SQL = [
  `CREATE OR REPLACE TABLE ${T('ref_star_fact')} AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM ${T('ref_sales')} s
LEFT JOIN ${T('ref_customers')} c ON c.customer_name = s.customer_name
LEFT JOIN ${T('ref_products')} p ON p.sku_code = s.sku_code`,
  `CREATE OR REPLACE TABLE ${T('ref_tile_kpi')} AS
SELECT SUM(revenue) AS revenue FROM ${T('ref_star_fact')}
WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`,
  `CREATE OR REPLACE TABLE ${T('ref_tile_line')} AS
SELECT date_trunc('month', sale_date) AS month, SUM(revenue) AS revenue FROM ${T('ref_star_fact')} GROUP BY 1 ORDER BY 1`,
  `CREATE OR REPLACE TABLE ${T('ref_tile_chains')} AS
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM ${T('ref_star_fact')} f JOIN ${T('ref_customers')} c ON c.customer_id = f.customer_id
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01' AND c.chain_name IS NOT NULL
GROUP BY c.chain_name ORDER BY revenue DESC`,
] as const

export const BUILD_DASH_DIAGNOSIS = {
  syntax: (error: string) => `${error}. The tile reads the gold tables: sale_date, customer_id, product_id, units, revenue.`,
  kpiCount: (v: string) => `${v} is the number of sales, not the money. The tile asks for revenue.`,
  kpiUnits: (v: string) => `${v} is units sold. The Head of Sales asked for revenue.`,
  kpiAvg: (v: string) => `${v} is the average sale. Revenue for the half-year is all sales added up.`,
  kpiMax: (v: string) => `${v} is the biggest single sale.`,
  kpiOther: (v: string) => `${v} is not the revenue of the half-year. Revenue is all the sales added up.`,
  lineMonthNumber: 'month() gives 1 to 12, so January 2024, 2025 and 2026 were added together: 12 points instead of 30.',
  lineYear: 'One point per year: 3 points. The line needs one per month.',
  lineQuarter: 'One point per quarter: 10 points. The line needs one per month.',
  lineDays: (n: number) => `One point per day with sales: ${n} points, too jagged to read. Group the days into months.`,
  lineOther: (n: number) => `${n} points. The line needs one point per month, January 2024 to June 2026: 30 points.`,
  chainsOff: "The table doesn't match the expected one. Is the star built from the cleaned tables?",
  pickFirst: (what: string) => `Pick a ${what.toLowerCase()} first.`,
  typeNumber: 'Type the number as you read it from the dashboard.',
  numberOff: (pick: string) => `${pick} is right, but the amount isn't. Read it from the dashboard again.`,
  pickOff: 'The amount belongs to another one. Look again at which one it is.',
  answerOff: (where: string) => `Not quite. Look again at ${where}.`,
} as const

// ---------------------------------------------------------------- Answer (5.4)

export type AnswerId = 'A1' | 'A2' | 'A3'

export const MONTHS_2025 = Array.from({ length: 12 }, (_, i) => {
  const name = new Date(Date.UTC(2025, i, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  return { value: `2025-${String(i + 1).padStart(2, '0')}`, label: `${name} 2025` }
})
export const CHAINS = ['Ichiba', 'Kaigan', 'Minori', 'Nagisa', 'Prima'] as const

export interface AnswerWrong {
  /** the pick that triggers the line (any when absent) */
  pick?: string
  /** the number that triggers it, within 0.5 (any when absent) */
  value?: number
  line: string
}

export interface AnswerQuestion {
  id: AnswerId
  question: string
  /** a select before the number: its label and options */
  pickLabel?: string
  options?: readonly { value: string; label: string }[]
  numberLabel: string
  right: { pick?: string; pickText?: string; value: number }
  /** where on the dashboard the answer is */
  where: string
  wrong: readonly AnswerWrong[]
}

export const ANSWERS: readonly AnswerQuestion[] = [
  {
    id: 'A1',
    question: 'How much did we sell from January to June 2026?',
    numberLabel: 'Revenue',
    right: { value: 314906.13 },
    where: 'the number tile',
    wrong: [
      { value: 595, line: "That's the number of sales." },
      { value: 331604.58, line: 'That total still has the 110 sales sent twice.' },
    ],
  },
  {
    id: 'A2',
    question: 'Which month of 2025 sold the most, and how much?',
    pickLabel: 'Month',
    options: MONTHS_2025,
    numberLabel: 'Revenue',
    right: { pick: '2025-08', pickText: 'August', value: 64592.75 },
    where: 'the line, 2025 only',
    wrong: [
      { value: 79717.23, line: 'January 2026 is the best month of the whole line; the question asks about 2025.' },
      { pick: '2025-06', line: 'June is second; look again at August.' },
      { value: 59020.4, line: 'June is second; look again at August.' },
    ],
  },
  {
    id: 'A3',
    question: 'Which chain sold the most from January to June 2026, and how much?',
    pickLabel: 'Chain',
    options: CHAINS.map((c) => ({ value: c, label: c })),
    numberLabel: 'Revenue',
    right: { pick: 'Minori', pickText: 'Minori', value: 90829.5 },
    where: 'the table of chains',
    wrong: [{ pick: 'Nagisa', line: 'Nagisa is second, 87,647.48.' }],
  },
]
