// A practice page is a ladder: each skill alone first, then together. Rules: RULES.md of each page.
// Skills of earlier sections count as practised, so one section can be checked by itself:
// npx vitest run tests/practiceLadder.test.ts -t "Python merge"
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tasksOf, type PracticeSection, type PracticeSkill } from '../src/data/practiceBook'
import { SECTIONS as PY_SECTIONS } from '../src/data/pyPractice'
import { SKILLS as PY_SKILLS } from '../src/data/pyPractice/skills'
import { SECTIONS as SQL_SECTIONS } from '../src/data/sqlPractice'
import { SKILLS as SQL_SKILLS } from '../src/data/sqlPractice/skills'

const withoutStrings = (code: string) => code.replace(/(#|--).*$/gm, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')

/** Whatever is wrong with one section's ladder. */
export function ladderProblems(section: PracticeSection, sections: PracticeSection[], skills: PracticeSkill[]): string[] {
  const problems: string[] = []
  const at = sections.indexOf(section)
  const byId = new Map(skills.map((s) => [s.id, s]))
  const practised = new Set(skills.filter((s) => sections.findIndex((x) => x.id === s.section) < at).map((s) => s.id))
  const own = skills.filter((s) => s.section === section.id)
  const tasks = tasksOf(section)
  tasks.forEach((t, i) => {
    const tagged = t.skills ?? []
    if (!tagged.length) problems.push(`${t.id}: no skills`)
    const code = withoutStrings(t.solution)
    for (const id of tagged) {
      const skill = byId.get(id)
      if (!skill) problems.push(`${t.id}: unknown skill ${id}`)
      else {
        if (skill.uses && !skill.uses.test(code)) problems.push(`${t.id}: tagged ${id}, but the solution does not use it`)
        if (sections.findIndex((x) => x.id === skill.section) > at) problems.push(`${t.id}: ${id} is taught in a later section, ${skill.section}`)
      }
    }
    for (const s of own) if (s.uses?.test(code) && !tagged.includes(s.id)) problems.push(`${t.id}: uses ${s.id}, not tagged`)
    const fresh = tagged.filter((id) => !practised.has(id))
    if (i === 0 && tagged.length !== 1) problems.push(`${t.id}: the first task of a section has one skill`)
    if (fresh.length > 1) problems.push(`${t.id}: ${fresh.length} new skills at once: ${fresh.join(', ')}`)
    if (i === tasks.length - 1 && fresh.length) problems.push(`${t.id}: the last task adds a new skill: ${fresh.join(', ')}`)
    if (i === tasks.length - 1 && tasks.length > 1 && tagged.length < 2) problems.push(`${t.id}: the last task joins at least two skills`)
    for (const id of tagged) practised.add(id)
  })
  for (const s of own) if (!practised.has(s.id)) problems.push(`skill ${s.id} is never practised`)
  return problems
}

// These sections name no topic, or put everything together: their tasks are not a ladder.
const PY_FREE = ['data', 'business', 'free']
const SQL_FREE = ['data', 'free']

describe('practice pages are ladders', () => {
  for (const s of PY_SECTIONS.filter((x) => !PY_FREE.includes(x.id))) it(`Python ${s.id}`, () => expect(ladderProblems(s, PY_SECTIONS, PY_SKILLS)).toEqual([]))
  for (const s of SQL_SECTIONS.filter((x) => !SQL_FREE.includes(x.id))) it(`SQL ${s.id}`, () => expect(ladderProblems(s, SQL_SECTIONS, SQL_SKILLS)).toEqual([]))

  it('skills have unique ids and a real section', () => {
    for (const [skills, sections] of [[PY_SKILLS, PY_SECTIONS], [SQL_SKILLS, SQL_SECTIONS]] as const) {
      expect(new Set(skills.map((s) => s.id)).size).toBe(skills.length)
      for (const s of skills) expect(sections.some((x) => x.id === s.section), s.id).toBe(true)
    }
  })

  it('every id published before the ladder is still there: ids hold the progress', () => {
    const published: string[] = JSON.parse(readFileSync('tests/fixtures/practice-ids.json', 'utf8'))
    const now = new Set([...PY_SECTIONS, ...SQL_SECTIONS].flatMap((s) => s.blocks).flatMap((b) => (b.kind === 'task' || b.kind === 'example' ? [b.id] : [])))
    expect(published.filter((id) => !now.has(id))).toEqual([])
  })
})
