// Model v1, Dashboard and Answer of the build page (spec docs/build-kaiyo-sales-spec.md, sections 4.1, 5.1 to 5.4). Pure:
// the blanks of the two tiles, the lines said about a wrong result, the answer parser and checker, and the part of the
// saved state that belongs to these steps. The engine part is src/db/buildRun.ts.
import { ANSWERS, BUILD_DASH_DIAGNOSIS, TILE_IDS, TILE_SQL, TILE_TABLE, T, type AnswerId, type TileId } from '../data/build/kaiyoSales'
import { checkBlank } from './pipeline'

export type { AnswerId, TileId }

// ---------------------------------------------------------------- the tiles

/** The blank as written into the SQL: the join of the chains tile already says `f.`, so `f.customer_id` is accepted too. */
const blankText = (id: TileId, blank: string): string => (id === 'chains' ? blank.trim().replace(/^f\s*\.\s*/i, '') : blank.trim())

/** The SQL of a tile as the learner reads it: a plain SELECT with their blank written in. */
export const tileSql = (id: TileId, blank: string): string => TILE_SQL[id].replace('____', () => blankText(id, blank))

/** What Lab runs: the learner's SELECT inside the statement that keeps its result as the tile's table. */
export const tileRunSql = (id: TileId, blank: string): string => `CREATE OR REPLACE TABLE ${T(TILE_TABLE[id])} AS
${tileSql(id, blank)}`

/** Why a blank can't be run, or null. */
export const tileBlankProblem = (_id: TileId, blank: string): string | null => checkBlank(blank)

/** The chains blank names another column than the key of the customers (the check says so only when the result is wrong). */
export const chainsKeyOff = (blank: string): boolean => blankText('chains', blank).toLowerCase() !== 'customer_id'

