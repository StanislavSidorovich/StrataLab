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
