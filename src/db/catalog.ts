// What is in the database right now: tables and views with their columns.
import { query } from './engine'

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
}

export interface TableInfo {
  name: string
  kind: 'table' | 'view'
  rows: number | null
  columns: ColumnInfo[]
}

export async function loadCatalog(): Promise<TableInfo[]> {
  const [cols, tables, views] = await Promise.all([
    query(`SELECT table_name, column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'main' AND table_catalog = current_database()
           ORDER BY table_name, ordinal_position`),
    query(`SELECT table_name, estimated_size::BIGINT AS rows FROM duckdb_tables() WHERE schema_name = 'main' AND database_name = current_database()`),
    query(`SELECT view_name FROM duckdb_views() WHERE schema_name = 'main' AND database_name = current_database() AND NOT internal`),
  ])
  const byName = new Map<string, TableInfo>()
  for (const t of tables.toArray())
    byName.set(t.table_name, { name: t.table_name, kind: 'table', rows: t.rows == null ? null : Number(t.rows), columns: [] })
  for (const v of views.toArray()) byName.set(v.view_name, { name: v.view_name, kind: 'view', rows: null, columns: [] })
  for (const c of cols.toArray()) {
    const t = byName.get(c.table_name)
    if (t) t.columns.push({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES' })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}
