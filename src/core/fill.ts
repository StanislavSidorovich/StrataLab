// Filling an existing table from a file (stage 2b): which file column goes into which
// table column, and the SQL that checks every row against the table's types and keys
// before anything is inserted. Pure: the db layer stages the file and runs these strings.
import { quoteIdent, quoteString } from './sql'

export interface TargetColumn {
  name: string
  type: string
  nullable: boolean
  hasDefault: boolean
}

export type TargetConstraint =
  | { kind: 'primary'; columns: string[] }
  | { kind: 'unique'; columns: string[] }
  | { kind: 'foreign'; columns: string[]; refTable: string; refColumns: string[] }
  | { kind: 'check'; expression: string }

export interface FillTarget {
  table: string
  columns: TargetColumn[]
  constraints: TargetConstraint[]
}

export interface SourceColumn {
  name: string
  type: string
}

/** Table column → file column, or null to leave it to its default (or NULL). */
export type Mapping = Record<string, string | null>

export type ProblemKind = 'type' | 'notnull' | 'duplicate' | 'exists' | 'foreign' | 'check'

export const PROBLEM_LABELS: Record<ProblemKind, string> = {
  type: 'wrong type',
  notnull: 'empty but NOT NULL',
  duplicate: 'repeated key in the file',
  exists: 'key already in the table',
  foreign: 'not in the referenced table',
  check: 'fails a CHECK',
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** "Customer ID", "customer_id" and "CustomerId" all become "customerid". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Matches file columns to table columns by name (ignoring case, spaces and underscores).
 * When nothing matches by name but the file has exactly as many columns as the table,
 * they are matched by position: a sheet typed by hand often has its own headers.
 */
export function autoMap(file: SourceColumn[], target: TargetColumn[]): Mapping {
  const byName = new Map<string, string>()
  for (const f of file) if (!byName.has(normalizeName(f.name))) byName.set(normalizeName(f.name), f.name)
  const mapping: Mapping = {}
  let matched = 0
  for (const c of target) {
    const hit = byName.get(normalizeName(c.name)) ?? null
    mapping[c.name] = hit
    if (hit) matched++
  }
  if (!matched && file.length === target.length) target.forEach((c, i) => (mapping[c.name] = file[i].name))
  return mapping
}

/** What stops the check from running at all: NOT NULL columns with nothing to fill them. */
export function mappingProblems(target: FillTarget, mapping: Mapping): string[] {
  const out: string[] = []
  const mapped = target.columns.filter((c) => mapping[c.name])
  if (!mapped.length) out.push('Choose a file column for at least one table column.')
  for (const c of target.columns)
    if (!mapping[c.name] && !c.nullable && !c.hasDefault) out.push(`${c.name} is NOT NULL: choose a file column for it.`)
  return out
}

const INTEGER = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|INT\d*)$/i
const FRACTIONAL = /^(DOUBLE|FLOAT|REAL|DECIMAL.*|NUMERIC.*)$/i
const NUMBER = new RegExp(`${INTEGER.source}|${FRACTIONAL.source}`, 'i')

const srcAlias = (i: number) => `__src${i}`

