// The user's own datasets: schemas they make themselves (sales.orders, hr.staff) and fill one
// table at a time, next to the catalog's. DuckDB 1.5 can neither move a table to another schema
// (ALTER TABLE … SET SCHEMA) nor rename a schema, so both are done by copying: the tables are
// created again in the new schema with their keys, the rows copied parents first, and the old
// tables dropped children first. Foreign keys can't cross schemas in DuckDB, so tables linked by
// keys move together. Pure: the db layer reads the catalog and runs these strings.
import type { ModelTable } from './modelLink'
import { parentsFirst } from './generate'
import { quoteIdent, tableNameFrom } from './sql'

/** Schemas that are never a dataset. */
const SYSTEM_SCHEMAS = new Set(['main', 'information_schema', 'pg_catalog', 'temp', 'system'])

/** A schema (other than main) is the user's own unless it is a catalog dataset's. */
export function isOwnSchema(schema: string, catalogIds: string[]): boolean {
  return schema === 'main' || !catalogIds.some((id) => id.toLowerCase() === schema.toLowerCase())
}

/**
 * The name a new dataset gets from what was typed ("Продажи 2024" → prodazhi_2024), or why it
 * can't have it. Catalog ids are kept for the catalog, so loading Chinook never replaces a
 * dataset of the user's.
 */
export function datasetName(raw: string, existing: string[], catalogIds: string[]): { name: string } | { problem: string } {
  if (!raw.trim()) return { problem: 'Type a name for the dataset.' }
  const name = tableNameFrom(raw)
  const same = (s: string) => s.toLowerCase() === name.toLowerCase()
  if (SYSTEM_SCHEMAS.has(name)) return { problem: `“${name}” is a name DuckDB keeps for itself: choose another.` }
  if (catalogIds.some(same)) return { problem: `“${name}” is the name of a sample dataset: choose another, so loading that one never replaces yours.` }
  if (existing.some(same)) return { problem: `There is already a dataset called ${name}.` }
  return { name }
}

/**
 * Whether a catalog dataset is in its schema: `absent`, `loaded` (all its tables are there), or
 * `foreign`: the schema holds tables that are not the dataset's (the user made a schema of that
 * name), which loading the dataset would drop. `extra` names them.
 */
export function catalogSchemaState(datasetTables: string[], schemaTables: string[] | null): { state: 'absent' | 'loaded' | 'foreign'; extra: string[] } {
  if (schemaTables === null) return { state: 'absent', extra: [] }
  const mine = new Set(datasetTables.map((t) => t.toLowerCase()))
  const extra = schemaTables.filter((t) => !mine.has(t.toLowerCase()))
  if (extra.length) return { state: 'foreign', extra }
  const there = new Set(schemaTables.map((t) => t.toLowerCase()))
  return { state: datasetTables.every((t) => there.has(t.toLowerCase())) ? 'loaded' : 'absent', extra: [] }
}

/** A table to move: its model (columns, keys, CHECKs), column defaults and its indexes' SQL. */
export interface MoveTable extends ModelTable {
  /** column → DuckDB's text of its default: `'x'`, `nextval('sales.seq')` */
  defaults?: Record<string, string>
  /** DuckDB's own CREATE INDEX statements */
  indexes?: string[]
}

/** `start` and every table linked to it by foreign keys, either way, all the way: they move together. */
export function linkedTables(tables: ModelTable[], start: string): string[] {
  const key = (s: string) => s.toLowerCase()
  const links = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!links.has(key(a))) links.set(key(a), new Set())
    links.get(key(a))!.add(key(b))
  }
  for (const t of tables)
    for (const fk of t.foreignKeys) {
      link(t.name, fk.refTable)
      link(fk.refTable, t.name)
    }
  const seen = new Set([key(start)])
  const todo = [key(start)]
  while (todo.length) for (const n of links.get(todo.pop()!) ?? []) if (!seen.has(n)) seen.add(n), todo.push(n)
  return tables.filter((t) => seen.has(key(t.name))).map((t) => t.name)
}

export const tableRef = (schema: string, name: string) => `${quoteIdent(schema)}.${quoteIdent(name)}`

/** CREATE TABLE in `to` with the table's columns, defaults, NOT NULLs and keys; its foreign keys point into `to`. */
export function createInSchema(t: MoveTable, to: string): string {
  const cols = t.columns.map((c) => {
    const d = t.defaults?.[c.name]
    return `${quoteIdent(c.name)} ${c.type}${d != null ? ` DEFAULT (${d})` : ''}${c.notNull ? ' NOT NULL' : ''}`
  })
  const list = (cs: string[]) => cs.map(quoteIdent).join(', ')
  const keys = [
    ...(t.primaryKey.length ? [`PRIMARY KEY (${list(t.primaryKey)})`] : []),
    ...t.uniques.map((u) => `UNIQUE (${list(u)})`),
    ...t.checks.map((c) => `CHECK (${c})`),
    ...t.foreignKeys.map((fk) => `FOREIGN KEY (${list(fk.columns)}) REFERENCES ${tableRef(to, fk.refTable)} (${list(fk.refColumns)})`),
  ]
  return `CREATE TABLE ${tableRef(to, t.name)} (${[...cols, ...keys].join(', ')})`
}

