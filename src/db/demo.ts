// The demo shop's schema (src/data/demo.ts): made when missing, the old shop moved into it once,
// and the search path set so a bare `orders` still finds `demo.orders`.
import { checkpoint, query } from './engine'
import { moveTables } from './ownDatasets'
import { demoToMigrate, type CatalogTable } from '../core/demoMigration'
import { DEMO_SCHEMA, SEARCH_PATH_SQL } from '../data/demo'
import { quoteIdent } from '../core/sql'

async function mainAndDemoTables(): Promise<CatalogTable[]> {
  const t = await query(
    `SELECT c.table_schema AS schema, c.table_name AS name, c.column_name AS col, tb.table_type AS kind
     FROM information_schema.columns c JOIN information_schema.tables tb
       ON tb.table_catalog = c.table_catalog AND tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_catalog = current_database() AND c.table_schema IN ('main', '${DEMO_SCHEMA}')
     ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
  )
  const byKey = new Map<string, CatalogTable>()
  for (const r of t.toArray()) {
    const key = `${r.schema}.${r.name}`
    let e = byKey.get(key)
    if (!e) byKey.set(key, (e = { schema: String(r.schema), name: String(r.name), kind: r.kind === 'VIEW' ? 'view' : 'table', columns: [] }))
    e.columns.push(String(r.col))
  }
  return [...byKey.values()]
}

/**
 * Called once after the engine starts. Returns a line for the Messages log when the old shop was
 * moved (or could not be), else null. Never throws: a failure leaves the tables where they were,
 * and the search path still lets bare names find them in main.
 */
export async function prepareDemoSchema(): Promise<string | null> {
  let note: string | null = null
  try {
    const s = await query(`SELECT count(*)::INTEGER AS n FROM duckdb_schemas() WHERE database_name = current_database() AND schema_name = '${DEMO_SCHEMA}'`)
    if (Number(s.get(0)?.n ?? 0) === 0) {
      await query(`CREATE SCHEMA ${quoteIdent(DEMO_SCHEMA)}`)
      await checkpoint()
    }
    const names = demoToMigrate(await mainAndDemoTables())
    if (names.length) {
      const r = await moveTables('main', names, DEMO_SCHEMA)
      note = `The demo shop moved to the demo schema (${r.tables.join(', ')}, ${r.rows.toLocaleString()} rows): write demo.orders; plain orders still works.`
    }
  } catch (e) {
    note = `The demo shop could not be moved to the demo schema and stays where it was: ${String(e instanceof Error ? e.message : e).split('\n')[0]}`
  }
  try {
    await query(SEARCH_PATH_SQL)
  } catch {
    /* no demo schema to look in: bare names then need their schema */
  }
  return note
}
