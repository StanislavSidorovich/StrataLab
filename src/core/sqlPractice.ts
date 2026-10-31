// The practice pages (`#practice=sql`, `#practice=python`): their address, what the learner has done,
// and the notes on T-SQL that runs here but not on Fabric. Queries are translated to DuckDB, and DuckDB forgives
// things SQL Server refuses, or answers differently; a note says so instead of letting a habit form.

export interface PracticeProgress {
  /** tasks whose Check passed */
  solved: string[]
  /** sections the learner marked "I know this": their own word, never counted as solved */
  known: string[]
  /** task → hints shown */
  hints: Record<string, number>
  /** task → the query being written */
  drafts: Record<string, string>
  hideKnown: boolean
}

export const emptyProgress = (): PracticeProgress => ({ solved: [], known: [], hints: {}, drafts: {}, hideKnown: false })

/** Progress from localStorage: anything unreadable starts afresh, a missing part stays empty. */
export function readProgress(raw: string | null): PracticeProgress {
  const blank = emptyProgress()
  if (!raw) return blank
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return blank
    return {
      solved: Array.isArray(p.solved) ? p.solved : [],
      known: Array.isArray(p.known) ? p.known : [],
      hints: p.hints && typeof p.hints === 'object' ? p.hints : {},
      drafts: p.drafts && typeof p.drafts === 'object' ? p.drafts : {},
      hideKnown: p.hideKnown === true,
    }
  } catch {
    return blank
  }
}

export type BookKind = 'sql' | 'python'

