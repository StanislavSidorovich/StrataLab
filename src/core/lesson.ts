// Lesson mode for a teacher (`#lesson=sql&set=inner-join&task=3`, `#lesson=sql&set=inner-join&mode=vote&q=1`): the address,
// the tables a task names, and how a vote's four queries are shuffled. Pure. Hidden: no menu or page links to it.
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

const param = (hash: string, name: string) => new RegExp(`(?:^#|&)${name}=([^&]*)`, 'i').exec(hash)?.[1]

/** The lesson asked for in the address; null when the address is not a lesson (other Lab links are parsed as before). */
export function lessonFromHash(hash: string): LessonRoute | null {
  const kind = param(hash, 'lesson')?.toLowerCase()
  if (kind !== 'sql' && kind !== 'python') return null
  const mode = param(hash, 'mode')?.toLowerCase() === 'vote' ? 'vote' : 'task'
  const rawN = param(hash, mode === 'vote' ? 'q' : 'task')
  return { kind, set: param(hash, 'set')?.toLowerCase() || null, mode, n: rawN === undefined ? null : Number(rawN.trim() === '' ? NaN : rawN) }
}

/** A 1-based position held to 1..count: a missing, non-numeric or too small number is 1, a too large one the last. */
export function clampIndex(n: number | null, count: number): number {
  if (count <= 0) return 1
  if (n === null || !Number.isFinite(n)) return 1
  return Math.min(count, Math.max(1, Math.trunc(n)))
}

const LESSON_KEYS = /^(lesson|set|task|mode|q)=/i

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
  for (const m of code.matchAll(/\b(?:from|join)\s+(?:quaera\.)?"?([a-z_]\w*)"?/gi)) {
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

/** The task a lesson reopens at: the last one shown in this browser, if it was in the same set and still exists. */
export function lastTask(raw: string | null, set: string, count: number): number | null {
  try {
    const p = raw ? JSON.parse(raw) : null
    return p && p.set === set && Number.isInteger(p.task) && p.task >= 1 && p.task <= count ? p.task : null
  } catch {
    return null
  }
}
