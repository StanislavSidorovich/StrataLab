// The code words in a practice note's text. Backticks mark code; in a "New: <topic>" note that code is the
// new term the note introduces, unless it starts with `~` (an older word mentioned for reference: `~assign`
// shows as `assign`, calm). `~~x` is a new term whose text starts with a tilde. Elsewhere (task text, sees,
// says, trap) backticked code is always calm and shown as written. Pure; the renderer is src/ui/Prose.tsx.

export interface ProsePart {
  text: string
  kind: 'text' | 'code' | 'new'
}

/** Text split at backticks. `newTerms`: the code in it is the new terms of a note (a `~` makes one calm). */
export function proseParts(text: string, newTerms: boolean): ProsePart[] {
  return text.split(/`([^`]+)`/).map((part, i): ProsePart => {
    if (i % 2 === 0) return { text: part, kind: 'text' }
    if (!newTerms) return { text: part, kind: 'code' }
    if (part.startsWith('~~')) return { text: part.slice(1), kind: 'new' }
    if (part.startsWith('~')) return { text: part.slice(1), kind: 'code' }
    return { text: part, kind: 'new' }
  })
}

/** The word to look for in code: the call without its arguments or brackets (`reset_index(name=...)` → `reset_index`). Undefined when nothing useful is left. */
export function termNeedle(term: string): string | undefined {
  let n = term.trim()
  const paren = n.indexOf('(')
  if (paren > 0) n = n.slice(0, paren)
  n = n.replace(/\s*=\s.*$/, '').replace(/\[\.\.\.\]$/, '').trim()
  return n && /[^\s()[\]{}]/.test(n) ? n : undefined
}

/** The new terms a note introduces, once each (by needle, case-insensitive), in text order: the chips of its header and the words marked in its example. */
export function newTermsOf(text: string): { label: string; needle: string }[] {
  const seen = new Set<string>()
  const out: { label: string; needle: string }[] = []
  for (const p of proseParts(text, true)) {
    if (p.kind !== 'new') continue
    // a list of columns in double brackets is found by its opening brackets
    const double = /^\[\[.*\]\]$/.test(p.text.trim())
    const needle = double ? '[[' : termNeedle(p.text)
    if (!needle || seen.has(needle.toLowerCase())) continue
    seen.add(needle.toLowerCase())
    out.push({ label: double ? p.text.trim() : needle, needle })
  }
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A regex for the needle: spaces match any whitespace, a word is not part of a longer word, a case-insensitive match for SQL. */
export function needleRegex(needle: string, ignoreCase: boolean): RegExp {
  const body = needle.split(/\s+/).map(escapeRe).join('\\s+')
  const before = /^\w/.test(needle) ? '(?<!\\w)' : ''
  const after = /\w$/.test(needle) ? '(?!\\w)' : ''
  return new RegExp(before + body + after, ignoreCase ? 'gi' : 'g')
}

/** Where the needles occur in a document: sorted, non-overlapping `[from, to]` pairs. */
export function termRanges(doc: string, needles: string[], ignoreCase: boolean): [number, number][] {
  const found: [number, number][] = []
  for (const n of needles) {
    const re = needleRegex(n, ignoreCase)
    for (const m of doc.matchAll(re)) found.push([m.index!, m.index! + m[0].length])
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: [number, number][] = []
  for (const r of found) if (!out.length || r[0] >= out[out.length - 1][1]) out.push(r)
  return out
}
