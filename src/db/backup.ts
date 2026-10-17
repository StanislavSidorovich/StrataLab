// The whole DuckDB database as one .duckdb file, and back (SSMS's Backup / Restore). The file
// opens in DuckDB's own tools too: `duckdb.connect('quaera-lab-….duckdb')` in Python.
import { quoteIdent, quoteString } from '../core/sql'
import { fillOrder, wipeStatements, type DbObjects } from '../core/backup'
import { checkpoint, dropFile, query, readFile, registerBuffer } from './engine'

async function currentDatabase(): Promise<string> {
  return String((await query('SELECT current_database() AS db')).toArray()[0].db)
}

/**
 * Copies database `from` into `to`: DuckDB's own COPY FROM DATABASE for the schemas, tables,
 * views, sequences and macros, then the rows table by table, parents first (its own copy of the
 * rows goes alphabetically and trips over foreign keys: order_items before orders).
 */
async function copyDatabase(from: string, to: string) {
  await query(`COPY FROM DATABASE ${quoteIdent(from)} TO ${quoteIdent(to)} (SCHEMA)`)
  const d = quoteString(from)
  const tables = (await query(`SELECT schema_name AS schema, table_name AS name FROM duckdb_tables() WHERE database_name = ${d} AND NOT internal ORDER BY ALL`)).toArray().map((r) => ({ schema: String(r.schema), name: String(r.name) }))
  for (const t of fillOrder(tables, await foreignKeys(from))) {
    const name = `${quoteIdent(t.schema)}.${quoteIdent(t.name)}`
    await query(`INSERT INTO ${quoteIdent(to)}.${name} SELECT * FROM ${quoteIdent(from)}.${name}`)
  }
}

async function foreignKeys(db: string): Promise<DbObjects['fks']> {
  const rows = await query(`SELECT schema_name AS schema, table_name AS "table", referenced_table AS "refTable" FROM duckdb_constraints() WHERE database_name = ${quoteString(db)} AND constraint_type = 'FOREIGN KEY'`)
  return rows.toArray().map((r) => ({ schema: String(r.schema), table: String(r.table), refTable: String(r.refTable) }))
}

/** Every schema, table, view, sequence and macro, copied into a new database file. */
export async function backupDatabase(): Promise<Uint8Array> {
  const db = await currentDatabase()
  const file = `backup_${Date.now()}.duckdb`
  const alias = `backup_${Date.now()}`
  await query(`ATTACH ${quoteString(file)} AS ${quoteIdent(alias)}`)
  try {
    await copyDatabase(db, alias)
  } finally {
    await query(`DETACH ${quoteIdent(alias)}`)
  }
  try {
    return await readFile(file)
  } finally {
    await dropFile(file).catch(() => {})
  }
}

async function objectsIn(db: string): Promise<DbObjects> {
  const d = quoteString(db)
  const rows = async (sql: string) => (await query(sql)).toArray().map((r) => ({ ...r }))
  const schemas = (await rows(`SELECT schema_name AS s FROM duckdb_schemas() WHERE database_name = ${d} AND NOT internal`)).map((r) => String(r.s))
  const fks = await foreignKeys(db)
  const objects = (await rows(`
    SELECT schema_name AS schema, table_name AS name, 'table' AS kind FROM duckdb_tables() WHERE database_name = ${d} AND NOT internal
    UNION ALL SELECT schema_name, view_name, 'view' FROM duckdb_views() WHERE database_name = ${d} AND NOT internal
    UNION ALL SELECT schema_name, sequence_name, 'sequence' FROM duckdb_sequences() WHERE database_name = ${d}
    UNION ALL SELECT DISTINCT schema_name, function_name, replace(function_type, '_', ' ') FROM duckdb_functions() WHERE database_name = ${d} AND NOT internal AND function_type IN ('macro', 'table_macro')
    UNION ALL SELECT schema_name, type_name, 'type' FROM duckdb_types() WHERE database_name = ${d} AND NOT internal`)) as unknown as DbObjects['objects']
  return { schemas, objects, fks }
}

/**
 * Replaces everything in this database with what is in the file: all or nothing, in one
 * transaction, so a file that is not a DuckDB database (or one from a newer DuckDB) leaves the
 * tables as they were. Returns the number of tables restored.
 */
export async function restoreDatabase(file: File): Promise<number> {
  const db = await currentDatabase()
  const name = `restore_${Date.now()}.duckdb`
  const alias = `restore_${Date.now()}`
  await registerBuffer(name, new Uint8Array(await file.arrayBuffer()))
  try {
    // DuckDB's message names the copy registered here; the user knows the file by its own name.
    await query(`ATTACH ${quoteString(name)} AS ${quoteIdent(alias)} (READ_ONLY)`).catch((e) => {
      throw new Error(String(e instanceof Error ? e.message : e).replaceAll(name, file.name).replace(/!\s*$/, ''))
    })
    try {
      const tables = Number((await query(`SELECT count(*) AS n FROM duckdb_tables() WHERE database_name = ${quoteString(alias)}`)).toArray()[0].n)
      await query('BEGIN TRANSACTION')
      try {
        for (const sql of wipeStatements(await objectsIn(db))) await query(sql)
        await copyDatabase(alias, db)
        await query('COMMIT')
      } catch (e) {
        await query('ROLLBACK').catch(() => {})
        throw e
      }
      return tables
    } finally {
      await query(`DETACH ${quoteIdent(alias)}`).catch(() => {})
    }
  } finally {
    await dropFile(name).catch(() => {})
    await checkpoint()
  }
}
