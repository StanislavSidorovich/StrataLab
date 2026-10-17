// The user's own datasets (src/core/ownDatasets.ts): schemas made in the tree, tables moved
// between them, a dataset renamed. Not one transaction (see the dataset loader): statement by
// statement, and a move that fails drops the copies it made, so the original tables stay as they were.
import { checkpoint, query } from './engine'
import { schemaForModel } from './modelExport'
import { planMove, tableRef, viewInSchema, mentionsSchema, type MoveTable } from '../core/ownDatasets'
import { quoteIdent, quoteString } from '../core/sql'

/** Every schema of the database but main and DuckDB's own, empty ones too. */
export async function listSchemas(): Promise<string[]> {
  const t = await query(
    `SELECT schema_name FROM duckdb_schemas() WHERE database_name = current_database() AND NOT internal AND schema_name NOT IN ('main', 'information_schema', 'pg_catalog') ORDER BY schema_name`,
  )
  return t.toArray().map((r) => String(r.schema_name))
}

export async function createSchema(name: string): Promise<void> {
  await query(`CREATE SCHEMA ${quoteIdent(name)}`)
  await checkpoint()
}

/** A schema's tables with what a move needs: keys, CHECKs, defaults and indexes. */
async function readTables(schema: string): Promise<MoveTable[]> {
  const s = quoteString(schema)
  const where = `database_name = current_database() AND schema_name = ${s}`
  const [tables, defaults, indexes] = await Promise.all([
    schemaForModel(schema),
    query(`SELECT table_name, column_name, column_default FROM duckdb_columns() WHERE ${where} AND column_default IS NOT NULL`),
    query(`SELECT table_name, sql FROM duckdb_indexes() WHERE ${where} AND sql IS NOT NULL`),
  ])
  const out: MoveTable[] = tables.map((t) => ({ ...t, defaults: {}, indexes: [] }))
  const byName = new Map(out.map((t) => [t.name, t]))
  for (const d of defaults.toArray()) {
    const t = byName.get(d.table_name)
    if (t) t.defaults![d.column_name] = String(d.column_default)
  }
  for (const i of indexes.toArray()) byName.get(i.table_name)?.indexes!.push(String(i.sql))
  return out
}

export interface MoveOutcome {
  tables: string[]
  rows: number
  notes: string[]
}

/** Moves the tables (already including the ones linked to them) from one schema to another. */
export async function moveTables(from: string, names: string[], to: string): Promise<MoveOutcome> {
  const [all, target] = await Promise.all([readTables(from), readTables(to)])
  const plan = planMove(all, names, from, to, target.map((t) => t.name))
  if ('problem' in plan) throw new Error(plan.problem)
  const created: string[] = []
  let rows = 0
  try {
    for (const [i, sql] of plan.create.entries()) {
      await query(sql)
      created.push(plan.tables[i])
    }
    for (const c of plan.copy) {
      for (let round = 0; ; round++) {
        const r = await query(c.sql)
        const n = Number(r.get(0)?.Count ?? 0)
        rows += n
        if (!c.rounds || !n || round > 1_000_000) break
      }
      const [a, b] = await Promise.all([count(from, c.table), count(to, c.table)])
      if (a !== b) throw new Error(`${c.table}: ${b.toLocaleString()} of ${a.toLocaleString()} rows could be copied (a row refers to a row that is not there)`)
    }
  } catch (e) {
    for (const t of [...created].reverse()) await query(`DROP TABLE IF EXISTS ${tableRef(to, t)}`).catch(() => {})
    await checkpoint().catch(() => {})
    throw e
  }
  for (const sql of plan.drop) await query(sql)
  const notes: string[] = []
  for (const sql of plan.indexes) await query(sql).catch(() => notes.push(`index not made again: ${sql}`))
  if (plan.lostIndexes.length) notes.push(`indexes of ${[...new Set(plan.lostIndexes)].join(', ')} were not made again`)
  await checkpoint()
  return { tables: plan.tables, rows, notes }
}

async function count(schema: string, table: string): Promise<number> {
  const t = await query(`SELECT count(*)::BIGINT AS n FROM ${tableRef(schema, table)}`)
  return Number(t.get(0)?.n ?? 0)
}

/**
 * Renames a schema: a new one, every table moved into it, its views made again there, views
 * elsewhere that name the old schema rewritten. The old schema is dropped once it is empty;
 * when something else is left in it (a sequence, a macro) it stays, and a note says so.
 */
export async function renameSchema(from: string, to: string): Promise<MoveOutcome> {
  await query(`CREATE SCHEMA ${quoteIdent(to)}`)
  const tables = (await readTables(from)).map((t) => t.name)
  let moved: MoveOutcome = { tables: [], rows: 0, notes: [] }
  try {
    if (tables.length) moved = await moveTables(from, tables, to)
  } catch (e) {
    await query(`DROP SCHEMA IF EXISTS ${quoteIdent(to)}`).catch(() => {})
    throw e
  }
  const notes = [...moved.notes]
  const views = await query(`SELECT schema_name, view_name, sql FROM duckdb_views() WHERE database_name = current_database() AND NOT internal`)
  for (const v of views.toArray()) {
    const own = String(v.schema_name) === from
    const sql = String(v.sql)
    if (!own && !mentionsSchema(sql, from)) continue
    const again = viewInSchema(sql, from, to).replace(/^\s*CREATE\s+VIEW/i, 'CREATE OR REPLACE VIEW')
    try {
      await query(again)
      if (own) await query(`DROP VIEW ${tableRef(from, String(v.view_name))}`)
    } catch (e) {
      notes.push(`view ${v.schema_name}.${v.view_name} was not changed: ${String(e instanceof Error ? e.message : e).split('\n')[0]}`)
    }
  }
  try {
    await query(`DROP SCHEMA ${quoteIdent(from)}`)
  } catch {
    notes.push(`the schema ${from} was kept: something besides tables is still in it (a sequence, a macro or a view)`)
  }
  await checkpoint()
  return { ...moved, notes }
}
