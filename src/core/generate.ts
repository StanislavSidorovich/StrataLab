// The data generator (stage 2): sample rows for empty tables — a model opened from
// model.quaera.app, or the user's own CREATE TABLEs — that respect their keys. Everything is
// generated inside DuckDB by the SQL written here, so a thousand rows take one statement:
//   * a foreign key takes the key of a random existing row of the referenced table (parents are
//     generated first; a nullable key to an empty table stays NULL),
//   * primary keys and UNIQUE columns get distinct values (after the ones already there),
//   * simple CHECKs (ranges, BETWEEN, IN lists) steer the values; every CHECK filters the rows,
//   * column names give plausible values: email, city, first_name, price, quantity, status…
import type { ModelTable } from './modelLink'
import { quoteIdent, quoteString, sqlName } from './sql'

export interface GenTable extends ModelTable {
  /** rows already in the table */
  rows: number
}

export interface Hint {
  min?: number
  max?: number
  /** IN ('a', 'b') */
  values?: string[]
}

const IDENT = String.raw`"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*`
const NUM = String.raw`-?\d+(?:\.\d+)?`
const unquote = (s: string) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s)

/**
 * What simple CHECKs say about each column: `(qty > 0)`, `(a BETWEEN 1 AND 5)`,
 * `(status IN ('new', 'done'))`, `((d >= 0) AND (d <= 1))`. A CHECK with OR gives no hint (the
 * rows are still filtered by it).
 */
export function checkHints(checks: string[]): Map<string, Hint> {
  const hints = new Map<string, Hint>()
  const hint = (col: string) => {
    const k = unquote(col).toLowerCase()
    if (!hints.has(k)) hints.set(k, {})
    return hints.get(k)!
  }
  const lower = (h: Hint, v: number) => (h.min = Math.max(h.min ?? -Infinity, v))
  const upper = (h: Hint, v: number) => (h.max = Math.min(h.max ?? Infinity, v))
  for (const c of checks) {
    if (/\bOR\b/i.test(c)) continue
    let text = c
    for (const m of c.matchAll(new RegExp(`(${IDENT})\\s+BETWEEN\\s+(${NUM})\\s+AND\\s+(${NUM})`, 'gi'))) {
      const h = hint(m[1])
      lower(h, Number(m[2]))
      upper(h, Number(m[3]))
      text = text.replace(m[0], '')
    }
    for (const m of text.matchAll(new RegExp(`(${IDENT})\\s+IN\\s+\\(((?:\\s*(?:'(?:[^']|'')*'|${NUM})\\s*,?)+)\\)`, 'gi'))) {
      const values = [...m[2].matchAll(new RegExp(`'((?:[^']|'')*)'|(${NUM})`, 'g'))].map((v) => (v[1] !== undefined ? v[1].replace(/''/g, "'") : v[2]))
      hint(m[1]).values = values
    }
    for (const m of text.matchAll(new RegExp(`(${IDENT})\\s*(>=|>|<=|<)\\s*(${NUM})`, 'g'))) {
      const v = Number(m[3])
      if (m[2] === '>=') lower(hint(m[1]), v)
      else if (m[2] === '>') lower(hint(m[1]), v + (Number.isInteger(v) ? 1 : 0.01))
      else if (m[2] === '<=') upper(hint(m[1]), v)
      else upper(hint(m[1]), v - (Number.isInteger(v) ? 1 : 0.01))
    }
    for (const m of text.matchAll(new RegExp(`(${NUM})\\s*(>=|>|<=|<)\\s*(${IDENT})`, 'g'))) {
      if (/^-?\d/.test(m[3])) continue
      const v = Number(m[1])
      if (m[2] === '<=') lower(hint(m[3]), v)
      else if (m[2] === '<') lower(hint(m[3]), v + (Number.isInteger(v) ? 1 : 0.01))
      else if (m[2] === '>=') upper(hint(m[3]), v)
      else upper(hint(m[3]), v - (Number.isInteger(v) ? 1 : 0.01))
    }
  }
  return hints
}

