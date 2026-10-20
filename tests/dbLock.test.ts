import { describe, expect, it } from 'vitest'
import { HEAD_START_MS, HOLDER_WAIT_MS, LEFT_RECENT_MS, lockPlan, memoryNote, memoryReason, updateLosesTables } from '../src/core/dbLock'

describe('lockPlan', () => {
  const now = 1_000_000
  it('a tab that held the database waits its turn', () => {
    expect(lockPlan(true, null, now)).toEqual({ waitMs: HOLDER_WAIT_MS, delayMs: 0 })
    expect(lockPlan(true, now - 100, now)).toEqual({ waitMs: HOLDER_WAIT_MS, delayMs: 0 })
  })
  it('another tab takes it only when free, at once when no holder just left', () => {
    expect(lockPlan(false, null, now)).toEqual({ waitMs: 0, delayMs: 0 })
    expect(lockPlan(false, now - LEFT_RECENT_MS - 1, now)).toEqual({ waitMs: 0, delayMs: 0 })
  })
  it('gives a holder coming back from the same reload a head start', () => {
    expect(lockPlan(false, now - 300, now)).toEqual({ waitMs: 0, delayMs: HEAD_START_MS })
  })
  it('ignores a time in the future (a clock that moved)', () => {
    expect(lockPlan(false, now + 5000, now).delayMs).toBe(0)
  })
})

describe('memoryReason', () => {
  const named = (name: string, message = 'x') => Object.assign(new Error(message), { name })
  it('a file held by another tab', () => {
    expect(memoryReason(named('NoModificationAllowedError'))).toBe('locked')
    expect(memoryReason(new Error('The database is locked by another tab'))).toBe('locked')
    expect(memoryReason(new Error("Failed to execute 'createSyncAccessHandle': Access Handles cannot be created if there is another open Access Handle"))).toBe('locked')
  })
  it('no OPFS here', () => {
    expect(memoryReason(new Error('OPFS is not supported'))).toBe('unsupported')
    expect(memoryReason(named('SecurityError'))).toBe('unsupported')
  })
  it('anything else: the file would not open', () => {
    expect(memoryReason(new Error('Failure while replaying WAL file'))).toBe('failed')
  })
})

describe('notes', () => {
  it('each reason says what happens to the tables', () => {
    expect(memoryNote('locked')).toMatch(/another tab.*gone when it closes or reloads/)
    expect(memoryNote('unsupported')).toMatch(/backup/)
    expect(memoryNote('failed')).toMatch(/left as it was/)
  })
  it('the Update question names the tables, a long list shortened', () => {
    expect(updateLosesTables(['quaera'])).toMatch(/^This tab works in memory: quaera will be gone/)
    expect(updateLosesTables(['a', 'b', 'c', 'd', 'e', 'f'])).toContain('a, b, c, d and 2 more')
  })
})
