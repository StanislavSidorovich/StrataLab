// Adds a file's rows to an existing table (stage 2b). The file is copied into a temp table,
// every row is checked against the table's types and keys (src/core/fill.ts), and only then
// inserted, in one transaction.
import { checkpoint, query } from './engine'
import { fileRowExpr, readExpr, type ImportSource } from './importer'
import { fillSql, type FillTarget, type Mapping, type ProblemKind, type SourceColumn, type TargetConstraint } from '../core/fill'
import { quoteIdent, quoteString } from '../core/sql'

const STAGED = '__stratalab_fill_src'
const VIEW = '__stratalab_fill'
const PROBLEMS = '__stratalab_fill_problems'

export interface FillProblem {
  row: number
  kind: ProblemKind
  col: string
  message: string
}

export interface FillReport {
  total: number
  /** rows with at least one problem */
  badRows: number
  counts: { kind: ProblemKind; rows: number }[]
  /** the first problems, by row */
  problems: FillProblem[]
}

export const SHOWN_PROBLEMS = 500

const list = (v: unknown): string[] => (v == null ? [] : Array.from(v as Iterable<string>))

/** Columns and constraints of a table in the main schema. */
export async function loadTarget(table: string): Promise<FillTarget> {
  const t = quoteString(table)
  const where = `schema_name = 'main' AND database_name = current_database() AND table_name = ${t}`
  const [cols, cons] = await Promise.all([
    query(`SELECT column_name, data_type, is_nullable, column_default IS NOT NULL AS has_default FROM duckdb_columns() WHERE ${where} ORDER BY column_index`),
    query(`SELECT constraint_type, expression, constraint_column_names, referenced_table, referenced_column_names FROM duckdb_constraints() WHERE ${where}`),
  ])
  const constraints: TargetConstraint[] = []
  const seen = new Set<string>()
  for (const c of cons.toArray()) {
    const columns = list(c.constraint_column_names)
    let k: TargetConstraint | null = null
    if (c.constraint_type === 'PRIMARY KEY') k = { kind: 'primary', columns }
    else if (c.constraint_type === 'UNIQUE') k = { kind: 'unique', columns }
    else if (c.constraint_type === 'CHECK' && c.expression) k = { kind: 'check', expression: String(c.expression) }
    else if (c.constraint_type === 'FOREIGN KEY' && c.referenced_table) k = { kind: 'foreign', columns, refTable: String(c.referenced_table), refColumns: list(c.referenced_column_names) }
    if (!k) continue
    const key = JSON.stringify(k)
    if (!seen.has(key)) constraints.push(k), seen.add(key)
  }
  return {
    table,
    columns: cols.toArray().map((c) => ({ name: c.column_name, type: c.data_type, nullable: !!c.is_nullable, hasDefault: !!c.has_default })),
    constraints,
  }
}

/** The file's columns with the types DuckDB reads them as. */
export async function sourceColumns(src: ImportSource): Promise<SourceColumn[]> {
  const t = await query(`DESCRIBE SELECT * FROM ${readExpr(src)}`)
  return t.toArray().map((r) => ({ name: r.column_name, type: r.column_type }))
}

let prepared: { target: string; inserts: (skip: string | null) => string } | null = null
// Checks share the temp tables, so one runs at a time (the dialog re-checks on every change).
let queue: Promise<unknown> = Promise.resolve()

/** Copies the file into a temp table and checks every row; nothing is written to the target. */
export function checkFill(src: ImportSource, target: FillTarget, mapping: Mapping): Promise<FillReport> {
  const run = queue.then(() => runCheck(src, target, mapping))
  queue = run.catch(() => {})
  return run
}

async function runCheck(src: ImportSource, target: FillTarget, mapping: Mapping): Promise<FillReport> {
  await query(`CREATE OR REPLACE TEMP TABLE ${STAGED} AS SELECT * FROM ${readExpr(src)}`)
  const source = await sourceColumns(src)
  const sql = fillSql(target, mapping, source, STAGED, VIEW, fileRowExpr(src), src.kind === 'csv' && !!src.csv?.decimalComma)
  await query(sql.view)
  await query(`CREATE OR REPLACE TEMP TABLE ${PROBLEMS} AS ${sql.problems}`)
  prepared = { target: target.table, inserts: sql.insert }
  const [total, bad, counts, first] = await Promise.all([
    query(`SELECT count(*)::INTEGER AS n FROM ${STAGED}`),
    query(`SELECT count(DISTINCT __row)::INTEGER AS n FROM ${PROBLEMS}`),
    query(`SELECT kind, count(DISTINCT __row)::INTEGER AS n FROM ${PROBLEMS} GROUP BY kind ORDER BY n DESC`),
    query(`SELECT __row::BIGINT AS r, kind, col, message FROM ${PROBLEMS} ORDER BY __row, kind LIMIT ${SHOWN_PROBLEMS}`),
  ])
  return {
    total: Number(total.get(0)?.n ?? 0),
    badRows: Number(bad.get(0)?.n ?? 0),
    counts: counts.toArray().map((r) => ({ kind: r.kind, rows: Number(r.n) })),
    problems: first.toArray().map((r) => ({ row: Number(r.r), kind: r.kind, col: r.col, message: r.message })),
  }
}

/** Inserts the checked rows (leaving out the ones with problems when `skipBad`); returns how many. */
export async function insertFill(skipBad: boolean): Promise<number> {
  if (!prepared) throw new Error('Check the rows first')
  const before = await countRows(prepared.target)
  await query('BEGIN TRANSACTION')
  try {
    await query(prepared.inserts(skipBad ? PROBLEMS : null))
    await query('COMMIT')
  } catch (e) {
    await query('ROLLBACK').catch(() => {})
    throw e
  }
  await checkpoint()
  return (await countRows(prepared.target)) - before
}

async function countRows(table: string): Promise<number> {
  const t = await query(`SELECT count(*)::BIGINT AS n FROM ${quoteIdent(table)}`)
  return Number(t.get(0)?.n ?? 0)
}

export async function clearFill(): Promise<void> {
  prepared = null
  for (const sql of [`DROP VIEW IF EXISTS ${VIEW}`, `DROP TABLE IF EXISTS ${PROBLEMS}`, `DROP TABLE IF EXISTS ${STAGED}`]) await query(sql).catch(() => {})
}
