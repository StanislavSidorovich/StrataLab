// "Show as model" (stage 2c): reads one schema's tables, columns and keys from DuckDB's catalog
// and opens them in model.quaera.app (src/core/modelLink.ts builds the statements and the link).
import { query } from './engine'
import { quoteString } from '../core/sql'
import { MODEL_URL, MODEL_WINDOW, modelDdl, modelUrl, type ModelDdl, type ModelTable } from '../core/modelLink'

// Lists come back joined with the unit separator: no JSON extension to download.
const SEP = '\u001f'
const list = (s: string | null) => (s ? s.split(SEP) : [])

export async function schemaForModel(schema: string): Promise<ModelTable[]> {
  const s = quoteString(schema)
  const [tables, cols, cons] = await Promise.all([
    query(`SELECT table_name FROM duckdb_tables() WHERE database_name = current_database() AND schema_name = ${s} AND NOT internal ORDER BY table_oid`),
    query(`SELECT table_name, column_name, data_type, is_nullable FROM duckdb_columns() WHERE database_name = current_database() AND schema_name = ${s} AND NOT internal ORDER BY table_oid, column_index`),
    query(
      `SELECT table_name, constraint_type, array_to_string(constraint_column_names, chr(31)) AS cols, referenced_table, array_to_string(referenced_column_names, chr(31)) AS ref_cols, expression
       FROM duckdb_constraints() WHERE database_name = current_database() AND schema_name = ${s} AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK') ORDER BY table_oid, constraint_index`,
    ),
  ])
  const byName = new Map<string, ModelTable>()
  for (const t of tables.toArray()) byName.set(t.table_name, { name: t.table_name, columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [] })
  for (const c of cols.toArray()) byName.get(c.table_name)?.columns.push({ name: c.column_name, type: c.data_type, notNull: !c.is_nullable })
  for (const c of cons.toArray()) {
    const t = byName.get(c.table_name)
    if (!t) continue
    if (c.constraint_type === 'PRIMARY KEY') t.primaryKey = list(c.cols)
    else if (c.constraint_type === 'UNIQUE') t.uniques.push(list(c.cols))
    else if (c.constraint_type === 'FOREIGN KEY') t.foreignKeys.push({ columns: list(c.cols), refTable: c.referenced_table, refColumns: list(c.ref_cols) })
    else if (c.expression) t.checks.push(c.expression)
  }
  return [...byName.values()]
}

// On a dev machine the link goes to StrataSQL's dev server (its .claude/launch.json, port 5173).
const MODEL_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:5173/' : MODEL_URL

/**
 * Opens the schema's tables as a model in StrataSQL. The window is opened before the await (a
 * window opened later may be blocked) under StrataSQL's name, so a tab it already has is reused:
 * there only the fragment changes and StrataSQL reads it without reloading.
 */
export async function showAsModel(schema: string, label: string): Promise<ModelDdl & { tables: number }> {
  const win = window.open('', MODEL_WINDOW)
  try {
    const tables = await schemaForModel(schema)
    const ddl = modelDdl(tables, label)
    const url = await modelUrl(ddl.sql, label, MODEL_BASE)
    if (win) win.location.href = url
    else window.open(url, MODEL_WINDOW)
    return { ...ddl, tables: tables.length }
  } catch (e) {
    win?.close()
    throw e
  }
}
