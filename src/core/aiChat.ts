// Pure TypeScript helpers for the AI helper's conversation (v0.62.0): the last few messages of a tab,
// the "Decisions so far" note, the `Decision:` line a reply may end with, and the "Sees" summary.
// No React, no fetch, no storage calls (the store reads and writes localStorage).

export type AiChatRole = 'user' | 'assistant'

export interface AiChatMessage {
  role: AiChatRole
  text: string
}

/** Messages kept per tab (4 exchanges). */
export const MAX_AI_HISTORY_MESSAGES = 8
/** One learner message in the history. */
export const MAX_AI_HISTORY_USER_CHARS = 1000
/** One helper reply in the history; the full reply stays on screen, the history keeps a shorter copy. */
export const MAX_AI_HISTORY_REPLY_CHARS = 1200
/** All history messages together, so the whole request fits next to the notebook code. */
export const MAX_AI_HISTORY_CHARS = 8000
/** The note's share of one request; older lines are cut first. */
export const MAX_AI_DECISIONS_CHARS = 2000

export const AI_CHAT_KEY_PREFIX = 'stratalab.ai.chat.v1.'
export const AI_SEND_NOTEBOOK_KEY = 'stratalab.ai.sendNotebook'

const SHORTENED = ' […shortened]'
const DECISION_LINE_RE = /^\s*(?:[-*>]\s*)?(?:\*\*|__)?\s*Decision\s*:\s*(?:\*\*|__)?\s*(.+?)\s*$/i

/** The text of the last `Decision: …` line outside code fences, or null. No line, no decision. */
export function extractDecision(reply: string): string | null {
  let inCode = false
  let found: string | null = null
  for (const line of reply.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const m = DECISION_LINE_RE.exec(line)
    if (!m) continue
    const text = m[1].replace(/(?:\*\*|__)\s*$/, '').trim()
    if (text) found = text
  }
  return found
}

/** Adds a line to the note unless the same one is already there (a double click adds it once). */
export function appendDecision(note: string, decision: string): string {
  const line = decision.replace(/\s+/g, ' ').trim()
  if (!line) return note
  const entry = `- ${line}`
  const existing = note.split('\n').map((l) => l.trim())
  if (existing.includes(entry) || existing.includes(line)) return note
  const base = note.replace(/\s+$/, '')
  return base ? `${base}\n${entry}` : entry
}

export function hasDecision(note: string, decision: string): boolean {
  const line = decision.replace(/\s+/g, ' ').trim()
  if (!line) return false
  const existing = note.split('\n').map((l) => l.trim())
  return existing.includes(`- ${line}`) || existing.includes(line)
}

/** The note as it is sent: trimmed, and when too long the newest lines are kept. */
export function decisionsForRequest(note: string, max = MAX_AI_DECISIONS_CHARS): string {
  const text = note.trim()
  if (text.length <= max) return text
  const lead = '[earlier decisions cut]\n'
  const tail = text.slice(text.length - (max - lead.length))
  const nl = tail.indexOf('\n')
  return lead + (nl >= 0 && nl < tail.length - 1 ? tail.slice(nl + 1) : tail)
}

/** A helper reply as the history keeps it: cut to a size, with its `Decision:` line kept. */
export function shortenReply(reply: string, max = MAX_AI_HISTORY_REPLY_CHARS): string {
  const text = reply.trim()
  if (text.length <= max) return text
  const decision = extractDecision(text)
  const keepLine = decision ? `\nDecision: ${decision}` : ''
  const room = Math.max(0, max - SHORTENED.length - keepLine.length)
  return text.slice(0, room).trimEnd() + SHORTENED + keepLine
}

function shortenUser(text: string): string {
  const t = text.trim()
  return t.length <= MAX_AI_HISTORY_USER_CHARS ? t : t.slice(0, MAX_AI_HISTORY_USER_CHARS - SHORTENED.length).trimEnd() + SHORTENED
}

/**
 * Makes a list safe to send: only user/assistant text, starting with the learner, the roles
 * taking turns (Gemini and Claude refuse anything else), at most the last 8 messages, all of them
 * within the character budget (the oldest exchanges go first).
 */
export function normalizeHistory(messages: readonly AiChatMessage[]): AiChatMessage[] {
  const out: AiChatMessage[] = []
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') continue
    const text = m.role === 'assistant' ? shortenReply(m.text) : shortenUser(m.text)
    if (!text) continue
    const last = out.at(-1)
    if (!last && m.role !== 'user') continue
    if (last && last.role === m.role) {
      last.text = `${last.text}\n\n${text}`
      continue
    }
    out.push({ role: m.role, text })
  }
  let list = out.slice(-MAX_AI_HISTORY_MESSAGES)
  while (list.length && list[0].role !== 'user') list = list.slice(1)
  const size = (l: readonly AiChatMessage[]) => l.reduce((n, m) => n + m.text.length, 0)
  // Drop the oldest exchange (a user message and its reply) while over budget.
  while (list.length > 2 && size(list) > MAX_AI_HISTORY_CHARS) list = list.slice(2)
  if (list.length && size(list) > MAX_AI_HISTORY_CHARS) list = []
  if (list.length && list.at(-1)!.role === 'user') list = list.slice(0, -1)
  return list
}

