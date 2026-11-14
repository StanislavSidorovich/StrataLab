// Where each function or keyword of a practice page is first taught, derived from its notes and examples
// (never typed by hand). Used by the hint links, the "where was it" search and the gate that holds every
// task to what its own section and the ones before it have shown (tests/practiceTaught.test.ts).
import type { PracticeSection } from '../data/practiceBook'

export type BookKind = 'sql' | 'python'

export interface TermIntro {
  term: string
  /** the section's number on the page */
  n: number
  sectionId: string
  title: string
  /** the element to scroll to: the note or example that first shows the term, else its section */
  anchor: string
}

export const noteAnchor = (sectionId: string, i: number) => `note-${sectionId}-${i}`
export const exampleAnchor = (exampleId: string) => `example-${exampleId}`
export const sectionAnchor = (sectionId: string) => `section-${sectionId}`

const withoutStrings = (code: string) => code.replace(/(#|--).*$/gm, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')

/** Words made of two keywords: the pair is the thing to look for (GROUP BY), not its halves. */
const SQL_PHRASES = /\b(GROUP BY|ORDER BY|PARTITION BY|LEFT JOIN|INNER JOIN|IS NOT NULL|IS NULL|UNION ALL)\b/g

export const sqlWords = (code: string) => {
  const c = withoutStrings(code)
  return [...[...c.matchAll(SQL_PHRASES)].map((m) => m[1]), ...[...c.matchAll(/\b[A-Z][A-Z_]+\b/g)].map((m) => m[0])]
}

export const pyWords = (code: string) => {
  const c = withoutStrings(code)
  return [...[...c.matchAll(/\.([a-zA-Z_]\w*)/g)].map((m) => m[1]), ...[...c.matchAll(/(?<![.\w])([a-zA-Z_]\w*)\(/g)].map((m) => m[1])]
}
/** In prose a name stands in backticks on its own (`shape`), or as code (`len(df)`). */
export const pyProse = (text: string) => [...text.matchAll(/`([^`]+)`/g)].flatMap((m) => [...pyWords(m[1]), ...(/^\w+$/.test(m[1]) ? [m[1]] : [])])

/** The basic keywords every learner has: a task may use them without a note ever teaching them. One place. */
export const BASIC_SQL = new Set(['SELECT', 'FROM', 'WHERE', 'AS', 'ON', 'BY', 'AND', 'OR', 'NOT', 'ASC', 'DESC'])
/** What a PostgreSQL rewrite says in place of the T-SQL the page teaches: dialect, not new skill. */
const PG_ONLY = new Set(['LIMIT', 'CAST', 'EXTRACT'])
export const BASIC_PY = new Set<string>()

/** Words that are in the code but are not worth a place in the search or a link in a hint. */
const NOISE_SQL = new Set(['AS', 'ON', 'BY', 'SQL', 'ORDER', 'GROUP', 'IS', 'PARTITION', 'CURRENT', 'ROW', 'PRECEDING'])
const NOISE_PY = new Set(['x', 'y', 'df', 'method', 'default', 'days', 'True', 'False', 'and', 'or', '_x', '_y'])

export interface Grammar {
  /** the terms a piece of code uses */
  code: (code: string) => string[]
  /** the terms a note's sentences teach */
  prose: (text: string) => string[]
  basic: Set<string>
  noise: Set<string>
  /** a hint that is code, not a sentence, is never decorated */
  isCode: (hint: string) => boolean
  /** a term inside a sentence: where it can stand to count as the term, not as a plain word */
  inHint: (text: string) => { term: string; at: number; length: number }[]
}

const sqlGrammar = (): Grammar => ({
  code: sqlWords,
  prose: sqlWords,
  basic: BASIC_SQL,
  noise: NOISE_SQL,
  isCode: (h) => /^\s*(SELECT|WITH)\b/.test(h) || /;\s*$/.test(h),
  inHint: (text) => {
    const found: { term: string; at: number; length: number }[] = []
    const taken = (at: number, length: number) => found.some((f) => at < f.at + f.length && f.at < at + length)
    for (const m of text.matchAll(SQL_PHRASES)) found.push({ term: m[1], at: m.index!, length: m[1].length })
    for (const m of text.matchAll(/\b[A-Z][A-Z_]+\b/g)) if (!taken(m.index!, m[0].length)) found.push({ term: m[0], at: m.index!, length: m[0].length })
    return found.sort((a, b) => a.at - b.at)
  },
})

const pyGrammar = (): Grammar => ({
  code: pyWords,
  prose: pyProse,
  basic: BASIC_PY,
  noise: NOISE_PY,
  // A hint whose first word has a bracket in it is code, whatever follows.
  isCode: (h) => /[([]/.test(h.trim().split(/\s+/)[0]),
  inHint: (text) => {
    const found: { term: string; at: number; length: number }[] = []
    for (const m of text.matchAll(/(?<![\w])(\.?)([a-zA-Z_]\w*)(\()?/g)) {
      const word = m[2]
      // A plain English word is not the method: it must have an underscore, a dot before it or a bracket after it.
      if (!(m[1] || m[3] || word.includes('_'))) continue
      const at = m.index! + m[1].length
      found.push({ term: word, at, length: word.length })
    }
    return found
  },
})

export const GRAMMARS: Record<BookKind, Grammar> = { sql: sqlGrammar(), python: pyGrammar() }

export interface PracticeIndex {
  kind: BookKind
  /** every term, in the order the page teaches it */
  terms: TermIntro[]
  introducedIn: (term: string) => TermIntro | null
  /** a term worth a link in a hint (not a table or column name, not noise) */
  linkable: (term: string) => boolean
  /** terms that contain the text, case-insensitive, the ones that start with it first */
  search: (query: string) => TermIntro[]
}

/** Walks the page in order: a term belongs to the first note that has it, else the first example. */
export function buildIndex(kind: BookKind, sections: PracticeSection[]): PracticeIndex {
  const g = GRAMMARS[kind]
  const by = new Map<string, TermIntro>()
  // Names of tables and columns are in the notes too, but they are not what one looks up here.
  const names = new Set(sections.flatMap((s) => s.blocks).flatMap((b) => (b.kind === 'tables' ? b.tables.flatMap((t) => [t.name, t.alias ?? t.name, ...t.columns]) : [])))
  const add = (term: string, s: PracticeSection, anchor: string) => {
    if (by.has(term)) return
    by.set(term, { term, n: s.n, sectionId: s.id, title: s.title, anchor })
  }
  // The notes teach; an example only shows. A term belongs to the first note that has it, and to the first
  // example only when no note does (the data map's examples run ORDER BY before section 1 explains it).
  for (const s of sections)
    s.blocks.forEach((b, i) => {
      if (b.kind === 'note') for (const w of [...(b.syntax ? g.code(b.syntax) : []), ...g.prose(b.text), ...(b.trap ? g.prose(b.trap) : [])]) add(w, s, noteAnchor(s.id, i))
    })
  for (const s of sections) {
    // Where the notes leave it open, the section names what it teaches.
    for (const w of s.introduces ?? []) add(w, s, sectionAnchor(s.id))
    for (const b of s.blocks) if (b.kind === 'example') for (const w of g.code(b.code)) add(w, s, exampleAnchor(b.id))
  }
  // Every term is known (the gate needs them); the search and the links skip the ones that only clutter.
  const shown = (t: string) => !g.noise.has(t) && !names.has(t)
  const terms = [...by.values()].filter((t) => shown(t.term))
  return {
    kind,
    terms,
    introducedIn: (term) => by.get(term) ?? null,
    linkable: (term) => shown(term) && by.has(term),
    search: (query) => {
      const q = query.trim().toLowerCase()
      if (!q) return []
      const hits = terms.filter((t) => t.term.toLowerCase().includes(q))
      const rank = (t: TermIntro) => (t.term.toLowerCase().startsWith(q) ? 0 : 1)
      return hits.sort((a, b) => rank(a) - rank(b) || a.n - b.n || a.term.localeCompare(b.term))
    },
  }
}

/** A hint cut into text and the terms that were taught in an earlier section than the task's own. */
export type HintPart = string | { term: string; intro: TermIntro; /** stands alone in a sentence: its text may say "(section 4)"; inside code the term is left as it is */ bare: boolean }

export function hintParts(kind: BookKind, index: PracticeIndex, hint: string, sectionN: number): HintPart[] {
  const g = GRAMMARS[kind]
  if (g.isCode(hint)) return [hint]
  const parts: HintPart[] = []
  const seen = new Set<string>()
  let from = 0
  for (const f of g.inHint(hint)) {
    if (f.at < from || seen.has(f.term) || g.basic.has(f.term)) continue
    const intro = index.introducedIn(f.term)
    if (!intro || !index.linkable(f.term) || intro.n >= sectionN) continue
    seen.add(f.term)
    if (f.at > from) parts.push(hint.slice(from, f.at))
    const before = hint[f.at - 1] ?? ' '
    const after = hint[f.at + f.length] ?? ' '
    parts.push({ term: hint.slice(f.at, f.at + f.length), intro, bare: !/[.`"'_]/.test(before) && !/[(.[`"'_]/.test(after) })
    from = f.at + f.length
  }
  if (from < hint.length) parts.push(hint.slice(from))
  return parts
}

/** Terms a task's solution uses that its own section and the ones before it have not shown. */
export function untaughtIn(index: PracticeIndex, sections: PracticeSection[]): string[] {
  const g = GRAMMARS[index.kind]
  const missing: string[] = []
  for (const s of sections)
    for (const b of s.blocks) {
      if (b.kind !== 'task') continue
      for (const [label, code] of [['solution', b.solution], ['pg', b.pg]] as const) {
        if (!code) continue
        const bad = [...new Set(g.code(code))].filter((w) => !g.basic.has(w) && !(label === 'pg' && PG_ONLY.has(w)) && !(index.introducedIn(w) && index.introducedIn(w)!.n <= s.n))
        if (bad.length) missing.push(`${b.id} (${label}): ${bad.join(', ')}`)
      }
    }
  return missing
}
