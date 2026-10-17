// Word-level diff of a T-SQL statement and its DuckDB translation (stage 4), for the side-by-side
// view: what was taken out on the left, what came in on the right. Keywords are compared without
// case (sqlglot writes them in capitals) and whitespace is not compared at all (it re-indents).

export interface Segment {
  text: string
  /** true: removed (left side) or added (right side); false: the same on both sides */
  changed: boolean
}

export interface SideBySide {
  left: Segment[]
  right: Segment[]
  /** runs of changed words: “5 changes” */
  changes: number
}

// Quoted names and strings stay whole, so [First Name] → "First Name" is one change.
const TOKEN = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|N?'(?:[^']|'')*'|"(?:[^"]|"")*"|\[[^\]]*\]|`[^`]*`|\d+(?:\.\d+)?|[\p{L}_@#$][\p{L}\p{N}_@#$]*|::|<>|!=|<=|>=|\|\||./gu

export function tokenize(sql: string): string[] {
  return sql.match(TOKEN) ?? []
}

const isSpace = (t: string) => /^\s+$/.test(t)
const key = (t: string) => (/^[\p{L}_]/u.test(t) ? t.toLowerCase() : t)

/** Longest common subsequence of the words (not the spaces) of `a` and `b`. */
function common(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length
  const m = b.length
  // Plenty for one statement; past that, mark everything changed rather than freeze the page.
  if (n * m > 4_000_000) return [a.map(() => false), b.map(() => false)]
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const inA = a.map(() => false)
  const inB = b.map(() => false)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      inA[i++] = true
      inB[j++] = true
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return [inA, inB]
}

/** Glues neighbouring tokens with the same state; a space between two changed words stays changed. */
function segments(tokens: string[], kept: boolean[]): { segs: Segment[]; runs: number } {
  const segs: Segment[] = []
  let runs = 0
  let last: boolean | null = null
  tokens.forEach((t, i) => {
    let changed = !kept[i]
    if (isSpace(t)) {
      const next = tokens.slice(i + 1).findIndex((x) => !isSpace(x))
      const after = next < 0 ? null : !kept[i + 1 + next]
      changed = last === true && after === true
    } else if (changed && last !== true) runs++
    const prev = segs[segs.length - 1]
    if (prev && prev.changed === changed) prev.text += t
    else segs.push({ text: t, changed })
    if (!isSpace(t)) last = changed
  })
  return { segs, runs }
}

/** An AS between a name (or closing bracket) and an alias name: optional in SQL. */
function aliasAs(words: string[], i: number): boolean {
  const before = words[i - 1] ?? ''
  const after = words[i + 1] ?? ''
  const name = /^[\p{L}_"\]`)]|[\p{L}\p{N}_"\]`)]$/u
  return name.test(before) && /^[\p{L}_"]/u.test(after) && !/^(select|from|where|on|join|by|and|or|not)$/i.test(before)
}

export function sideBySide(source: string, target: string): SideBySide {
  const a = tokenize(source)
  const b = tokenize(target)
  const wa = a.filter((t) => !isSpace(t))
  const wb = b.filter((t) => !isSpace(t))
  const [keptA, keptB] = common(wa, wb)
  // Spread the word flags back over the token lists (spaces get decided in segments()).
  const spread = (tokens: string[], kept: boolean[]) => {
    let k = 0
    return tokens.map((t) => (isSpace(t) ? true : kept[k++]))
  }
  // sqlglot writes every alias with AS (customers c → customers AS c): the same query, not a change.
  wb.forEach((t, i) => {
    if (!keptB[i] && key(t) === 'as') keptB[i] = aliasAs(wb, i)
  })
  const left = segments(a, spread(a, keptA))
  const right = segments(b, spread(b, keptB))
  return { left: left.segs, right: right.segs, changes: Math.max(left.runs, right.runs) }
}