/** One finished exchange added to a tab's history (what a request carries: shortened, within budget). */
export function pushExchange(history: readonly AiChatMessage[], userText: string, reply: string): AiChatMessage[] {
  return normalizeHistory([...history, { role: 'user', text: userText }, { role: 'assistant', text: reply }])
}

/** Messages the panel keeps and shows per tab (10 exchanges); a request still carries only the last 8. */
export const MAX_AI_FEED_MESSAGES = 20
/** One kept message: a reply is at most 8 000 characters already, a question is cut like in the history. */
const MAX_AI_FEED_USER_CHARS = 2000
/** All kept messages together, so one tab never fills the browser's storage. */
export const MAX_AI_FEED_CHARS = 60000

/**
 * The messages as the panel shows them: the same alternating, learner-first list as the history,
 * but the replies stay whole (the request shortens them itself, `normalizeHistory`), and up to
 * 20 messages are kept. The oldest exchanges go first when the text is too big.
 */
export function normalizeFeed(messages: readonly AiChatMessage[]): AiChatMessage[] {
  const out: AiChatMessage[] = []
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') continue
    const text = m.role === 'user' && m.text.trim().length > MAX_AI_FEED_USER_CHARS
      ? m.text.trim().slice(0, MAX_AI_FEED_USER_CHARS - SHORTENED.length).trimEnd() + SHORTENED
      : m.text.trim()
    if (!text) continue
    const last = out.at(-1)
    if (!last && m.role !== 'user') continue
    if (last && last.role === m.role) {
      last.text = `${last.text}

${text}`
      continue
    }
    out.push({ role: m.role, text })
  }
  let list = out.slice(-MAX_AI_FEED_MESSAGES)
  while (list.length && list[0].role !== 'user') list = list.slice(1)
  const size = (l: readonly AiChatMessage[]) => l.reduce((n, m) => n + m.text.length, 0)
  while (list.length > 2 && size(list) > MAX_AI_FEED_CHARS) list = list.slice(2)
  if (list.length && size(list) > MAX_AI_FEED_CHARS) list = []
  if (list.length && list.at(-1)!.role === 'user') list = list.slice(0, -1)
  return list
}

/** One finished exchange added to a tab's feed. */
export function pushFeedExchange(feed: readonly AiChatMessage[], userText: string, reply: string): AiChatMessage[] {
  return normalizeFeed([...feed, { role: 'user', text: userText }, { role: 'assistant', text: reply }])
}

export function parseChat(raw: string | null): AiChatMessage[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return normalizeFeed(
      v.filter(
        (m): m is AiChatMessage =>
          !!m &&
          typeof m === 'object' &&
          ((m as AiChatMessage).role === 'user' || (m as AiChatMessage).role === 'assistant') &&
          typeof (m as AiChatMessage).text === 'string',
      ),
    )
  } catch {
    return []
  }
}

export function parseSendNotebook(raw: string | null): boolean {
  return raw !== '0'
}

export interface AiSeesInput {
  hasSchema: boolean
  sendNotebook: boolean
  /** earlier cells that hold code and went in (notes are not counted) */
  notebookCodeCells: number
  /** messages of the conversation that the request carries */
  messages: number
  hasDecisions: boolean
  sampleRows?: boolean
}

/** The line under the input: what the next request will carry. The current cell always goes in. */
export function describeSees(i: AiSeesInput): string {
  const parts: string[] = []
  if (i.hasSchema) parts.push('schema')
  if (i.sendNotebook && i.notebookCodeCells > 0)
    parts.push(`${i.notebookCodeCells} code cell${i.notebookCodeCells === 1 ? '' : 's'} above + the current cell`)
  else parts.push(i.sendNotebook ? 'the current cell (no code above)' : 'the current cell only')
  if (i.messages > 0) parts.push(`${i.messages} message${i.messages === 1 ? '' : 's'}`)
  if (i.hasDecisions) parts.push('decisions')
  if (i.sampleRows) parts.push('first 20 rows')
  return `Sees: ${parts.join(', ')}`
}

/** The decisions note as the first markdown cell of a saved notebook. */
export const DECISIONS_TITLE = 'Decisions so far'
export const DECISIONS_TAG = 'quaera-lab-decisions'

export function decisionsCellSource(note: string): string {
  return `## ${DECISIONS_TITLE}\n\n${note.trim()}`
}

export function decisionsFromCellSource(source: string): string {
  return source.replace(new RegExp(`^\\s*#+\\s*${DECISIONS_TITLE}\\s*\\n*`, 'i'), '').trim()
}

/** The request as one text, in the order the provider reads it: the system prompt, the history, the new message. */
export function formatRequestPreview(systemPrompt: string, history: readonly AiChatMessage[], userPrompt: string): string {
  const parts = [`[system prompt]\n${systemPrompt}`]
  for (const m of normalizeHistory(history)) parts.push(`[${m.role === 'user' ? 'you, earlier' : 'helper, earlier'}]\n${m.text}`)
  parts.push(`[you, now]\n${userPrompt}`)
  return parts.join('\n\n----------\n\n')
}
