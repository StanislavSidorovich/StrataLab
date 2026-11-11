// Slicers of the build dashboard (spec docs/build-kaiyo-sales-spec.md, section 5.6). Two single-select slicers, Chain and Brand.
// A slicer is a query: Lab keeps views in schema `slice` with the names of the star's tables (the fact filtered through the
// filtered dimensions) and, before a tile or a pin runs, rewrites `build_kaiyo.gold_*` in its SQL to `slice.gold_*`. The
// learner's own SQL is never changed on the page; the checks always read the unfiltered tables. Pure: the engine part is
// src/db/buildSlice.ts.
import { SCHEMA } from '../data/build/kaiyoSales'

export interface SliceFilter {
  chain: string | null
  brand: string | null
}
export type SliceDim = keyof SliceFilter

export const NO_SLICE: SliceFilter = { chain: null, brand: null }
export const sliceOn = (f: SliceFilter): boolean => f.chain !== null || f.brand !== null

/** Click on a chip: selects the value; the selected chip clears it. */
export const toggleSlice = (f: SliceFilter, dim: SliceDim, value: string): SliceFilter => ({ ...f, [dim]: f[dim] === value ? null : value })

/** "Chain = Minori · Brand = Fruvia", or null when nothing is selected. */
export function sliceLine(f: SliceFilter): string | null {
  const parts = [f.chain !== null && `Chain = ${f.chain}`, f.brand !== null && `Brand = ${f.brand}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** `all`: both slicers act. `nochain`: the Chain slicer is left out (the bars of the chains tile keep every chain). */
export type SliceVariant = 'all' | 'nochain'
export const SLICE_SCHEMA: Record<SliceVariant, string> = { all: 'slice', nochain: 'slice_nochain' }

/** The three tables a slicer reaches. */
export const SLICED_TABLES = ['gold_fact_sales', 'gold_dim_customer', 'gold_dim_product'] as const
export type SlicedTable = (typeof SLICED_TABLES)[number]

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

/** The SELECT behind one view of the slice. */
export function viewSelect(table: SlicedTable, f: SliceFilter, variant: SliceVariant): string {
  const chain = variant === 'nochain' ? null : f.chain
  const customers = chain === null ? null : `SELECT customer_id FROM ${SCHEMA}.gold_dim_customer WHERE chain_name = ${lit(chain)}`
  const products = f.brand === null ? null : `SELECT product_id FROM ${SCHEMA}.gold_dim_product WHERE brand = ${lit(f.brand)}`
  if (table === 'gold_dim_customer') return `SELECT * FROM ${SCHEMA}.gold_dim_customer${chain === null ? '' : `\nWHERE chain_name = ${lit(chain)}`}`
  if (table === 'gold_dim_product') return `SELECT * FROM ${SCHEMA}.gold_dim_product${f.brand === null ? '' : `\nWHERE brand = ${lit(f.brand)}`}`
  const where = [customers && `f.customer_id IN (${customers})`, products && `f.product_id IN (${products})`].filter(Boolean)
  return `SELECT f.* FROM ${SCHEMA}.gold_fact_sales f${where.length ? `\nWHERE ${where.join('\n  AND ')}` : ''}`
}

/** Every statement that (re)creates the two slices for a filter. Views, so a changed filter is a replaced view. */
export function sliceStatements(f: SliceFilter): string[] {
  const out: string[] = []
  for (const v of Object.keys(SLICE_SCHEMA) as SliceVariant[]) {
    out.push(`CREATE SCHEMA IF NOT EXISTS ${SLICE_SCHEMA[v]}`)
    for (const t of SLICED_TABLES) out.push(`CREATE OR REPLACE VIEW ${SLICE_SCHEMA[v]}.${t} AS\n${viewSelect(t, f, v)}`)
  }
  return out
}

/** Names of the schemas to drop when the work tables are dropped. */
export const sliceDropStatements = (): string[] => Object.values(SLICE_SCHEMA).map((s) => `DROP SCHEMA IF EXISTS ${s} CASCADE`)

// `build_kaiyo.gold_fact_sales`, in any case, with spaces around the dot, each part quoted or not
const NAMED = /(?<![\w."])("?)build_kaiyo\1\s*\.\s*("?)(gold_(?:fact_sales|dim_customer|dim_product))\2(?![\w"])/gi

export interface Rewritten {
  sql: string
  /** the star's tables the SQL names, once each, in the order of the star */
  tables: SlicedTable[]
}

/** The SQL as it runs under a slicer, and which of the tables it reached. `tables` empty: the slicer cannot touch this SQL. */
export function rewriteSql(sql: string, variant: SliceVariant = 'all'): Rewritten {
  const seen = new Set<SlicedTable>()
  const out = sql.replace(NAMED, (_m, _q1, _q2, name: string) => {
    const t = name.toLowerCase() as SlicedTable
    seen.add(t)
    return `${SLICE_SCHEMA[variant]}.${t}`
  })
  return { sql: out, tables: SLICED_TABLES.filter((t) => seen.has(t)) }
}

/** The SQL names no table the slicer reaches. */
export const notSliced = (sql: string): boolean => rewriteSql(sql).tables.length === 0

/** What the slicer adds to a SQL: the renamed tables and the definition of each view (the teaching block "SQL it runs"). */
export function slicerAdds(sql: string, f: SliceFilter, variant: SliceVariant = 'all'): string {
  const { tables } = rewriteSql(sql, variant)
  if (tables.length === 0) return `-- This SQL names no table of the star, so the slicers do not reach it.`
  const lines: string[] = []
  const line = sliceLine(variant === 'nochain' ? { ...f, chain: null } : f)
  lines.push(`-- Slicer: ${line ?? 'none'}${variant === 'nochain' ? ' (Chain is ignored here: every chain stays)' : ''}`)
  for (const t of tables) lines.push(`-- ${SCHEMA}.${t} → ${SLICE_SCHEMA[variant]}.${t}`)
  for (const t of tables) lines.push(`CREATE VIEW ${SLICE_SCHEMA[variant]}.${t} AS\n${viewSelect(t, f, variant)};`)
  return lines.join('\n')
}
