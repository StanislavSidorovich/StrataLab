// The share of a practice's sections done, at which Lab offers to count it in Quaera, and the addresses it links to.
import { describe, expect, it } from 'vitest'
import { PRACTICE_DONE_SHARE, PRACTICE_RETURN_URL, practiceSections, readProgress, type SectionTasks } from '../src/core/sqlPractice'
import { BUILD_RETURN_URL } from '../src/data/build/kaiyoSales'

// ten sections of two tasks, one section without tasks
const SECTIONS: SectionTasks[] = [...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, taskIds: [`s${i}a`, `s${i}b`] })), { id: 'intro', taskIds: [] }]
const progress = (solved: string[], known: string[] = []) => ({ ...readProgress(null), solved, known })
const solveSections = (n: number) => Array.from({ length: n }, (_, i) => [`s${i}a`, `s${i}b`]).flat()

describe('practiceSections', () => {
  it('counts a section done when every task is solved, or it is marked known after its last task (Test me) was solved; own word and empty sections do not count', () => {
    const r = practiceSections(SECTIONS, progress([...solveSections(2), 's5b'], ['s5', 's6']))
    expect(r).toMatchObject({ done: 3, total: 10, reached: false })
    expect(r.share).toBeCloseTo(0.3)
    expect(practiceSections(SECTIONS, progress(['s0a'])).done).toBe(0)
  })
  it('reaches the offer at 70% and not below it', () => {
    expect(PRACTICE_DONE_SHARE).toBe(0.7)
    expect(practiceSections(SECTIONS, progress(solveSections(6))).reached).toBe(false)
    expect(practiceSections(SECTIONS, progress(solveSections(7))).reached).toBe(true)
    expect(practiceSections(SECTIONS, progress([...solveSections(5), 's7b', 's8b'], ['s7', 's8'])).reached).toBe(true)
    expect(practiceSections(SECTIONS, progress(solveSections(5), ['s7', 's8'])).reached).toBe(false)
  })
  it('an empty book never reaches it', () => {
    expect(practiceSections([], progress([])).reached).toBe(false)
  })
})

describe('addresses back to Quaera', () => {
  it('match the trainer\'s key format (pipeline|build|practice):<id>', () => {
    const KEY_RE = /^(pipeline|build|practice):[a-z0-9-]+$/
    for (const url of [BUILD_RETURN_URL, PRACTICE_RETURN_URL.sql, PRACTICE_RETURN_URL.python]) {
      expect(url.startsWith('https://quaera.app/#lab-done=')).toBe(true)
      expect(KEY_RE.test(url.split('#lab-done=')[1])).toBe(true)
    }
    expect(BUILD_RETURN_URL).toBe('https://quaera.app/#lab-done=build:kaiyo-sales')
  })
})
