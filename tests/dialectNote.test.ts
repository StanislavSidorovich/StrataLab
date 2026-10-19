import { describe, expect, it } from 'vitest'
import { dismissNote, needsNote, noteDismissed, sqlLabel } from '../src/core/dialectNote'

const fake = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('dialect note', () => {
  it('labels the one SQL button by dialect', () => {
    expect(sqlLabel('duckdb')).toBe('SQL · DuckDB')
    expect(sqlLabel('tsql')).toBe('SQL · T-SQL')
    expect(sqlLabel('postgres')).toBe('SQL · PostgreSQL')
  })
  it('needs a note for T-SQL and PostgreSQL only', () => {
    expect(needsNote('tsql')).toBe(true)
    expect(needsNote('postgres')).toBe(true)
    expect(needsNote('duckdb')).toBe(false)
    expect(needsNote('python')).toBe(false)
  })
  it('is closed once, per dialect', () => {
    const store = fake()
    expect(noteDismissed('tsql', store)).toBe(false)
    dismissNote('tsql', store)
    expect(noteDismissed('tsql', store)).toBe(true)
    expect(noteDismissed('postgres', store)).toBe(false)
  })
})
