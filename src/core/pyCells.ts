// Python tabs (stage 7): a tab is split into cells by `# %%` lines (the percent format of VS Code,
// Spyder and Jupytext), and before a cell runs the page looks for the tables it reads with
// `lab.table("…")` and `lab.sql("…")`, so it can send them along (a worker can't wait for the page).

export interface Cell {
  kind: 'code' | 'markdown'
  /** the cell's text without its `# %%` line; a markdown cell's lines without their `# ` */
  source: string
  /** where the cell starts in the tab (its `# %%` line, if it has one) and ends */
  from: number
  to: number
  /** the 1-based line of the tab where `source` starts, for tracebacks */
  line: number
}

const MARKER = /^#\s?%%(.*)$/
const isMarkdown = (rest: string) => /^\s*\[(markdown|md)\]/i.test(rest)

/** The tab's cells, in order. Text before the first `# %%` is a cell when it isn't blank. */
export function splitCells(text: string): Cell[] {
  const lines = text.split('\n')
  const cells: Cell[] = []
  let at = 0
  let current: { kind: Cell['kind']; from: number; line: number; body: string[]; marked: boolean } = { kind: 'code', from: 0, line: 1, body: [], marked: false }
  const close = (to: number) => {
    const body = current.body.join('\n').replace(/\s+$/, '')
    if (!current.marked && !body.trim()) return
    const source = current.kind === 'markdown' ? current.body.map((l) => l.replace(/^#\s?/, '')).join('\n').trim() : body.replace(/^\s*\n/, '')
    const skipped = current.kind === 'code' ? current.body.findIndex((l) => l.trim() !== '') : 0
    cells.push({ kind: current.kind, source, from: current.from, to, line: current.line + Math.max(0, skipped) })
  }
  lines.forEach((l, i) => {
    const m = MARKER.exec(l)
    if (m) {
      close(at > 0 ? at - 1 : 0)
      current = { kind: isMarkdown(m[1]) ? 'markdown' : 'code', from: at, line: i + 2, body: [], marked: true }
    } else current.body.push(l)
    at += l.length + 1
  })
  close(text.length)
  return cells
}

/** The index of the cell the cursor is in (the last one when it is past the end), -1 with no cells. */
export function cellAt(cells: Cell[], pos: number): number {
  if (!cells.length) return -1
  const i = cells.findIndex((c) => pos >= c.from && pos <= c.to)
  if (i >= 0) return i
  const before = cells.filter((c) => c.from <= pos)
  return before.length ? cells.indexOf(before[before.length - 1]) : 0
}

/** Cells back into a tab's text: `# %%` before each, markdown lines as `# ` comments. */
export function joinCells(cells: { kind: Cell['kind']; source: string }[]): string {
  return (
    cells
      .map((c) =>
        c.kind === 'markdown'
          ? `# %% [markdown]\n${c.source.split('\n').map((l) => (l ? `# ${l}` : '#')).join('\n')}`
          : `# %%\n${c.source.replace(/\s+$/, '')}`,
      )
      .join('\n\n') + '\n'
  )
}

// ------------------------------------------------------------------ the tables a cell reads

type Token = { type: 'name' | 'op' | 'str'; value: string } | { type: 'dyn' }

const STRING_START = /^([rRbBuUfF]{0,2})('''|"""|'|")/

/** Python's escapes in a string that is not raw. */
function unescape(s: string): string {
  return s.replace(/\\(\n|[\\'"abfnrtv]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3})/g, (_, e: string) => {
    if (e === '\n') return ''
    const simple: Record<string, string> = { '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }
    if (e in simple) return simple[e]
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16))
    return String.fromCharCode(parseInt(e, 8))
  })
}

/** Names, operators and string literals; comments dropped; f-strings marked as not literal. */
function tokens(code: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '#') {
      while (i < code.length && code[i] !== '\n') i++
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    const s = STRING_START.exec(code.slice(i, i + 5))
    if (s) {
      const prefix = s[1].toLowerCase()
      const quote = s[2]
      let j = i + s[0].length
      let body = ''
      while (j < code.length && !code.startsWith(quote, j)) {
        if (code[j] === '\\') {
          body += code.slice(j, j + 2)
          j += 2
        } else if (quote.length === 1 && code[j] === '\n') break
        else body += code[j++]
      }
      i = j + quote.length
      if (prefix.includes('f') || prefix.includes('b')) out.push({ type: 'dyn' })
      else out.push({ type: 'str', value: prefix.includes('r') ? body : unescape(body) })
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(i))
    if (name) {
      out.push({ type: 'name', value: name[0] })
      i += name[0].length
      continue
    }
    out.push({ type: 'op', value: c })
    i++
  }
  return out
}

export interface LabCall {
  kind: 'table' | 'sql'
  /** the table's name, or the SQL */
  arg: string
}

/**
 * The `lab.table("…")` and `lab.sql("…")` calls whose first argument is written out as a string
 * (adjacent strings joined, as Python does), in order and without repeats. A name built at run time
 * (`lab.table(name)`, an f-string) is not here: it is fetched while the cell runs, where it can be.
 */
export function labCalls(code: string): LabCall[] {
  const t = tokens(code)
  const found: LabCall[] = []
  for (let i = 0; i + 4 < t.length; i++) {
    const [a, dot, fn, open] = t.slice(i, i + 4)
    if (a.type !== 'name' || a.value !== 'lab' || dot.type !== 'op' || dot.value !== '.' || fn.type !== 'name' || (fn.value !== 'table' && fn.value !== 'sql') || open.type !== 'op' || open.value !== '(') continue
    if (i > 0 && t[i - 1].type === 'op' && (t[i - 1] as { value: string }).value === '.') continue
    let j = i + 4
    let arg = ''
    while (j < t.length && t[j].type === 'str') arg += (t[j++] as { value: string }).value
    const after = t[j]
    if (j === i + 4 || !after || after.type !== 'op' || (after.value !== ')' && after.value !== ',')) continue
    const call: LabCall = { kind: fn.value, arg }
    if (!found.some((f) => f.kind === call.kind && f.arg === call.arg)) found.push(call)
  }
  return found
}

/** The key a fetched table or query result travels under (`lab.py` looks it up the same way). */
export const callKey = (c: LabCall) => `${c.kind}:${c.kind === 'table' ? c.arg.trim() : c.arg}`

/**
 * The DuckDB SQL for a `lab.table` name: `orders`, `quaera.fact_sellout`, `"Order Details"`,
 * `northwind."Order Details"`. A name that is already quoted is kept; others are quoted.
 */
export function tableSql(name: string): string {
  const bad = () => new Error(`lab.table: “${name}” is not a table name`)
  const parts: string[] = []
  const n = name.trim()
  let i = 0
  while (i < n.length) {
    if (n[i] === '"') {
      const end = /^"(?:[^"]|"")*"/.exec(n.slice(i))
      if (!end) throw bad()
      parts.push(end[0])
      i += end[0].length
    } else {
      const part = /^[^."]+/.exec(n.slice(i))?.[0].trim()
      if (!part) throw bad()
      parts.push(`"${part}"`)
      i += /^[^."]+/.exec(n.slice(i))![0].length
    }
    if (i < n.length && n[i++] !== '.') throw bad()
    if (i === n.length && n.endsWith('.')) throw bad()
  }
  if (!parts.length || parts.length > 3) throw bad()
  return `SELECT * FROM ${parts.join('.')}`
}
