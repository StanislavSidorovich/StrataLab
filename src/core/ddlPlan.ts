// A PostgreSQL DDL script (from model.quaera.app) turned into a plan DuckDB can run:
// one CREATE TABLE per table with its keys folded in, tables ordered so that every
// foreign key points at a table that already exists, and a note for everything changed or left out.
//
// Why folding: StrataSQL (like pg_dump) adds foreign keys afterwards with
// `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`, which DuckDB does not support;
// DuckDB only takes foreign keys inside CREATE TABLE, pointing at tables created before.

export interface ForeignKey {
  /** `CONSTRAINT name` as written, or null. */
  name: string | null
  /** The referencing columns, as written (quoted when they were). */
  columns: string[]
  /** The referenced table, as written; `refName` is its folded name for lookups. */
  refTable: string
  refName: string
  /** Empty when the script left them out (the referenced table's primary key). */
  refColumns: string[]
}

export interface PlannedTable {
  /** The name DuckDB will show (unquoted names keep their case, quoted ones lose the quotes). */
  name: string
  /** The name as SQL, ready to put in a statement. */
  ident: string
  /** The name as Postgres folds it (lower case unless quoted), to match foreign keys with. */
  key: string
  /** Column definitions, PRIMARY KEY and UNIQUE constraints. */
  items: string[]
  checks: string[]
  foreignKeys: ForeignKey[]
}

export interface DdlNote {
  /** The start of the statement the note is about. */
  statement: string
  message: string
}

export interface DdlPlan {
  /** The model name from StrataSQL's header comment, when there is one. */
  title: string | null
  /** In creation order: referenced tables first. */
  tables: PlannedTable[]
  /** Other statements (CREATE INDEX, COMMENT ON, views…), run as they are after the tables. */
  extras: string[]
  notes: DdlNote[]
}

// ---------------------------------------------------------------- lexing

const WORD = /(?:[A-Za-z_]|[^\x00-\x7f])(?:[\w$]|[^\x00-\x7f])*/y

/** Removes `--` and block comments, leaving strings and quoted names alone. */
export function stripComments(sql: string): string {
  let out = ''
  for (let i = 0; i < sql.length; ) {
    const c = sql[i]
    if (c === "'" || c === '"') {
      const end = closingQuote(sql, i)
      out += sql.slice(i, end)
      i = end
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end < 0 ? sql.length : end + 2
      out += ' '
    } else {
      out += c
      i++
    }
  }
  return out
}

/** Index just past the quote that closes the one at `start` ('' and "" are escapes). */
function closingQuote(s: string, start: number): number {
  const q = s[start]
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === q) {
      if (s[i + 1] === q) i++
      else return i + 1
    }
  }
  return s.length
}

/**
 * Words Postgres takes as plain names but DuckDB's parser does not (DuckDB 1.5 keywords that
 * are not reserved in Postgres): a column called `at` or `map` must be quoted for DuckDB.
 * `by` and `generated` are left out: they are also parts of column syntax.
 */
const DUCK_KEYWORDS = new Set(
  'anti asof at columns describe glob lambda map pivot pivot_longer pivot_wider positional qualify semi show struct summarize try_cast unpack unpivot'.split(' '),
)

/** Quotes the words DuckDB would read as keywords, outside strings and quoted names. */
export function quoteDuckKeywords(sql: string): string {
  let out = ''
  for (let i = 0; i < sql.length; ) {
    const c = sql[i]
    if (c === "'" || c === '"') {
      const end = closingQuote(sql, i)
      out += sql.slice(i, end)
      i = end
      continue
    }
    WORD.lastIndex = i
    const m = WORD.exec(sql)
    if (m) {
      out += DUCK_KEYWORDS.has(m[0].toLowerCase()) ? `"${m[0].toLowerCase()}"` : m[0]
      i += m[0].length
    } else {
      out += c
      i++
    }
  }
  return out
}

/** Splits on `sep` outside quotes and parentheses. */
export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"') i = closingQuote(s, i) - 1
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === sep && depth === 0) {
      parts.push(s.slice(from, i))
      from = i + 1
    }
  }
  parts.push(s.slice(from))
  return parts.map((p) => p.trim()).filter(Boolean)
}

export function splitStatements(sql: string): string[] {
  return splitTopLevel(stripComments(sql), ';')
}

interface Ident {
  /** As written, without a leading `public.` schema. */
  raw: string
  /** The last part, unquoted. */
  bare: string
  /** The last part as Postgres folds it: lower case unless quoted. */
  folded: string
  end: number
}

