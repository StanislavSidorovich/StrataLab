// The warm-up at the top of a section: two tasks from earlier sections, picked so that what was missed or
// left longest comes back first. Pure: the page asks once a day and keeps the answer (PracticeProgress.warm).
import type { PracticeProgress } from './sqlPractice'

export interface RecallSection {
  id: string
  n: number
  taskIds: string[]
}

/** A day as the learner's calendar has it. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A small seeded generator (mulberry32 on an FNV-1a hash of the text): the same text gives the same numbers. */
function seeded(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296)
  }
}

/** Takes `count` from the pool in a day's order, from different sections while there are some. */
function draw(pool: { id: string; section: string }[], count: number, rand: () => number) {
  const left = [...pool]
  const out: { id: string; section: string }[] = []
  while (out.length < count && left.length) {
    const fresh = left.filter((t) => !out.some((o) => o.section === t.section))
    const from = fresh.length ? fresh : left
    const pick = from[Math.floor(rand() * from.length)]
    out.push(pick)
    left.splice(left.indexOf(pick), 1)
  }
  return out
}

/**
 * Two tasks of sections before `sectionN`. First the ones not solved or failed last time; when they run out,
 * the ones solved longest ago (a task saved without a time counts as oldest, ties by section order). A day
 * and a section always give the same two.
 */
export function pickWarmUp(sections: readonly RecallSection[], sectionId: string, p: PracticeProgress, day: string, count = 2): string[] {
  const here = sections.find((s) => s.id === sectionId)
  if (!here) return []
  const earlier = sections.filter((s) => s.n < here.n).flatMap((s) => s.taskIds.map((id) => ({ id, section: s.id })))
  const rand = seeded(`${day}|${sectionId}`)
  const open = earlier.filter((t) => !p.solved.includes(t.id) || p.failedAt[t.id] !== undefined)
  const picked = draw(open, count, rand)
  if (picked.length < count) {
    const rest = earlier
      .filter((t) => !picked.some((x) => x.id === t.id) && !open.includes(t))
      // oldest first; the order of the page breaks ties (sort is stable)
      .sort((a, b) => (p.solvedAt[a.id] ?? 0) - (p.solvedAt[b.id] ?? 0))
    picked.push(...draw(rest.slice(0, Math.max(6, count * 3)), count - picked.length, rand))
  }
  return picked.map((t) => t.id)
}