/**
 * The INSERT that copies a table's rows. A table that refers to itself (an employee's boss) is
 * copied in rounds, as datasets load: each round adds the rows whose parent is empty or already
 * copied, so `rounds` says to repeat it until it adds nothing.
 */
export function copyRowsSql(t: MoveTable, from: string, to: string): { sql: string; rounds: boolean } {
  const src = tableRef(from, t.name)
  const dst = tableRef(to, t.name)
  const self = t.foreignKeys.find((fk) => fk.refTable.toLowerCase() === t.name.toLowerCase())
  if (!self) return { sql: `INSERT INTO ${dst} BY NAME SELECT * FROM ${src}`, rounds: false }
  const key = t.primaryKey.length ? t.primaryKey : self.refColumns
  const has = key.map((k) => `x.${quoteIdent(k)} = s.${quoteIdent(k)}`).join(' AND ')
  const parent = self.columns.map((c, i) => `x.${quoteIdent(self.refColumns[i])} = s.${quoteIdent(c)}`).join(' AND ')
  const empty = self.columns.map((c) => `s.${quoteIdent(c)} IS NULL`).join(' OR ')
  return {
    sql: `INSERT INTO ${dst} BY NAME SELECT s.* FROM ${src} s WHERE NOT EXISTS (SELECT 1 FROM ${dst} x WHERE ${has}) AND (${empty} OR EXISTS (SELECT 1 FROM ${dst} x WHERE ${parent}))`,
    rounds: true,
  }
}

/** DuckDB's `CREATE [UNIQUE] INDEX name ON schema.table(cols)` pointed at the table in `to`. */
export function indexInSchema(sql: string, table: string, to: string): string | null {
  const part = String.raw`(?:"(?:[^"]|"")+"|[^\s(".]+)`
  const m = new RegExp(String.raw`^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(${part})\s+ON\s+(?:${part}\s*\.\s*)*${part}\s*(\([\s\S]*\))\s*;?\s*$`, 'i').exec(sql)
  if (!m) return null
  return `CREATE ${m[1] ? 'UNIQUE ' : ''}INDEX ${m[2]} ON ${tableRef(to, table)}${m[3]}`
}

export interface MovePlan {
  /** the tables, parents first */
  tables: string[]
  create: string[]
  copy: { table: string; sql: string; rounds: boolean }[]
  /** children first */
  drop: string[]
  indexes: string[]
  /** indexes that could not be read, by table: they are not made again */
  lostIndexes: string[]
}

/**
 * Moves `names` from schema `from` to `to`. Refused (with why) when a table of that name is
 * already in `to`, or when a moved table is linked by a foreign key to one that stays.
 */
export function planMove(all: MoveTable[], names: string[], from: string, to: string, inTarget: string[]): MovePlan | { problem: string } {
  const key = (s: string) => s.toLowerCase()
  if (key(from) === key(to)) return { problem: 'The tables are already there.' }
  const moving = new Set(names.map(key))
  const chosen = all.filter((t) => moving.has(key(t.name)))
  if (!chosen.length) return { problem: 'No such table.' }
  const taken = new Set(inTarget.map(key))
  const clash = chosen.filter((t) => taken.has(key(t.name))).map((t) => t.name)
  if (clash.length) return { problem: `${to === 'main' ? 'My tables' : to} already has ${clash.length === 1 ? 'a table' : 'tables'} called ${clash.join(', ')}: rename ${clash.length === 1 ? 'it' : 'them'} first.` }
  for (const t of all) {
    for (const fk of t.foreignKeys) {
      if (moving.has(key(t.name)) !== moving.has(key(fk.refTable)))
        return { problem: `${t.name} refers to ${fk.refTable} by a foreign key, so they can only move together (DuckDB keeps keys inside one schema).` }
    }
  }
  const order = parentsFirst(chosen.map((t) => ({ ...t, rows: 0 })))
  const indexes: string[] = []
  const lostIndexes: string[] = []
  for (const t of order)
    for (const ix of t.indexes ?? []) {
      const sql = indexInSchema(ix, t.name, to)
      if (sql) indexes.push(sql)
      else lostIndexes.push(t.name)
    }
  return {
    tables: order.map((t) => t.name),
    create: order.map((t) => createInSchema(t, to)),
    copy: order.map((t) => ({ table: t.name, ...copyRowsSql(t, from, to) })),
    drop: [...order].reverse().map((t) => `DROP TABLE ${tableRef(from, t.name)}`),
    indexes,
    lostIndexes,
  }
}

/** A schema name as it can appear before a dot in SQL: sales or "Sales" (quoted, any case). */
function schemaPrefix(schema: string): RegExp {
  const q = schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w."])(?:${q}|"${q.replace(/"/g, '""')}")(\\s*\\.)`, 'gi')
}

/** A view's SQL with every `from.` qualifier made `to.` (the view's own name included). */
export function viewInSchema(sql: string, from: string, to: string): string {
  return sql.replace(schemaPrefix(from), (_, before: string, dot: string) => `${before}${quoteIdent(to)}${dot}`)
}

/** Whether SQL names the schema as a qualifier (`sales.orders`). */
export function mentionsSchema(sql: string, schema: string): boolean {
  return schemaPrefix(schema).test(sql)
}
