// Copy DuckDB tables into the PostgreSQL database (stage 4): the plan as SQL. Tables first with
// their primary keys, UNIQUEs and CHECKs, then the rows (CSV written by DuckDB, read by COPY), then
// the foreign keys, so the order of the tables and circles of keys don't matter and every row is
// checked once. The user's tables (DuckDB's main) go to public; a dataset keeps its schema name,
// so `chinook."Track"` is the same query in both engines.
import { ordered, postgresType, type ModelTable } from './modelLink'
import { quoteIdent, sqlName } from './sql'

export interface PgCopyTable {
  name: string
  /** DuckDB: what to export, one expression per column */
  select: string
  /** PostgreSQL: DROP + CREATE TABLE (no foreign keys) */
  create: string[]
  /** the same CREATE TABLE without its CHECKs, when PostgreSQL refuses one */
  createPlain: string
  /** PostgreSQL: COPY … FROM '/dev/blob' */
  copy: string
}

export interface PgCopyPlan {
  schema: string
  tables: PgCopyTable[]
  /** ALTER TABLE … ADD FOREIGN KEY, with a label for the note when one fails */
  foreignKeys: { sql: string; label: string }[]
  notes: string[]
}

/** DuckDB's schema → PostgreSQL's. */
export const pgSchema = (duckSchema: string) => (duckSchema === 'main' ? 'public' : duckSchema)

const cols = (names: string[]) => names.map(sqlName).join(', ')

export function planPgCopy(duckSchema: string, tables: ModelTable[]): PgCopyPlan {
  const schema = pgSchema(duckSchema)
  const q = (t: string) => `${sqlName(schema)}.${sqlName(t)}`
  const dq = (t: string) => (duckSchema === 'main' ? sqlName(t) : `${sqlName(duckSchema)}.${sqlName(t)}`)
  const names = new Set(tables.map((t) => t.name))
  const notes: string[] = []
  const foreignKeys: PgCopyPlan['foreignKeys'] = []
  const out: PgCopyTable[] = []

  for (const t of ordered(tables)) {
    const select: string[] = []
    const lines = t.columns.map((c) => {
      let type = postgresType(c.type)
      if (c.type.toUpperCase() === 'BLOB') select.push(`'\\x' || hex(${sqlName(c.name)})`)
      else select.push(sqlName(c.name))
      if (!type) {
        notes.push(`${t.name}.${c.name} is ${c.type} in DuckDB: copied as text.`)
        type = 'text'
      }
      return `  ${sqlName(c.name)} ${type}${c.notNull ? ' NOT NULL' : ''}`
    })
    const keys: string[] = []
    if (t.primaryKey.length) keys.push(`  PRIMARY KEY (${cols(t.primaryKey)})`)
    for (const u of t.uniques) keys.push(`  UNIQUE (${cols(u)})`)
    const checks = t.checks.map((c) => `  CHECK ${c.startsWith('(') ? c : `(${c})`}`)
    const table = (body: string[]) => `CREATE TABLE ${q(t.name)} (\n${body.join(',\n')}\n)`
    out.push({
      name: t.name,
      select: `SELECT ${select.join(', ')} FROM ${dq(t.name)}`,
      create: [`DROP TABLE IF EXISTS ${q(t.name)} CASCADE`, table([...lines, ...keys, ...checks])],
      createPlain: table([...lines, ...keys]),
      copy: `COPY ${q(t.name)} FROM '/dev/blob' WITH (FORMAT csv)`,
    })
    t.foreignKeys.forEach((fk, i) => {
      const label = `${t.name} (${fk.columns.join(', ')}) → ${fk.refTable}`
      if (!names.has(fk.refTable)) {
        notes.push(`Foreign key ${label} left out: ${fk.refTable} is not being copied.`)
        return
      }
      const name = quoteIdent(`${t.name}_fk_${i + 1}`.slice(0, 63))
      foreignKeys.push({
        sql: `ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${name} FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${q(fk.refTable)} (${cols(fk.refColumns)})`,
        label,
      })
    })
  }
  return { schema, tables: out, foreignKeys, notes }
}
