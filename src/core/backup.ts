// The whole-database backup (a .duckdb file) and its restore.
import { quoteIdent } from './sql'

/** "quaera-lab-2026-10-17.duckdb", by the local date. */
export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `quaera-lab-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.duckdb`
}

/** Files Restore accepts: DuckDB database files under the names DuckDB's own tools give them. */
export function isDatabaseFile(fileName: string): boolean {
  return /\.(duckdb|ddb|db)$/i.test(fileName)
}

/** What is in a database before a restore replaces it. */
export interface DbObjects {
  schemas: string[]
  objects: { schema: string; name: string; kind: 'table' | 'view' | 'sequence' | 'macro' | 'table macro' | 'type' }[]
  /** foreign keys: `table` refers to `refTable`, in the same schema */
  fks: { schema: string; table: string; refTable: string }[]
}

/**
 * The statements that empty the database before a restore: views first (they may read tables),
 * then tables, children before their parents (DuckDB's CASCADE does not follow foreign keys),
 * then the rest of main, then every other schema with what is left in it.
 */
export function wipeStatements({ schemas, objects, fks }: DbObjects): string[] {
  const q = (o: { schema: string; name: string }) => `${quoteIdent(o.schema)}.${quoteIdent(o.name)}`
  const out = objects.filter((o) => o.kind === 'view').map((o) => `DROP VIEW IF EXISTS ${q(o)} CASCADE`)
  const tables = objects.filter((o) => o.kind === 'table')
  for (const t of fillOrder(tables, fks).reverse()) out.push(`DROP TABLE IF EXISTS ${q(t)} CASCADE`)
  const keyword = { sequence: 'SEQUENCE', macro: 'MACRO', 'table macro': 'MACRO TABLE', type: 'TYPE' } as const
  for (const kind of ['sequence', 'macro', 'table macro', 'type'] as const)
    for (const o of objects.filter((x) => x.schema === 'main' && x.kind === kind)) out.push(`DROP ${keyword[kind]} IF EXISTS ${q(o)} CASCADE`)
  for (const s of schemas.filter((s) => s !== 'main')) out.push(`DROP SCHEMA IF EXISTS ${quoteIdent(s)} CASCADE`)
  return out
}

export interface TableRef {
  schema: string
  name: string
}

/**
 * The order to fill tables in so that every foreign key finds its parent row: parents first
 * (`fks`: table → the table it refers to, in the same schema). A circle of keys, or a table
 * referring to itself, keeps the given order for those tables.
 */
export function fillOrder(tables: TableRef[], fks: { schema: string; table: string; refTable: string }[]): TableRef[] {
  const key = (schema: string, name: string) => `${schema}\u0000${name}`
  const parents = new Map<string, Set<string>>()
  for (const fk of fks)
    if (fk.table !== fk.refTable) {
      const k = key(fk.schema, fk.table)
      if (!parents.has(k)) parents.set(k, new Set())
      parents.get(k)!.add(key(fk.schema, fk.refTable))
    }
  const out: TableRef[] = []
  const done = new Set<string>()
  let left = [...tables]
  while (left.length) {
    const ready = left.filter((t) => [...(parents.get(key(t.schema, t.name)) ?? [])].every((p) => done.has(p) || !tables.some((x) => key(x.schema, x.name) === p)))
    const next = ready.length ? ready : left.slice(0, 1)
    for (const t of next) {
      out.push(t)
      done.add(key(t.schema, t.name))
    }
    left = left.filter((t) => !done.has(key(t.schema, t.name)))
  }
  return out
}
