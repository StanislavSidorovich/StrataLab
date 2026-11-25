// Fill-the-gaps questions of lesson mode (plan items `f<n>`, v0.74): a query with 1 to 3 gaps (`___`) that the phones fill by choosing
// words from a bank (tap or drag) or by typing. Pure: how an answer is compared, what a phone may send, and what the projector shows
// from the room's counts. The store is `supabase/0003_lesson_fill.sql`; the calls are in voteApi.ts.

/** What stands for a gap in a template. */
export const FILL_GAP = '___'
export const FILL_MAX_GAPS = 3
/** The longest answer for one gap (the server holds the same cap). */
export const FILL_MAX_LEN = 30

/** The template cut at its gaps: `parts.length - 1` gaps, text before, between and after them. */
export const splitTemplate = (template: string): string[] => template.split(FILL_GAP)
export const gapCount = (template: string): number => splitTemplate(template).length - 1

/**
 * An answer made comparable: trimmed, spaces and line breaks collapsed to one space, lower case, a trailing `;` dropped (the
 * template's own `;` stays outside the gap, but a student may type one). `group  by` = `GROUP BY` = ` group by;`.
 */
export const normalizeAnswer = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s;]+$/, '')
    .trim()

/** What a phone sends for one gap: trimmed, runs of spaces collapsed; the case is kept (the projector shows what was typed). */
export const cleanAnswer = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** An answer a phone may send: 1 to FILL_MAX_LEN characters once cleaned. */
export const answerValid = (s: string): boolean => {
  const c = cleanAnswer(s)
  return c.length >= 1 && c.length <= FILL_MAX_LEN
}

/** Answers for every gap, cleaned, or null when the count is not 1..3 or a gap is empty or too long. */
export function answersToSend(raw: readonly string[]): string[] | null {
  if (raw.length < 1 || raw.length > FILL_MAX_GAPS || !raw.every((a) => typeof a === 'string' && answerValid(a))) return null
  return raw.map(cleanAnswer)
}

/** Is `answer` one of the accepted spellings of a gap (compared by normalizeAnswer)? An empty answer is never right. */
export function matchesGap(accepted: readonly string[], answer: string): boolean {
  const a = normalizeAnswer(answer)
  return a !== '' && accepted.some((x) => normalizeAnswer(x) === a)
}

/** Right or wrong for each gap; a missing answer is wrong. */
export const checkAnswers = (accepted: readonly (readonly string[])[], answers: readonly string[]): boolean[] => accepted.map((acc, i) => matchesGap(acc, answers[i] ?? ''))

export const allRight = (accepted: readonly (readonly string[])[], answers: readonly string[]): boolean => answers.length === accepted.length && checkAnswers(accepted, answers).every(Boolean)

/** The template with every gap filled; a gap left out keeps its `___`. */
export function fillQuery(template: string, answers: readonly string[]): string {
  const parts = splitTemplate(template)
  return parts.map((p, i) => (i < parts.length - 1 ? p + (answers[i] ?? FILL_GAP) : p)).join('')
}

/** The query a question's right answers give (the first accepted spelling of each gap). */
export const rightQuery = (template: string, accepted: readonly (readonly string[])[]): string => fillQuery(template, accepted.map((a) => a[0]))

// ------------------------------------------------------------------ what the server tells

/** One distinct answer set and how many phones sent it: `lesson_fill_read` gives `[{q_key, answers, sample, n}]`. */
export interface FillRow {
  q_key: string
  /** normalised, one per gap */
  answers: string[]
  /** as one phone typed it */
  sample: string[]
  n: number
}

/** The server's rows made safe: null when it is not that shape; rows with a bad shape are dropped. */
export function parseFillRows(raw: unknown): FillRow[] | null {
  if (!Array.isArray(raw)) return null
  const out: FillRow[] = []
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>
    const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.length >= 1 && v.length <= FILL_MAX_GAPS && v.every((x) => typeof x === 'string') ? (v as string[]) : null)
    const answers = strings(o.answers)
    const sample = strings(o.sample) ?? answers
    const n = typeof o.n === 'number' && Number.isFinite(o.n) && o.n > 0 ? Math.floor(o.n) : 0
    if (typeof o.q_key === 'string' && o.q_key && answers && sample && sample.length === answers.length && n > 0) out.push({ q_key: o.q_key, answers, sample, n })
  }
  return out
}

export interface WrongAnswer {
  /** as a phone typed it (the first one seen) */
  text: string
  n: number
  /** whole percent of all phones that answered */
  pct: number
}

export interface GapStat {
  /** whole percent of the phones whose answer for this gap is right; null while nobody answered */
  rightPct: number | null
  right: number
  /** the most common wrong answer; null when every answer was right (or none) */
  wrong: WrongAnswer | null
}

export interface FillStats {
  /** phones that answered */
  total: number
  fully: number
  /** whole percent of phones with every gap right; null while nobody answered (no division by 0) */
  fullyPct: number | null
  gaps: GapStat[]
}

const pct = (n: number, total: number): number => Math.round((n / total) * 100)

/** What the projector shows after Reveal: the share fully right, the share right per gap and the most common wrong answer per gap. */
export function fillStats(accepted: readonly (readonly string[])[], rows: readonly FillRow[]): FillStats {
  const used = rows.filter((r) => r.answers.length === accepted.length)
  const total = used.reduce((a, r) => a + r.n, 0)
  const fully = used.reduce((a, r) => a + (allRight(accepted, r.answers) ? r.n : 0), 0)
  const gaps = accepted.map((acc, g): GapStat => {
    let right = 0
    const wrong = new Map<string, { text: string; n: number }>()
    for (const r of used) {
      if (matchesGap(acc, r.answers[g])) right += r.n
      else {
        const k = normalizeAnswer(r.answers[g])
        const have = wrong.get(k)
        if (have) have.n += r.n
        else wrong.set(k, { text: r.sample[g], n: r.n })
      }
    }
    const top = [...wrong.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))[0]
    return { rightPct: total ? pct(right, total) : null, right, wrong: top && total ? { text: top[1].text, n: top[1].n, pct: pct(top[1].n, total) } : null }
  })
  return { total, fully, fullyPct: total ? pct(fully, total) : null, gaps }
}

/** "1 phone answered", "38 phones answered". */
export const answeredText = (n: number): string => `${n.toLocaleString('en-US')} phone${n === 1 ? '' : 's'} answered`

/** The line for one gap's most common wrong answer: `38% put WHERE`. */
export const wrongText = (w: WrongAnswer): string => `${w.pct}% put ${w.text}`

// ------------------------------------------------------------------ the questions as plan items

/** The question as a phone knows it by its key (`f1`): no answers in here, the phone bundle must not carry them. */
export interface FillQuestion {
  id: string
  mode: 'choose' | 'type'
  topic: string
  level: 'easy' | 'medium' | 'tricky'
  /** one sentence: what the query is for */
  question: string
  /** the query with `___` for each gap */
  template: string
  /** the words to choose from, distractors included, in the order shown (choose only) */
  bank?: string[]
}

/** `f3` → 3; null when the key is not a fill question's. */
export const fillNumber = (key: string | null | undefined): number | null => {
  const m = /^f(\d{1,4})$/.exec(key ?? '')
  return m ? Number(m[1]) : null
}
