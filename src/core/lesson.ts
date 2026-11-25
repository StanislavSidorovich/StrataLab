// Lesson mode for a teacher (`#lesson=sql&set=inner-join&task=3`, `#lesson=sql&set=inner-join&mode=vote&q=1`,
// `#lesson=sql&set=warmup&q=5`, `#lesson=sql&plan=w3,w7,v2,t:inner-join:4`): the address, the tables a task names, how a
// vote's four queries are shuffled, the warm-up options, hand counts and the lesson plan. Pure. Hidden: no menu or page links to it.
//
// Plan link: `#lesson=sql&plan=<item>,<item>,…&i=<position>`. Items, in the order they are shown:
//   w<n>               warm-up question n          (w3)
//   v<n>               vote on code, question n of the INNER JOIN set (v2); `v:<set>:<n>` for another set
//   t:<section>:<n>    write-code task n of a practice section (t:inner-join:4)
//   d<n>               vote on the demo shop (schema `demo`: customers, products, orders, order_items), question n (d3); for a class
//                      that knows no business terms. Same four-option shape as a warm-up. f<n> fill the gaps of a query on the demo shop (f1). Prefixes in use: w v t s r d f
//   s                  the schema slide: the tables the plan's items use, their keys and links
//   r                  the results slide: every vote of the plan with its votes and the share who were right
// A plan value that is a name in PLAN_PRESETS (`plan=intro`) stands for that list of items.
// `i` is the 1-based position being shown (absent = 1). Duplicates are dropped, at most PLAN_MAX (20) items are used, an item
// that does not exist is skipped and named on the page. `set=…&mode=vote&q=N` links keep working on their own.
import type { PracticeSection, PracticeTables, PracticeTaskCell } from '../data/practiceBook'
import { tasksOf } from '../data/practiceBook'

export type LessonKind = 'sql' | 'python'
export interface LessonRoute {
  kind: LessonKind
  /** section id as written (lower case); null when not given */
  set: string | null
  mode: 'task' | 'vote'
  /** 1-based, as written: not yet clamped (a number, NaN when not a number, null when absent) */
  n: number | null
}

/** The set id of the warm-up questions: a set numbered by `q`, like a vote. */
export const WARMUP_SET = 'warmup'

/** The question keys of the demo shop plan (`d3`, `f1`, and its schema slide `s:shop`): what tells a phone to list the demo tables, not Kaiyo's. */
export const isShopKey = (key: string | null | undefined): boolean => !!key && /^(?:d\d{1,4}|f\d{1,4}|s:shop)$/.test(key)

const param = (hash: string, name: string) => new RegExp(`(?:^#|&)${name}=([^&]*)`, 'i').exec(hash)?.[1]

/** The lesson asked for in the address; null when the address is not a lesson (other Lab links are parsed as before). */
export function lessonFromHash(hash: string): LessonRoute | null {
  const kind = param(hash, 'lesson')?.toLowerCase()
  if (kind !== 'sql' && kind !== 'python') return null
  const set = param(hash, 'set')?.toLowerCase() || null
  const mode = param(hash, 'mode')?.toLowerCase() === 'vote' || set === WARMUP_SET ? 'vote' : 'task'
  const rawN = param(hash, mode === 'vote' ? 'q' : 'task')
  return { kind, set, mode, n: rawN === undefined ? null : Number(rawN.trim() === '' ? NaN : rawN) }
}

/** A 1-based position held to 1..count: a missing, non-numeric or too small number is 1, a too large one the last. */
export function clampIndex(n: number | null, count: number): number {
  if (count <= 0) return 1
  if (n === null || !Number.isFinite(n)) return 1
  return Math.min(count, Math.max(1, Math.trunc(n)))
}

const LESSON_KEYS = /^(lesson|set|task|mode|q|plan|i)=/i