const intLike = (n: number) => Number.isInteger(n)
/** 595, 3,523, 552.47: whole numbers without decimals, the rest with two. */
export function fmtValue(v: string | number): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return intLike(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface TileDiagnosis {
  ok: boolean
  /** the line to show; null when passed */
  line: string | null
}

export interface KpiFacts {
  /** the value the tile shows, as text; null when the SQL failed */
  value: string | null
  /** it is exactly the reference revenue */
  match: boolean
  /** the engine's message when the SQL failed */
  error: string | null
  blank: string
}

export function diagnoseKpi(f: KpiFacts): TileDiagnosis {
  if (f.error) return { ok: false, line: BUILD_DASH_DIAGNOSIS.syntax(f.error) }
  if (f.match) return { ok: true, line: null }
  const v = f.value === null ? '' : fmtValue(f.value)
  const b = f.blank.toLowerCase()
  if (/\bcount\s*\(/.test(b)) return { ok: false, line: BUILD_DASH_DIAGNOSIS.kpiCount(v) }
  if (/\bsum\s*\(\s*units\b/.test(b)) return { ok: false, line: BUILD_DASH_DIAGNOSIS.kpiUnits(v) }
  if (/\bavg\s*\(/.test(b)) return { ok: false, line: BUILD_DASH_DIAGNOSIS.kpiAvg(v) }
  if (/\bmax\s*\(/.test(b)) return { ok: false, line: BUILD_DASH_DIAGNOSIS.kpiMax(v) }
  return { ok: false, line: BUILD_DASH_DIAGNOSIS.kpiOther(v) }
}

export interface LineFacts {
  points: number
  /** different values in the month column */
  distinct: number
  /** rows of the revenue column not in the reference / missing from it */
  diff: number
  error: string | null
  blank: string
}

export function diagnoseLine(f: LineFacts): TileDiagnosis {
  if (f.error) return { ok: false, line: BUILD_DASH_DIAGNOSIS.syntax(f.error) }
  if (f.points === 30 && f.distinct === 30 && f.diff === 0) return { ok: true, line: null }
  if (f.points === 12) return { ok: false, line: BUILD_DASH_DIAGNOSIS.lineMonthNumber }
  if (f.points === 3) return { ok: false, line: BUILD_DASH_DIAGNOSIS.lineYear }
  if (f.points === 10) return { ok: false, line: BUILD_DASH_DIAGNOSIS.lineQuarter }
  if (f.points > 30) return { ok: false, line: BUILD_DASH_DIAGNOSIS.lineDays(f.points) }
  return { ok: false, line: BUILD_DASH_DIAGNOSIS.lineOther(f.points) }
}

// ---------------------------------------------------------------- the answers (5.4)

/**
 * A number typed by a person. Spaces are dropped. With both `,` and `.` the one written last is the decimal mark; with
 * only `.` it is the decimal mark; with only `,` it is a thousands separator when every group after it has three digits
 * (`314,906`), else the decimal mark (`906,13`, `90829,5`). Null when it is not a number.
 */
export function parseAnswerNumber(text: string): number | null {
  const t = text.replace(/[\s  ]/g, '')
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  const hasC = t.includes(',')
  const hasD = t.includes('.')
  let s = t
  if (hasC && hasD) {
    const decimal = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'
    s = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (hasC) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.split(',').length === 2 ? t.replace(',', '.') : t
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.5

export interface AnswerInput {
  /** the month or the chain picked (A2, A3); '' for none */
  pick: string
  /** the number as typed */
  number: string
}

export interface AnswerResult {
  ok: boolean
  line: string | null
}

export function checkAnswer(id: AnswerId, input: AnswerInput): AnswerResult {
  const a = ANSWERS.find((q) => q.id === id)!
  const wrong = (line: string): AnswerResult => ({ ok: false, line })
  const n = parseAnswerNumber(input.number)
  if (a.options && !input.pick) return wrong(BUILD_DASH_DIAGNOSIS.pickFirst(a.pickLabel!))
  if (n === null) return wrong(BUILD_DASH_DIAGNOSIS.typeNumber)
  const pickOk = !a.options || input.pick === a.right.pick
  const numOk = close(n, a.right.value)
  if (pickOk && numOk) return { ok: true, line: null }
  for (const w of a.wrong) {
    if (w.pick !== undefined && w.pick !== input.pick) continue
    if (w.value !== undefined && !close(n, w.value)) continue
    return wrong(w.line)
  }
  if (a.options && pickOk) return wrong(BUILD_DASH_DIAGNOSIS.numberOff(a.right.pickText!))
  if (a.options && numOk) return wrong(BUILD_DASH_DIAGNOSIS.pickOff)
  return wrong(BUILD_DASH_DIAGNOSIS.answerOff(a.where))
}

// ---------------------------------------------------------------- what is kept

export interface DashWork {
  /** the blank of each tile */
  blanks: Record<TileId, string>
  /** tiles that passed */
  tiles: TileId[]
  /** what was typed in the answers */
  answers: Record<AnswerId, AnswerInput>
  /** answers that passed */
  answered: AnswerId[]
}

export const emptyDash = (): DashWork => ({
  blanks: { kpi: '', line: '', chains: '' },
  tiles: [],
  answers: { A1: { pick: '', number: '' }, A2: { pick: '', number: '' }, A3: { pick: '', number: '' } },
  answered: [],
})

export const dashboardDone = (tiles: readonly TileId[]) => TILE_IDS.every((t) => tiles.includes(t))
export const answersDone = (answered: readonly AnswerId[]) => ANSWERS.every((a) => answered.includes(a.id))

/** Anything unreadable is dropped. */
export function readDash(raw: unknown): DashWork {
  const d = emptyDash()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  const b = r.blanks as Record<string, unknown> | undefined
  if (b && typeof b.kpi === 'string') d.blanks.kpi = b.kpi.slice(0, 200)
  if (b && typeof b.line === 'string') d.blanks.line = b.line.slice(0, 200)
  if (b && typeof b.chains === 'string') d.blanks.chains = b.chains.slice(0, 200)
  if (Array.isArray(r.tiles)) d.tiles = TILE_IDS.filter((t) => (r.tiles as unknown[]).includes(t))
  // saved before the third tile had a blank: its SQL was given, so a passed tile keeps the answer it had
  if (d.tiles.includes('chains') && !d.blanks.chains.trim()) d.blanks.chains = 'customer_id'
  const a = r.answers as Record<string, Partial<AnswerInput> | undefined> | undefined
  for (const q of ANSWERS) {
    const x = a?.[q.id]
    if (x && typeof x.pick === 'string') d.answers[q.id].pick = x.pick.slice(0, 40)
    if (x && typeof x.number === 'string') d.answers[q.id].number = x.number.slice(0, 40)
  }
  if (Array.isArray(r.answered)) d.answered = ANSWERS.map((q) => q.id).filter((id) => (r.answered as unknown[]).includes(id))
  return d
}
