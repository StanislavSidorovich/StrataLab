// Lesson mode, pure rules added with the warm-up and the plan: the warm-up set in the address, how options are shown,
// hand counts, and the plan link (`#lesson=sql&plan=w3,v2,t:inner-join:4&i=2`).
import { describe, expect, it } from 'vitest'
import { LETTERS, PLAN_MAX, handShares, hashWithoutLesson, lessonFromHash, lessonHash, looksLikeCode, parseCount, parsePlan, planFromHash, planHash, planKey, voteOptions, warmOptions } from '../src/core/lesson'
import { INNER_JOIN_VOTES } from '../src/data/lessonVotes/innerJoin'
import { WARMUP } from '../src/data/lessonVotes/warmup'

describe('lesson: the warm-up set in the address', () => {
  it('is a set numbered by q, with or without mode=vote', () => {
    expect(lessonFromHash('#lesson=sql&set=warmup&q=5')).toEqual({ kind: 'sql', set: 'warmup', mode: 'vote', n: 5 })
    expect(lessonFromHash('#lesson=sql&set=warmup&mode=vote&q=2')?.n).toBe(2)
    expect(lessonHash('', { kind: 'sql', set: 'warmup', mode: 'vote', n: 3 })).toBe('#lesson=sql&set=warmup&mode=vote&q=3')
  })
  it('turns an option into what the slide shows', () => {
    const w = warmOptions(WARMUP[0])
    expect(w.map((o) => o.letter)).toEqual([...LETTERS])
    expect(w.filter((o) => o.right)).toHaveLength(1)
    const v = voteOptions(INNER_JOIN_VOTES[0], 0)
    expect(v.every((o) => o.code && o.sql === o.text)).toBe(true)
    expect(v.filter((o) => o.right)).toHaveLength(1)
  })
  it('sets bits of SQL in code and sentences in text', () => {
    for (const t of ['WHERE', 'GROUP BY', 'ON', 'TOP (n)', 'LEFT JOIN (from dim_promo)', 'COUNT(*)', 'COUNT(DISTINCT c.customer_id)', 's.sellout_id IS NULL', "chain_name = ''", 'SELECT DISTINCT brand', 'NOT EXISTS', '<> ANY (subquery)'])
      expect(looksLikeCode(t), t).toBe(true)
    for (const t of ['Both in WHERE', 'Dropped by the INNER JOIN', 'Duplicated', '0 rows', '118,449', 'An error', 'The pair (customer_id, week_start)', 'Add an ORDER BY'])
      expect(looksLikeCode(t), t).toBe(false)
  })
})

describe('lesson: hand counts', () => {
  it('reads whole numbers only; anything else counts as 0', () => {
    expect(parseCount(' 12 ')).toBe(12)
    expect(parseCount('')).toBe(0)
    expect(parseCount(undefined)).toBe(0)
    expect(parseCount('-3')).toBe(0)
    expect(parseCount('2.5')).toBe(0)
    expect(parseCount('abc')).toBe(0)
    expect(parseCount('1e3')).toBe(0)
    expect(parseCount('99999999')).toBe(1_000_000)
  })
  it('gives shares of the total, and nothing at all when nobody voted', () => {
    expect(handShares(['', '', '', ''])).toBeNull()
    expect(handShares(['0', '0', '0', '0'])).toBeNull()
    expect(handShares(['x', '-1', ' ', '1.5'])).toBeNull()
    expect(handShares([])).toBeNull()
    expect(handShares(['6', '3', '0', '1'])?.map((s) => s.pct)).toEqual([60, 30, 0, 10])
    expect(handShares(['6', 'x', '4', ''])?.map((s) => [s.count, s.pct])).toEqual([[6, 60], [0, 0], [4, 40], [0, 0]])
  })
  it('everyone on one option is 100%', () => {
    expect(handShares(['0', '25', '0', '0'])?.map((s) => s.pct)).toEqual([0, 100, 0, 0])
  })
})

