// Practice tasks (stage 5): the user's result next to the reference one, and what differs,
// said the way a teacher would ("3 rows too many: is a filter missing?"). Column names don't
// matter (only their number and, when the names match, their order); numbers are compared to
// as many decimals as the reference shows, at most 2, so 57.8346 is right where 57.83 is
// expected; a midnight timestamp counts as its date.

export type Cell = string | number | null

export interface ResultData {
  header: string[]
  rows: Cell[][]
}

export type Verdict =
  | { ok: true; rows: number }
  | { ok: false; problem: 'columns'; got: number; expected: number; expectedHeader: string[] }
  | { ok: false; problem: 'rows'; got: number; expected: number }
  | { ok: false; problem: 'values'; wrong: number; expected: number; missing: Cell[] | null; extra: Cell[] | null }
  | { ok: false; problem: 'order' }

const NUMERIC = /^-?\d+(\.\d+)?$/
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2}) 00:00:00(\.0+)?$/

const asNumber = (v: Cell): number | null => (typeof v === 'number' ? v : typeof v === 'string' && NUMERIC.test(v.trim()) ? Number(v) : null)
const decimals = (n: number) => {
  const s = String(n)
  return s.includes('e') ? 2 : s.includes('.') ? s.length - s.indexOf('.') - 1 : 0
}

/** How each reference column is compared: as numbers to some decimals, or as text. */
function columnRules(expected: ResultData): (number | null)[] {
  return expected.header.map((_, j) => {
    const values = expected.rows.map((r) => r[j]).filter((v) => v != null)
    if (!values.length || values.some((v) => asNumber(v) == null)) return null
    return Math.min(2, Math.max(...values.map((v) => decimals(asNumber(v)!))))
  })
}

/** A cell as the text it is compared by. */
function key(v: Cell, rule: number | null): string {
  if (v == null) return 'NULL'
  if (rule != null) {
    const n = asNumber(v)
    if (n != null) {
      // Whole numbers expected: 5.4 is not 5. Otherwise round to the reference's decimals.
      const fixed = rule === 0 ? String(Number(n.toFixed(6))) : n.toFixed(rule)
      return fixed === '-0' || /^-0\.0+$/.test(fixed) ? fixed.slice(1) : fixed
    }
  }
  const s = String(v)
  const m = MIDNIGHT.exec(s)
  return m ? m[1] : s
}

/** The user's columns in the reference's order when the names say so, else as they are. */
function alignColumns(got: ResultData, expected: ResultData): Cell[][] {
  const names = got.header.map((h) => h.toLowerCase())
  const want = expected.header.map((h) => h.toLowerCase())
  const order = want.map((w) => names.indexOf(w))
  if (order.some((i) => i < 0) || new Set(order).size !== order.length) return got.rows
  return got.rows.map((r) => order.map((i) => r[i]))
}

/** Compares a result with the reference; `ordered` when the task asks for a sort order. */
export function compareResults(got: ResultData, expected: ResultData, ordered: boolean): Verdict {
  if (got.header.length !== expected.header.length)
    return { ok: false, problem: 'columns', got: got.header.length, expected: expected.header.length, expectedHeader: expected.header }
  if (got.rows.length !== expected.rows.length) return { ok: false, problem: 'rows', got: got.rows.length, expected: expected.rows.length }
  const rules = columnRules(expected)
  const rowKey = (r: Cell[]) => JSON.stringify(r.map((v, j) => key(v, rules[j])))
  const mine = alignColumns(got, expected)
  const gotKeys = mine.map(rowKey)
  const wantKeys = expected.rows.map(rowKey)

  // Rows as a multiset: which reference rows are missing, which of the user's are extra.
  const left = new Map<string, number>()
  for (const k of gotKeys) left.set(k, (left.get(k) ?? 0) + 1)
  let missing: Cell[] | null = null
  let wrong = 0
  wantKeys.forEach((k, i) => {
    const n = left.get(k) ?? 0
    if (n > 0) left.set(k, n - 1)
    else {
      wrong++
      missing ??= expected.rows[i]
    }
  })
  if (wrong > 0) {
    const extraAt = gotKeys.findIndex((k) => (left.get(k) ?? 0) > 0)
    return { ok: false, problem: 'values', wrong, expected: expected.rows.length, missing, extra: extraAt >= 0 ? mine[extraAt] : null }
  }
  if (ordered && gotKeys.some((k, i) => k !== wantKeys[i])) return { ok: false, problem: 'order' }
  return { ok: true, rows: expected.rows.length }
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
const showRow = (r: Cell[]) => r.map((v) => (v == null ? 'NULL' : String(v))).join(' · ')

/** What to tell the user about a verdict: a headline and a nudge. */
export function describeVerdict(v: Verdict): { title: string; detail: string } {
  if (v.ok) return { title: 'Correct!', detail: `All ${plural(v.rows, 'row')} match the answer.` }
  switch (v.problem) {
    case 'columns':
      return {
        title: `${plural(v.got, 'column')}, the answer has ${v.expected}`,
        detail: `The answer's columns: ${v.expectedHeader.join(', ')}. Names don't have to match, but their number and meaning do.`,
      }
    case 'rows':
      return v.got > v.expected
        ? { title: `${plural(v.got, 'row')}, the answer has ${v.expected}`, detail: 'Too many rows: is a filter (WHERE) missing, or are you grouping by more columns than asked, or did a JOIN repeat rows?' }
        : { title: `${plural(v.got, 'row')}, the answer has ${v.expected}`, detail: 'Too few rows: is a filter too strict, or does an INNER JOIN drop rows that have no match, or is a LIMIT left over?' }
    case 'values':
      return {
        title: `${v.wrong} of ${plural(v.expected, 'row')} differ`,
        detail: [
          v.missing && `Expected a row like: ${showRow(v.missing)}.`,
          v.extra && `Yours has: ${showRow(v.extra)}.`,
          'Check the filters and what is summed or counted.',
        ]
          .filter(Boolean)
          .join(' '),
      }
    case 'order':
      return { title: 'Right rows, wrong order', detail: 'The task asks for a sort order: check ORDER BY (and DESC).' }
  }
}
