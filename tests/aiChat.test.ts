import { describe, expect, it } from 'vitest'
import {
  MAX_AI_HISTORY_CHARS,
  MAX_AI_HISTORY_MESSAGES,
  MAX_AI_HISTORY_REPLY_CHARS,
  appendDecision,
  decisionsCellSource,
  decisionsForRequest,
  decisionsFromCellSource,
  describeSees,
  extractDecision,
  formatRequestPreview,
  hasDecision,
  normalizeHistory,
  parseChat,
  parseSendNotebook,
  pushExchange,
  shortenReply,
  type AiChatMessage,
} from '../src/core/aiChat'

describe('extractDecision', () => {
  it('takes the text of a closing Decision line', () => {
    expect(extractDecision('Dropping is safe here.\n\nDecision: drop the 12 rows with price 0, they are test orders')).toBe(
      'drop the 12 rows with price 0, they are test orders',
    )
  })
  it('accepts bold and bullet forms, any case', () => {
    expect(extractDecision('text\n**Decision:** keep NULL as a category')).toBe('keep NULL as a category')
    expect(extractDecision('text\n- decision: fill with median')).toBe('fill with median')
  })
  it('returns null when there is no line, or the line is empty', () => {
    expect(extractDecision('Option A or option B? Which one?')).toBeNull()
    expect(extractDecision('Decision:')).toBeNull()
    expect(extractDecision('We made a decision: later')).toBeNull()
  })
  it('ignores a Decision line inside a code block and takes the last real one', () => {
    expect(extractDecision('```python\n# Decision: not this\n```')).toBeNull()
    expect(extractDecision('Decision: first\ntext\nDecision: second')).toBe('second')
  })
})

describe('decisions note', () => {
  it('appends once: a double click does not duplicate the line', () => {
    const once = appendDecision('', 'drop price 0')
    expect(once).toBe('- drop price 0')
    expect(appendDecision(once, 'drop  price 0')).toBe(once)
    expect(hasDecision(once, 'drop price 0')).toBe(true)
    expect(appendDecision(once, 'fill median')).toBe('- drop price 0\n- fill median')
  })
  it('keeps the newest lines when the note is too long', () => {
    const note = Array.from({ length: 200 }, (_, i) => `- decision number ${i}`).join('\n')
    const sent = decisionsForRequest(note, 500)
    expect(sent.length).toBeLessThanOrEqual(500)
    expect(sent).toContain('decision number 199')
    expect(sent).not.toContain('decision number 0\n')
    expect(sent.startsWith('[earlier decisions cut]')).toBe(true)
  })
  it('round-trips through the notebook cell', () => {
    expect(decisionsFromCellSource(decisionsCellSource('- a\n- b'))).toBe('- a\n- b')
    expect(decisionsCellSource('- a').startsWith('## Decisions so far')).toBe(true)
  })
})

const ex = (n: number): AiChatMessage[] => [
  { role: 'user', text: `question ${n}` },
  { role: 'assistant', text: `answer ${n}` },
]

describe('history', () => {
  it('keeps only the last 8 messages, starting with the learner', () => {
    let h: AiChatMessage[] = []
    for (let i = 1; i <= 6; i++) h = pushExchange(h, `question ${i}`, `answer ${i}`)
    expect(h).toHaveLength(MAX_AI_HISTORY_MESSAGES)
    expect(h[0]).toEqual({ role: 'user', text: 'question 3' })
    expect(h.at(-1)).toEqual({ role: 'assistant', text: 'answer 6' })
  })
  it('makes the roles take turns and drops a leading or trailing odd message', () => {
    const h = normalizeHistory([
      { role: 'assistant', text: 'stray' },
      { role: 'user', text: 'a' },
      { role: 'user', text: 'b' },
      { role: 'assistant', text: 'c' },
      { role: 'user', text: 'dangling' },
    ])
    expect(h.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(h[0].text).toBe('a\n\nb')
  })
  it('shortens a long reply but keeps its Decision line', () => {
    const long = 'x'.repeat(5000) + '\nDecision: use median'
    const short = shortenReply(long)
    expect(short.length).toBeLessThanOrEqual(MAX_AI_HISTORY_REPLY_CHARS)
    expect(short).toContain('[…shortened]')
    expect(short.endsWith('Decision: use median')).toBe(true)
  })
  it('drops the oldest exchanges when the budget is exceeded', () => {
    const big = 'y'.repeat(MAX_AI_HISTORY_REPLY_CHARS - 50)
    let h: AiChatMessage[] = []
    for (let i = 0; i < 4; i++) h = pushExchange(h, `q${i}${'z'.repeat(1000)}`, `${i}${big}`)
    const size = h.reduce((n, m) => n + m.text.length, 0)
    expect(size).toBeLessThanOrEqual(MAX_AI_HISTORY_CHARS)
    expect(h.length).toBeLessThan(8)
    expect(h.at(-1)!.text.startsWith('3')).toBe(true)
  })
  it('parses a saved chat defensively', () => {
    expect(parseChat(null)).toEqual([])
    expect(parseChat('not json')).toEqual([])
    expect(parseChat('{"a":1}')).toEqual([])
    expect(parseChat(JSON.stringify([...ex(1), { role: 'system', text: 'nope' }, 7]))).toEqual(ex(1))
  })
  it('the notebook switch is on unless saved as 0', () => {
    expect(parseSendNotebook(null)).toBe(true)
    expect(parseSendNotebook('1')).toBe(true)
    expect(parseSendNotebook('0')).toBe(false)
  })
})

describe('describeSees and the request preview', () => {
  it('lists what the next request carries', () => {
    expect(describeSees({ hasSchema: true, sendNotebook: true, notebookCells: 4, messages: 6, hasDecisions: true })).toBe(
      'Sees: schema, 4 cells of code, 6 messages, decisions',
    )
    expect(describeSees({ hasSchema: false, sendNotebook: false, notebookCells: 4, messages: 0, hasDecisions: false })).toBe('Sees: current cell only')
    expect(describeSees({ hasSchema: true, sendNotebook: true, notebookCells: 1, messages: 1, hasDecisions: false })).toBe('Sees: schema, 1 cell of code, 1 message')
    expect(describeSees({ hasSchema: true, sendNotebook: true, notebookCells: 0, messages: 0, hasDecisions: false, sampleRows: true })).toBe(
      'Sees: schema, no code yet, first 20 rows',
    )
  })
  it('prints the system prompt, the earlier messages, then the new one', () => {
    const text = formatRequestPreview('SYS', ex(1), 'NOW')
    expect(text.indexOf('SYS')).toBeLessThan(text.indexOf('question 1'))
    expect(text.indexOf('question 1')).toBeLessThan(text.indexOf('answer 1'))
    expect(text.indexOf('answer 1')).toBeLessThan(text.indexOf('NOW'))
  })
})