function readPart(s: string, at: number): { raw: string; bare: string; folded: string; end: number } | null {
  if (s[at] === '"') {
    const end = closingQuote(s, at)
    const bare = s.slice(at + 1, end - 1).replace(/""/g, '"')
    return { raw: s.slice(at, end), bare, folded: bare, end }
  }
  WORD.lastIndex = at
  const m = WORD.exec(s)
  if (!m) return null
  return { raw: quoteDuckKeywords(m[0]), bare: m[0], folded: m[0].toLowerCase(), end: at + m[0].length }
}

/** A possibly schema-qualified name at `at` (spaces before it are skipped). */
export function readIdent(s: string, at: number): Ident | null {
  while (/\s/.test(s[at] ?? '')) at++
  const parts: NonNullable<ReturnType<typeof readPart>>[] = []
  for (;;) {
    const p = readPart(s, at)
    if (!p) return null
    parts.push(p)
    at = p.end
    if (s[at] !== '.') break
    at++
  }
  // `public` is Postgres' default schema; DuckDB's is `main`.
  if (parts.length > 1 && parts[0].folded === 'public') parts.shift()
  const last = parts[parts.length - 1]
  return { raw: parts.map((p) => p.raw).join('.'), bare: last.bare, folded: last.folded, end: at }
}

/** The text inside the parentheses that open at or after `at`, and the index after them. */
function readParens(s: string, at: number): { inner: string; end: number } | null {
  while (/\s/.test(s[at] ?? '')) at++
  if (s[at] !== '(') return null
  let depth = 0
  for (let i = at; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"') i = closingQuote(s, i) - 1
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return { inner: s.slice(at + 1, i), end: i + 1 }
  }
  return null
}

const oneLine = (s: string, max = 90) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// ---------------------------------------------------------------- table items

const CONSTRAINT_NAME = /^constraint\s+/i

/** `CONSTRAINT name` at the start of an item, and the rest. */
function splitConstraintName(item: string): { name: string | null; rest: string } {
  if (!CONSTRAINT_NAME.test(item)) return { name: null, rest: item }
  const id = readIdent(item, item.match(CONSTRAINT_NAME)![0].length)
  if (!id) return { name: null, rest: item }
  return { name: id.raw, rest: item.slice(id.end).trim() }
}

const REF_ACTION = /\s+on\s+(delete|update)\s+(no\s+action|restrict|cascade|set\s+null|set\s+default)/gi
const DEFERRABLE = /\s+(not\s+)?deferrable(\s+initially\s+(deferred|immediate))?|\s+initially\s+(deferred|immediate)|\s+match\s+(full|partial|simple)|\s+not\s+valid/gi

/** `REFERENCES t (a, b) [ON DELETE …]` at the start of `s`. */
function readReferences(s: string, notes: string[]): { refTable: Ident; refColumns: string[]; end: number } | null {
  const m = /^\s*references\s+/i.exec(s)
  if (!m) return null
  const refTable = readIdent(s, m[0].length)
  if (!refTable) return null
  let end = refTable.end
  let refColumns: string[] = []
  const cols = readParens(s, end)
  if (cols) {
    refColumns = splitTopLevel(quoteDuckKeywords(cols.inner), ',')
    end = cols.end
  }
  // ON DELETE / ON UPDATE and DEFERRABLE: DuckDB only checks the key at once and takes no action.
  let tail = s.slice(end)
  const rest = tail.replace(REF_ACTION, (all, _what, action: string) => {
    if (!/^(no\s+action|restrict)$/i.test(action)) notes.push(`${oneLine(all)} left out: DuckDB foreign keys only block the change`)
    return ''
  })
  tail = rest.replace(DEFERRABLE, (all) => {
    notes.push(`${oneLine(all)} left out: DuckDB checks keys at once`)
    return ''
  })
  return { refTable, refColumns, end: s.length - tail.length }
}

function parseForeignKey(name: string | null, rest: string, notes: string[]): ForeignKey | null {
  const m = /^foreign\s+key\s*/i.exec(rest)
  if (!m) return null
  const cols = readParens(rest, m[0].length)
  if (!cols) return null
  const ref = readReferences(rest.slice(cols.end), notes)
  if (!ref) return null
  return { name, columns: splitTopLevel(quoteDuckKeywords(cols.inner), ','), refTable: ref.refTable.raw, refName: ref.refTable.folded, refColumns: ref.refColumns }
}