const FIRST = ['Ana', 'João', 'Maria', 'Pedro', 'Inês', 'Rui', 'Olga', 'Ivan', 'Sofia', 'Tiago', 'Elena', 'Marta', 'Liam', 'Emma', 'Noah', 'Mia']
const LAST = ['Silva', 'Costa', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Petrova', 'Martins', 'Sousa', 'Smith', 'Müller', 'Rossi']
const CITY = ['Lisbon', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Madrid', 'Berlin', 'Paris', 'Warsaw', 'Almaty']
const COUNTRY = ['Portugal', 'Spain', 'Germany', 'France', 'Poland', 'Kazakhstan', 'Brazil']
const STATUS = ['new', 'active', 'done', 'cancelled']

const list = (items: string[]) => `[${items.map(quoteString).join(', ')}]`
const pick = (items: string[]) => `(${list(items)})[1 + floor(random() * ${items.length})::INTEGER]`
const between = (lo: number, hi: number) => `CAST(${lo} + floor(random() * ${hi - lo + 1}) AS INTEGER)`
/** the row number while generating (1, 2, …) */
const I = 'r.i'

export type ColumnKind = 'int' | 'decimal' | 'float' | 'bool' | 'date' | 'timestamp' | 'time' | 'uuid' | 'text' | 'blob' | 'other'

export function columnKind(duckType: string): { kind: ColumnKind; precision?: number; scale?: number; max?: number } {
  const t = duckType.toUpperCase()
  const dec = /^DECIMAL\((\d+),\s*(\d+)\)$/.exec(t)
  if (dec) return { kind: 'decimal', precision: Number(dec[1]), scale: Number(dec[2]) }
  if (['TINYINT', 'UTINYINT'].includes(t)) return { kind: 'int', max: 100 }
  if (['SMALLINT', 'USMALLINT'].includes(t)) return { kind: 'int', max: 30000 }
  if (['INTEGER', 'UINTEGER', 'BIGINT', 'UBIGINT', 'HUGEINT', 'UHUGEINT'].includes(t)) return { kind: 'int' }
  if (t === 'DOUBLE' || t === 'FLOAT') return { kind: 'float' }
  if (t === 'BOOLEAN') return { kind: 'bool' }
  if (t === 'DATE') return { kind: 'date' }
  if (t.startsWith('TIMESTAMP')) return { kind: 'timestamp' }
  if (t === 'TIME') return { kind: 'time' }
  if (t === 'UUID') return { kind: 'uuid' }
  if (t === 'VARCHAR' || /^VARCHAR\(\d+\)$/.test(t)) return { kind: 'text' }
  if (t === 'BLOB') return { kind: 'blob' }
  return { kind: 'other' }
}

/** A readable label from a column name: customer_name → "Customer name", ProductName → "Product name". */
function label(col: string): string {
  const words = col
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The SQL for one column's value in row `r.i` (1, 2, …). `unique`: the value must differ from row
 * to row (a key); `base`: SQL for the largest integer key already in the table.
 */
export function valueSql(col: string, type: string, hint: Hint | undefined, unique: boolean, base: string): string | null {
  const { kind, precision, scale, max } = columnKind(type)
  // the column's words: "UnitPrice" → "unit price", "customer_id" → "customer id"
  const n = label(col).toLowerCase()
  if (hint?.values?.length && !unique) {
    if (kind === 'text') return pick(hint.values)
    if (kind === 'int' || kind === 'decimal' || kind === 'float') return `CAST(${pick(hint.values)} AS ${type})`
  }
  switch (kind) {
    case 'int': {
      if (unique) return `CAST(${base} + ${I} AS ${type})`
      let lo = 1
      let hi = Math.min(max ?? 1000, 1000)
      if (/\b(qty|quantity|count|units)\b/.test(n)) hi = 10
      else if (/\byear\b/.test(n)) [lo, hi] = [2015, 2026]
      else if (/\bage\b/.test(n)) [lo, hi] = [18, 80]
      else if (/\b(rating|stars|score)\b/.test(n)) [lo, hi] = [1, 5]
      if (hint?.min !== undefined) lo = Math.ceil(hint.min)
      if (hint?.max !== undefined) hi = Math.floor(hint.max)
      if (hint?.min !== undefined && hint.max === undefined && hi < lo) hi = lo + 100
      if (hint?.max !== undefined && hint.min === undefined && lo > hi) lo = hi - 100
      return `CAST(${between(lo, Math.max(lo, hi))} AS ${type})`
    }
    case 'decimal':
    case 'float': {
      const s = kind === 'decimal' ? scale! : 2
      const top = kind === 'decimal' ? Math.min(1000, 10 ** (precision! - s) - 1) : 1000
      let lo = /\b(discount|rate|pct|percent|share)\b/.test(n) ? 0 : 1
      let hi = /\b(discount|rate|pct|percent|share)\b/.test(n) ? Math.min(top, 0.5) : top
      if (hint?.min !== undefined) lo = hint.min
      if (hint?.max !== undefined) hi = Math.min(top, hint.max)
      if (hi < lo) hi = lo + Math.min(top, 100)
      return `CAST(round(${lo} + random() * ${hi - lo}, ${s}) AS ${type})`
    }
    case 'bool':
      return 'random() < 0.5'
    case 'date':
      return `CAST(DATE '2023-01-01' + CAST(floor(random() * 1000) AS INTEGER) AS ${type})`
    case 'timestamp':
      return `CAST(TIMESTAMP '2023-01-01 08:00:00' + to_seconds(CAST(floor(random() * 1000 * 86400) AS BIGINT)) AS ${type})`
    case 'time':
      return `make_time(CAST(8 + floor(random() * 12) AS BIGINT), CAST(floor(random() * 60) AS BIGINT), 0)`
    case 'uuid':
      return 'uuid()'
    case 'blob':
      return 'NULL'
    case 'other':
      return null
  }
  // text
  const suffix = unique ? ` || ' ' || (${base} + ${I})` : ''
  if (/\be ?mail\b|\bemail/.test(n)) return `'user' || (${base} + ${I}) || '@example.com'`
  if (/\b(phone|mobile|tel|telephone)\b/.test(n)) return `'+351 9' || lpad(CAST(CAST(floor(random() * 100000000) AS BIGINT) AS VARCHAR), 8, '0')`
  if (/\b(first name|forename|given name)\b/.test(n)) return pick(FIRST) + suffix
  if (/\b(last name|surname|family name)\b/.test(n)) return pick(LAST) + suffix
  if (/^(full |customer |person |employee |student |contact )?name$/.test(n)) return `${pick(FIRST)} || ' ' || ${pick(LAST)}` + suffix
  if (/\b(city|town)\b/.test(n)) return pick(CITY) + suffix
  if (/\bcountry\b/.test(n)) return pick(COUNTRY) + suffix
  if (/\b(status|state)\b/.test(n) && !unique) return pick(STATUS)
  if (/\b(category|type|kind|group|segment|channel)\b/.test(n) && !unique) return `${quoteString(label(col) + ' ')} || ${between(1, 5)}`
  if (/\b(code|id|number|no)$/.test(n) || unique) return `${quoteString(label(col).replace(/ (id|code)$/i, '').slice(0, 12).toUpperCase().replace(/ /g, '') + '-')} || lpad(CAST(${base} + ${I} AS VARCHAR), 5, '0')`
  return `${quoteString(label(col) + ' ')} || ${I}`
}

export interface GenStep {
  table: string
  count: number
  /** statements to run in order; the last one inserts */
  sql: string[]
}

export interface GenPlan {
  steps: GenStep[]
  /** tables that cannot be filled as asked, with why */
  problems: { table: string; message: string }[]
}

/** Tables in an order where every table comes after the tables it refers to (a circle keeps its order). */
export function parentsFirst<T extends GenTable>(tables: T[]): T[] {
  const byName = new Map(tables.map((t) => [t.name, t]))
  const order: T[] = []
  const seen = new Set<string>()
  const visit = (t: T, path: Set<string>) => {
    if (seen.has(t.name) || path.has(t.name)) return
    path.add(t.name)
    for (const fk of t.foreignKeys) {
      const ref = byName.get(fk.refTable)
      if (ref && ref !== t) visit(ref, path)
    }
    path.delete(t.name)
    seen.add(t.name)
    order.push(t)
  }
  for (const t of tables) visit(t, new Set())
  return order
}

/**
 * The statements that add `counts[table]` rows to each chosen table, parents first. A table whose
 * NOT NULL foreign key points at a table that is empty and not being filled is left out with a
 * problem; so is a column type the generator can't make (LIST, STRUCT…) when it is NOT NULL.
 */
export function planGeneration(tables: GenTable[], counts: Map<string, number>): GenPlan {
  const byName = new Map(tables.map((t) => [t.name, t]))
  const problems: GenPlan['problems'] = []
  const willHaveRows = (name: string) => (byName.get(name)?.rows ?? 0) > 0 || (counts.get(name) ?? 0) > 0
  const order = parentsFirst(tables)
  const left = new Set<string>()
  const steps: GenStep[] = []
  for (const t of order) {
    const count = counts.get(t.name) ?? 0
    if (count <= 0) continue
    const notNull = new Set(t.columns.filter((c) => c.notNull).map((c) => c.name))
    const blocking = t.foreignKeys.find(
      (fk) => fk.refTable !== t.name && fk.columns.some((c) => notNull.has(c)) && (left.has(fk.refTable) || !willHaveRows(fk.refTable)),
    )
    if (blocking) {
      problems.push({ table: t.name, message: `needs rows in ${blocking.refTable} first (${blocking.columns.join(', ')} must point at one): tick it too` })
      left.add(t.name)
      continue
    }
    const selfKey = t.foreignKeys.find((fk) => fk.refTable === t.name && fk.columns.some((c) => notNull.has(c)))
    if (selfKey && t.rows === 0) {
      problems.push({ table: t.name, message: `each row must point at another row of ${t.name} (${selfKey.columns.join(', ')} is NOT NULL), so the first one can't be made` })
      left.add(t.name)
      continue
    }
    const step = tableSql(t, count)
    if ('problem' in step) {
      problems.push({ table: t.name, message: step.problem })
      left.add(t.name)
      continue
    }
    steps.push(step)
  }
  return { steps, problems }
}

const STAGE = 'strata_gen_stage'
const ROW = 'strata_row'

function tableSql(t: GenTable, count: number): GenStep | { problem: string } {
  const target = sqlName(t.name)
  const hints = checkHints(t.checks)
  const fkCols = new Map<string, { k: number; ref: string }>()
  t.foreignKeys.forEach((fk, k) => fk.columns.forEach((c, j) => fkCols.set(c, { k, ref: fk.refColumns[j] })))
  const pk = new Set(t.primaryKey)
  const singleKeys = [t.primaryKey, ...t.uniques].filter((u) => u.length === 1).map((u) => u[0])
  const intKey = t.primaryKey.length === 1 && columnKind(t.columns.find((c) => c.name === t.primaryKey[0])?.type ?? '').kind === 'int' ? t.primaryKey[0] : null
  // a key column that is not a foreign key: in a composite key (order_id, line_no) it still numbers the rows
  const numbered = new Set([...singleKeys, ...t.primaryKey.filter((c) => !fkCols.has(c))])
  const base = intKey ? `(SELECT coalesce(max(${quoteIdent(intKey)}), 0) FROM ${target})` : `(SELECT count(*) FROM ${target})`

  const select: string[] = []
  for (const c of t.columns) {
    const fk = fkCols.get(c.name)
    if (fk) {
      select.push(`p${fk.k}.${quoteIdent(fk.ref)} AS ${quoteIdent(c.name)}`)
      continue
    }
    const v = valueSql(c.name, c.type, hints.get(c.name.toLowerCase()), numbered.has(c.name), base)
    if (v === null) {
      if (c.notNull || pk.has(c.name)) return { problem: `${c.name} is ${c.type}: the generator can't make values of that type` }
      select.push(`NULL AS ${quoteIdent(c.name)}`)
      continue
    }
    select.push(`${v} AS ${quoteIdent(c.name)}`)
  }

  // Each foreign key joins a numbered copy of the referenced keys; row i takes a pseudo-random one.
  // A NOT NULL key needs a parent (inner join), a nullable one stays NULL when there is none.
  const joins: string[] = []
  t.foreignKeys.forEach((fk, k) => {
    const nullable = fk.columns.every((c) => !t.columns.find((x) => x.name === c)?.notNull)
    const keys = fk.refColumns.map(quoteIdent).join(', ')
    const parent = `(SELECT ${keys}, row_number() OVER (ORDER BY random()) - 1 AS rn, count(*) OVER () AS n FROM ${sqlName(fk.refTable)})`
    joins.push(`${nullable ? 'LEFT JOIN' : 'JOIN'} ${parent} p${k} ON p${k}.rn = hash(${I} * 7919 + ${k + 1}) % p${k}.n`)
  })
  // CHECKs and duplicate keys drop rows (two date CHECKs keep about a quarter), so make plenty
  const oversample = count * 10 + 50
  const stage = `CREATE OR REPLACE TEMP TABLE ${STAGE} AS\nSELECT ${[...select, `${I} AS ${ROW}`].join(',\n       ')}\nFROM range(1, ${oversample + 1}) r(i)${joins.length ? '\n' + joins.join('\n') : ''}`

  // keep rows that pass every CHECK, have new keys, and are distinct among themselves
  const keys = [t.primaryKey, ...t.uniques].filter((k) => k.length)
  const where = [
    ...t.checks.map((c) => `(${c})`),
    ...keys.map((k) => `NOT EXISTS (SELECT 1 FROM ${target} x WHERE ${k.map((c) => `x.${quoteIdent(c)} = s.${quoteIdent(c)}`).join(' AND ')})`),
  ]
  const qualify = keys.map((k) => `row_number() OVER (PARTITION BY ${k.map((c) => `s.${quoteIdent(c)}`).join(', ')} ORDER BY s.${ROW}) = 1`)
  const insert =
    `INSERT INTO ${target} BY NAME\nSELECT s.* EXCLUDE (${ROW}) FROM ${STAGE} s` +
    (where.length ? `\nWHERE ${where.join('\n  AND ')}` : '') +
    (qualify.length ? `\nQUALIFY ${qualify.join(' AND ')}` : '') +
    `\nORDER BY s.${ROW}\nLIMIT ${count}`
  return { table: t.name, count, sql: [stage, insert] }
}

export const GEN_STAGE = STAGE
