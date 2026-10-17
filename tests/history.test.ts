import { describe, expect, it } from 'vitest'
import { HISTORY_MAX_SQL, historyDay, historyTabTitle, parseHistory, remember, searchHistory, type HistoryEntry } from '../src/core/history'

const e = (sql: string, more: Partial<HistoryEntry> = {}): HistoryEntry => ({ sql, dialect: 'duckdb', at: 1, ok: true, text: '1 rows · 2 ms', tab: 'Query 1', ...more })

describe('query history', () => {
  it('puts the newest run on top and moves a repeated query up', () => {
    let h = remember([], e('SELECT 1', { at: 1 }))
    h = remember(h, e('SELECT 2', { at: 2 }))
    h = remember(h, e('  SELECT 1\n', { at: 3 }))
    expect(h.map((x) => [x.sql.trim(), x.at])).toEqual([['SELECT 1', 3], ['SELECT 2', 2]])
  })

  it('keeps the same SQL in another dialect apart', () => {
    const h = remember([e('SELECT 1')], e('SELECT 1', { dialect: 'postgres' }))
    expect(h).toHaveLength(2)
  })

  it('keeps at most the limit, dropping the oldest', () => {
    let h: HistoryEntry[] = []
    for (let i = 0; i < 5; i++) h = remember(h, e(`SELECT ${i}`), 3)
    expect(h.map((x) => x.sql)).toEqual(['SELECT 4', 'SELECT 3', 'SELECT 2'])
  })

  it('skips empty and very long scripts', () => {
    expect(remember([], e('   '))).toEqual([])
    expect(remember([], e('x'.repeat(HISTORY_MAX_SQL + 1)))).toEqual([])
  })

  it('searches SQL and tab titles by every word, any case', () => {
    const h = [e('SELECT * FROM orders', { tab: 'Sales' }), e('SELECT name FROM customers', { tab: 'People' })]
    expect(searchHistory(h, 'FROM')).toHaveLength(2)
    expect(searchHistory(h, 'select orders')).toEqual([h[0]])
    expect(searchHistory(h, 'people')).toEqual([h[1]])
    expect(searchHistory(h, 'orders people')).toEqual([])
    expect(searchHistory(h, '  ')).toEqual(h)
  })

  it('reads back what was saved and drops anything malformed', () => {
    const good = e('SELECT 1')
    expect(parseHistory(JSON.stringify([good, { sql: 1 }, null, { ...good, text: 5 }]))).toEqual([good, { ...good, text: '' }])
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory('{oops')).toEqual([])
    expect(parseHistory('{"a":1}')).toEqual([])
  })

  it('lists entries under Today, Yesterday or their date', () => {
    const now = new Date(2026, 9, 17, 15, 0).getTime()
    expect(historyDay(new Date(2026, 9, 17, 0, 5).getTime(), now)).toBe('Today')
    expect(historyDay(new Date(2026, 9, 16, 23, 59).getTime(), now)).toBe('Yesterday')
    expect(historyDay(new Date(2026, 9, 1).getTime(), now)).not.toMatch(/Today|Yesterday|2026/)
    expect(historyDay(new Date(2025, 9, 1).getTime(), now)).toMatch(/2025/)
  })

  it('names a tab opened from the history', () => {
    expect(historyTabTitle(e('SELECT 1'))).toBe('Query 1 (history)')
    expect(historyTabTitle(e('SELECT 1', { tab: '' }))).toBe('From history')
  })
})
