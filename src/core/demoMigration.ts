// The demo shop moved from main (no prefix) to its own schema `demo` in v0.13. A database saved
// before that still has the four tables in main; this decides, from the catalog alone, whether
// they are the old shop and should move once. Pure: src/db/demo.ts reads the catalog and moves.
import { DEMO_COLUMNS, DEMO_SCHEMA, DEMO_TABLES } from '../data/demo'

export interface CatalogTable {
  schema: string
  name: string
  kind: 'table' | 'view'
  columns: string[]
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase())

/**
 * The tables to move from main to demo: all four of the old shop, as tables, with exactly the
 * shop's columns (a user's own `orders` or `customers` with other columns stays where it is, and
 * so does a set that lacks one of the four), and only when `demo` does not hold any of them yet.
 * Empty when there is nothing to do.
 */
export function demoToMigrate(tables: CatalogTable[]): string[] {
  if (tables.some((t) => t.schema === DEMO_SCHEMA && DEMO_TABLES.includes(t.name))) return []
  const mine = DEMO_TABLES.map((n) => tables.find((t) => t.schema === 'main' && t.kind === 'table' && t.name === n))
  if (!mine.every((t) => t && same(t.columns, DEMO_COLUMNS[t.name]))) return []
  return [...DEMO_TABLES]
}