/** "customer_id = 999", "(order_id, line_no) = (5, 2)" — built in SQL from the row's values. */
function keyText(cols: string[], prefix = ''): string {
  const val = (c: string) => `coalesce(CAST(${prefix}${quoteIdent(c)} AS VARCHAR), 'NULL')`
  if (cols.length === 1) return `${quoteString(`${cols[0]} = `)} || ${val(cols[0])}`
  return `${quoteString(`(${cols.join(', ')}) = (`)} || ${cols.map(val).join(` || ', ' || `)} || ')'`
}

const allNotNull = (cols: string[], prefix = '') => cols.map((c) => `${prefix}${quoteIdent(c)} IS NOT NULL`).join(' AND ')

export interface FillSql {
  /** temp view `view` over the staged rows: `__row` (row in the file) and every table column, cast */
  view: string
  /** one SELECT (__row, kind, col, message) per rule, joined with UNION ALL */
  problems: string
  /** INSERT of the rows of `view`; `skip` = a table of rows (`__row`) to leave out */
  insert: (skip: string | null) => string
}

/**
 * `staged` is a table holding the file's rows as read (`source` gives its columns and types);
 * `rowExpr` turns a staged row into the row number the user sees in the file.
 */
export function fillSql(
  target: FillTarget,
  mapping: Mapping,
  source: SourceColumn[],
  staged: string,
  view: string,
  rowExpr: string,
  /** the file writes 3,5 for 3.5: text going into a number column is read that way (and "1 234,50" too) */
  decimalComma = false,
): FillSql {
  const srcType = new Map(source.map((s) => [s.name, s.type]))
  const mapped = target.columns.filter((c) => mapping[c.name] && srcType.has(mapping[c.name]!))
  const isMapped = new Set(mapped.map((c) => c.name))

  const viewCols = target.columns.map((c) => {
    const i = target.columns.indexOf(c)
    if (!isMapped.has(c.name)) return `CAST(NULL AS ${c.type}) AS ${quoteIdent(c.name)}`
    const src = quoteIdent(mapping[c.name]!)
    // One stray value makes DuckDB read the whole column as text; the good "2,40" must still count.
    const commaText = decimalComma && NUMBER.test(c.type) && /^VARCHAR$/i.test(srcType.get(mapping[c.name]!) ?? '')
    const value = commaText ? `replace(regexp_replace(${src}, '[\\s\\x{a0}]', '', 'g'), ',', '.')` : src
    return `${src} AS ${srcAlias(i)}, TRY_CAST(${value} AS ${c.type}) AS ${quoteIdent(c.name)}`
  })
  const viewSql = `CREATE OR REPLACE TEMP VIEW ${view} AS SELECT ${rowExpr} AS __row, ${viewCols.join(', ')} FROM ${staged}`

  const parts: string[] = []
  const row = (kind: ProblemKind, col: string, message: string, from: string, where: string) =>
    `SELECT __row, '${kind}' AS kind, ${quoteString(col)} AS col, ${message} AS message FROM ${from} WHERE ${where}`

  for (const c of mapped) {
    const i = target.columns.indexOf(c)
    const src = srcAlias(i)
    // DuckDB rounds 5.6 to 6 on the way into an integer column: a silent change we report instead.
    const lossy = INTEGER.test(c.type) && FRACTIONAL.test(srcType.get(mapping[c.name]!) ?? '') ? ` OR ${src} <> trunc(${src})` : ''
    const shown = `left(CAST(${src} AS VARCHAR), 40)`
    parts.push(row('type', c.name, `${quoteString(`${c.name}: `)} || ${shown} || ${quoteString(` is not a valid ${c.type}`)}`, view, `${src} IS NOT NULL AND (${quoteIdent(c.name)} IS NULL${lossy})`))
    if (!c.nullable) parts.push(row('notnull', c.name, quoteString(`${c.name} is empty, but the column is NOT NULL`), view, `${src} IS NULL`))
  }

  const usable = (cols: string[]) => cols.every((c) => isMapped.has(c))
  for (const k of target.constraints) {
    if (k.kind === 'primary' || k.kind === 'unique') {
      if (!usable(k.columns)) continue
      const cols = k.columns.map(quoteIdent).join(', ')
      const label = k.columns.join(', ')
      const ranked = `(SELECT *, row_number() OVER (PARTITION BY ${cols} ORDER BY __row) AS __n, min(__row) OVER (PARTITION BY ${cols}) AS __first FROM ${view} WHERE ${allNotNull(k.columns)})`
      parts.push(row('duplicate', label, `${keyText(k.columns)} || ' repeats row ' || __first`, ranked, '__n > 1'))
      const on = k.columns.map((c) => `t.${quoteIdent(c)} = f.${quoteIdent(c)}`).join(' AND ')
      parts.push(
        `SELECT f.__row, 'exists' AS kind, ${quoteString(label)} AS col, ${keyText(k.columns, 'f.')} || ${quoteString(` is already in ${target.table}`)} AS message ` +
          `FROM ${view} f WHERE ${allNotNull(k.columns, 'f.')} AND EXISTS (SELECT 1 FROM ${quoteIdent(target.table)} t WHERE ${on})`,
      )
    } else if (k.kind === 'foreign') {
      if (!usable(k.columns)) continue
      const on = k.columns.map((c, j) => `r.${quoteIdent(k.refColumns[j] ?? c)} = f.${quoteIdent(c)}`).join(' AND ')
      // A table that refers to itself may point at rows of the same file.
      const self = k.refTable.toLowerCase() === target.table.toLowerCase()
        ? ` AND NOT EXISTS (SELECT 1 FROM ${view} r WHERE ${on})`
        : ''
      parts.push(
        `SELECT f.__row, 'foreign' AS kind, ${quoteString(k.columns.join(', '))} AS col, ${keyText(k.columns, 'f.')} || ${quoteString(` is not in ${k.refTable}`)} AS message ` +
          `FROM ${view} f WHERE ${allNotNull(k.columns, 'f.')} AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(k.refTable)} r WHERE ${on})${self}`,
      )
    } else {
      parts.push(row('check', '', quoteString(`fails CHECK ${k.expression}`), view, `NOT coalesce(${k.expression}, true)`))
    }
  }

  const cols = mapped.map((c) => quoteIdent(c.name)).join(', ')
  return {
    view: viewSql,
    problems: parts.join('\nUNION ALL\n') || `SELECT NULL::BIGINT AS __row, NULL AS kind, NULL AS col, NULL AS message WHERE false`,
    insert: (skip) =>
      `INSERT INTO ${quoteIdent(target.table)} (${cols}) SELECT ${cols} FROM ${view}` +
      (skip ? ` WHERE __row NOT IN (SELECT __row FROM ${skip})` : '') +
      ' ORDER BY __row',
  }
}
