import { describe, expect, it } from 'vitest'
import { CLEAN_CARDS } from '../src/data/build/kaiyoSales'
import { LINK_TEXT } from '../src/data/build/linkData'

const words = (s: string) => s.trim().split(/\s+/).length
const VERBS = /^(Press|Fill)\b/

describe('Clean cards: the action comes first', () => {
  const cards = [...CLEAN_CARDS, { id: 'P4', ...LINK_TEXT.p4 }, { id: 'P7', ...LINK_TEXT.p7 }]
  it.each(cards.map((c) => [c.id, c] as const))('%s starts with a verb and keeps the reason short', (_id, c) => {
    expect(c.action).toMatch(VERBS)
    expect(words(c.text)).toBeLessThanOrEqual(30)
    // the second hint shows a setting or an example, not the action line again
    if (c.hints.length > 1) expect(c.hints[1]).not.toBe(c.action)
  })
})
