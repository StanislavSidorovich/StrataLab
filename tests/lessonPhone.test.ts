// What a phone shows after Reveal (src/core/lessonPhone.ts, src/data/lessonPhone.ts, src/ui/PhoneResult.tsx): right, wrong or no answer, and why.
// No tables on the phone. The queries behind each option are run in tests/lessonShop.test.ts and tests/lessonWarmup.test.ts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { voteOutcome } from '../src/core/lessonPhone'
import { phoneItems } from '../src/data/lessonPhone'
import { arrange } from '../src/core/lesson'
import { VOTES } from '../src/data/lessonVotes'
import { FILL_ANSWERS } from '../src/data/lessonFillAnswers'

describe('phone result: rules', () => {
  it('a vote is right, wrong or not answered', () => {
    expect(voteOutcome('C', 2)).toBe('right')
    expect(voteOutcome('A', 2)).toBe('wrong')
    for (const m of [null, undefined, '', 'Z', 'E']) expect(voteOutcome(m, 2), String(m)).toBe('none')
  })
})

describe('phone result: the items', () => {
  const items = phoneItems()
  it('knows every question key a plan can put on a phone', () => {
    expect(Object.keys(items)).toEqual(expect.arrayContaining(['w1', 'w30', 'd1', 'd11', 'f1', 'f4', 'v1']))
    expect(items.s).toBeUndefined()
    expect(items.r).toBeUndefined()
    expect(items.d99).toBeUndefined()
  })
  it('a vote has four options with the right one in range and a why; a fill question has its answers', () => {
    for (const [key, it] of Object.entries(items)) {
      if (it.kind === 'vote') {
        expect(it.options, key).toHaveLength(4)
        expect(it.right >= 0 && it.right < 4, key).toBe(true)
        expect(it.why.length, key).toBeGreaterThan(10)
        it.options.forEach((o) => expect(o.text.length, key).toBeGreaterThan(0))
      } else {
        expect(it.accepted, key).toEqual(FILL_ANSWERS[key])
        expect(it.why.length, key).toBeGreaterThan(20)
      }
    }
  })
  it('SQL Server’s message reaches the phone for the options that have one (d10 A: Msg 8120, d8 A: Msg 207)', () => {
    const d10 = items.d10
    const d8 = items.d8
    if (d10.kind !== 'vote' || d8.kind !== 'vote') throw new Error('d8 and d10 are votes')
    expect(d10.options[0].mssql).toMatch(/^Msg 8120/)
    expect(d8.options[0].mssql).toMatch(/^Msg 207/)
    expect(d10.options[d10.right].mssql).toBeNull()
  })
  it('a vote on code (v) lists its queries in the letters the slide shows, the right one on its own letter', () => {
    VOTES['inner-join'].forEach((q, i) => {
      const item = items[`v${i + 1}`]
      expect(item.kind).toBe('vote')
      if (item.kind !== 'vote') return
      const a = arrange(q, i)
      expect(item.options.map((o) => o.text)).toEqual(a.map((o) => o.sql))
      expect(item.right).toBe(a.findIndex((o) => o.right))
    })
  })
})

describe('phone result: kept out of the phone’s first bundle', () => {
  it('only a dynamic import reaches the result view and the answer key', () => {
    const page = readFileSync('src/ui/VotePage.tsx', 'utf8')
    expect(page).toMatch(/import\('\.\/PhoneResult'\)/)
    expect(page).not.toMatch(/from\s+'\.\/PhoneResult'|lessonPhone'|lessonFillAnswers|FILL_ANSWERS/)
    for (const f of ['src/ui/FillPhone.tsx', 'src/core/lessonFill.ts', 'src/core/lessonPhone.ts', 'src/core/voting.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\s+'[^']*(lessonFillAnswers|data\/lessonPhone)'/)
  })
  it('there are no result tables on the phone', () => {
    expect(readFileSync('src/ui/PhoneResult.tsx', 'utf8')).not.toMatch(/<table|lessonPreview|duckdb/i)
  })
})