/** The address of the page: whether it is asked for, which one, and which section. */
export function practiceFromHash(hash: string): { kind: BookKind; at: string | null } | null {
  const kind = /(?:^#|&)practice=(sql|python)(?:&|$)/i.exec(hash)?.[1].toLowerCase() as BookKind | undefined
  if (!kind) return null
  return { kind, at: /(?:^#|&)at=([a-z0-9-]+)/i.exec(hash)?.[1].toLowerCase() ?? null }
}

export function hashWithoutPractice(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^(practice|at)=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

export function hashWithPractice(hash: string, at: string | null, kind: BookKind = 'sql'): string {
  const rest = hashWithoutPractice(hash).replace(/^#/, '')
  return `#practice=${kind}${at ? `&at=${at}` : ''}${rest ? `&${rest}` : ''}`
}

export interface SectionTasks {
  id: string
  taskIds: string[]
}

/** Where Continue goes: the first task not solved, outside the sections marked as known. */
export function nextTask(sections: readonly SectionTasks[], p: PracticeProgress): string | null {
  for (const s of sections) {
    if (p.known.includes(s.id)) continue
    const id = s.taskIds.find((t) => !p.solved.includes(t))
    if (id) return id
  }
  return null
}

/** Solved, known (unsolved tasks of known sections) and left: they add up to all the tasks. */
export function practiceCounts(sections: readonly SectionTasks[], p: PracticeProgress) {
  let solved = 0
  let known = 0
  let left = 0
  for (const s of sections) {
    for (const t of s.taskIds) {
      if (p.solved.includes(t)) solved++
      else if (p.known.includes(s.id)) known++
      else left++
    }
  }
  return { solved, known, left }
}

/**
 * Solving the last task of a section ("Test me") offers to mark the rest as known, unless the
 * section has nothing left to skip or is marked already.
 */
export function offersKnown(section: SectionTasks, justSolved: string, p: PracticeProgress): boolean {
  if (p.known.includes(section.id) || section.taskIds[section.taskIds.length - 1] !== justSolved) return false
  return section.taskIds.some((t) => t !== justSolved && !p.solved.includes(t))
}

/** DuckDB can report an error as JSON: the sentence in it, or the text as it came. */
export function readableError(raw: string): string {
  if (!raw.trimStart().startsWith('{')) return raw
  try {
    const message = JSON.parse(raw).exception_message
    return typeof message === 'string' ? message : raw
  } catch {
    return raw
  }
}

export interface FabricNote {
  id: string
  text: string
}

/** Text without comments and string literals: their words are not SQL. */
function codeOnly(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/** Each pair of brackets' own text, with what is nested inside taken out: one query level at a time. */
function levels(code: string): string[] {
  const out: string[] = []
  const stack: string[] = ['']
  for (const c of code) {
    if (c === '(') {
      stack[stack.length - 1] += '()'
      stack.push('')
    } else if (c === ')') {
      if (stack.length > 1) out.push(stack.pop()!)
    } else stack[stack.length - 1] += c
  }
  return [...out, ...stack]
}

const CLAUSE_END = /\b(?:having|order\s+by|union|except|intersect)\b/i

/** Aliases of computed values at one query level: `YEAR() AS y`, `p.brand AS b`, not `brand AS brand`. */
function computedAliases(level: string): Set<string> {
  const names = new Set<string>()
  for (const m of level.matchAll(/([^\s,]+)\s+as\s+([a-z_]\w*)/gi)) {
    const source = m[1].split('.').pop()!.toLowerCase()
    if (source !== m[2].toLowerCase()) names.add(m[2].toLowerCase())
  }
  return names
}

/** A GROUP BY or HAVING at this level that names one of the level's computed aliases. */
function aliasIn(level: string, clause: 'group by' | 'having'): string | null {
  const start = new RegExp(`\\b${clause.replace(' ', '\\s+')}\\b`, 'i').exec(level)
  if (!start) return null
  let body = level.slice(start.index + start[0].length)
  const end = (clause === 'having' ? /\b(?:order\s+by|union|except|intersect)\b/i : CLAUSE_END).exec(body)
  if (end) body = body.slice(0, end.index)
  const aliases = computedAliases(level)
  return body.match(/(?<![\w.])[a-z_]\w*(?![\w(.])/gi)?.find((w) => aliases.has(w.toLowerCase())) ?? null
}

const SYNTAX: { id: string; re: RegExp; text: string }[] = [
  { id: 'limit', re: /\blimit\s+\d/i, text: 'LIMIT is not T-SQL: write SELECT TOP (n) on Fabric.' },
  { id: 'cast-colons', re: /::/, text: 'x::type is not T-SQL: write CAST(x AS type).' },
  { id: 'filter', re: /\bfilter\s*\(\s*where\b/i, text: 'FILTER (WHERE …) is not T-SQL: use SUM(CASE WHEN … THEN x END).' },
  { id: 'qualify', re: /\bqualify\b/i, text: 'QUALIFY is not T-SQL: put the window function in a CTE and filter outside it.' },
  { id: 'group-by-all', re: /\bgroup\s+by\s+all\b/i, text: 'GROUP BY ALL is not T-SQL: name the columns.' },
  { id: 'using', re: /\bjoin\s+[\w.]+(?:\s+(?:as\s+)?\w+)?\s+using\s*\(/i, text: 'JOIN … USING is not T-SQL: write ON a.x = b.x.' },
  { id: 'ilike', re: /\bilike\b/i, text: 'ILIKE is not T-SQL: compare with LOWER(x) LIKE ….' },
  { id: 'pipes', re: /\|\|/, text: '|| is not T-SQL: use CONCAT(a, b) or a + b.' },
  { id: 'date-trunc', re: /\bdate_trunc\s*\(/i, text: "date_trunc is not T-SQL: write DATETRUNC(month, d)." },
  { id: 'strftime', re: /\bstrftime\s*\(/i, text: "strftime is not T-SQL: write FORMAT(d, 'yyyy-MM')." },
]

// COUNT(...) / n, or two whole numbers, unless a decimal factor came first (1.0 * COUNT(*) / n).
const INT_DIVISION = /(?<!\.\d*\s*\*\s*)\bcount\s*\(\)\s*\/|(?<![\d.])\d+\s*\/\s*\d+(?![\d.])/i

/** What in this query works here but fails or answers differently on Fabric. */
export function fabricNotes(sql: string): FabricNote[] {
  const code = codeOnly(sql)
  const notes: FabricNote[] = SYNTAX.filter((r) => r.re.test(code)).map(({ id, text }) => ({ id, text }))
  const each = levels(code)
  const flat = each.join(' ')
  const grouped = each.map((l) => aliasIn(l, 'group by')).find(Boolean)
  if (grouped) notes.push({ id: 'group-by-alias', text: `GROUP BY ${grouped} uses a name given in SELECT. It runs here; on Fabric repeat the expression.` })
  const having = each.map((l) => aliasIn(l, 'having')).find(Boolean)
  if (having) notes.push({ id: 'having-alias', text: `HAVING ${having} uses a name given in SELECT. It runs here; on Fabric repeat the expression.` })
  if (INT_DIVISION.test(flat)) notes.push({ id: 'int-division', text: 'Whole numbers divide with a fraction here, but on Fabric 7 / 2 is 3. Write 1.0 * a / b, or CAST one side.' })
  return notes
}