const SERIAL = /^(\S+|"(?:[^"]|"")*")\s+(small|big)?serial\d?\b/i
const IDENTITY = /\s+generated\s+(always|by\s+default)\s+as\s+identity(\s*\([^)]*\))?/i

/** A column definition with Postgres-only parts translated; inline REFERENCES become table foreign keys. */
function parseColumn(item: string, notes: string[], fks: ForeignKey[]): string {
  let col = item
  const serial = SERIAL.exec(col)
  if (serial) {
    const type = serial[2]?.toLowerCase() === 'big' ? 'bigint' : serial[2]?.toLowerCase() === 'small' ? 'smallint' : 'integer'
    col = col.replace(SERIAL, `$1 ${type}`)
    if (!/\bnot\s+null\b/i.test(col)) col += ' NOT NULL'
    notes.push(`${serial[1]}: ${serial[0].split(/\s+/).pop()} became ${type} NOT NULL (DuckDB has no serial; give the ids yourself or use a sequence)`)
  }
  if (IDENTITY.test(col)) {
    col = col.replace(IDENTITY, '')
    notes.push(`${oneLine(item.split(/\s+/)[0])}: GENERATED AS IDENTITY left out (DuckDB has no identity columns)`)
  }
  const at = col.search(/\sreferences\s/i)
  if (at >= 0) {
    const ref = readReferences(col.slice(at), notes)
    const name = readIdent(col, 0)
    if (ref && name) {
      fks.push({ name: null, columns: [name.raw], refTable: ref.refTable.raw, refName: ref.refTable.folded, refColumns: ref.refColumns })
      col = (col.slice(0, at) + col.slice(at + ref.end)).trim()
    }
  }
  return col
}

interface TableBits {
  items: string[]
  checks: string[]
  foreignKeys: ForeignKey[]
}

/** Sorts one table item (from CREATE TABLE or ALTER TABLE … ADD) into `bits`; false when it can't be used. */
function addItem(item: string, bits: TableBits, notes: string[], isColumnAllowed: boolean): boolean {
  const { name, rest } = splitConstraintName(item)
  if (/^foreign\s+key\b/i.test(rest)) {
    const fk = parseForeignKey(name, rest, notes)
    if (!fk) return false
    bits.foreignKeys.push(fk)
  } else if (/^check\s*\(/i.test(rest)) {
    bits.checks.push(quoteDuckKeywords(item).replace(/\s+no\s+inherit\b/i, ''))
  } else if (/^(primary\s+key|unique)\b/i.test(rest)) {
    bits.items.push(quoteDuckKeywords(item).replace(DEFERRABLE, ''))
  } else if (/^exclude\b/i.test(rest)) {
    notes.push(`${oneLine(item)} left out: DuckDB has no EXCLUDE constraints`)
  } else if (isColumnAllowed && !name) {
    bits.items.push(quoteDuckKeywords(parseColumn(item, notes, bits.foreignKeys)))
  } else {
    return false
  }
  return true
}

// ---------------------------------------------------------------- the plan

const CREATE_TABLE = /^create\s+table\s+(if\s+not\s+exists\s+)?/i
const ALTER_ADD = /^alter\s+table\s+(if\s+exists\s+)?(only\s+)?/i
const IGNORED = /^(begin|commit|end|start\s+transaction|set|go|rollback|savepoint|release)\b/i

export function planDdl(sql: string): DdlPlan {
  const title = /DDL for "([^"\n]*)"/.exec(sql.slice(0, 500))?.[1] ?? null
  const tables: PlannedTable[] = []
  const byName = new Map<string, PlannedTable>()
  const extras: string[] = []
  const notes: DdlNote[] = []
  const note = (stmt: string, message: string) => notes.push({ statement: oneLine(stmt), message })

  for (const stmt of splitStatements(sql)) {
    const local: string[] = []
    const flush = () => local.splice(0).forEach((m) => note(stmt, m))

    const create = CREATE_TABLE.exec(stmt)
    if (create) {
      const id = readIdent(stmt, create[0].length)
      const body = id && readParens(stmt, id.end)
      if (!id || !body) {
        extras.push(stmt)
        continue
      }
      const tail = stmt.slice(body.end).trim()
      if (tail) local.push(`${oneLine(tail, 40)} after the column list left out (Postgres storage options)`)
      const t: PlannedTable = { name: id.bare, ident: id.raw, key: id.folded, items: [], checks: [], foreignKeys: [] }
      for (const item of splitTopLevel(body.inner, ',')) if (!addItem(item, t, local, true)) local.push(`${oneLine(item)} not understood, left out`)
      const earlier = byName.get(t.key)
      if (earlier) {
        local.push(`${t.name} is created twice; the later definition is used`)
        tables.splice(tables.indexOf(earlier), 1, t)
      } else tables.push(t)
      byName.set(t.key, t)
      flush()
      continue
    }

    const alter = ALTER_ADD.exec(stmt)
    if (alter) {
      const id = readIdent(stmt, alter[0].length)
      const actions = id ? splitTopLevel(stmt.slice(id.end), ',') : []
      const t = id && byName.get(id.folded)
      if (t && actions.length && actions.every((a) => /^add\s+/i.test(a))) {
        const bits: TableBits = { items: [], checks: [], foreignKeys: [] }
        const ok = actions.every((a) => addItem(a.replace(/^add\s+(constraint\s+)?/i, (_m, c) => (c ? 'CONSTRAINT ' : '')), bits, local, false))
        if (ok) {
          t.items.push(...bits.items)
          t.checks.push(...bits.checks)
          t.foreignKeys.push(...bits.foreignKeys)
          flush()
          continue
        }
        local.length = 0
      }
      if (id && /\bforeign\s+key\b/i.test(stmt)) {
        note(stmt, 'Left out: DuckDB can only add a foreign key while it creates the table, and this table is not in the script')
        continue
      }
      extras.push(stmt)
      continue
    }

    if (/^drop\s+table\b/i.test(stmt)) {
      note(stmt, 'Not run: Quaera Lab asks before it replaces a table that already exists')
      continue
    }
    if (IGNORED.test(stmt)) continue
    extras.push(stmt)
  }

  return { title, tables: orderTables(tables, notes), extras, notes }
}

