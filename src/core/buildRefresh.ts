// The optional step Refresh of the build page (spec docs/build-kaiyo-sales-spec.md, 5.7): a new file arrives, the learner runs the
// whole chain again and reads a journal. Pure: the state that is kept, the journal rows and the run history. The engine part is
// src/db/buildRefresh.ts, the screen src/ui/build/RefreshScreen.tsx.
import { R1_QUESTION } from '../data/build/refreshData'
import type { BuildSourceId, SalesMode } from '../data/build/kaiyoSales'
import { judgeAnswer, type AnswerInput, type AnswerResult } from './buildDashboard'

export type Stage = 'bronze' | 'clean' | 'model' | 'dashboard'
export const STAGE_LABEL: Record<Stage, string> = { bronze: 'Bronze', clean: 'Clean', model: 'Star', dashboard: 'Dashboard' }

export type Status = 'ok' | 'warning' | 'error' | 'skipped'

/** One line of the journal: a stage and the step in it, the rows before and after, how it went, how long it took. */
export interface JournalRow {
  n: number
  stage: Stage
  /** the source a bronze or clean line is about */
  source: BuildSourceId | null
  step: string
  rowsIn: number | null
  rowsOut: number | null
  status: Status
  /** warning: files not read; error: rows [Error] (0 for an error with a message only) */
  count: number
  /** one short line: what happened */
  note: string
  ms: number
}

/** What a run leaves in the history. */
export interface RunSummary {
  n: number
  /** rows of bronze_sales and of clean_sales after the run */
  bronze: number
  clean: number
  /** rows turned into [Error] by the sales steps, warnings and errors in the journal */
  errors: number
  warnings: number
}

export interface RefreshWork {
  /** how the sales source reads its folder: the 30 names it was given, or every file that matches */
  mode: SalesMode
  /** the blank: the format of the new date spelling, for the date step */
  format2: string
  /** the last three runs */
  runs: RunSummary[]
  /** the journal of the last run */
  journal: JournalRow[]
  /** R1 as typed, and passed */
  answer: AnswerInput
  done: boolean
}

export const emptyRefresh = (): RefreshWork => ({ mode: 'list', format2: '', runs: [], journal: [], answer: { pick: '', number: '' }, done: false })

const STATUS: readonly Status[] = ['ok', 'warning', 'error', 'skipped']
const STAGES: readonly Stage[] = ['bronze', 'clean', 'model', 'dashboard']
const SOURCES: readonly string[] = ['sales', 'customers', 'products', 'regions']
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

function readRow(raw: unknown): JournalRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const n = int(r.n)
  if (n === null || !STAGES.includes(r.stage as Stage) || typeof r.step !== 'string' || !STATUS.includes(r.status as Status)) return null
  return {
    n,
    stage: r.stage as Stage,
    source: SOURCES.includes(r.source as string) ? (r.source as BuildSourceId) : null,
    step: r.step.slice(0, 120),
    rowsIn: int(r.rowsIn),
    rowsOut: int(r.rowsOut),
    status: r.status as Status,
    count: int(r.count) ?? 0,
    note: typeof r.note === 'string' ? r.note.slice(0, 200) : '',
    ms: int(r.ms) ?? 0,
  }
}

function readRun(raw: unknown): RunSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const [n, bronze, clean, errors, warnings] = ['n', 'bronze', 'clean', 'errors', 'warnings'].map((k) => int(r[k]))
  return n === null || bronze === null || clean === null || errors === null || warnings === null ? null : { n, bronze, clean, errors, warnings }
}

/** Anything unreadable is dropped; work saved before Refresh existed gets the defaults (the 30 names, no runs). */
export function readRefresh(raw: unknown): RefreshWork {
  const w = emptyRefresh()
  if (!raw || typeof raw !== 'object') return w
  const r = raw as Record<string, unknown>
  if (r.mode === 'pattern') w.mode = 'pattern'
  if (typeof r.format2 === 'string') w.format2 = r.format2.slice(0, 30)
  if (Array.isArray(r.runs)) w.runs = r.runs.map(readRun).filter((x): x is RunSummary => !!x).slice(-3)
  if (Array.isArray(r.journal)) w.journal = r.journal.map(readRow).filter((x): x is JournalRow => !!x).slice(0, 60)
  const a = r.answer as Partial<AnswerInput> | undefined
  if (a && typeof a.number === 'string') w.answer.number = a.number.slice(0, 40)
  if (r.done === true) w.done = true
  return w
}

/** The next run's number: one more than the last one in the history. */
export const nextRunNumber = (runs: readonly RunSummary[]): number => (runs.length ? runs[runs.length - 1].n : 0) + 1

/** The history keeps the last three runs. */
export const pushRun = (runs: readonly RunSummary[], run: RunSummary): RunSummary[] => [...runs, run].slice(-3)

/** The run is green: nothing in the journal but ok lines. A warning is not green: something was left out. */
export const runGreen = (rows: readonly JournalRow[]): boolean => rows.length > 0 && rows.every((r) => r.status === 'ok')

export const runHasErrors = (rows: readonly JournalRow[]): boolean => rows.some((r) => r.status === 'error')

const n = (x: number) => x.toLocaleString('en-US')

/** "Run 2: 3,222 → 3,111 · 14 [Error]" */
export function runLine(r: RunSummary): string {
  const tail = r.errors > 0 ? `${n(r.errors)} [Error]` : r.warnings > 0 ? 'a file not read' : 'green'
  return `Run ${r.n}: ${n(r.bronze)} → ${n(r.clean)} · ${tail}`
}

/** How a status reads in the journal. */
export function statusText(row: Pick<JournalRow, 'status' | 'count'>): string {
  switch (row.status) {
    case 'ok':
      return 'ok'
    case 'warning':
      return row.count > 0 ? `warning: ${n(row.count)} ${row.count === 1 ? 'file' : 'files'} not read` : 'warning'
    case 'error':
      return row.count > 0 ? `error: ${n(row.count)} rows [Error]` : 'error'
    case 'skipped':
      return 'not run'
  }
}

/** "3,110 → 3,000"; a dash for a stage that has no rows before it. */
export const rowsText = (row: Pick<JournalRow, 'rowsIn' | 'rowsOut'>): string => {
  if (row.rowsOut === null) return '–'
  return row.rowsIn === null ? n(row.rowsOut) : `${n(row.rowsIn)} → ${n(row.rowsOut)}`
}

export const checkR1 = (input: AnswerInput): AnswerResult => judgeAnswer(R1_QUESTION, input)
