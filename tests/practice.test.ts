import { describe, expect, it } from 'vitest'
import { compareResults, describeVerdict, type ResultData } from '../src/core/check'
import { EXAMPLES, TASKS, hashWithoutTask, taskFromHash, taskStarter } from '../src/data/practice'

const expected: ResultData = {
  header: ['category', 'revenue'],
  rows: [
    ['Coffee', '1200.50'],
    ['Tea', '310.00'],
    ['Snacks', '95.25'],
  ],
}

describe('Practice: comparing a result with the answer', () => {
  it('accepts the same rows, whatever the column names', () => {
    const got = { header: ['cat', 'total'], rows: expected.rows }
    expect(compareResults(got, expected, true)).toEqual({ ok: true, rows: 3 })
  })
  it('ignores row order unless the task asks for one', () => {
    const got = { header: expected.header, rows: [...expected.rows].reverse() }
    expect(compareResults(got, expected, false).ok).toBe(true)
    expect(compareResults(got, expected, true)).toEqual({ ok: false, problem: 'order' })
  })
  it('puts columns in the answer’s order when the names match', () => {
    const got = { header: ['Revenue', 'Category'], rows: expected.rows.map(([a, b]) => [b, a]) }
    expect(compareResults(got, expected, true).ok).toBe(true)
  })
  it('compares numbers to the answer’s decimals, at most 2', () => {
    const got = { header: expected.header, rows: [['Coffee', 1200.5], ['Tea', 310], ['Snacks', 95.2549]] }
    expect(compareResults(got, expected, true).ok).toBe(true)
    const avg: ResultData = { header: ['avg'], rows: [[57.83]] }
    expect(compareResults({ header: ['x'], rows: [[57.8346]] }, avg, false).ok).toBe(true)
    expect(compareResults({ header: ['x'], rows: [[57.9]] }, avg, false).ok).toBe(false)
  })
  it('does not round a fraction to a whole number the answer counts', () => {
    const count: ResultData = { header: ['n'], rows: [[70]] }
    expect(compareResults({ header: ['n'], rows: [['70']] }, count, false).ok).toBe(true)
    expect(compareResults({ header: ['n'], rows: [[70.4]] }, count, false).ok).toBe(false)
  })
  it('takes a midnight timestamp as its date', () => {
    const months: ResultData = { header: ['month'], rows: [['2024-01-01'], ['2024-02-01']] }
    const got = { header: ['month'], rows: [['2024-01-01 00:00:00'], ['2024-02-01 00:00:00']] }
    expect(compareResults(got, months, true).ok).toBe(true)
  })
  it('says what is wrong', () => {
    expect(compareResults({ header: ['a'], rows: [] }, expected, false)).toMatchObject({ problem: 'columns', got: 1, expected: 2 })
    expect(compareResults({ header: expected.header, rows: expected.rows.slice(1) }, expected, false)).toMatchObject({ problem: 'rows', got: 2, expected: 3 })
    const off = { header: expected.header, rows: [expected.rows[0], ['Tea', '300.00'], expected.rows[2]] }
    expect(compareResults(off, expected, false)).toEqual({ ok: false, problem: 'values', wrong: 1, expected: 3, missing: ['Tea', '310.00'], extra: ['Tea', '300.00'] })
  })
  it('counts repeated rows', () => {
    const twice: ResultData = { header: ['x'], rows: [['a'], ['a'], ['b']] }
    expect(compareResults({ header: ['x'], rows: [['a'], ['b'], ['b']] }, twice, false)).toMatchObject({ problem: 'values', wrong: 1 })
  })
  it('turns a verdict into words', () => {
    expect(describeVerdict({ ok: true, rows: 1 }).title).toBe('Correct!')
    expect(describeVerdict({ ok: false, problem: 'rows', got: 1500, expected: 871 }).detail).toMatch(/filter/)
    expect(describeVerdict({ ok: false, problem: 'rows', got: 2, expected: 3 }).detail).toMatch(/Too few/)
  })
})

describe('Practice: tasks', () => {
  it('have unique ids, three hints and a solution', () => {
    const ids = [...TASKS, ...EXAMPLES].map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of TASKS) {
      expect(t.hints).toHaveLength(3)
      expect(t.solution).toMatch(/^(SELECT|WITH)/)
    }
  })
  it('open from a #task= link', () => {
    expect(taskFromHash('#task=top-customers')).toBe('top-customers')
    expect(taskFromHash('#ds=chinook&task=Top-Customers')).toBe('top-customers')
    expect(taskFromHash('#ds=chinook')).toBeNull()
    expect(hashWithoutTask('#ds=chinook&task=x')).toBe('#ds=chinook')
    expect(hashWithoutTask('#task=x')).toBe('')
  })
  it('start their tab with the question as a comment', () => {
    const start = taskStarter(TASKS[0])
    expect(start.startsWith('-- Task 1 · Basics: one table\n-- How many customers')).toBe(true)
    expect(start.split('\n').every((l) => l === '' || l.startsWith('-- '))).toBe(true)
  })
})
