// The schema slide of a lesson plan (plan item `s`) and the phone's "Tables" list: which tables a set of queries uses, what a row is,
// the key, and the links between tables. Pure; the table metadata is the "The data" block of the SQL practice page.
import type { PracticeTables } from '../data/practiceBook'
import { tablesNamed } from './lesson'

type Table = PracticeTables['tables'][number]

export interface SchemaLink {
  /** the column that holds the other table's key */
  from: string
  /** the table it points to */
  to: string
  /** the key column there */
  toColumn: string
}

export interface SchemaTable extends Table {
  /** the key: the first column, as everywhere in Lab's lesson mode */
  key: string
  links: SchemaLink[]
}

/** "dim_customer.region_id → dim_region.region_id" as written in the data block's `keys`, or null when it is not that shape. */
export function parseKeyLine(line: string): { table: string; from: string; to: string; toColumn: string } | null {
  const m = /^\s*([a-z_]\w*)\.([a-z_]\w*)\s*(?:→|->)\s*([a-z_]\w*)\.([a-z_]\w*)\s*$/i.exec(line)
  return m ? { table: m[1], from: m[2], to: m[3], toColumn: m[4] } : null
}

/**
 * The links of every table. Written ones (`keys`) are taken as they are; for the rest the rule is the one the Kaiyo columns follow:
 * a column `<x>_id` that is not the table's own key points to the table whose key is `<x>_id`. A column that already has a written
 * link is not derived again (dim_rep.manager_id is not a key of any table, so nothing is guessed for it).
 */
export function schemaLinks(tables: readonly Table[], keys: readonly string[] = []): Record<string, SchemaLink[]> {
  const out: Record<string, SchemaLink[]> = {}
  for (const t of tables) out[t.name] = []
  const written = new Set<string>()
  for (const line of keys) {
    const k = parseKeyLine(line)
    if (!k || !out[k.table]) continue
    out[k.table].push({ from: k.from, to: k.to, toColumn: k.toColumn })
    written.add(`${k.table}.${k.from}`)
  }
  const owner = new Map<string, string>() // key column → table that has it as its key
  for (const t of tables) if (t.columns[0] && !owner.has(t.columns[0])) owner.set(t.columns[0], t.name)
  for (const t of tables) {
    for (const c of t.columns) {
      if (c === t.columns[0] || !/_id$/.test(c) || written.has(`${t.name}.${c}`)) continue
      const to = owner.get(c)
      if (to && to !== t.name) out[t.name].push({ from: c, to, toColumn: c })
    }
  }
  return out
}

/** "dim_customer.region_id → dim_region" */
export const linkText = (table: string, l: SchemaLink): string => `${table}.${l.from} → ${l.to}${l.toColumn === l.from ? '' : `.${l.toColumn}`}`

/** The tables the queries name after FROM or JOIN, each once, in the order they first appear in the data block (facts, then dimensions). */
export function tablesOfQueries(sqls: readonly string[], all: readonly Table[]): string[] {
  const known = all.map((t) => t.name)
  const used = new Set<string>()
  for (const sql of sqls) for (const n of tablesNamed(sql, known)) used.add(n)
  return known.filter((n) => used.has(n))
}

/** The tables to show, with their keys and links; links to tables that are not shown are kept (a join may leave one out), marked by `shown`. */
export function schemaOf(names: readonly string[], all: readonly Table[], keys: readonly string[] = []): SchemaTable[] {
  const links = schemaLinks(all, keys)
  return names
    .map((n) => all.find((t) => t.name === n))
    .filter((t): t is Table => !!t)
    .map((t) => ({ ...t, key: t.columns[0], links: links[t.name] ?? [] }))
}

/** Links between the shown tables only: what the slide draws as the picture of how they join. */
export const linksAmong = (tables: readonly SchemaTable[]): string[] => {
  const shown = new Set(tables.map((t) => t.name))
  return tables.flatMap((t) => t.links.filter((l) => shown.has(l.to)).map((l) => linkText(t.name, l)))
}
