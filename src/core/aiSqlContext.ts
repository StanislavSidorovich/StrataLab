// What the AI helper sends from a SQL tab (v0.64.0): the dialect, the statement the cursor is in (or the
// selection), a few statements above it, the tables that statement names with their columns, and the
// last error or the shape of the last result. Never the whole tab: a PowerDesigner script has thousands of
// lines. Pure TypeScript, no React, no DuckDB.
import { statementAt, statementRanges } from './statementAt'
import { decisionsForRequest } from './aiChat'
import { assembleAiContext, formatTableSchema, truncateBlock, MAX_AI_CELL_CHARS, MAX_AI_OUTCOME_CHARS } from './aiContext'
import type { AiContextTable, BuiltAiContext } from './aiContext'

export type SqlAiDialect = 'duckdb' | 'tsql' | 'postgres'

export const SQL_DIALECT_NAMES: Record<SqlAiDialect, string> = {
  duckdb: 'DuckDB',
  tsql: 'T-SQL',
  postgres: 'PostgreSQL',
}

/** What the model is told about the dialect, one line at the top of every request. */
export const SQL_DIALECT_LINES: Record<SqlAiDialect, string> = {
  duckdb: 'DuckDB (runs as written)',
  tsql: 'T-SQL (SQL Server syntax, translated to DuckDB before it runs)',
  postgres: 'PostgreSQL (a real PostgreSQL in the browser, a separate database from DuckDB)',
}

export const MAX_AI_EARLIER_SQL_CHARS = 5000
export const MAX_AI_EARLIER_SQL_STATEMENTS = 5
const MAX_EARLIER_STATEMENT_CHARS = 800
export const MAX_AI_SQL_ROWS = 20
const MAX_AI_SQL_CELL_CHARS = 80
const MAX_REFERENCED_TABLES = 6
const MAX_LISTED_TABLES = 40
export const NO_RESULT_SET = 'Statement executed, no result set.'

export interface SqlAiResult {
  status: 'running' | 'done' | 'error'
  error?: string
  /** the user cancelled the run: not an SQL error */
  stopped?: boolean
  hints?: readonly { found: string; use: string }[]
  columns?: readonly { name: string; type: string }[]
  numRows?: number
  /** the grid holds only the first rows; more exist */
  more?: boolean
  /** the first rows, already as text, at most MAX_AI_SQL_ROWS */
  rows?: readonly (readonly string[])[]
}

export interface SqlAiTranslation {
  error?: string
  /** the script as translated, statement by statement */
  statements?: readonly { source: string; target: string | null; error: string | null; notes: readonly string[] }[]
}

export interface SqlAiOptions {
  dialect: SqlAiDialect
  tabTitle: string
  tabText: string
  cursorPos: number
  /** the selection, when there is one */
  selection?: { from: number; to: number } | null
  tables: readonly AiContextTable[]
  result?: SqlAiResult | null
  translation?: SqlAiTranslation | null
  /** also send the rows (the first 20 of the last result), explicit opt-in */
  includeRows?: boolean
  instruction?: string
  /** send the statements above the current one (default true) */
  sendEarlier?: boolean
  decisions?: string
}

export type SqlScope = 'selection' | 'statement' | 'empty'

