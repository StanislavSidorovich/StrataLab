// PostgreSQL mode (stage 4): a real PostgreSQL (PGlite, PostgreSQL compiled to WebAssembly) next to
// DuckDB. It is a separate database, kept in this browser (IndexedDB); tables get there by
// “Copy to PostgreSQL” (src/core/pgCopy.ts) or by the user's own CREATE TABLE. Loaded only when a
// tab is switched to PostgreSQL or something is copied: ~10 MB that DuckDB users never download.
import type { PGlite } from '@electric-sql/pglite'
import type { Table } from 'apache-arrow'
import { pgToArrow } from './pgResult'
import { planPgCopy, type PgCopyPlan } from '../core/pgCopy'
import { quoteString } from '../core/sql'
import { query as duck, dropFile, readFile } from '../db/engine'
import { schemaForModel } from '../db/modelExport'
import type { TableInfo } from '../db/catalog'

const DATA_DIR = 'idb://quaera-lab-postgres'

export interface PgEngine {
  pg: PGlite
  version: string
  persistent: boolean
}

let pgPromise: Promise<PgEngine> | null = null

export function getPostgres(): Promise<PgEngine> {
  pgPromise ??= start().catch((e) => {
    pgPromise = null
    throw e
  })
  return pgPromise
}

async function start(): Promise<PgEngine> {
  const { PGlite } = await import('@electric-sql/pglite')
  let pg: PGlite
  let persistent = true
  try {
    pg = await PGlite.create(DATA_DIR)
  } catch (e) {
    // No IndexedDB (private window, blocked storage): this tab only.
    console.warn('PostgreSQL in memory:', e)
    pg = await PGlite.create()
    persistent = false
  }
  const v = await pg.query<{ v: string }>("SELECT current_setting('server_version') AS v")
  return { pg, version: v.rows[0].v, persistent }
}

/** Runs a script; like DuckDB's side, the last statement that returns rows is the result. */
export async function runPostgres(sql: string): Promise<Table> {
  const { pg } = await getPostgres()
  const results = await pg.exec(sql, { rowMode: 'array', parsers: { 20: (v: string) => BigInt(v) } })
  const last = [...results].reverse().find((r) => r.fields.length) ?? results[results.length - 1]
  return pgToArrow(last?.fields ?? [], (last?.rows ?? []) as unknown[][])
}

/** EXPLAIN (…, FORMAT JSON) of one statement: PostgreSQL's plan as parsed JSON. */
export async function explainPostgres(explain: string): Promise<unknown> {
  const { pg } = await getPostgres()
  const r = await pg.query<Record<string, unknown>>(explain)
  return Object.values(r.rows[0] ?? {})[0]
}

const SYSTEM = "('pg_catalog', 'information_schema', 'pg_toast')"

/** Tables and views of every schema but the system ones, for the object tree and completion. */
export async function postgresCatalog(): Promise<TableInfo[]> {
  const { pg } = await getPostgres()
  const objs = await pg.query<{ schema: string; name: string; kind: string }>(
    `SELECT table_schema AS schema, table_name AS name, table_type AS kind FROM information_schema.tables
     WHERE table_schema NOT IN ${SYSTEM} AND table_schema NOT LIKE 'pg_temp%' ORDER BY table_schema <> 'public', table_schema, table_name`,
  )
  const cols = await pg.query<{ schema: string; table: string; name: string; type: string; nullable: string }>(
    `SELECT table_schema AS schema, table_name AS "table", column_name AS name, data_type AS type, is_nullable AS nullable
     FROM information_schema.columns WHERE table_schema NOT IN ${SYSTEM} ORDER BY table_schema, table_name, ordinal_position`,
  )
  const tables: TableInfo[] = objs.rows.map((o) => ({
    schema: o.schema,
    name: o.name,
    kind: o.kind === 'VIEW' ? 'view' : 'table',
    rows: null,
    columns: cols.rows.filter((c) => c.schema === o.schema && c.table === o.name).map((c) => ({ name: c.name, type: c.type, nullable: c.nullable === 'YES' })),
  }))
  // Exact counts: these are learners' tables, small enough to count.
  for (const t of tables) {
    if (t.kind !== 'table') continue
    const r = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${q(t.schema)}.${q(t.name)}`).catch(() => null)
    t.rows = r?.rows[0]?.n ?? null
  }
  return tables
}

const q = (name: string) => '"' + name.replace(/"/g, '""') + '"'

export interface PgCopyOutcome {
  schema: string
  copied: { name: string; rows: number }[]
  notes: string[]
}

/**
 * Copies tables of one DuckDB schema (all, or the ones named) into PostgreSQL, replacing tables
 * with the same names there. Each table is created, filled from a CSV that DuckDB writes, and
 * only then are the foreign keys added.
 */
export async function copyToPostgres(duckSchema: string, only?: string[], onStep?: (table: string) => void): Promise<PgCopyOutcome> {
  const { pg } = await getPostgres()
  let tables = await schemaForModel(duckSchema)
  if (only) tables = tables.filter((t) => only.includes(t.name))
  const plan: PgCopyPlan = planPgCopy(duckSchema, tables)
  const notes = [...plan.notes]
  const copied: PgCopyOutcome['copied'] = []
  if (plan.schema !== 'public') await pg.exec(`CREATE SCHEMA IF NOT EXISTS ${q(plan.schema)}`)
  for (const t of plan.tables) {
    onStep?.(t.name)
    await pg.exec(t.create[0])
    try {
      await pg.exec(t.create[1])
    } catch (e) {
      await pg.exec(t.createPlain)
      notes.push(`${t.name}: its CHECKs were left out (PostgreSQL: ${message(e)}).`)
    }
    const file = `pg_copy_${Date.now()}.csv`
    try {
      await duck(`COPY (${t.select}) TO ${quoteString(file)} (FORMAT csv, HEADER false)`)
      const bytes = await readFile(file)
      const r = await pg.query(t.copy, [], { blob: new Blob([bytes as BlobPart]) })
      copied.push({ name: t.name, rows: r.affectedRows ?? 0 })
    } catch (e) {
      notes.push(`${t.name}: created, but its rows could not be copied (${message(e)}).`)
      copied.push({ name: t.name, rows: 0 })
    } finally {
      await dropFile(file).catch(() => {})
    }
  }
  for (const fk of plan.foreignKeys) {
    try {
      await pg.exec(fk.sql)
    } catch (e) {
      notes.push(`Foreign key ${fk.label} left out: ${message(e)}`)
    }
  }
  return { schema: plan.schema, copied, notes }
}

const message = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
