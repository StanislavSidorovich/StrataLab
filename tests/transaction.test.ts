// The end-of-run rule for transactions (src/core/transaction.ts); the same rule on real DuckDB is in tests/tsqlWrite.test.ts.
import { describe, expect, it } from 'vitest'
import { afterRun, mentionsTransaction, settleTransaction, TRANSACTION_OPEN_NOTE } from '../src/core/transaction'

describe('mentionsTransaction', () => {
  it('finds the words that start or end one, in any case', () => {
    for (const sql of ['BEGIN TRANSACTION; DELETE FROM t', 'begin tran', 'START TRANSACTION', 'commit', 'ROLLBACK TRAN', 'abort']) expect(mentionsTransaction(sql), sql).toBe(true)
  })
  it('leaves a plain script alone', () => {
    for (const sql of ['SELECT 1', 'UPDATE t SET a = 1', 'SELECT CASE WHEN a THEN 1 END FROM t', 'SELECT beginning FROM t', '']) expect(mentionsTransaction(sql), sql).toBe(false)
  })
})

describe('afterRun', () => {
  it('no transaction: nothing to do, CHECKPOINT is safe', () => {
    expect(afterRun({ failedAt: null, inTransaction: false })).toEqual({ rollback: false, checkpoint: true, note: null })
    expect(afterRun({ failedAt: 3, inTransaction: false })).toEqual({ rollback: false, checkpoint: true, note: null })
  })
  it('a failure inside a transaction: ROLLBACK and a line naming the statement', () => {
    expect(afterRun({ failedAt: 3, inTransaction: true })).toEqual({
      rollback: true,
      checkpoint: true,
      note: 'Statement 3 failed inside a transaction; Lab rolled it back, nothing from BEGIN onwards was kept.',
    })
  })
  it('a script that went to DuckDB in one piece does not name a statement', () => {
    expect(afterRun({ failedAt: 'unknown', inTransaction: true }).note).toBe('A statement failed inside a transaction; Lab rolled it back, nothing from BEGIN onwards was kept.')
  })
  it('a transaction left open, no error: kept, no CHECKPOINT, the note', () => {
    expect(afterRun({ failedAt: null, inTransaction: true })).toEqual({ rollback: false, checkpoint: false, note: TRANSACTION_OPEN_NOTE })
  })
})

describe('settleTransaction', () => {
  const io = (inside: boolean | Error) => {
    const calls: string[] = []
    return {
      calls,
      inTransaction: async () => {
        calls.push('probe')
        if (inside instanceof Error) throw inside
        return inside
      },
      rollback: async () => void calls.push('rollback'),
    }
  }
  it('does not even ask DuckDB about a script with no transaction words', async () => {
    const f = io(true)
    expect(await settleTransaction('SELECT 1', null, false, f)).toEqual({ note: null, open: false })
    expect(f.calls).toEqual([])
  })
  it('asks when an earlier Run left a transaction open, whatever this script says', async () => {
    const f = io(true)
    const r = await settleTransaction('SELECT 1', 1, true, f)
    expect(f.calls).toEqual(['probe', 'rollback'])
    expect(r.note).toMatch(/^Statement 1 failed inside a transaction/)
    expect(r.open).toBe(false)
  })
  it('a script that opens and closes its own transaction: asked, nothing sent, closed', async () => {
    const f = io(false)
    expect(await settleTransaction('BEGIN; DELETE FROM t; COMMIT', null, false, f)).toEqual({ note: null, open: false })
    expect(f.calls).toEqual(['probe'])
  })
  it('left open: open, with the note, no rollback', async () => {
    const f = io(true)
    expect(await settleTransaction('BEGIN TRANSACTION; DELETE FROM t', null, false, f)).toEqual({ note: TRANSACTION_OPEN_NOTE, open: true })
    expect(f.calls).toEqual(['probe'])
  })
  it('failed outside any transaction (the script has BEGIN words but DuckDB says none): no ROLLBACK, no note', async () => {
    const f = io(false)
    expect(await settleTransaction('SELECT \'begin\'; SELECT * FROM nope', 2, false, f)).toEqual({ note: null, open: false })
    expect(f.calls).toEqual(['probe'])
  })
  it('a probe that fails leaves things as they were', async () => {
    expect(await settleTransaction('BEGIN', null, false, io(new Error('x')))).toEqual({ note: null, open: false })
    expect(await settleTransaction('COMMIT', null, true, io(new Error('x')))).toEqual({ note: null, open: true })
  })
})