/** The names a statement reads or writes: after FROM, JOIN, INTO, UPDATE, TABLE, REFERENCES (and a comma list after FROM). */
export function referencedNames(sql: string): string[] {
  const code = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
  const ident = String.raw`(?:"[^"]+"|\[[^\]]+\]|` + '`[^`]+`' + String.raw`|[A-Za-z_#@][\w$#@]*)`
  const name = `${ident}(?:\\s*\\.\\s*${ident}){0,2}`
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const clean = raw
      .split(/\s*\.\s*/)
      .map((p) => p.replace(/^["[`]|["\]`]$/g, ''))
      .join('.')
      .toLowerCase()
    if (clean && !seen.has(clean)) {
      seen.add(clean)
      out.push(clean)
    }
  }
  const re = new RegExp(String.raw`\b(from|join|into|update|table|references)\s+(?:if\s+(?:not\s+)?exists\s+)?(${name})((?:\s*,\s*${name})*)`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (/^(select|\(|values|only|lateral|unnest)$/i.test(m[2])) continue
    add(m[2])
    if (m[1].toLowerCase() === 'from' && m[3]) {
      for (const extra of m[3].split(',').slice(1)) {
        const n = new RegExp(`^\\s*(${name})`).exec(extra)
        if (n) add(n[1])
      }
    }
  }
  return out
}

function tableFullName(t: AiContextTable): string {
  return t.name.toLowerCase()
}

/** The catalog tables a statement names: `schema.name` exactly, else by the name alone. */
export function matchReferencedTables(names: readonly string[], tables: readonly AiContextTable[]): AiContextTable[] {
  const out: AiContextTable[] = []
  const take = (t: AiContextTable | undefined) => {
    if (t && !out.includes(t)) out.push(t)
  }
  for (const ref of names) {
    const exact = tables.find((t) => tableFullName(t) === ref)
    if (exact) {
      take(exact)
      continue
    }
    const last = ref.split('.').at(-1)!
    const byName = tables.filter((t) => t.name.toLowerCase().split('.').at(-1) === last)
    // dbo.orders in T-SQL, or a bare name that lives in a dataset's schema
    if (byName.length === 1) take(byName[0])
    else if (byName.length > 1) {
      const plain = byName.find((t) => !t.name.includes('.'))
      take(plain ?? byName[0])
    }
  }
  return out
}

function cell(v: string): string {
  const t = v.replace(/\s+/g, ' ')
  return t.length > MAX_AI_SQL_CELL_CHARS ? t.slice(0, MAX_AI_SQL_CELL_CHARS - 1) + '…' : t
}

const WRITES_RE = /^\s*(?:create|insert|update|delete|drop|alter|truncate|merge|copy|set|use|attach|detach)\b/i

function resultLines(r: SqlAiResult, sql: string): { text: string; lastError: string | null } {
  if (r.status === 'running') return { text: '(the query is still running)', lastError: null }
  if (r.status === 'error') {
    if (r.stopped) return { text: '(the last run was stopped by the learner before it finished: not an SQL error)', lastError: null }
    const lines = [`Last error:\n${r.error ?? '(no message)'}`]
    if (r.hints?.length)
      lines.push(`Quaera noticed T-SQL in a DuckDB tab:\n${r.hints.map((h) => `  ${h.found} -> ${h.use}`).join('\n')}`)
    return { text: lines.join('\n'), lastError: r.error ?? 'error' }
  }
  const cols = r.columns ?? []
  // DuckDB answers a DDL/DML with a one-column "Count" table: that is not a result set
  const countOnly = cols.length === 1 && cols[0].name === 'Count'
  const noSet = cols.length === 0 || (countOnly && ((r.numRows ?? 0) === 0 || (WRITES_RE.test(sql) && !/\breturning\b/i.test(sql))))
  if (noSet) return { text: NO_RESULT_SET, lastError: null }
  const head = `Last result: ${(r.numRows ?? 0).toLocaleString('en-US')} row${r.numRows === 1 ? '' : 's'}${r.more ? ' (more exist than were fetched)' : ''}, ${cols.length} column${cols.length === 1 ? '' : 's'}`
  const shown = cols.slice(0, 60).map((c) => `  - ${c.name}: ${c.type}`).join('\n')
  const extra = cols.length > 60 ? `\n  ... and ${cols.length - 60} more columns` : ''
  return { text: `${head}\nColumns:\n${shown}${extra}`, lastError: null }
}

/** Builds the request text for a SQL tab. */
export function buildSqlAiContext(opts: SqlAiOptions): BuiltAiContext & { scope: SqlScope; earlierStatements: number; dialect: SqlAiDialect } {
  const text = opts.tabText
  const pos = Math.max(0, Math.min(text.length, opts.cursorPos))
  const sel = opts.selection && opts.selection.to > opts.selection.from ? opts.selection : null
  const current = sel ? { from: sel.from, to: sel.to } : statementAt(text, pos)
  const scope: SqlScope = sel ? 'selection' : current ? 'statement' : 'empty'
  const currentSql = current ? text.slice(current.from, current.to) : ''
  const statementBody = scope === 'empty' ? '(empty tab)' : truncateBlock(currentSql, MAX_AI_CELL_CHARS, '\n[... statement truncated]')

  // Earlier statements: the nearest ones above, in their order, within the budget.
  let earlierParts: string[] = []
  if (opts.sendEarlier !== false && current) {
    const above = statementRanges(text).filter((r) => r.to <= current.from)
    let used = 0
    const picked: string[] = []
    for (let i = above.length - 1; i >= 0 && picked.length < MAX_AI_EARLIER_SQL_STATEMENTS; i--) {
      const s = truncateBlock(text.slice(above[i].from, above[i].to), MAX_EARLIER_STATEMENT_CHARS, '\n[... cut]')
      if (used + s.length > MAX_AI_EARLIER_SQL_CHARS) break
      used += s.length + 2
      picked.unshift(s)
    }
    earlierParts = picked
  }

  // Tables: only those the current statement names.
  const names = scope === 'empty' ? [] : referencedNames(currentSql)
  const matched = matchReferencedTables(names, opts.tables).slice(0, MAX_REFERENCED_TABLES)
  const referencedTables = matched.map((t) => t.name)
  let schemaBody: string
  if (matched.length > 0) schemaBody = matched.map(formatTableSchema).join('\n\n')
  else if (opts.tables.length === 0) schemaBody = 'No tables loaded.'
  else {
    const list = opts.tables.slice(0, MAX_LISTED_TABLES).map((t) => t.name).join(', ')
    const more = opts.tables.length > MAX_LISTED_TABLES ? `, ... and ${opts.tables.length - MAX_LISTED_TABLES} more` : ''
    schemaBody = `${scope === 'empty' ? 'The tab is empty.' : 'The statement names no loaded table.'}\nAvailable tables: ${list}${more}`
  }

  const r = opts.result ? resultLines(opts.result, currentSql) : { text: '(nothing has run in this tab yet)', lastError: null }
  const resultBody = [r.text]
  if (opts.dialect === 'tsql' && opts.translation) {
    const tr = opts.translation
    const wanted = currentSql.trim()
    const st = tr.statements?.find((x) => x.source.trim() === wanted) ?? (tr.statements?.length === 1 && scope !== 'empty' ? tr.statements[0] : undefined)
    if (tr.error) resultBody.push(`Translation error:\n${tr.error}`)
    else if (st) {
      if (st.error) resultBody.push(`Translation error for this statement:\n${st.error}`)
      else if (st.target) resultBody.push(`The statement as translated to DuckDB:\n${truncateBlock(st.target, MAX_AI_CELL_CHARS, '\n[... cut]')}`)
      if (st.notes.length) resultBody.push(`Translation notes: ${st.notes.join('; ')}`)
    }
  }

  const decisions = decisionsForRequest(opts.decisions ?? '')
  const sections: string[] = [
    `Dialect: ${SQL_DIALECT_LINES[opts.dialect]}`,
    `Tab: ${opts.tabTitle}`,
    `=== Tables the statement uses ===\n${schemaBody}`,
  ]
  if (decisions) sections.push(`=== Decisions so far (written by the learner) ===\n${decisions}`)
  if (earlierParts.length) sections.push(`=== Statements above (no results) ===\n${earlierParts.join('\n\n')}`)
  sections.push(
    `=== ${scope === 'selection' ? 'Selected SQL' : 'Current Statement'} ===\n${statementBody}`,
    `=== Last Result / Error ===\n${truncateBlock(resultBody.join('\n\n'), MAX_AI_OUTCOME_CHARS, '\n[... output truncated]')}`,
  )
  const res = opts.result
  if (opts.includeRows && res?.status === 'done' && res.columns?.length && res.rows?.length) {
    const lines = [res.columns.map((c) => c.name).join(' | '), ...res.rows.slice(0, MAX_AI_SQL_ROWS).map((row) => row.map(cell).join(' | '))]
    sections.push(`=== First ${Math.min(res.rows.length, MAX_AI_SQL_ROWS)} Rows of the last result (explicit user opt-in) ===\n${lines.join('\n')}`)
  }
  const instruction =
    opts.instruction ?? 'Explain what this statement does and what to check next; do not just give the final query.'
  const { text: out, truncated } = assembleAiContext(sections, `=== Instruction ===\n${instruction}`)

  return {
    text: out,
    truncated,
    hasSummary: false,
    lastError: r.lastError,
    stage: null,
    referencedTables,
    notebookCells: 0,
    notebookCodeCells: 0,
    notebookShortened: 0,
    hasDecisions: decisions !== '',
    scope,
    earlierStatements: earlierParts.length,
    dialect: opts.dialect,
  }
}

/** "Replace current statement": the selection, else the statement under the cursor, becomes `code`; an empty tab just gets it. */
export function replaceCurrentStatement(
  tabText: string,
  cursorPos: number,
  code: string,
  selection?: { from: number; to: number } | null,
): { text: string; cursor: number } {
  const clean = code.trim()
  if (!clean) return { text: tabText, cursor: Math.min(cursorPos, tabText.length) }
  const sel = selection && selection.to > selection.from ? selection : null
  const range = sel ?? statementAt(tabText, Math.max(0, Math.min(tabText.length, cursorPos)))
  if (!range) return { text: clean, cursor: clean.length }
  const text = tabText.slice(0, range.from) + clean + tabText.slice(range.to)
  return { text, cursor: range.from + clean.length }
}
