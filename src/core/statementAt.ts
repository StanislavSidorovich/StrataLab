// Which SQL statement the cursor is in, so Ctrl+Enter can run just that one (as DBeaver / DataGrip do).
// A statement ends at a `;` or at a blank line, both outside quotes and comments. Pure: no editor, no DuckDB.

export interface Range {
  from: number
  to: number
}

/** Offsets of every non-empty statement: trimmed, comment-only pieces dropped, a closing `;` kept. */
export function statementRanges(text: string): Range[] {
  const cuts: Range[] = []
  let start = 0
  const push = (end: number) => {
    cuts.push({ from: start, to: end })
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === "'" || c === '"') {
      // a quoted string or identifier; '' and "" are escapes, an unclosed quote runs to the end
      let j = i + 1
      while (j < text.length) {
        if (text[j] === c) {
          if (text[j + 1] === c) j += 2
          else break
        } else j++
      }
      i = j + 1
    } else if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else if (c === ';') {
      push(i + 1)
      i++
      start = i
    } else if (c === '\n') {
      // a blank line (only spaces between two line breaks) ends a statement too
      const m = /^[ \t\r]*\n/.exec(text.slice(i + 1))
      if (m) {
        push(i)
        i += 1 + m[0].length
        start = i
      } else i++
    } else i++
  }
  push(text.length)
  const out: Range[] = []
  for (const r of cuts) {
    const raw = text.slice(r.from, r.to)
    const lead = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (!trimmed || !hasCode(trimmed)) continue
    out.push({ from: r.from + lead, to: r.from + lead + trimmed.length })
  }
  return out
}

/** False for a piece that is only comments and semicolons. */
function hasCode(s: string): boolean {
  return s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?(\*\/|$)/g, '').replace(/;/g, '').trim() !== ''
}

/**
 * The statement the cursor is in. On a blank line or after the last `;` it is the one just
 * above; before the first statement, the first one. Null when the text has no statement.
 */
export function statementAt(text: string, pos: number): Range | null {
  const all = statementRanges(text)
  if (!all.length) return null
  const inside = all.find((r) => pos >= r.from && pos <= r.to)
  if (inside) return inside
  const before = all.filter((r) => r.to < pos)
  return before.length ? before[before.length - 1] : all[0]
}
