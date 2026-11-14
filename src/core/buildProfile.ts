// The column profile of Clean (design docs/clean-canvas-design.md, 1.4 and 3): per column of the table after one step, how many
// values are valid, [Error] or empty, how many distinct, and for text how many are the same after trim + upper (spellings) or padded.
// Pure: the SQL is written here, the engine part is `profileAt` in src/db/buildRun.ts.
import { typeFamily } from './buildLinks'
import { CLEAN_COLUMNS, chainCtes, type Step } from './buildSteps'
import type { BuildSourceId } from '../data/build/kaiyoSales'

/** The columns Change type can leave NULL on a value that was there in the file (sales only; same list as ERROR_COLUMNS in src/db/buildRun.ts). */
const ERROR_COLS: readonly string[] = ['sale_date', 'units', 'revenue']

export interface ColumnProfile {
  col: string
  family: 'text' | 'number' | 'date' | 'other'
  /** rows */
  n: number
  nonNull: number
  distinct: number
  /** distinct after upper(trim()); text only, else equal to `distinct` */
  distinctNorm: number
  /** text values with a space at an edge */
  padded: number
  /** text values that are not in capitals (c <> upper(c)); text only */
  lowered: number
  /** text values that are '' */
  blank: number
  /** text values with a digit and something else (R-03); text only */
  mixedDigits: number
  /** cells that are NULL now and were there in the file: a typing step could not read them */
  errors: number
  /** NULL or '' that no typing step caused */
  empty: number
  /** n - errors - empty */
  valid: number
}

const nameOf = (i: number) => (i === 0 ? 'bronze' : `step${i}`)

/**
 * One row per column over the table after step `at` (0 = bronze), UNION ALL, chain CTEs on top. `families` are the type families of that
 * table's columns (typesAtSql), so text-only measures are asked of text only. Errors (sales, from step 1 on): NULL in this table and
 * not NULL in the file, matched by raw_id, which is what the grid's [Error] cells mean.
 */
export function profileSql(source: BuildSourceId, steps: readonly Step[], at: number, families: readonly ReturnType<typeof typeFamily>[]): string {
  const cols = CLEAN_COLUMNS[source]
  const from = nameOf(at)
  const parts = cols.map((c, j) => {
    const text = families[j] === 'text'
    const err =
      source === 'sales' && at > 0 && ERROR_COLS.includes(c)
        ? `(SELECT count(*) FROM ${from} a JOIN bronze b ON CAST(b.raw_id AS INTEGER) = CAST(a.raw_id AS INTEGER) WHERE a.${c} IS NULL AND b.${c} IS NOT NULL)`
        : '0'
    return `SELECT '${c}' AS col, count(*) AS n, count(${c}) AS non_null, count(DISTINCT ${c}) AS distinct_n,
  ${text ? `count(DISTINCT upper(trim(${c})))` : `count(DISTINCT ${c})`} AS distinct_norm,
  ${text ? `count(*) FILTER (WHERE ${c} <> trim(${c}))` : '0'} AS padded,
  ${text ? `count(*) FILTER (WHERE ${c} <> upper(${c}))` : '0'} AS lowered,
  ${text ? `count(*) FILTER (WHERE ${c} = '')` : '0'} AS blank,
  ${text ? `count(*) FILTER (WHERE regexp_matches(${c}, '[0-9]') AND regexp_matches(${c}, '[^0-9]'))` : '0'} AS mixed_digits,
  ${err} AS errors
FROM ${from}`
  })
  return `${chainCtes(source, steps)}\n${parts.join('\nUNION ALL\n')}`
}

/** Rows of the profile query to profiles, in the order of the source's columns. `empty` and `valid` come from the counts. */
export function readProfile(source: BuildSourceId, rows: readonly (readonly unknown[])[], families: readonly ReturnType<typeof typeFamily>[]): ColumnProfile[] {
  return CLEAN_COLUMNS[source].map((col, j) => {
    const r = rows.find((x) => String(x[0]) === col) ?? []
    const [n, nonNull, distinct, distinctNorm, padded, lowered, blank, mixedDigits, errors] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => Number(r[k] ?? 0))
    const empty = n - nonNull - errors + blank
    return { col, family: families[j] ?? 'other', n, nonNull, distinct, distinctNorm, padded, lowered, blank, mixedDigits, errors, empty, valid: n - errors - empty }
  })
}

/** Extract number applies to the region ids written as R-03 (P7); no other column of v1. */
export const extractApplies = (source: BuildSourceId, col: string) => source === 'regions' && col === 'region_id'

/** The short hints under a column's bar: the spellings, the edge spaces, the digits inside text. Empty when none applies. */
export function profileHints(source: BuildSourceId, p: ColumnProfile): { text: string; title: string }[] {
  const out: { text: string; title: string }[] = []
  if (p.family !== 'text') return out
  if (p.distinct > p.distinctNorm) {
    const extra = p.distinct - p.distinctNorm
    out.push({ text: `${extra} extra ${extra === 1 ? 'spelling' : 'spellings'}`, title: `${p.distinct} distinct values, ${p.distinctNorm} after trim and UPPERCASE: ${extra} of them are the same value written another way` })
  }
  if (/_code$/.test(p.col) && p.lowered > 0) out.push({ text: `${p.lowered} in lowercase`, title: `${p.lowered} values have lowercase letters; a code is written in capitals` })
  if (p.padded > 0) out.push({ text: 'leading/trailing spaces', title: `${p.padded} values have a space at the start or the end` })
  if (extractApplies(source, p.col) && p.nonNull > 0 && p.mixedDigits === p.nonNull) out.push({ text: 'digits inside text', title: `${p.mixedDigits} values hold a number inside text, like R-03` })
  return out
}

/** "97%"; "<1%" for a small non-zero share, so a real error never reads as 0. */
export function pct(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%'
  const x = (part / total) * 100
  return x < 1 ? '<1%' : x > 99 && part < total ? '>99%' : `${Math.round(x)}%`
}

/**
 * The first rows of the sales after step `at` (1 or more) with, after the columns, one 0/1 flag per column of ERROR_COLS: the cell is NULL
 * here and was there in the file ([Error]). The grid tints those cells at any step, not only the latest.
 */
export function previewErrorsAtSql(steps: readonly Step[], at: number, limit: number): string {
  const cols = CLEAN_COLUMNS.sales
  return `${chainCtes('sales', steps)}
SELECT ${cols.map((c) => `a.${c}`).join(', ')}, ${ERROR_COLS.map((c) => `CAST(a.${c} IS NULL AND b.${c} IS NOT NULL AS INTEGER)`).join(', ')}
FROM ${nameOf(at)} a LEFT JOIN bronze b ON CAST(b.raw_id AS INTEGER) = CAST(a.raw_id AS INTEGER)
ORDER BY a.raw_id LIMIT ${limit}`
}

export const ERROR_COLUMN_LIST = ERROR_COLS
