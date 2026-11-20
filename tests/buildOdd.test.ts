import { describe, expect, it } from 'vitest'
import { oddText } from '../src/core/buildOdd'

describe('P8 text (the count is the data, the claims match it)', () => {
  it('uses the counts it is given, with thousands separators', () => {
    expect(oddText({ noRevenue: 1174, noUnits: 82, returns: 106, returnsPositive: 106, returnsNegative: 0 })).toContain('1,174 sales have no revenue, 82 have no units, and 106 have negative units (returns). Their revenue came positive')
  })
  it('0 returns: no number 106 and no sentence about a sign', () => {
    const t = oddText({ noRevenue: 3, noUnits: 0, returns: 0, returnsPositive: 0, returnsNegative: 0 })
    expect(t).toBe('3 sales have no revenue, 0 have no units, and none have negative units (returns).')
    expect(t).not.toContain('106')
    expect(t).not.toContain('revenue came positive')
  })
  it('does not promise a positive revenue when the returns are negative or mixed', () => {
    expect(oddText({ noRevenue: 1, noUnits: 1, returns: 5, returnsPositive: 0, returnsNegative: 5 })).toContain('We keep them as sent')
    expect(oddText({ noRevenue: 1, noUnits: 1, returns: 5, returnsPositive: 2, returnsNegative: 1 })).not.toContain('came positive')
  })
  it('returns where some have no revenue: the claim is limited to those that have one', () => {
    expect(oddText({ noRevenue: 1, noUnits: 1, returns: 106, returnsPositive: 102, returnsNegative: 0 })).toContain('Where there is a revenue (102 of them) it came positive')
  })
  it('one return reads in the singular', () => {
    expect(oddText({ noRevenue: 1, noUnits: 1, returns: 1, returnsPositive: 1, returnsNegative: 0 })).toContain('and 1 has negative units (returns). Its revenue came positive')
  })
})
