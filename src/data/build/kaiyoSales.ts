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

/** How the sales source reads its folder (spec 5.7): an explicit list of names, or every file that matches the pattern. */
export type SalesMode = 'list' | 'pattern'
export const SALES_PATTERN = `${SCHEMA}/sales/export_*.csv`

/** The Connect statement of a source. `names` are the registered sales files (ignored for the other three); `mode` only matters for sales. */
export function CONNECT_SQL(source: BuildSource, names: readonly string[], mode: SalesMode = 'list'): string {
  if (source.id === 'sales') {
    const files = mode === 'pattern' ? quoteName(SALES_PATTERN) : `[${names.map(quoteName).join(', ')}]`
    return `CREATE OR REPLACE TABLE ${T(source.bronze)} AS
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(${files}, delim = ';', header = true, all_varchar = true, filename = true)`
  }
  return `CREATE OR REPLACE TABLE ${T(source.bronze)} AS
SELECT * FROM read_csv([${quoteName(source.file)}], delim = '${source.delim}', header = true)`
}

// ---------------------------------------------------------------- the given step (3.1) and Quick look

/**
 * The given step on sales (spec 3.1, v0.33.0): only what a loader would do, raw_id and source_file. Dates, numbers and
 * names arrive as text; P5, P6 and P4 are the learner's. The SKU codes are tidied here, because the products' P1 compares
 * with them and the sales are not where the learner fixes SKUs. `{prev}` stands for the table before it.
 */
export const GIVEN_SQL = `SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    sale_date,
    customer_name,
    upper(trim(sku_code)) AS sku_code,   -- nett005 and NETT005 are one SKU
    units,
    revenue
FROM {prev}`

/**
 * The first version's given step (v0.32.0 and before): it also did dates, decimal commas and names. Saved work that
 * has it keeps it (P4 to P6 count as done), and the Quick look still reads the sales through it.
 */
export const GIVEN_FULL_SQL = `SELECT
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
${GIVEN_FULL_SQL.replace('{prev}', T('bronze_sales'))}
)
SELECT SUM(s.revenue) AS revenue
FROM sales s
LEFT JOIN ${T('bronze_customers')} c ON c.customer_name = s.customer_name
WHERE s.sale_date >= DATE '2026-01-01' AND s.sale_date < DATE '2026-07-01'`,
  chain: `WITH sales AS (
${GIVEN_FULL_SQL.replace('{prev}', T('bronze_sales'))}
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

export type CleanId = 'W' | 'P1' | 'P2' | 'P3' | 'P5' | 'P6'
export const CLEAN_IDS: readonly CleanId[] = ['W', 'P1', 'P2', 'P3', 'P5', 'P6']

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
  {
    id: 'P5',
    source: 'sales',
    title: 'Dates in the sales',
    text: 'sale_date came as text. Turn it into a date: press Change type with Date on sale_date in the sales list below, and see what happens.',
    hints: [
      'Look at the rows in error. A plain Change type reads 2024-01-05 only; the exports also write 19.02.2024 and 19/02/2024.',
      "Write the format of the slash dates. Kaiyo's distributors put the day first: %d/%m/%Y.",
    ],
  },
  {
    id: 'P6',
    source: 'sales',
    title: 'Numbers with a decimal comma',
    text: 'revenue and units are text too. Press Change type on each: Decimal for revenue, Whole number for units. Then see what the preview says.',
    hints: [
      'Look at the rows in error: 381,99 is written with a comma, and a number with a comma is not a number to the computer.',
      'Change type again, with Decimal separator set to comma, on revenue and on units.',
    ],
  },
]

export const cleanCard = (id: CleanId) => CLEAN_CARDS.find((c) => c.id === id)!

/** The six SKUs of P1 as they are in the file, spaces drawn as a visible mark. */
export const P1_SKUS = ['aqua002', 'FRUV002␣', '␣KROS001', 'nett002', 'MILV001␣␣', '␣milv004']

export const GIVEN_NOTE = 'Lab only typed raw_id and tidied the SKU codes. Dates, numbers and names are as the distributors sent them: they are yours.'
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
  dateText: 'sale_date is still text. Press Change type with Date on sale_date in the sales list below.',
  datePlain: (n: string, samples: string[]) =>
    `The step is there, but ${n} dates are [Error]: a plain Change type reads 2024-01-05 and nothing else. These are written another way: ${samples.map((x) => `'${x}'`).join(', ')}.`,
  dateMonthFirst: (n: string) => `${n} dates are still [Error]. A format with the month first can't read 19/02/2024: there is no month 19. In these files the day comes first.`,
  dateStill: (n: string, samples: string[]) => `${n} dates are still [Error], like ${samples.map((x) => `'${x}'`).join(', ')}. Compare how they are written with the format in the blank.`,
  dateWrongDay: (n: string) => `No errors, but ${n} dates are not the ones in the expected table: day and month are swapped on some. Day comes first in these files.`,
  numberText: (cols: string[]) => `${cols.join(' and ')} ${cols.length === 1 ? 'is' : 'are'} still text. Press Change type on ${cols.length === 1 ? 'it' : 'each'} in the sales list below.`,
  numberComma: (parts: string[]) => `${parts.join(' and ')} are [Error]: the numbers are written with a comma, like 381,99. Change type again with Decimal separator set to comma.`,
  numberOne: (col: string, n: string) => `${col} is fine now, but ${n} values in ${col} are still [Error]. Same fix there: Decimal separator comma.`,
  numberOff: (n: string) => `No errors, but ${n} values are not the ones in the expected table. Whole number for units, Decimal for revenue.`,
  namesSpaces: (n: string) => `${n} names still have spaces at the edges. A name has to match to the character: Trim customer_name.`,
  namesItiba: (n: string, sample: string) => `Spaces are gone, but ${n} sales still find no customer, like '${sample}': sales write the chain as Itiba and customers as Ichiba. Replace values: Itiba with Ichiba.`,
  namesWrongColumn: (col: string) => `The step changed ${col}. The column that has to match the customers is customer_name.`,
  namesLeft: (n: string, sample: string) => `${n} sales still find no customer, like '${sample}'. Compare it with the names in customers.`,
  regionText: 'region_id is still text. Make it a number: R-03 is region 3. Then customers and regions can be linked.',
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