describe('lesson: the plan', () => {
  const cat = { warm: 30, votes: { 'inner-join': 7 }, tasks: { 'inner-join': 7, where: 9 } }
  it('writes and reads items', () => {
    expect(planKey({ kind: 'w', n: 3 })).toBe('w3')
    expect(planKey({ kind: 'v', set: 'inner-join', n: 2 })).toBe('v2')
    expect(planKey({ kind: 'v', set: 'where', n: 2 })).toBe('v:where:2')
    expect(planKey({ kind: 't', set: 'inner-join', n: 4 })).toBe('t:inner-join:4')
    const { items, bad } = parsePlan('w3, W7,v2,t:inner-join:4,v:where:1')
    expect(bad).toEqual([])
    expect(items.map(planKey)).toEqual(['w3', 'w7', 'v2', 't:inner-join:4', 'v:where:1'])
  })
  it('drops repeats, keeps order, reports what it cannot read', () => {
    const { items, bad } = parsePlan('w3,w3,v2,v:inner-join:2,,w0,x9,t:bad,w-1,w3')
    expect(items.map(planKey)).toEqual(['w3', 'v2'])
    expect(bad).toEqual(['w0', 'x9', 't:bad', 'w-1'])
    expect(parsePlan(null).items).toEqual([])
    expect(parsePlan('').items).toEqual([])
  })
  it('reads a plan from the address: unknown items skipped, a position held to the plan', () => {
    const r = planFromHash('#lesson=sql&plan=w3,w99,v2,t:nope:1,t:inner-join:4,v9&i=2', cat)!
    expect(r.items.map(planKey)).toEqual(['w3', 'v2', 't:inner-join:4'])
    expect(r.skipped).toEqual(['w99', 't:nope:1', 'v9'])
    expect(r.at).toBe(2)
    expect(planFromHash('#lesson=sql&plan=w1,w2&i=9', cat)!.at).toBe(2)
    expect(planFromHash('#lesson=sql&plan=w1,w2&i=-4', cat)!.at).toBe(1)
    expect(planFromHash('#lesson=sql&plan=w1,w2&i=abc', cat)!.at).toBe(1)
    expect(planFromHash('#lesson=sql&plan=w1', cat)!.at).toBe(1)
  })
  it('is no plan without plan=, and an empty plan with an empty one', () => {
    expect(planFromHash('#lesson=sql', cat)).toBeNull()
    expect(planFromHash('#lesson=sql&set=inner-join&mode=vote&q=2', cat)).toBeNull()
    const e = planFromHash('#lesson=sql&plan=', cat)!
    expect(e.items).toEqual([])
    expect(e.at).toBe(1)
  })
  it('holds a plan to 20 items', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(',')
    const r = planFromHash(`#lesson=sql&plan=${many}`, cat)!
    expect(r.items).toHaveLength(PLAN_MAX)
    expect(r.capped).toBe(true)
    expect(planFromHash('#lesson=sql&plan=w1,w2', cat)!.capped).toBe(false)
  })
  it('builds the address, keeps other parts, and leaves position 1 out', () => {
    const items = parsePlan('w3,v2,t:inner-join:4').items
    expect(planHash('', items)).toBe('#lesson=sql&plan=w3,v2,t:inner-join:4')
    expect(planHash('', items, 1)).toBe('#lesson=sql&plan=w3,v2,t:inner-join:4')
    expect(planHash('', items, 3)).toBe('#lesson=sql&plan=w3,v2,t:inner-join:4&i=3')
    expect(planHash('#lesson=sql&plan=w1&i=2&ds=quaera', items, 2)).toBe('#lesson=sql&plan=w3,v2,t:inner-join:4&i=2&ds=quaera')
    expect(hashWithoutLesson('#lesson=sql&plan=w1,w2&i=2&ds=quaera')).toBe('#ds=quaera')
    expect(planFromHash(planHash('', items, 2), cat)!.items).toEqual(items)
  })
  it('keeps old links working next to plans', () => {
    expect(lessonFromHash('#lesson=sql&set=inner-join&mode=vote&q=3')).toEqual({ kind: 'sql', set: 'inner-join', mode: 'vote', n: 3 })
    expect(lessonFromHash('#lesson=sql&plan=w1,w2')).toEqual({ kind: 'sql', set: null, mode: 'task', n: null })
  })
})
