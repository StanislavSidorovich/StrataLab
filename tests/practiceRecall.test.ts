// The warm-up pick and the progress shape it needs.
import { describe, expect, it } from 'vitest'
import { emptyProgress, readProgress } from '../src/core/sqlPractice'
import { dayOf, pickWarmUp, type RecallSection } from '../src/core/practiceRecall'

const sections: RecallSection[] = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, n, taskIds: [`s${n}a`, `s${n}b`, `s${n}c`] }))
const solvedAll = () => ({ ...emptyProgress(), solved: sections.flatMap((s) => s.taskIds) })

describe('pickWarmUp', () => {
  it('gives the same two for the same day and section, and takes only earlier sections', () => {
    const p = emptyProgress()
    const a = pickWarmUp(sections, 's4', p, '2026-11-14')
    expect(pickWarmUp(sections, 's4', p, '2026-11-14')).toEqual(a)
    expect(a).toHaveLength(2)
    for (const id of a) expect(['s1', 's2', 's3']).toContain(id.slice(0, 2))
    expect(pickWarmUp(sections, 's1', p, '2026-11-14')).toEqual([])
  })
  it('takes tasks from two different sections while it can', () => {
    for (let d = 1; d < 20; d++) {
      const [x, y] = pickWarmUp(sections, 's5', emptyProgress(), `2026-11-${d}`)
      expect(x.slice(0, 2)).not.toBe(y.slice(0, 2))
    }
  })
  it('puts unsolved and failed tasks before solved ones', () => {
    const p = { ...solvedAll(), solved: solvedAll().solved.filter((t) => t !== 's2b'), failedAt: { s1c: 5 } }
    expect(pickWarmUp(sections, 's5', p, '2026-11-14').sort()).toEqual(['s1c', 's2b'])
  })
  it('else the ones solved longest ago; a task with no time counts as oldest', () => {
    const solvedAt: Record<string, number> = Object.fromEntries(sections.flatMap((s) => s.taskIds).map((id, i) => [id, 1000 + i]))
    delete solvedAt.s3c
    const p = { ...solvedAll(), solvedAt }
    const picks = new Set<string>()
    for (let d = 1; d < 30; d++) for (const id of pickWarmUp(sections, 's5', p, `2026-12-${d}`)) picks.add(id)
    // the pool is the oldest few: nothing recent from section 4
    expect([...picks].some((id) => id.startsWith('s4'))).toBe(false)
    expect(picks.has('s3c')).toBe(true)
  })
  it('with nothing to go on, tasks of the earlier sections', () => {
    const picks = pickWarmUp(sections, 's5', solvedAll(), '2026-11-14')
    expect(picks.every((id) => /^s[1-4]/.test(id))).toBe(true)
  })
  it('a single earlier task gives one', () => {
    expect(pickWarmUp([{ id: 'a', n: 1, taskIds: ['t'] }, { id: 'b', n: 3, taskIds: ['u'] }], 'b', emptyProgress(), '2026-11-14')).toEqual(['t'])
  })
})

describe('dayOf', () => {
  it('is the local calendar day', () => expect(dayOf(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04'))
})

describe('progress saved before the warm-up existed', () => {
  const old = JSON.stringify({ solved: ['a', 'b'], known: ['s1'], peeked: ['a'], hints: { a: 2 }, drafts: { b: 'SELECT 1' }, hideKnown: true })
  it('loads with every old field and empty new ones', () => {
    const p = readProgress(old)
    expect(p).toMatchObject({ solved: ['a', 'b'], known: ['s1'], peeked: ['a'], hints: { a: 2 }, drafts: { b: 'SELECT 1' }, hideKnown: true })
    expect(p).toMatchObject({ solvedAt: {}, failedAt: {}, warm: {}, warmFolded: [] })
  })
  it('then picks by the order of the page, since nothing has a time', () => {
    expect(pickWarmUp(sections, 's3', readProgress(old), '2026-11-14')).toHaveLength(2)
  })
  it('keeps new fields and drops junk', () => {
    const p = readProgress(JSON.stringify({ solvedAt: { a: 5, b: 'x' }, failedAt: [1], warm: { s2: { day: '2026-11-14', ids: ['a'] }, s3: 7 }, warmFolded: ['s2', 4] }))
    expect(p.solvedAt).toEqual({ a: 5 })
    expect(p.warm).toEqual({ s2: { day: '2026-11-14', ids: ['a'] } })
    expect(p.warmFolded).toEqual(['s2'])
  })
})
