// "Show as model" (stage 2c): the tables of one schema as CREATE TABLE statements for
// model.quaera.app (StrataSQL), which turns them into a conceptual model (its SQL → model, #32).
// They travel in the URL fragment `#sql=<data>&name=<label>`, packed like `#ddl=` (src/core/ddlLink.ts);
// StrataSQL's src/core/shareLink.ts reads them and must stay in step.
import { encodeDdl } from './ddlLink'
import { sqlName } from './sql'

export const MODEL_URL = 'https://model.quaera.app/'
/** StrataSQL's fragment keys. */
export const SQL_PARAM = 'sql'
export const NAME_PARAM = 'name'
/** The window StrataSQL's tab answers to, so a second click lands in the same tab. */
export const MODEL_WINDOW = 'stratasql'

export interface ModelColumn {
  name: string
  /** DuckDB's type name: INTEGER, DECIMAL(10,2), VARCHAR… */
  type: string
  notNull: boolean
}

export interface ModelForeignKey {
  columns: string[]
  refTable: string
  refColumns: string[]
}

export interface ModelTable {
  name: string
  columns: ModelColumn[]
  primaryKey: string[]
  uniques: string[][]
  foreignKeys: ModelForeignKey[]
  /** DuckDB's own text of each CHECK: `(Quantity > 0)` */
  checks: string[]
}

export interface ModelDdl {
  sql: string
  /** what did not travel as it is, in plain words */
  notes: string[]
}

/**
 * DuckDB type → the PostgreSQL name StrataSQL reads (its sql-reader knows the Postgres and SQL
 * Server names). null: a type with no column type in a model (LIST, STRUCT…), sent as text.
 */
export function postgresType(duck: string): string | null {
  const t = duck.toUpperCase().trim()
  const dec = /^DECIMAL\((\d+),\s*(\d+)\)$/.exec(t)
  if (dec) return `numeric(${dec[1]},${dec[2]})`
  if (/^VARCHAR\(\d+\)$/.test(t)) return t.toLowerCase()
  const map: Record<string, string> = {
    INTEGER: 'integer',
    BIGINT: 'bigint',
    SMALLINT: 'smallint',
    TINYINT: 'smallint',
    UTINYINT: 'smallint',
    USMALLINT: 'integer',
    UINTEGER: 'bigint',
    UBIGINT: 'numeric(20,0)',
    HUGEINT: 'numeric(38,0)',
    UHUGEINT: 'numeric(38,0)',
    DOUBLE: 'double precision',
    FLOAT: 'real',
    VARCHAR: 'text',
    BOOLEAN: 'boolean',
    DATE: 'date',
    TIME: 'time',
    TIMESTAMP: 'timestamp',
    TIMESTAMP_S: 'timestamp',
    TIMESTAMP_MS: 'timestamp',
    TIMESTAMP_NS: 'timestamp',
    'TIMESTAMP WITH TIME ZONE': 'timestamptz',
    UUID: 'uuid',
    BLOB: 'bytea',
  }
  return map[t] ?? null
}

/** Referenced tables first; a circle keeps the order it has. */
function ordered(tables: ModelTable[]): ModelTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]))
  const done: ModelTable[] = []
  const seen = new Set<string>()
  const visit = (t: ModelTable, path: Set<string>) => {
    if (seen.has(t.name) || path.has(t.name)) return
    path.add(t.name)
    for (const fk of t.foreignKeys) {
      const ref = byName.get(fk.refTable)
      if (ref && ref !== t) visit(ref, path)
    }
    path.delete(t.name)
    seen.add(t.name)
    done.push(t)
  }
  for (const t of tables) visit(t, new Set())
  return done
}

const cols = (names: string[]) => names.map(sqlName).join(', ')

/** CREATE TABLE statements (PostgreSQL flavour) for StrataSQL's SQL → model. */
export function modelDdl(tables: ModelTable[], label: string): ModelDdl {
  const names = new Set(tables.map((t) => t.name))
  const notes: string[] = []
  const out = [`-- ${label}: ${tables.length} table${tables.length === 1 ? '' : 's'} from StrataLab (lab.quaera.app)`]
  for (const t of ordered(tables)) {
    const lines = t.columns.map((c) => {
      let type = postgresType(c.type)
      if (!type) {
        notes.push(`${t.name}.${c.name} is ${c.type} in DuckDB, sent as text.`)
        type = 'text'
      }
      return `  ${sqlName(c.name)} ${type}${c.notNull ? ' NOT NULL' : ''}`
    })
    if (t.primaryKey.length) lines.push(`  PRIMARY KEY (${cols(t.primaryKey)})`)
    for (const u of t.uniques) lines.push(`  UNIQUE (${cols(u)})`)
    for (const fk of t.foreignKeys) {
      if (!names.has(fk.refTable)) {
        notes.push(`${t.name} (${fk.columns.join(', ')}) refers to ${fk.refTable}, which is not among these tables: left out.`)
        continue
      }
      lines.push(`  FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${sqlName(fk.refTable)} (${cols(fk.refColumns)})`)
    }
    for (const c of t.checks) lines.push(`  CHECK ${c.startsWith('(') ? c : `(${c})`}`)
    out.push(`CREATE TABLE ${sqlName(t.name)} (\n${lines.join(',\n')}\n);`)
  }
  return { sql: out.join('\n\n') + '\n', notes }
}

/** `https://model.quaera.app/#sql=<data>&name=<label>` */
export async function modelUrl(sql: string, label: string, base: string = MODEL_URL): Promise<string> {
  const url = new URL(base)
  url.search = ''
  url.hash = `${SQL_PARAM}=${await encodeDdl(sql)}&${NAME_PARAM}=${encodeURIComponent(label)}`
  return url.toString()
}
