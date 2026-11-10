// The optional step "More" of the build page (spec docs/build-kaiyo-sales-spec.md, section 5.5): five more questions the
// learner answers with their own SQL over the star, results that can be pinned to the dashboard, and the part of the
// saved state that belongs to them. Pure; the engine is the page's `query`.
import { MORE_IDS, MORE_QUESTIONS, moreQuestion, type MoreId } from '../data/build/kaiyoSales'
import { judgeAnswer, type AnswerInput, type AnswerResult } from './buildDashboard'

export type { MoreId }

export interface Pin {
  /** the question it answers; one pin per question */
  q: MoreId
  /** the learner's SQL, run again when the page opens */
  sql: string
}

export interface MoreWork {
  /** the editor text of each question (the start text until touched) */
  sql: Record<MoreId, string>
  /** what was typed in the answers */
  answers: Record<MoreId, AnswerInput>
  /** questions answered right */
  done: MoreId[]
  /** the ones among them that were finished with "Show a solution" */
  solved: MoreId[]
  /** results pinned to the dashboard */
  pins: Pin[]
}

const each = <T>(f: (id: MoreId) => T): Record<MoreId, T> => Object.fromEntries(MORE_IDS.map((id) => [id, f(id)])) as Record<MoreId, T>

export const emptyMore = (): MoreWork => ({
  sql: each((id) => moreQuestion(id).start),
  answers: each(() => ({ pick: '', number: '' })),
  done: [],
  solved: [],
  pins: [],
})

export const moreDone = (more: Pick<MoreWork, 'done'>) => MORE_QUESTIONS.every((q) => more.done.includes(q.id))

/** How many of the five are answered, e.g. for the list and the step chip. */
export const moreCount = (more: Pick<MoreWork, 'done'>) => MORE_QUESTIONS.filter((q) => more.done.includes(q.id)).length

export const checkMoreAnswer = (id: MoreId, input: AnswerInput): AnswerResult => judgeAnswer(moreQuestion(id), input)

/** Why this text can't be run here, or null. The step reads the star; it doesn't change it. */
export function moreSqlProblem(text: string): string | null {
  const bare = text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .replace(/;\s*$/, '')
    .trim()
  if (!bare) return 'Write a query first.'
  if (bare.includes('____')) return 'Fill in the ____ first.'
  if (/;/.test(bare)) return 'One query at a time: remove the extra ;'
  if (!/^(select|with|from|values|table)\b/i.test(bare)) return "Here a query only reads the star: start with SELECT. It can't change the tables."
  return null
}

/** The chart for a pinned result: a line when the first column is a date, else bars. */
export const pinKind = (firstColumnIsDate: boolean): 'line' | 'bars' => (firstColumnIsDate ? 'line' : 'bars')

/** A result can be pinned when it has exactly two columns: a label and a number. */
export function pinnable(columns: { name: string; kind: 'number' | 'date' | 'text' }[]): boolean {
  return columns.length === 2 && columns[1].kind === 'number' && columns[0].kind !== 'number'
}

/** The pins in the order of the questions; pinning a question again replaces its pin. */
export function setPin(pins: readonly Pin[], pin: Pin): Pin[] {
  return [...pins.filter((p) => p.q !== pin.q), pin].sort((a, b) => MORE_IDS.indexOf(a.q) - MORE_IDS.indexOf(b.q))
}
export const removePin = (pins: readonly Pin[], q: MoreId): Pin[] => pins.filter((p) => p.q !== q)

/** Anything unreadable is dropped; an old save without the step gets the defaults. */
export function readMore(raw: unknown): MoreWork {
  const m = emptyMore()
  if (!raw || typeof raw !== 'object') return m
  const r = raw as Record<string, unknown>
  const text = r.sql as Record<string, unknown> | undefined
  const ans = r.answers as Record<string, Partial<AnswerInput> | undefined> | undefined
  for (const id of MORE_IDS) {
    if (text && typeof text[id] === 'string') m.sql[id] = (text[id] as string).slice(0, 4000)
    const a = ans?.[id]
    if (a && typeof a.pick === 'string') m.answers[id].pick = a.pick.slice(0, 40)
    if (a && typeof a.number === 'string') m.answers[id].number = a.number.slice(0, 40)
  }
  if (Array.isArray(r.done)) m.done = MORE_IDS.filter((id) => (r.done as unknown[]).includes(id))
  if (Array.isArray(r.solved)) m.solved = MORE_IDS.filter((id) => m.done.includes(id) && (r.solved as unknown[]).includes(id))
  if (Array.isArray(r.pins)) {
    for (const p of r.pins as Partial<Pin>[]) {
      if (p && MORE_IDS.includes(p.q as MoreId) && typeof p.sql === 'string' && p.sql.trim()) m.pins = setPin(m.pins, { q: p.q as MoreId, sql: p.sql.slice(0, 4000) })
    }
  }
  return m
}
