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

describe('texts name buttons where the screen has them', () => {
  const all = [...CLEAN_CARDS, { id: 'P4', ...LINK_TEXT.p4 }, { id: 'P7', ...LINK_TEXT.p7 }]
  it('no hint sends the learner to a column box next to a button: the column is the header clicked in the grid', () => {
    for (const c of all) for (const h of c.hints) expect(h, c.id).not.toMatch(/column box|next to (Trim|Change type)/i)
  })
  it('the decimal separator is said to be inside the Change type menu', () => {
    const p6 = CLEAN_CARDS.find((c) => c.id === 'P6')!
    expect(p6.hints.join(' ')).toMatch(/inside the menu/)
  })
})

describe('the linking hint follows the links made', () => {
  it('starts with the store, then the product, then the region', () => {
    expect(LINK_TEXT.idleFor([])).toMatch(/store: start there/)
    expect(LINK_TEXT.idleFor(['L1'])).toMatch(/product/)
    expect(LINK_TEXT.idleFor(['L1']) ).not.toMatch(/start there/)
    expect(LINK_TEXT.idleFor(['L1', 'L2'])).toMatch(/region/)
  })
})
