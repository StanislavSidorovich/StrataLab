// The introduced-in index (src/core/practiceIndex.ts): where each term is first taught, the gate that holds
// every task to it, and the hint links.
import { describe, expect, it } from 'vitest'
import { SECTIONS as PY_SECTIONS } from '../src/data/pyPractice'
import { SECTIONS as SQL_SECTIONS } from '../src/data/sqlPractice'
import { tasksOf } from '../src/data/practiceBook'
import { buildIndex, hintParts, untaughtIn } from '../src/core/practiceIndex'

const sql = buildIndex('sql', SQL_SECTIONS)
const py = buildIndex('python', PY_SECTIONS)

describe('the gate: a solution uses only what its section or an earlier one has shown', () => {
  it('SQL (T-SQL, and the pg rewrites)', () => expect(untaughtIn(sql, SQL_SECTIONS)).toEqual([]))
  it('Python', () => expect(untaughtIn(py, PY_SECTIONS)).toEqual([]))
  it('fails when a task uses a function taught later', () => {
    const early = SQL_SECTIONS.find((s) => tasksOf(s).length)!
    const bad = { ...early, blocks: [...early.blocks, { kind: 'task' as const, id: 'x', title: 'x', question: 'x', ordered: false, hints: [], solution: 'SELECT DENSE_RANK() OVER (ORDER BY 1)' }] }
    const sections = SQL_SECTIONS.map((s) => (s === early ? bad : s))
    expect(untaughtIn(buildIndex('sql', sections), sections).join()).toMatch(/x \(solution\)/)
  })
})

describe('introducedIn', () => {
  it('finds the section, its title and a place to scroll to', () => {
    expect(sql.introducedIn('MAX')).toMatchObject({ n: 4, title: 'Totals', sectionId: 'totals' })
    expect(sql.introducedIn('MAX')!.anchor).toMatch(/^(note|example)-/)
    expect(sql.introducedIn('GROUP BY')?.n).toBe(4)
    expect(sql.introducedIn('LEFT JOIN')?.n).toBe(8)
    expect(py.introducedIn('merge')?.n).toBe(9)
    expect(py.introducedIn('value_counts')?.n).toBe(3)
    expect(sql.introducedIn('NOPE')).toBeNull()
  })
  it('searches without case, prefix matches first', () => {
    expect(sql.search('max')[0]).toMatchObject({ term: 'MAX', n: 4 })
    expect(sql.search('  ')).toEqual([])
    expect(sql.search('group by').map((t) => t.term)).toContain('GROUP BY')
    expect(py.search('isna').map((t) => t.term)).toContain('isna')
  })
  it('keeps table and column names out of the search', () => {
    expect(py.search('promo_id')).toEqual([])
    expect(sql.search('xyzzy')).toEqual([])
  })
})

describe('hint links', () => {
  const links = (kind: 'sql' | 'python', hint: string, n: number) => hintParts(kind, kind === 'sql' ? sql : py, hint, n).filter((p) => typeof p !== 'string')
  it('links a term of an earlier section, with its section', () => {
    const [m] = links('sql', 'Take the MAX of the price.', 6)
    expect(m).toMatchObject({ term: 'MAX', bare: true, intro: { n: 4 } })
  })
  it('leaves a term of the same section, or a later one, plain', () => {
    expect(links('sql', 'Take the MAX of the price.', 4)).toEqual([])
    expect(links('sql', 'Take the MAX of the price.', 2)).toEqual([])
  })
  it('does not link the basic keywords, and links a term once', () => {
    expect(links('sql', 'Pick it FROM there WHERE x. MAX and MAX.', 9)).toHaveLength(1)
  })
  it('leaves a hint that is code as it is', () => {
    expect(hintParts('sql', sql, 'SELECT MAX(units) FROM quaera.fact_sellin;', 9)).toEqual(['SELECT MAX(units) FROM quaera.fact_sellin;'])
    expect(hintParts('python', py, 'products["a"].value_counts()', 9)).toEqual(['products["a"].value_counts()'])
  })
  it('a Python method inside a sentence is linked in place, a bare name gets its section', () => {
    const [a, b] = links('python', 'value_counts on division, then .reset_index() to finish.', 9)
    expect(a).toMatchObject({ term: 'value_counts', bare: true })
    expect(b).toMatchObject({ term: 'reset_index', bare: false })
  })
  it('an ordinary English word is not a method', () => {
    expect(links('python', 'Merge the sum and the mean of the rows.', 12)).toEqual([])
  })
  it('the parts put the hint back together', () => {
    const hint = 'Then use .reset_index() and value_counts here.'
    const joined = hintParts('python', py, hint, 9).map((p) => (typeof p === 'string' ? p : p.term)).join('')
    expect(joined).toBe(hint)
  })
})
