// StrataLab runs DuckDB (PostgreSQL-like). Many learners come from SQL Server
// (SSMS courses), so when a query fails we look for T-SQL habits and say what
// DuckDB expects instead. Hints are shown next to the error, never applied
// silently: seeing the difference is part of learning.

export interface DialectHint {
  id: string
  found: string
  use: string
}

interface Rule {
  id: string
  re: RegExp
  found: string
  use: string
}

const RULES: Rule[] = [
  { id: 'top', re: /\bselect\s+(distinct\s+)?top\s*\(?\s*\d+/i, found: 'SELECT TOP n', use: 'put LIMIT n at the end of the query' },
  { id: 'getdate', re: /\bgetdate\s*\(\s*\)/i, found: 'GETDATE()', use: 'now() or current_date' },
  { id: 'isnull', re: /\bisnull\s*\(/i, found: 'ISNULL(a, b)', use: 'coalesce(a, b)' },
  { id: 'brackets', re: /\[\p{L}[\p{L}\p{N}_ ]*\]/u, found: '[column name]', use: '"column name" (double quotes)' },
  { id: 'dateadd', re: /\bdateadd\s*\(/i, found: 'DATEADD(day, n, d)', use: "d + INTERVAL n DAY or date_add(d, INTERVAL 'n days')" },
  { id: 'datediff', re: /\bdatediff\s*\(\s*(day|month|year|hour|minute)\s*,/i, found: 'DATEDIFF(day, a, b)', use: "date_diff('day', a, b)" },
  { id: 'charindex', re: /\bcharindex\s*\(/i, found: 'CHARINDEX(x, s)', use: 'strpos(s, x)' },
  { id: 'nvarchar', re: /\bn?varchar\s*\(\s*max\s*\)/i, found: 'NVARCHAR(MAX)', use: 'VARCHAR (no length needed)' },
  { id: 'nstring', re: /\bN'/, found: "N'text'", use: "'text' (all text is Unicode)" },
  { id: 'go', re: /^\s*go\s*$/im, found: 'GO between batches', use: 'a semicolon ; after each statement' },
  { id: 'identity', re: /\bidentity\s*\(\s*\d+\s*,\s*\d+\s*\)/i, found: 'IDENTITY(1,1)', use: "a SEQUENCE: CREATE SEQUENCE s; id INTEGER DEFAULT nextval('s')" },
  { id: 'plus-concat', re: /'\s*\+\s*[A-Za-z_"]|[A-Za-z_"]\s*\+\s*'/, found: "'a' + b to join text", use: "'a' || b or concat('a', b)" },
  { id: 'convert', re: /\bconvert\s*\(\s*(n?varchar|int|date|datetime|decimal)/i, found: 'CONVERT(type, x)', use: 'CAST(x AS type) or x::type' },
]

export function dialectHints(sql: string): DialectHint[] {
  const text = stripComments(sql)
  return RULES.filter((r) => r.re.test(text)).map(({ id, found, use }) => ({ id, found, use }))
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Splits DuckDB's "Catalog Error: Table with name x does not exist!" into kind + message. */
export function splitError(message: string): { kind: string; text: string } {
  const m = /^([A-Z][A-Za-z ]+ Error):\s*([\s\S]*)$/.exec(message.trim())
  return m ? { kind: m[1], text: m[2] } : { kind: 'Error', text: message }
}

export interface NamedTable {
  schema: string
  name: string
}

const ref = (t: NamedTable) => (t.schema === 'main' ? t.name : `${t.schema}.${t.name}`)

/**
 * A Python NameError on a word that is really a dataset or a table (`aw = adventureworks`,
 * `Product.head()`): says to read it with lab.table, schema-qualified. Null when the name is neither.
 */
export function pythonNameHint(evalue: string, tables: readonly NamedTable[]): string | null {
  const word = /^name '([^']+)' is not defined/.exec(evalue)?.[1]?.toLowerCase()
  if (!word) return null
  const call = (t: NamedTable) => `lab.table("${ref(t)}")`
  const ofSchema = tables.filter((t) => t.schema !== 'main' && t.schema.toLowerCase() === word)
  if (ofSchema.length) {
    const [first, ...rest] = ofSchema
    return `Did you mean ${call(first)}? “${first.schema}” is a dataset, not a Python variable; its tables: ${[first, ...rest].slice(0, 3).map(call).join(', ')}.`
  }
  const named = tables.find((t) => t.name.toLowerCase() === word)
  return named ? `Did you mean ${call(named)}? Tables are read with lab.table(…), they are not Python variables.` : null
}

/**
 * DuckDB's "Table with name X does not exist" where X is a table of a loaded dataset: names the
 * schema-qualified table, unless DuckDB's own "Did you mean" already does.
 */
export function sqlNameHint(error: string, tables: readonly NamedTable[]): string | null {
  const word = /Table with name "?([^"\s]+)"? does not exist/.exec(error)?.[1]?.toLowerCase()
  if (!word) return null
  const t = tables.find((x) => x.schema !== 'main' && x.name.toLowerCase() === word)
  if (!t || error.toLowerCase().includes(`${t.schema}.${t.name}`.toLowerCase())) return null
  return `Did you mean ${t.schema}.${t.name}? That table is in the ${t.schema} dataset: write its schema before the name.`
}
