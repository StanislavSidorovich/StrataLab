// Pure TypeScript helper for Feature C ("Copy context for AI"):
// builds a schema + summary + current-cell + last-output/error prompt without leaking raw DataFrame rows.
import { cellAt, labCalls, splitCells } from './pyCells'
import type { Output } from './ipynb'

export const COPY_CONTEXT_TOAST = 'Copied: schema and summary, no rows'
export const DEFAULT_AI_INSTRUCTION =
  'I am doing data mining exploration/preprocessing/processing/analysis; explain the decision, do not just give the final code.'
export const MAX_AI_CONTEXT_COLS = 60
export const MAX_AI_CELL_CHARS = 4000
export const MAX_AI_SUMMARY_CHARS = 1500
export const MAX_AI_CONTEXT_CHARS = 12000

export type DmStageName = 'exploration' | 'preprocessing' | 'processing' | 'analysis'

export interface AiContextTable {
  name: string
  rows: number | null
  columns: readonly { name: string; type: string; nullable?: boolean }[]
}

export interface AiContextCellRun {
  source: string
  outputs: readonly Output[]
}

export interface AiContextSampleRows {
  tableName: string
  header: readonly string[]
  rows: readonly (readonly string[])[]
}

export interface AiContextOptions {
  tabTitle: string
  tabText: string
  cursorPos: number
  tables: readonly AiContextTable[]
  cellRuns: readonly AiContextCellRun[]
  fallbackLastOutputs?: readonly Output[]
  sampleRows?: AiContextSampleRows | null
  instruction?: string
}

export interface BuiltAiContext {
  text: string
  truncated: boolean
  hasSummary: boolean
  lastError: string | null
  stage: DmStageName | null
  referencedTables: string[]
}

const NOT_COMPUTED_MESSAGE =
  'Not computed yet: run exploration first (df.isna().sum() and df.describe()) to include null counts and summary statistics.'

const CODE_STAGE_RE =
  /^\s*#\s*(?:#+\s*)?(?:\d+[.)]\s*|stage\s*\d*[:.\-\s]*)?(preprocessing|exploration|processing|analysis)\b/i
const MD_HEADING_STAGE_RE =
  /^\s*(?:#+\s*)?(?:\d+[.)]\s*|stage\s*\d*[:.\-\s]*)?(preprocessing|exploration|processing|analysis)\b/i

function matchStageInLine(line: string, isMarkdown: boolean): DmStageName | null {
  if (isMarkdown) {
    const heading = MD_HEADING_STAGE_RE.exec(line)
    if (heading) return heading[1].toLowerCase() as DmStageName
    // Check preprocessing before processing so substring cannot collide.
    if (/\bpreprocessing\b/i.test(line)) return 'preprocessing'
    if (/\bexploration\b/i.test(line)) return 'exploration'
    if (/\bprocessing\b/i.test(line)) return 'processing'
    if (/\banalysis\b/i.test(line)) return 'analysis'
    return null
  }
  const m = CODE_STAGE_RE.exec(line)
  return m ? (m[1].toLowerCase() as DmStageName) : null
}

/**
 * Checks cells/headings up to `cursorPos` for exploration, preprocessing, processing, or analysis
 * (case-insensitive, checking preprocessing before processing).
 */
export function detectCellStage(tabText: string, cursorPos: number): DmStageName | null {
  const cells = splitCells(tabText)
  if (!cells.length) return null
  const idx = cellAt(cells, cursorPos)
  if (idx < 0) return null

  const clamped = Math.max(0, Math.min(tabText.length, cursorPos))
  const cursorLine = tabText.slice(0, clamped).split('\n').length

  for (let i = idx; i >= 0; i--) {
    const cell = cells[i]
    let lines = cell.source.split('\n')
    if (i === idx && cell.kind === 'code') {
      const relCount = Math.max(1, cursorLine - cell.line + 1)
      lines = lines.slice(0, relCount)
    }
    for (let j = lines.length - 1; j >= 0; j--) {
      const stage = matchStageInLine(lines[j], cell.kind === 'markdown')
      if (stage) return stage
    }
  }
  return null
}

function truncateBlock(text: string, maxChars: number, suffix: string): string {
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(0, maxChars - suffix.length)) + suffix
}

