// A small Markdown reader for the AI helper's replies (v0.63.0). Pure: it turns a text into a
// plain tree (paragraphs, headings, lists, and inline bold / italic / `code`); the panel draws the
// tree as React elements, so nothing the model writes is ever used as HTML. Fenced code blocks are
// split off before this (`parseAiReplyBlocks`). Links are not made clickable: a link stays text.
// Anything it does not understand (an unclosed `**`, a lone `*`, a table) stays as typed.

export type AiInline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b'; c: AiInline[] }
  | { t: 'i'; c: AiInline[] }

export interface AiListItem {
  /** nesting depth from the indent, 0 to 3 */
  level: number
  c: AiInline[]
}

export type AiMdBlock =
  | { t: 'p'; c: AiInline[] }
  | { t: 'h'; level: number; c: AiInline[] }
  | { t: 'ul'; items: AiListItem[] }
  | { t: 'ol'; start: number; items: AiListItem[] }

const MAX_DEPTH = 4

/** Inline marks: `code`, **bold**, *italic*. An opener without a closer is plain text. */
export function parseInline(src: string, depth = 0): AiInline[] {
  const out: AiInline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '`') {
      // a run of backticks opens a span that the same run closes
      let n = 1
      while (src[i + n] === '`') n++
      const fence = '`'.repeat(n)
      const end = src.indexOf(fence, i + n)
      if (end > i + n) {
        flush()
        out.push({ t: 'code', v: src.slice(i + n, end).replace(/^ (.*) $/, '$1') })
        i = end + n
        continue
      }
      buf += fence
      i += n
      continue
    }
    if (ch === '*' && depth < MAX_DEPTH) {
      const double = src[i + 1] === '*'
      const mark = double ? '**' : '*'
      const from = i + mark.length
      // the opener must touch the text: "2 * 3 * 4" is arithmetic, not italics
      if (from < src.length && !/\s/.test(src[from]) && src[from] !== '*' && !/[\p{L}\p{N}]/u.test(src[i - 1] ?? ' ')) {
        const end = findClosing(src, from, mark)
        if (end > from) {
          flush()
          const inner = parseInline(src.slice(from, end), depth + 1)
          out.push(double ? { t: 'b', c: inner } : { t: 'i', c: inner })
          i = end + mark.length
          continue
        }
      }
      buf += mark
      i += mark.length
      continue
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** The index of the closing mark: not after a space, not inside a `code` span, single `*` not part of `**`. */
function findClosing(src: string, from: number, mark: string): number {
  let i = from
  while (i < src.length) {
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end < 0) {
        i++
        continue
      }
      i = end + 1
      continue
    }
    if (src.startsWith(mark, i) && !/\s/.test(src[i - 1] ?? ' ')) {
      if (mark === '*' && (src[i + 1] === '*' || src[i - 1] === '*')) {
        i += src[i + 1] === '*' ? 2 : 1
        continue
      }
      return i
    }
    i++
  }
  return -1
}

const BULLET_RE = /^(\s*)[-*+•]\s+(.*)$/
const ORDERED_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/

function levelOf(indent: string): number {
  return Math.min(3, Math.floor(indent.replace(/\t/g, '    ').length / 2))
}

/** A text block (no code fences) as paragraphs, headings and lists. Blank lines separate paragraphs. */
export function parseMarkdown(text: string): AiMdBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: AiMdBlock[] = []
  let para: string[] = []
  let list: { kind: 'ul' | 'ol'; start: number; items: { level: number; lines: string[] }[] } | null = null

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) })
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it) => ({ level: it.level, c: parseInline(it.lines.join('\n')) }))
    blocks.push(list.kind === 'ul' ? { t: 'ul', items } : { t: 'ol', start: list.start, items })
    list = null
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushPara()
      flushList()
      blocks.push({ t: 'h', level: heading[1].length, c: parseInline(heading[2]) })
      continue
    }
    const bullet = BULLET_RE.exec(line)
    const ordered = bullet ? null : ORDERED_RE.exec(line)
    if (bullet || ordered) {
      flushPara()
      const kind = bullet ? 'ul' : 'ol'
      if (list && list.kind !== kind && levelOf((bullet ?? ordered)![1]) === 0) flushList()
      const level = levelOf((bullet ?? ordered)![1])
      if (!list) list = { kind, start: ordered ? Number(ordered[2]) : 1, items: [] }
      list.items.push({ level, lines: [bullet ? bullet[2] : ordered![3]] })
      continue
    }
    // a line that continues the item above (indented), or an ordinary paragraph line
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1].lines.push(line.trim())
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()
  return blocks
}