/**
 * Referenced tables first (keeping the script's order otherwise). A table that refers to
 * itself is fine; a circle of tables is broken by leaving out the foreign key that closes it.
 */
function orderTables(tables: PlannedTable[], notes: DdlNote[]): PlannedTable[] {
  const names = new Set(tables.map((t) => t.key))
  const done = new Set<string>()
  const out: PlannedTable[] = []
  const ready = (t: PlannedTable) => t.foreignKeys.every((fk) => fk.refName === t.key || !names.has(fk.refName) || done.has(fk.refName))
  let left = [...tables]
  while (left.length) {
    let next = left.find(ready)
    if (!next) {
      next = left[0]
      const self = next.key
      next.foreignKeys = next.foreignKeys.filter((fk) => {
        const keep = fk.refName === self || !names.has(fk.refName) || done.has(fk.refName)
        if (!keep)
          notes.push({
            statement: `${next!.name} → ${fk.refTable}`,
            message: `Foreign key ${fk.name ?? `(${fk.columns.join(', ')})`} left out: the tables refer to each other in a circle, and DuckDB can't add a foreign key to a table that already exists`,
          })
        return keep
      })
    }
    out.push(next)
    done.add(next.key)
    left = left.filter((t) => t !== next)
  }
  return out
}

export function foreignKeySql(fk: ForeignKey): string {
  const refCols = fk.refColumns.length ? ` (${fk.refColumns.join(', ')})` : ''
  return `${fk.name ? `CONSTRAINT ${fk.name} ` : ''}FOREIGN KEY (${fk.columns.join(', ')}) REFERENCES ${fk.refTable}${refCols}`
}

export interface CreateOptions {
  /** Leave the CHECK constraints out (used when DuckDB rejects one of them). */
  withoutChecks?: boolean
  /** Foreign keys to leave out. */
  skip?: ReadonlySet<ForeignKey>
}

export function createTableSql(t: PlannedTable, opts: CreateOptions = {}): string {
  const lines = [...t.items, ...(opts.withoutChecks ? [] : t.checks), ...t.foreignKeys.filter((fk) => !opts.skip?.has(fk)).map(foreignKeySql)]
  return `CREATE TABLE ${t.ident} (\n   ${lines.join(',\n   ')}\n)`
}

/** The query tab that opens with the new tables: one starter SELECT each. */
export function starterSql(plan: DdlPlan, created: PlannedTable[]): string {
  const head = `-- ${created.length} empty table${created.length === 1 ? '' : 's'} from model.quaera.app${plan.title ? ` ("${plan.title}")` : ''}, with their keys.\n-- Select a line and press F5 to run it.\n`
  return head + created.map((t) => `SELECT * FROM ${t.ident};`).join('\n') + '\n'
}