export function hashWithoutLesson(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !LESSON_KEYS.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

/** The address of a lesson page; other parts of the hash stay after it. */
export function lessonHash(hash: string, r: { kind: LessonKind; set?: string | null; mode?: 'task' | 'vote'; n?: number | null }): string {
  const rest = hashWithoutLesson(hash).replace(/^#/, '')
  const parts = [`lesson=${r.kind}`]
  if (r.set) parts.push(`set=${r.set}`)
  if (r.mode === 'vote') parts.push('mode=vote')
  if (r.n != null) parts.push(`${r.mode === 'vote' ? 'q' : 'task'}=${r.n}`)
  return '#' + parts.join('&') + (rest ? `&${rest}` : '')
}

/** Tables a query names after FROM or JOIN, in order, once each, kept to those that exist. */
export function tablesNamed(sql: string, known: readonly string[]): string[] {
  const code = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const out: string[] = []
  for (const m of code.matchAll(/\b(?:from|join)\s+(?:(?:quaera|demo)\.)?"?([a-z_]\w*)"?/gi)) {
    const name = m[1].toLowerCase()
    if (known.includes(name) && !out.includes(name)) out.push(name)
  }
  return out
}

export type LessonTable = PracticeTables['tables'][number]

/** What a task's tables show on the slide: name, what a row is, columns, and the key (the first column of the table). */
export function lessonTables(task: PracticeTaskCell, all: readonly LessonTable[]): (LessonTable & { key: string })[] {
  return tablesNamed(task.solution, all.map((t) => t.name))
    .map((n) => all.find((t) => t.name === n)!)
    .map((t) => ({ ...t, key: t.columns[0] }))
}

/** The sections that have tasks, for the list shown when a set is unknown. */
export const lessonSections = (sections: readonly PracticeSection[]) => sections.filter((s) => tasksOf(s).length > 0)

export const LETTERS = ['A', 'B', 'C', 'D'] as const
export type Letter = (typeof LETTERS)[number]

export interface VoteQuestion {
  /** the task of the section it is built on */
  taskId: string
  question: string
  /** the right query first, then the three wrong ones; shuffled for the slide by `arrange` */
  right: string
  wrong: [string, string, string]
  /** one or two sentences after Reveal */
  why: string
}

/** The four queries in a fixed order that differs from question to question: the right one lands on A, B, C or D by `index`, never random. */
export function arrange(q: VoteQuestion, index: number): { letter: Letter; sql: string; right: boolean }[] {
  const place = (index * 3 + 1) % 4 // index 0 → B, 1 → A, 2 → D, 3 → C, ...
  const all = [...q.wrong]
  all.splice(place, 0, q.right)
  return all.map((sql, i) => ({ letter: LETTERS[i], sql, right: i === place }))
}

const shown = (v: unknown): string => (v == null ? 'NULL' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 })) : String(v))

/** One line on what a query gave, from its result: the number of rows and the first rows' values ("4 rows: ecom · 61,799,300; …"). */
export function describeRun(r: { header: string[]; rows: (string | number | null)[][] }, firstRows = 3, more = false): string {
  const n = r.rows.length
  if (n === 0) return '0 rows.' // an empty result may come without its columns
  const head = r.rows.slice(0, firstRows).map((row) => row.slice(0, 3).map(shown).join(' · '))
  return `${n.toLocaleString('en-US')}${more ? '+' : ''} row${n === 1 ? '' : 's'}: ${head.join('; ')}${n > firstRows ? '; …' : ''}`
}

/** The first line of an error, without the engine's JSON wrapper (see readableError). */
export const errorLine = (message: string): string => message.split('\n')[0].trim()

// ------------------------------------------------------------------ warm-up questions and clickable options

export type Level = 'easy' | 'medium' | 'tricky'
export const LEVELS: readonly Level[] = ['easy', 'medium', 'tricky']

export interface WarmOption {
  /** what the slide shows; may hold `code` in backticks */
  text: string
  /** the query that shows this choice: clicking the option runs it. None when the option is not a query. */
  sql?: string
  /** after Reveal: why it is tempting and what is wrong, or why it is right */
  why: string
  /** what SQL Server says when this option's query fails (short, only when known for sure); shown after DuckDB's own error */
  mssql?: string
}

export interface WarmQuestion {
  id: string
  topic: string
  level: Level
  question: string
  /** four options, A to D in this order */
  options: WarmOption[]
  /** index of the right option */
  right: number
  why: string
  /** the right option's query is meant to give no rows (NOT IN with a NULL) */
  empty?: boolean
}

/** What one option looks like on the slide, for the warm-up and for the vote on code alike. */
export interface QuizOption {
  letter: Letter
  text: string
  /** the text is code (a vote option) and is shown as such */
  code: boolean
  sql?: string
  why?: string
  mssql?: string
  right: boolean
}

