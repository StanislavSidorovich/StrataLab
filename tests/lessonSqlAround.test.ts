// An option that shows a piece of a query is shown inside the whole query (a class asked "if we group by status, don't we use COUNT?").
import { describe, expect, it } from 'vitest'
import { sqlAround } from '../src/core/lesson'
import { BASICS_VOTES } from '../src/data/lessonVotes/basics'

describe('sqlAround', () => {
  const sql = 'SELECT status, COUNT(*) AS orders\nFROM demo.orders\nGROUP BY status\nORDER BY status;'

  it('splits the query around the piece', () => {
    expect(sqlAround(sql, 'GROUP BY status')).toEqual({
      before: 'SELECT status, COUNT(*) AS orders\nFROM demo.orders\n',
      hit: 'GROUP BY status',
      after: '\nORDER BY status;',
    })
  })

  it('gives nothing for a description, a missing query or an empty piece', () => {
    expect(sqlAround(sql, 'COUNT(*), no GROUP BY')).toBeNull()
    expect(sqlAround(undefined, 'GROUP BY status')).toBeNull()
    expect(sqlAround(sql, '  ')).toBeNull()
  })

  it('gives nothing when the piece is the whole query (a vote option)', () => {
    expect(sqlAround('SELECT 1;', 'SELECT 1;')).toBeNull()
    expect(sqlAround('SELECT 1;', 'SELECT 1')).toBeNull()
  })

  it('finds the piece of the right option of every basics question', () => {
    for (const q of BASICS_VOTES) {
      const o = q.options[q.right]
      const parts = sqlAround(o.sql, o.text)
      // a right option is either a piece of its query or a description: both are fine, a broken split is not
      if (parts) expect(parts.before + parts.hit + parts.after).toBe(o.sql)
    }
  })
})
