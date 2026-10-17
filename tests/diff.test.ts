import { describe, expect, it } from 'vitest'
import { sideBySide, tokenize } from '../src/core/diff'

const changed = (segs: { text: string; changed: boolean }[]) => segs.filter((s) => s.changed).map((s) => s.text)

describe('side-by-side diff', () => {
  it('keeps quoted names, strings and comments whole', () => {
    expect(tokenize("SELECT [First Name], N'x''y' -- note")).toEqual(['SELECT', ' ', '[First Name]', ',', ' ', "N'x''y'", ' ', '-- note'])
  })

  it('marks what was taken out and what came in', () => {
    const d = sideBySide("SELECT TOP 5 name, ISNULL(city, 'n/a') FROM t", "SELECT name, COALESCE(city, 'n/a') FROM t LIMIT 5")
    expect(changed(d.left)).toEqual(['TOP 5', 'ISNULL'])
    expect(changed(d.right)).toEqual(['COALESCE', 'LIMIT 5'])
    expect(d.changes).toBe(2)
  })

  it('does not count the AS sqlglot adds to every alias', () => {
    const d = sideBySide('SELECT c.name n FROM customers c', 'SELECT c.name AS n FROM customers AS c')
    expect(d.changes).toBe(0)
    expect(sideBySide("SELECT CONVERT(date, '2024-01-01')", "SELECT CAST('2024-01-01' AS DATE)").right.filter((s) => s.changed).map((s) => s.text)).toEqual(["CAST", "AS DATE"])
  })

  it('ignores case and layout', () => {
    const d = sideBySide('select a\nfrom t', 'SELECT\n  a\nFROM t')
    expect(d.changes).toBe(0)
    expect(d.left.map((s) => s.text).join('')).toBe('select a\nfrom t')
  })
})