/** An option that is a bit of SQL (`WHERE`, `COUNT(*)`, `s.id IS NULL`, `TOP (5) alone`) is set in the code font; a sentence is not. */
export const looksLikeCode = (text: string): boolean =>
  /^[A-Z][A-Z ]*( \(.*\))?$/.test(text) || /^(COUNT|SUM|SELECT|TOP \(|NOT (IN|EXISTS)|<> ANY|FULL |LEFT |RIGHT |INNER |CROSS )/.test(text) || /^[a-z_][\w.]*\s*(=|==|<>|IS)\s/.test(text)

export const warmOptions = (q: WarmQuestion): QuizOption[] => q.options.map((o, i) => ({ letter: LETTERS[i], text: o.text, code: looksLikeCode(o.text), sql: o.sql, why: o.why, mssql: o.mssql, right: i === q.right }))

export const voteOptions = (q: VoteQuestion, index: number): QuizOption[] => arrange(q, index).map((o) => ({ letter: o.letter, text: o.sql, code: true, sql: o.sql, right: o.right }))

/** The rows of a clicked option's result that the slide shows. */
export const PICK_ROWS = 10

// ------------------------------------------------------------------ hand counts

export interface HandShare {
  letter: Letter
  count: number
  /** whole percent of all counted votes */
  pct: number
}

/** A typed count: a whole number from 0 up; empty, negative, decimal or text counts as 0, and a huge number is held to a million. */
export function parseCount(raw: string | undefined): number {
  const t = (raw ?? '').trim()
  return /^\d{1,9}$/.test(t) ? Math.min(1_000_000, Number(t)) : 0
}

/** The four typed counts as shares of the total, or null when no vote was counted (nothing to draw, no division by 0). */
export function handShares(raw: readonly (string | undefined)[]): HandShare[] | null {
  const counts = LETTERS.map((_, i) => parseCount(raw[i]))
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return LETTERS.map((letter, i) => ({ letter, count: counts[i], pct: Math.round((counts[i] / total) * 100) }))
}

// ------------------------------------------------------------------ the lesson plan

export const PLAN_MAX = 20
export const VOTE_DEFAULT_SET = 'inner-join'

export type PlanItem = { kind: 'w'; n: number } | { kind: 'd'; n: number } | { kind: 'f'; n: number } | { kind: 'v'; set: string; n: number } | { kind: 't'; set: string; n: number } | { kind: 's' } | { kind: 'r' }

/**
 * Named plans: `#lesson=sql&plan=intro`. `intro` is the first lesson for a class that has not seen the Kaiyo tables: the schema, six
 * votes from easy to medium on at most one fact table (w1 WHERE vs HAVING; w6 INNER JOIN; v1 join on the right key; w5 LEFT JOIN;
 * w9 ON vs WHERE in a LEFT JOIN; v2 two conditions across a join), the results, and one plain write-code task (where: Yellow tag promotions).
 */
export const PLAN_PRESETS: Record<string, string> = {
  intro: 's,w1,w6,v1,w5,w9,v2,r,t:where:1',
  // `shop`: the same flow on the small demo shop (customers, orders, products), for a class that knows no business terms.
  shop: 's,d1,d2,d3,d4,d5,d6,f1,f2,r',
}

/** The same text the teacher's header shows: "Step 3 of 8". */
export const stepLabel = (at: number, count: number): string => `Step ${at} of ${count}`

/** The questions a plan can be voted on: warm-ups and votes on code (the items that have four options). */
export const isVoteItem = (it: PlanItem): it is Extract<PlanItem, { kind: 'w' | 'v' | 'd' }> => it.kind === 'w' || it.kind === 'v' || it.kind === 'd'

/** The items the room can ask the phones: votes (a letter) and fill questions (words). */
export const isRoomItem = (it: PlanItem): it is Extract<PlanItem, { kind: 'w' | 'v' | 'd' | 'f' }> => isVoteItem(it) || it.kind === 'f'

/** The item as written in a plan link. */
export function planKey(it: PlanItem): string {
  if (it.kind === 's' || it.kind === 'r') return it.kind
  if (it.kind === 'w') return `w${it.n}`
  if (it.kind === 'd') return `d${it.n}`
  if (it.kind === 'f') return `f${it.n}`
  if (it.kind === 'v') return it.set === VOTE_DEFAULT_SET ? `v${it.n}` : `v:${it.set}:${it.n}`
  return `t:${it.set}:${it.n}`
}

function parseItem(raw: string): PlanItem | null {
  if (raw === 's' || raw === 'r') return { kind: raw }
  let m = /^w(\d{1,4})$/.exec(raw)
  if (m) return { kind: 'w', n: Number(m[1]) }
  m = /^d(\d{1,4})$/.exec(raw)
  if (m) return { kind: 'd', n: Number(m[1]) }
  m = /^f(\d{1,4})$/.exec(raw)
  if (m) return { kind: 'f', n: Number(m[1]) }
  m = /^v(\d{1,4})$/.exec(raw)
  if (m) return { kind: 'v', set: VOTE_DEFAULT_SET, n: Number(m[1]) }
  m = /^([vt]):([a-z0-9-]{1,40}):(\d{1,4})$/.exec(raw)
  if (m) return { kind: m[1] as 'v' | 't', set: m[2], n: Number(m[3]) }
  return null
}

/** The items of a plan value, in order, without repeats; what could not be read comes back as `bad`. */
export function parsePlan(raw: string | null | undefined): { items: PlanItem[]; bad: string[] } {
  const items: PlanItem[] = []
  const bad: string[] = []
  const seen = new Set<string>()
  const name = (raw ?? '').trim().toLowerCase()
  for (const part of (Object.hasOwn(PLAN_PRESETS, name) ? PLAN_PRESETS[name] : (raw ?? '')).split(',')) {
    const t = part.trim().toLowerCase()
    if (!t) continue
    const it = parseItem(t)
    if (!it || ('n' in it && it.n < 1)) {
      if (!bad.includes(t)) bad.push(t)
      continue
    }
    const k = planKey(it)
    if (!seen.has(k)) {
      seen.add(k)
      items.push(it)
    }
  }
  return { items, bad }
}

/** What exists: the number of warm-up questions and, by section id, of vote questions and of tasks. */
export interface PlanCatalog {
  warm: number
  /** demo shop votes (d1, d2, ...) */
  shop?: number
  /** fill-the-gaps questions (f1, ...) */
  fill?: number
  votes: Record<string, number>
  tasks: Record<string, number>
}

export interface PlanRead {
  items: PlanItem[]
  /** items that could not be read or do not exist, as written */
  skipped: string[]
  /** more than PLAN_MAX items were given: the rest are not used */
  capped: boolean
  /** 1-based position asked for, held to the items */
  at: number
}

/** The plan in an address: null when there is no `plan=`. */
export function planFromHash(hash: string, cat: PlanCatalog): PlanRead | null {
  const raw = param(hash, 'plan')
  if (raw === undefined) return null
  const { items, bad } = parsePlan(raw)
  const skipped = [...bad]
  const known = items.filter((it) => {
    if (it.kind === 's' || it.kind === 'r') return true
    const have = it.kind === 'w' ? cat.warm : it.kind === 'd' ? (cat.shop ?? 0) : it.kind === 'f' ? (cat.fill ?? 0) : ((it.kind === 'v' ? cat.votes : cat.tasks)[it.set] ?? 0)
    if (it.n <= have) return true
    skipped.push(planKey(it))
    return false
  })
  const rawAt = param(hash, 'i')
  const used = known.slice(0, PLAN_MAX)
  return { items: used, skipped, capped: known.length > PLAN_MAX, at: clampIndex(rawAt === undefined || rawAt.trim() === '' ? null : Number(rawAt), used.length) }
}

/** The address of a plan, at a position; other parts of the hash stay after it. */
export function planHash(hash: string, items: readonly PlanItem[], at?: number | null): string {
  const rest = hashWithoutLesson(hash).replace(/^#/, '')
  const written = items.map(planKey).join(',')
  const preset = Object.keys(PLAN_PRESETS).find((k) => PLAN_PRESETS[k] === written)
  const parts = ['lesson=sql', `plan=${preset ?? written}`]
  if (at != null && at > 1) parts.push(`i=${at}`)
  return '#' + parts.join('&') + (rest ? `&${rest}` : '')
}

/** The task a lesson reopens at: the last one shown in this browser, if it was in the same set and still exists. */
export function lastTask(raw: string | null, set: string, count: number): number | null {
  try {
    const p = raw ? JSON.parse(raw) : null
    return p && p.set === set && Number.isInteger(p.task) && p.task >= 1 && p.task <= count ? p.task : null
  } catch {
    return null
  }
}