/** The tiles' SQL as the learner sees it: a plain SELECT; `____` is the blank of each tile. Lab wraps it (`tileRunSql`). */
export const TILE_SQL: Record<TileId, string> = {
  kpi: `SELECT ____ AS revenue
FROM ${T('gold_fact_sales')}
WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`,
  line: `SELECT ____ AS month, SUM(revenue) AS revenue
FROM ${T('gold_fact_sales')}
GROUP BY 1
ORDER BY 1`,
  chains: `SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM ${T('gold_fact_sales')} f
JOIN ${T('gold_dim_customer')} c ON c.customer_id = f.____
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
    prompt: 'Which customer does a sale belong to? The join needs the key you linked on the Model step.',
    hints: [
      'On the Model step you linked the sales to the customers by one column. The same column joins them here.',
      'It is the key both gold_fact_sales and gold_dim_customer carry: customer_id.',
    ],
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
  chainsKey: 'Sales and customers are linked by customer_id, the key you linked on the Model step. Another column joins the wrong rows.',
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
  /** `unsigned`: the sign is not asked for, -217 and 217 both pass */
  right: { pick?: string; pickText?: string; value: number; unsigned?: boolean }
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

/** Where the finish leads back to: the trainer counts the build (quaera.app reads `#lab-done=build:<id>`). */
export const BUILD_RETURN_URL = 'https://quaera.app/#lab-done=build:kaiyo-sales'

// ---------------------------------------------------------------- More: six more questions (spec 5.5, 5.6)

export type MoreId = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6'

export const BRANDS = ['Aqualis', 'Fruvia', 'Gastrivo', 'Krosti', 'Milvara', 'Nettora', 'Pyrexan', 'Rhinolar', 'Vitanor'] as const
export const PREFECTURES = ['Aichi', 'Chiba', 'Fukuoka', 'Hiroshima', 'Hokkaido', 'Hyogo', 'Ibaraki', 'Kanagawa', 'Kyoto', 'Miyagi', 'Niigata', 'Okinawa', 'Osaka', 'Saitama', 'Shizuoka', 'Tokyo'] as const
export const MINORI_STORES = [1013, 1014, 1015, 1016, 1020, 1021, 1024, 1027, 1033, 1040, 1047, 1054].map((n) => `Minori #${n}`)

export interface MoreQuestion extends Omit<AnswerQuestion, 'id'> {
  id: MoreId
  /** a short name for the list and the pinned tile */
  title: string
  /** what the question practises (one line under it) */
  practises: string
  /** what the editor holds at the start: the skeleton of K1, a one-line comment for the others */
  start: string
  hints: readonly [string, string]
  solution: string
  /** answered with the dashboard's slicers, no SQL (K6): the slicers to set */
  slicers?: { chain: string; brand: string }
}

const H1 = `sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'`
const Y2025 = `sale_date >= DATE '2025-01-01' AND sale_date < DATE '2026-01-01'`

export const MORE_QUESTIONS: readonly MoreQuestion[] = [
  {
    id: 'K1',
    title: 'Sales, January to June 2026',
    question: 'How many sales did we have from January to June 2026?',
    practises: 'COUNT and the date filter of the number tile',
    start: `-- How many sales from January to June 2026?\nSELECT ____ AS sales\nFROM ${T('gold_fact_sales')}\nWHERE ${H1}`,
    numberLabel: 'Sales',
    right: { value: 595 },
    where: 'your result',
    hints: ['A sale is one row of the fact table. Count the rows that pass the date filter.', 'count(*) counts rows. The WHERE of the number tile already limits the dates.'],
    solution: `SELECT count(*) AS sales\nFROM ${T('gold_fact_sales')}\nWHERE ${H1}`,
    wrong: [
      { value: 618, line: 'That count still has the sales sent twice. Is the Clean step done for the sales?' },
      { value: 570, line: '570 counts only the sales that have a revenue; some have none. count(*) counts every row.' },
      { value: 314906.13, line: "That's the revenue, not the number of sales." },
    ],
  },
  {
    id: 'K2',
    title: 'Revenue by brand, January to June 2026',
    question: 'Which brand sold the most from January to June 2026, and how much?',
    practises: 'JOIN to the product dimension, GROUP BY, ORDER BY',
    start: '-- Revenue per brand, January to June 2026. The brand is in gold_dim_product.\n',
    pickLabel: 'Brand',
    options: BRANDS.map((b) => ({ value: b, label: b })),
    numberLabel: 'Revenue',
    right: { pick: 'Fruvia', pickText: 'Fruvia', value: 100004.67 },
    where: 'your result',
    hints: ['The fact has product_id, the brand is in gold_dim_product. Join them on product_id, then add up the revenue per brand.', 'GROUP BY brand, SUM(revenue), ORDER BY the sum DESC. The first row is the top brand.'],
    solution: `SELECT p.brand, SUM(f.revenue) AS revenue\nFROM ${T('gold_fact_sales')} f\nJOIN ${T('gold_dim_product')} p ON p.product_id = f.product_id\nWHERE f.${H1}\nGROUP BY p.brand\nORDER BY revenue DESC`,
    wrong: [
      { pick: 'Aqualis', line: 'Aqualis is second, 80,977.09. Look at the top row.' },
      { value: 80977.09, line: 'That is Aqualis, the second brand.' },
    ],
  },
  {
    id: 'K3',
    title: 'Units returned in 2025',
    question: 'How many units came back as returns in 2025?',
    practises: 'WHERE on negative units, SUM',
    start: '-- Returns are sales with negative units.\n',
    numberLabel: 'Units',
    right: { value: 217, unsigned: true },
    where: 'your result',
    hints: ['A return is a row whose units are below zero. Filter on that, and on the year 2025.', 'SUM(units) over those rows is negative; the units that came back are its size. Dates of 2025 run from 2025-01-01 up to, not including, 2026-01-01.'],
    solution: `SELECT -SUM(units) AS units_returned\nFROM ${T('gold_fact_sales')}\nWHERE units < 0 AND ${Y2025}`,
    wrong: [
      { value: 43, line: '43 is how many return lines there are, not how many units came back.' },
      { value: 6497, line: '6,497 is every unit of 2025 with the returns taken off. The question asks about the returns only.' },
      { value: 6714, line: '6,714 is the units sold, the positive rows. The returns are the negative ones.' },
    ],
  },
  {
    id: 'K4',
    title: 'Revenue by prefecture, January to June 2026',
    question: 'Which prefecture sold the most from January to June 2026, and how much?',
    practises: 'JOIN to the customer dimension, GROUP BY region_name',
    start: '-- Revenue per prefecture, January to June 2026. Where does a sale know its prefecture?\n',
    pickLabel: 'Prefecture',
    options: PREFECTURES.map((b) => ({ value: b, label: b })),
    numberLabel: 'Revenue',
    right: { pick: 'Okinawa', pickText: 'Okinawa', value: 44845.38 },
    where: 'your result',
    hints: ['A sale knows its store through customer_id, and the store knows its prefecture: look at the columns of gold_dim_customer in Your star.', 'Join the fact to gold_dim_customer on customer_id, group by region_name, add up the revenue.'],
    solution: `SELECT c.region_name, SUM(f.revenue) AS revenue\nFROM ${T('gold_fact_sales')} f\nJOIN ${T('gold_dim_customer')} c ON c.customer_id = f.customer_id\nWHERE f.${H1}\nGROUP BY c.region_name\nORDER BY revenue DESC`,
    wrong: [
      { pick: 'Aichi', line: 'Aichi is second, 35,819.43. Look at the top row.' },
      { value: 35819.43, line: 'That is Aichi, the second prefecture.' },
    ],
  },
  {
    id: 'K5',
    title: 'Minori stores, 2025',
    question: 'Which single Minori store sold the most in 2025, and how much?',
    practises: 'JOIN, two filters, LIMIT 1',
    start: '-- One row per Minori store, 2025. The chain is in gold_dim_customer.\n',
    pickLabel: 'Store',
    options: MINORI_STORES.map((b) => ({ value: b, label: b })),
    numberLabel: 'Revenue',
    right: { pick: 'Minori #1015', pickText: 'Minori #1015', value: 22383.37 },
    where: 'your result',
    hints: ['Two filters: the chain is Minori (a column of the customers) and the date is in 2025. Group by the store, not the chain.', 'GROUP BY customer_name, ORDER BY the sum DESC, LIMIT 1 keeps only the top store.'],
    solution: `SELECT c.customer_name, SUM(f.revenue) AS revenue\nFROM ${T('gold_fact_sales')} f\nJOIN ${T('gold_dim_customer')} c ON c.customer_id = f.customer_id\nWHERE c.chain_name = 'Minori'\n  AND f.${Y2025}\nGROUP BY c.customer_name\nORDER BY revenue DESC\nLIMIT 1`,
    wrong: [
      { pick: 'Minori #1027', line: 'Minori #1027 is second, 19,893.72. Look at the top row.' },
      { value: 19893.72, line: 'That is Minori #1027, the second store.' },
    ],
  },
  {
    id: 'K6',
    title: 'Aqualis in Minori stores',
    question: 'How much did Aqualis sell in Minori stores from January to June 2026?',
    practises: 'the slicers: a slicer is a query, no SQL to write',
    start: '',
    numberLabel: 'Revenue',
    right: { value: 24519.83 },
    where: 'the revenue tile with the slicers set',
    slicers: { chain: 'Minori', brand: 'Aqualis' },
    hints: ['Set both slicers: Chain = Minori and Brand = Aqualis. The revenue tile of the dashboard then shows the number.', 'The tile says “Filtered” while a slicer is on. Open the SQL it runs under the tile: the slicer is a view with a WHERE on the chain and on the brand.'],
    solution: '',
    wrong: [
      { value: 90829.5, line: 'That is all of Minori, every brand. Set the Brand slicer to Aqualis too.' },
      { value: 80977.09, line: 'That is Aqualis in every chain. Set the Chain slicer to Minori too.' },
      { value: 314906.13, line: 'That is the whole dashboard with no slicer on. Set Chain and Brand.' },
    ],
  },
]

export const moreQuestion = (id: MoreId) => MORE_QUESTIONS.find((q) => q.id === id)!
export const MORE_IDS: readonly MoreId[] = MORE_QUESTIONS.map((q) => q.id)