function stripComments(code: string): string {
  return code.replace(/#.*$/gm, '')
}

function extractSafeSummaryOutputText(outputs: readonly Output[]): string | null {
  if (outputs.some((o) => o.output_type === 'error')) return null
  const parts: string[] = []
  for (const o of outputs) {
    if (o.output_type === 'stream') {
      const t = o.text.trimEnd()
      if (t) parts.push(t)
    } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
      if (o.data['image/png'] != null) continue
      const plain = o.data['text/plain']?.trimEnd()
      if (plain) parts.push(plain)
    }
  }
  return parts.length ? parts.join('\n') : null
}

/**
 * Scans executed cellRuns in reverse (latest first) to extract computed null-count and
 * describe() summaries without picking up raw-row DataFrame outputs.
 */
export function extractComputedSummaries(cellRuns: readonly AiContextCellRun[]): {
  nullCounts: string | null
  describeSummary: string | null
} {
  let nullCounts: string | null = null
  let describeSummary: string | null = null

  for (let i = cellRuns.length - 1; i >= 0; i--) {
    const run = cellRuns[i]
    const code = stripComments(run.source)
    const hasRawRowCall = /\.(?:head|tail|sample)\s*\(/i.test(code)

    if (nullCounts === null && /\.(?:isna|isnull)\s*\(/.test(code) && !hasRawRowCall) {
      const text = extractSafeSummaryOutputText(run.outputs)
      if (text) nullCounts = truncateBlock(text, MAX_AI_SUMMARY_CHARS, '\n[... summary truncated]')
    }

    if (describeSummary === null && /\.describe\s*\(/.test(code) && !/\b(?:display|print)\s*\([^)]*\.(?:head|tail|sample)\s*\(/i.test(code)) {
      const text = extractSafeSummaryOutputText(run.outputs)
      if (text) describeSummary = truncateBlock(text, MAX_AI_SUMMARY_CHARS, '\n[... summary truncated]')
    }

    if (nullCounts !== null && describeSummary !== null) break
  }

  return { nullCounts, describeSummary }
}

const SAFE_SUMMARY_RE =
  /\.(?:describe|isna|isnull|info|dtypes|shape|columns|nunique|count|sum|mean|median|std|var|min|max|corr|cov|value_counts|duplicated|agg|quantile)\b/

function looksLikeRawRowDump(cellSource: string): boolean {
  const code = stripComments(cellSource)
  if (/\.(?:head|tail|sample)\s*\(/i.test(code)) return true
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const last = lines.at(-1) ?? ''
  if (!last) return false
  if (/^(?:display\s*\(\s*)?[A-Za-z_][A-Za-z0-9_]*\s*\)?$/.test(last)) return true
  if (
    /^(?:display\s*\(\s*)?(?:lab\.(?:table|sql)\s*\(.*\)|[A-Za-z_][A-Za-z0-9_]*\s*(?:\[.*\]|\.(?:loc|iloc)\b.*))\s*\)?$/.test(
      last,
    ) &&
    !SAFE_SUMMARY_RE.test(last)
  ) {
    return true
  }
  return false
}

/**
 * Formats the outcome of a cell's run: error (`ename: evalue` + up to 8 traceback lines) or safe
 * non-row output (omitting raw-row DataFrames, `text/html`, and `image/png` base64).
 */
export function formatLastCellOutcome(
  outputs: readonly Output[],
  cellSource: string,
): { lastError: string | null; outputText: string | null } {
  if (!outputs.length) return { lastError: null, outputText: null }

  const err = outputs.find((o): o is Extract<Output, { output_type: 'error' }> => o.output_type === 'error')
  if (err) {
    const header = err.evalue ? `${err.ename}: ${err.evalue}` : err.ename
    const tb = err.traceback
      .flatMap((line) => line.split('\n'))
      .filter((line) => line.length > 0)
      .slice(0, 8)
    const lastError = tb.length ? `${header}\n${tb.join('\n')}` : header
    return { lastError, outputText: null }
  }

  const code = stripComments(cellSource)
  const rawDump = looksLikeRawRowDump(cellSource)
  const safeSummary = SAFE_SUMMARY_RE.test(code)
  const parts: string[] = []

  for (const o of outputs) {
    if (o.output_type === 'stream') {
      const t = o.text.trimEnd()
      if (t) parts.push(t)
    } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
      if (o.data['image/png'] != null) {
        parts.push('<Figure output omitted>')
        continue
      }
      const hasHtml = o.data['text/html'] != null
      const plain = o.data['text/plain']?.trimEnd()
      if (rawDump || (hasHtml && !safeSummary)) {
        parts.push('<DataFrame output omitted: no raw rows included>')
      } else if (plain) {
        parts.push(plain)
      } else if (hasHtml) {
        parts.push('<DataFrame output omitted: no raw rows included>')
      }
    }
  }

  return { lastError: null, outputText: parts.length ? parts.join('\n') : null }
}

function normalizeTableRef(ref: string): string {
  return ref.trim().replace(/"/g, '').toLowerCase()
}

function resolveReferencedTables(tabText: string, tables: readonly AiContextTable[]): AiContextTable[] {
  const calls = labCalls(tabText).filter((c) => c.kind === 'table')
  const matched: AiContextTable[] = []
  const seen = new Set<AiContextTable>()

  for (const call of calls) {
    const arg = call.arg.trim().toLowerCase()
    const norm = normalizeTableRef(call.arg)
    const found = tables.find(
      (t) => t.name.toLowerCase() === arg || normalizeTableRef(t.name) === norm,
    )
    if (found && !seen.has(found)) {
      seen.add(found)
      matched.push(found)
    }
  }

  if (matched.length > 0) return matched
  if (tables.length === 1) return [tables[0]]
  return []
}

function formatTableSchema(t: AiContextTable): string {
  const rowLabel =
    t.rows === null ? 'row count unknown' : `${t.rows.toLocaleString('en-US')} rows`
  const colCountLabel = `${t.columns.length} column${t.columns.length === 1 ? '' : 's'}`
  const lines = [`Table: ${t.name} (${rowLabel}, ${colCountLabel})`]
  if (t.columns.length === 0) {
    lines.push('Columns: (none)')
  } else {
    lines.push('Columns:')
    const shown = t.columns.slice(0, MAX_AI_CONTEXT_COLS)
    for (const c of shown) {
      lines.push(`  - ${c.name}: ${c.type}`)
    }
    if (t.columns.length > MAX_AI_CONTEXT_COLS) {
      lines.push(`  ... and ${t.columns.length - MAX_AI_CONTEXT_COLS} more columns`)
    }
  }
  return lines.join('\n')
}

function findCurrentCellRun(
  cellRuns: readonly AiContextCellRun[],
  cellSource: string,
): AiContextCellRun | undefined {
  for (let i = cellRuns.length - 1; i >= 0; i--) {
    if (cellRuns[i].source === cellSource) return cellRuns[i]
  }
  const trimmed = cellSource.trim()
  if (!trimmed) return undefined
  for (let i = cellRuns.length - 1; i >= 0; i--) {
    if (cellRuns[i].source.trim() === trimmed) return cellRuns[i]
  }
  return undefined
}

/**
 * Builds the structured prompt context for AI assistance from a Python tab's schema, computed
 * exploration summaries, current cell, and last error/output — without raw rows by default.
 */
export function buildAiContext(opts: AiContextOptions): BuiltAiContext {
  const stage = detectCellStage(opts.tabText, opts.cursorPos)
  const selectedTables = resolveReferencedTables(opts.tabText, opts.tables)
  const referencedTables = selectedTables.map((t) => t.name)

  // 1. Table & Schema
  let schemaBody: string
  if (selectedTables.length > 0) {
    schemaBody = selectedTables.map(formatTableSchema).join('\n\n')
  } else if (opts.tables.length > 0) {
    schemaBody = `No table referenced directly via lab.table(...) in this tab.\nAvailable tables: ${opts.tables.map((t) => t.name).join(', ')}`
  } else {
    schemaBody = 'No tables loaded.'
  }

  // 2. Exploration Summary
  const { nullCounts, describeSummary } = extractComputedSummaries(opts.cellRuns)
  const hasSummary = Boolean(nullCounts || describeSummary)
  const summaryParts: string[] = []
  if (nullCounts) summaryParts.push(`Null counts (isna/isnull):\n${nullCounts}`)
  if (describeSummary) summaryParts.push(`Summary statistics (describe):\n${describeSummary}`)
  const summaryBody = hasSummary ? summaryParts.join('\n\n') : NOT_COMPUTED_MESSAGE

  // 3. Current Cell
  const cells = splitCells(opts.tabText)
  const idx = cellAt(cells, opts.cursorPos)
  const currentCell = idx >= 0 ? cells[idx] : null
  const rawCellCode = currentCell ? currentCell.source : opts.tabText.trim()
  const cellCode = truncateBlock(
    rawCellCode || '(empty cell)',
    MAX_AI_CELL_CHARS,
    '\n[... cell truncated]',
  )
  const currentCellBody = stage ? `Stage: ${stage}\n${cellCode}` : cellCode

  // 4. Last Error / Output
  const matchedRun = currentCell ? findCurrentCellRun(opts.cellRuns, currentCell.source) : undefined
  const outcomeOutputs = matchedRun?.outputs ?? opts.fallbackLastOutputs ?? []
  const outcomeSource = matchedRun ? currentCell!.source : (currentCell?.source ?? '')
  const outcome = formatLastCellOutcome(outcomeOutputs, outcomeSource)
  const outcomeBody = outcome.lastError ?? outcome.outputText ?? '(none yet)'

  // 5. Optional Sample Rows (Part D opt-in only)
  const sections: string[] = [
    `Tab: ${opts.tabTitle}`,
    `=== Table & Schema ===\n${schemaBody}`,
    `=== Exploration Summary (no raw rows) ===\n${summaryBody}`,
    `=== Current Cell ===\n${currentCellBody}`,
    `=== Last Error / Output ===\n${outcomeBody}`,
  ]

  if (opts.sampleRows) {
    const sampleLines = [
      `Table: ${opts.sampleRows.tableName}`,
      opts.sampleRows.header.join(' | '),
      ...opts.sampleRows.rows.map((r) => r.join(' | ')),
    ]
    sections.push(`=== First 20 Rows (explicit user opt-in) ===\n${sampleLines.join('\n')}`)
  }

  // 6. Instruction
  const instruction =
    opts.instruction ??
    (stage
      ? `I am doing data mining ${stage}; explain the decision, do not just give the final code.`
      : DEFAULT_AI_INSTRUCTION)
  sections.push(`=== Instruction ===\n${instruction}`)

  const rawText = sections.join('\n\n')
  const limitSuffix = '\n[Context truncated to fit size limit]'
  const truncated = rawText.length > MAX_AI_CONTEXT_CHARS
  const text = truncated ? truncateBlock(rawText, MAX_AI_CONTEXT_CHARS, limitSuffix) : rawText

  return {
    text,
    truncated,
    hasSummary,
    lastError: outcome.lastError,
    stage,
    referencedTables,
  }
}
