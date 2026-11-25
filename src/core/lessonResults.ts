// The results slide of a lesson plan (plan item `r`): for every vote of the plan, how many answered and how many were right.
// Counts come from the phones (the room's summary) or from the hands the teacher typed; phones win when both exist. Pure.
import { LETTERS, parseCount, type Letter } from './lesson'
import { allRight, type FillRow } from './lessonFill'
import { emptyCounts, type Counts } from './voting'

/** One vote of the plan, as the slide knows it before any count. */
export interface ResultItem {
  /** 1-based position in the plan (the "Step n") */
  step: number
  /** the plan item as written: w3, v2 */
  key: string
  /** what the question says, short */
  text: string
  /** the letter that is right (a vote) */
  right?: Letter
  /** a fill question: the accepted spellings of every gap; "right" then means every gap right */
  fill?: readonly (readonly string[])[]
}

export type ResultSource = 'phones' | 'hands'

export interface ResultRow extends ResultItem {
  /** null: nothing was counted */
  counts: Counts | null
  total: number
  /** whole percent of the counted who chose the right letter; null when nothing was counted */
  rightPct: number | null
  source: ResultSource | null
}

const sum = (c: Counts): number => LETTERS.reduce((a, l) => a + c[l], 0)

/** The typed hand counts of an item as counts, or null when none was typed (all four empty or zero). */
export function handsToCounts(raw: readonly (string | undefined)[] | undefined): Counts | null {
  if (!raw) return null
  const c = emptyCounts()
  for (let i = 0; i < 4; i++) c[LETTERS[i]] = parseCount(raw[i])
  return sum(c) > 0 ? c : null
}

/** The slide's rows: phones if they counted anyone, else hands if any were typed, else "not counted". */
export function computeResults(
  items: readonly ResultItem[],
  phones: Readonly<Record<string, Counts>> | null | undefined,
  hands: Readonly<Record<string, readonly (string | undefined)[]>> | null | undefined,
  fills?: Readonly<Record<string, readonly FillRow[]>> | null,
): ResultRow[] {
  return items.map((it) => {
    if (it.fill) {
      // a fill question has phones only (no hands): the share of phones with every gap right
      const rows = (fills?.[it.key] ?? []).filter((r) => r.answers.length === it.fill!.length)
      const total = rows.reduce((a, r) => a + r.n, 0)
      const fully = rows.reduce((a, r) => a + (allRight(it.fill!, r.answers) ? r.n : 0), 0)
      return { ...it, counts: null, total, rightPct: total > 0 ? Math.round((fully / total) * 100) : null, source: total > 0 ? 'phones' : null }
    }
    const p = phones?.[it.key]
    const h = handsToCounts(hands?.[it.key])
    let counts: Counts | null = null
    let source: ResultSource | null = null
    if (p && sum(p) > 0) {
      counts = p
      source = 'phones'
    } else if (h) {
      counts = h
      source = 'hands'
    }
    const total = counts ? sum(counts) : 0
    return { ...it, counts, total, rightPct: counts && total > 0 && it.right ? Math.round((counts[it.right] / total) * 100) : null, source }
  })
}

/** The unit next to the count on the results slide: "1 phone", "2 phones", "1 hand", "3 hands". */
export const sourceText = (total: number, source: ResultSource | null): string => (source === 'hands' ? (total === 1 ? 'hand' : 'hands') : total === 1 ? 'phone' : 'phones')

/** The first `max` characters of a question as plain text: no backticks, one line, an ellipsis when cut. */
export function shortText(s: string, max = 80): string {
  const t = s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

// ------------------------------------------------------------------ typed hand counts kept for the lesson (sessionStorage)

export const HANDS_KEY = 'stratalab.lesson.hands.v1'
export type HandsStore = Record<string, Record<string, string[]>>

/** What was kept, read back safely: `{lesson scope: {item key: [A, B, C, D]}}`. */
export function readHands(raw: string | null): HandsStore {
  try {
    const p = raw ? JSON.parse(raw) : null
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
    const out: HandsStore = {}
    for (const [scope, items] of Object.entries(p as Record<string, unknown>)) {
      if (!items || typeof items !== 'object' || Array.isArray(items)) continue
      out[scope] = {}
      for (const [k, v] of Object.entries(items as Record<string, unknown>)) if (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'string')) out[scope][k] = v as string[]
    }
    return out
  } catch {
    return {}
  }
}
