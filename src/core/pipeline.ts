// The rules of the pipeline page (`#pipeline=kaiyo-sellout`): the address, run order, what a step does after the
// one before it, what is still unset, the blank's rules, the proofs and the diagnosis lines. Pure; the SQL is in
// src/data/pipelines/kaiyoSellout.ts, the engine in src/db/pipelineRun.ts.
import {
  ALL_SLOTS,
  BLOCKS,
  BUILDER,
  DIAGNOSIS_TEXT,
  WHY_TEXT,
  LANES,
  LAYER_OF,
  NEXT_TEXT,
  REQUIRED,
  PIPELINE_ID,
  blockById,
  defaultSettings,
  laneOfSlot,
  slotId,
  type BlockId,
  type DiagKey,
  type Settings,
  type WorkTable,
  WORK_TABLES,
} from '../data/pipelines/kaiyoSellout'

// ---------------------------------------------------------------- the address

const KNOWN = [PIPELINE_ID]

/** The pipeline asked for in the address, if Lab has it. */
export function pipelineFromHash(hash: string): string | null {
  const id = /(?:^#|&)pipeline=([a-z0-9-]+)(?:&|$)/i.exec(hash)?.[1].toLowerCase()
  return id && KNOWN.includes(id) ? id : null
}

export function hashWithoutPipeline(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^pipeline=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

export function hashWithPipeline(hash: string, id: string): string {
  const rest = hashWithoutPipeline(hash).replace(/^#/, '')
  return `#pipeline=${id}${rest ? `&${rest}` : ''}`
}

// ---------------------------------------------------------------- what the learner has built

export interface PipelineState {
  /** slot id → the block in it */
  slots: Record<string, BlockId | null>
  settings: Record<string, Settings>
  /** the SQL step's blank */
  blank: string
  /** false: the first pass of the story (phase `first-pass`): types only, no blank. The page sets it from the phase. */
  dedup: boolean
}

export const emptyState = (): PipelineState => ({
  slots: Object.fromEntries(ALL_SLOTS.map((s) => [s, null])),
  settings: Object.fromEntries(BLOCKS.map((b) => [b.id, defaultSettings()])),
  blank: '',
  dedup: true,
})

/** What was saved (localStorage), repaired: anything unreadable starts afresh, a block placed twice stays once. */
export function readState(raw: string | null): PipelineState {
  const blank = emptyState()
  if (!raw) return blank
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return blank
    const seen = new Set<string>()
    for (const slot of ALL_SLOTS) {
      const id = p.slots?.[slot]
      const block = typeof id === 'string' ? blockById(id) : undefined
      if (block && block.lane === laneOfSlot(slot) && !seen.has(block.id)) {
        seen.add(block.id)
        blank.slots[slot] = block.id
      }
    }
    for (const b of BLOCKS) {
      const s = p.settings?.[b.id]
      if (s && typeof s === 'object') blank.settings[b.id] = { ...defaultSettings(), ...pick(s) }
    }
    if (typeof p.blank === 'string') blank.blank = p.blank.slice(0, 400)
    return blank
  } catch {
    return blank
  }
}

function pick(s: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (s.when === 'succeeded' || s.when === 'completed' || s.when === null) out.when = s.when
  if (s.files === 'all' || s.files === 'latest') out.files = s.files
  if (s.format === 'text' || s.format === 'binary') out.format = s.format
  if (s.delim === ';' || s.delim === ',') out.delim = s.delim
  if (typeof s.header === 'boolean') out.header = s.header
  if (s.mode === 'replace' || s.mode === 'append' || s.mode === null) out.mode = s.mode
  if (s.measure === 'sum' || s.measure === 'distinct') out.measure = s.measure
  return out
}

/** Filled slots left to right in each lane, lanes in data order. Empty slots are skipped. */
export function runOrder(state: PipelineState): BlockId[] {
  const out: BlockId[] = []
  for (const lane of LANES) for (let i = 0; i < lane.slots; i++) {
    const id = state.slots[slotId(lane.id, i)]
    if (id) out.push(id)
  }
  return out
}

/** Where a block is placed, or null. */
export const slotOf = (state: PipelineState, id: BlockId): string | null => ALL_SLOTS.find((s) => state.slots[s] === id) ?? null

/** Places a block in a slot of its own lane; a block already placed moves; a block in the slot goes back to the palette. */
export function place(state: PipelineState, id: BlockId, slot: string): PipelineState {
  const block = blockById(id)
  if (!block || !(slot in state.slots) || laneOfSlot(slot) !== block.lane) return state
  const slots = { ...state.slots }
  for (const s of ALL_SLOTS) if (slots[s] === id) slots[s] = null
  slots[slot] = id
  return { ...state, slots }
}

export function remove(state: PipelineState, id: BlockId): PipelineState {
  return { ...state, slots: Object.fromEntries(ALL_SLOTS.map((s) => [s, state.slots[s] === id ? null : state.slots[s]])) }
}

// ---------------------------------------------------------------- what to do next

/** The first block a working pipeline needs that is not placed yet, or null when all are. */
export const nextRequired = (state: PipelineState): BlockId | null => REQUIRED.find((id) => slotOf(state, id) === null) ?? null

/**
 * The slot to highlight for a block: the first free slot of its lane to the right of what is already placed there,
 * else the first free one; null when the lane is full.
 */
export function nextSlotFor(state: PipelineState, id: BlockId): string | null {
  const block = blockById(id)
  const lane = LANES.find((l) => l.id === block?.lane)
  if (!lane) return null
  const free = Array.from({ length: lane.slots }, (_, i) => i).filter((i) => !state.slots[slotId(lane.id, i)])
  const last = Math.max(-1, ...Array.from({ length: lane.slots }, (_, i) => i).filter((i) => state.slots[slotId(lane.id, i)]))
  const i = free.find((n) => n > last) ?? free[0]
  return i === undefined ? null : slotId(lane.id, i)
}

/** What the page says to do now: a sentence after "Next:", and the block and slot it is about (null when nothing is left to place). */
export function nextStep(state: PipelineState, o: { ran: boolean; solved: boolean; firstPass?: boolean }): { text: string; block: BlockId | null; slot: string | null } {
  const block = nextRequired(state)
  if (block) return { text: NEXT_TEXT[block], block, slot: nextSlotFor(state, block) }
  const unset = missingSetting(state)
  if (unset) return { text: `set up the block marked ? (${unset.message})`, block: null, slot: null }
  if (!o.ran) return { text: 'press Run and watch each step in the journal', block: null, slot: null }
  if (!o.solved)
    return {
      text: o.firstPass ? 'read what stopped the run in the journal, fix it and press Run again' : 'press Check my pipeline: it runs everything twice and judges the result',
      block: null,
      slot: null,
    }
  return { text: 'nothing, the pipeline works', block: null, slot: null }
}

/** After a run: what was built, and what is still missing, so a partial pipeline reads as a start and not as an error. */
export function progressNote(state: PipelineState, journal: StepResult[]): string | null {
  const ok = journal.filter((r) => r.status === 'succeeded').map((r) => r.block)
  if (journal.length === 0 || journal.some((r) => r.status === 'failed')) return null
  const next = nextRequired(state)
  const built = [...new Set(ok.map((b) => LAYER_OF[b]).filter(Boolean))]
  const steps = `Ran ${journal.length} step${journal.length === 1 ? '' : 's'}`
  if (!next) return null
  const layers = built.length ? ` and built ${built.join(', ')}. Open the tables under pipe_kaiyo in the tree to look at them` : ''
  return `${steps}${layers}. The run stops here because nothing is placed after it yet. Next: ${NEXT_TEXT[next]}.`
}

// ---------------------------------------------------------------- status

export type StepStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'

/**
 * Whether a block runs after the one before it: it does after a success, after a failure only when it is set to
 * Completed, and never after a skipped step.
 */
export function nextStatus(previous: StepStatus | null, when: Settings['when']): 'run' | 'skip' {
  if (previous === null || previous === 'succeeded') return 'run'
  if (previous === 'failed') return when === 'completed' ? 'run' : 'skip'
  return 'skip'
}

// ---------------------------------------------------------------- blank

/** Why the blank cannot be used, or null. Judged by the rules only: whether it is right is judged by the result. */
export function checkBlank(text: string): string | null {
  if (!text.trim()) return 'The blank is empty.'
  if (text.length > 200) return 'The blank is longer than 200 characters.'
  if (text.includes(';')) return 'The blank cannot contain a semicolon.'
  if (text.includes('--') || text.includes('/*')) return 'The blank cannot contain a comment.'
  let depth = 0
  for (const c of text) {
    if (c === '(') depth++
    else if (c === ')' && --depth < 0) return 'The brackets in the blank do not match.'
  }
  if (depth !== 0) return 'The brackets in the blank do not match.'
  return null
}

// ---------------------------------------------------------------- what is not set

export interface Missing {
  block: BlockId
  message: string
}

/** What is still unset in one placed block (index: its place in the run order), as a sentence; null when all is set. */
export function unsetOf(state: PipelineState, id: BlockId, index: number): string | null {
  const s = state.settings[id]
  if (id === 'copy-files' && s.mode === null) return `${shortName(id)}: choose the write mode`
  if (id === 'sql-silver' && state.dedup) {
    const bad = checkBlank(state.blank)
    if (bad) return `SQL step: fill the blank (${bad.replace(/\.$/, '').toLowerCase()})`
  }
  if (index > 0 && s.when === null) return `${shortName(id)}: choose when it runs`
  return null
}

/** The first block (in run order) with a setting still unset, with the sentence that names it. */
export function missingSetting(state: PipelineState): Missing | null {
  for (const [i, id] of runOrder(state).entries()) {
    const message = unsetOf(state, id, i)
    if (message) return { block: id, message }
  }
  return null
}

/** A block's short name in a sentence: the label up to its colon, else its first two words. */
const SHORT: Partial<Record<BlockId, string>> = { 'copy-files': 'Copy files', 'clear-bronze': 'Clear bronze', 'notify-team': 'Team chat post' }
function shortName(id: BlockId): string {
  const label = blockById(id)!.label
  return SHORT[id] ?? label.split(':')[0]
}

/** Not a proof, a grey note: a load step or a step right after a check that is set to Completed. */
export function softNotes(state: PipelineState): string[] {
  const order = runOrder(state)
  const notes: string[] = []
  for (const [i, id] of order.entries()) {
    if (i === 0 || state.settings[id].when !== 'completed') continue
    if (blockById(id)!.lane === 'engineer') notes.push(`${blockById(id)!.label} is set to Completed: a load that goes on after a failure builds on nothing.`)
    else if (order[i - 1].startsWith('check-')) notes.push(`${blockById(id)!.label} runs even if "${blockById(order[i - 1])!.label}" fails.`)
  }
  return notes
}

// ---------------------------------------------------------------- journal

export interface StepResult {
  block: BlockId
  status: StepStatus
  ms: number | null
  /** rows after a load or SQL step, rows removed by Clear, violations of a check, "chain · revenue" of the card */
  rows: number | string | null
  message: string
  /** DuckDB's message, shortened to the first sentence */
  error?: string
  /** the SQL step: how silver compares with the reference */
  verdict?: { rows: number; extra: number; missing: number }
}

// ---------------------------------------------------------------- proofs and diagnosis

export type Counts = Partial<Record<WorkTable, number | null>>

export interface TopRow {
  chain: string
  revenue: string
}

export interface Facts {
  order: BlockId[]
  settings: Record<string, Settings>
  blank: string
  run1: StepResult[]
  run2: StepResult[]
  /** bronze columns after run 1, null when there is no bronze */
  bronzeColumns: string[] | null
  counts1: Counts
  counts2: Counts
  /** the card after run 1 and run 2 */
  top1: TopRow | null
  top2: TopRow | null
  /** rows of the reference silver, and the reference card */
  refRows: number
  ref: TopRow[]
  /** duplicate (date, store, product) groups and rows without a key in gold after run 2 */
  dupGroups: number | null
  noKey: number | null
  /** proof 1 passed */
  answerOk?: boolean
}

export interface ProofLine {
  ok: boolean
  /** why not, for a failed proof */
  diagnosis?: string
  /** two or three sentences under "Why?" */
  why?: string
}

export interface Proofs {
  answer: ProofLine
  again: ProofLine
  clean: ProofLine
  note?: string
}

/** The snapshot of row counts is equal for every work table. */
export const sameCounts = (a: Counts, b: Counts): boolean => WORK_TABLES.every((t) => (a[t] ?? null) === (b[t] ?? null))

const fmtRevenue = (v: string) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The three proofs on the state after run 2, and a diagnosis line for each that failed (first match wins). */
export function proofs(f: Facts, answerOk: boolean): Proofs {
  const again = sameCounts(f.counts1, f.counts2)
  const fact = f.counts2.gold_fact_sellout
  const clean = fact != null && fact > 0 && f.noKey === 0 && f.dupGroups === 0
  const base: Proofs = { answer: { ok: answerOk }, again: { ok: again }, clean: { ok: clean } }
  const picks = pickRules({ ...f, answerOk }, [answerOk, again, clean])
  for (const [i, line] of [base.answer, base.again, base.clean].entries()) {
    if (line.ok) continue
    line.diagnosis = picks[i]?.line ?? DIAGNOSIS_TEXT.generic
    line.why = WHY_TEXT[picks[i]?.key ?? 'generic']
  }
  const stopped = checkStopped(f)
  if (stopped) base.note = DIAGNOSIS_TEXT.checkStopped
  return base
}

/** A check failed and the step after it did not run: the pipeline stopped as designed. */
function checkStopped(f: Facts): boolean {
  return f.run1.some((r, i) => r.block.startsWith('check-') && r.status === 'failed' && f.run1[i + 1]?.status === 'skipped')
}

type Rule = { key: DiagKey; proofs: (0 | 1 | 2)[]; line: (f: Facts) => string | null }

const rowsOf = (r: StepResult[], id: BlockId) => r.find((s) => s.block === id)

/** A step that failed on a table not built yet: the line names the block to move. */
function missingTable(f: Facts): string | null {
  for (const r of f.run1) {
    const m = r.status === 'failed' && r.error ? /Table with name (\w+) does not exist/i.exec(r.error)?.[1] : undefined
    if (!m) continue
    const builder = BUILDER[m as WorkTable]
    if (!builder) continue
    // Only a step placed before its builder: if the builder is not in the pipeline at all, it is missing, not misplaced.
    return DIAGNOSIS_TEXT.missing(blockById(r.block)!.label, `pipe_kaiyo.${m}`, blockById(builder)!.label)
  }
  return null
}

const RULES: Rule[] = [
  { key: 'delimiter',
    proofs: [0, 1, 2],
    line: (f) => {
      const s = f.settings['copy-files']
      if (!f.order.includes('copy-files') || !s || s.delim !== ',') return null
      const copy = rowsOf(f.run1, 'copy-files')
      return copy?.status === 'failed' || !f.bronzeColumns?.includes('raw_id') ? DIAGNOSIS_TEXT.delimiter : null
    },
  },
  { key: 'binary', proofs: [0, 1, 2], line: (f) => (f.bronzeColumns?.includes('content') ? DIAGNOSIS_TEXT.binary : null) },
  { key: 'header', proofs: [0, 1, 2], line: (f) => (f.bronzeColumns?.includes('column0') ? DIAGNOSIS_TEXT.header : null) },
  { key: 'append',
    proofs: [1],
    line: (f) => {
      const a = f.counts1.bronze_sellout_raw
      const b = f.counts2.bronze_sellout_raw
      return a != null && b != null && b > a ? DIAGNOSIS_TEXT.append(b - a, a, b) : null
    },
  },
  { key: 'latest',
    proofs: [0],
    line: (f) => (f.settings['copy-files']?.files === 'latest' && f.order.includes('copy-files') ? DIAGNOSIS_TEXT.latest(f.counts1.bronze_sellout_raw ?? 0) : null),
  },
  { key: 'clearAfter',
    proofs: [0, 2],
    line: (f) => {
      const copy = rowsOf(f.run1, 'copy-files')
      const clear = f.order.indexOf('clear-bronze') > f.order.indexOf('copy-files') && f.order.includes('copy-files') && f.order.includes('clear-bronze')
      return copy?.status === 'succeeded' && clear && f.counts1.bronze_sellout_raw === 0 ? DIAGNOSIS_TEXT.clearAfter : null
    },
  },
  { key: 'missing', proofs: [0, 1, 2], line: missingTable },
  { key: 'failed',
    proofs: [0, 1, 2],
    line: (f) => {
      const r = f.run1.find((s) => s.status === 'failed' && !s.block.startsWith('check-'))
      return r ? DIAGNOSIS_TEXT.failed(blockById(r.block)!.label, r.error ?? r.message) : null
    },
  },
  { key: 'measure',
    proofs: [2],
    line: (f) => (f.answerOk && f.settings['card-top-chain']?.measure === 'distinct' && (f.dupGroups ?? 0) > 0 ? DIAGNOSIS_TEXT.measure(f.dupGroups!) : null),
  },
  { key: 'rawId',
    proofs: [0, 2],
    line: (f) => {
      const silver = f.counts1.silver_sellout
      const bronze = f.counts1.bronze_sellout_raw
      return f.order.includes('sql-silver') && /\braw_id\b/i.test(f.blank) && silver != null && silver === bronze && silver > f.refRows ? DIAGNOSIS_TEXT.rawId : null
    },
  },
  { key: 'doubled',
    proofs: [0, 2],
    line: (f) => {
      const silver = f.counts1.silver_sellout
      if (silver == null || silver <= f.refRows) return null
      const extra = silver - f.refRows
      const top = f.top1
      const refRow = top ? f.ref.find((r) => r.chain === top.chain) : undefined
      const wrong = top && f.ref[0] && top.chain !== f.ref[0].chain ? top : null
      return DIAGNOSIS_TEXT.doubled(extra, wrong?.chain ?? '', wrong ? fmtRevenue(wrong.revenue) : '', wrong && refRow ? fmtRevenue(refRow.revenue) : null)
    },
  },
  { key: 'tooShort',
    proofs: [0],
    line: (f) => {
      const silver = f.counts1.silver_sellout
      return silver != null && silver > 0 && silver < f.refRows ? DIAGNOSIS_TEXT.tooShort(silver, f.refRows) : null
    },
  },
  { key: 'checkIgnored',
    proofs: [0, 2],
    line: (f) => (f.run1.some((r, i) => r.block.startsWith('check-') && r.status === 'failed' && f.run1[i + 1]?.status && f.run1[i + 1].status !== 'skipped' && f.settings[f.run1[i + 1].block]?.when === 'completed') ? DIAGNOSIS_TEXT.checkIgnored : null),
  },
  { key: 'noCard', proofs: [0], line: (f) => (!f.order.includes('card-top-chain') || rowsOf(f.run1, 'card-top-chain')?.status !== 'succeeded' ? DIAGNOSIS_TEXT.noCard : null) },
]

type Picked = { line: string; key: DiagKey } | null

/** The first rule that fits each failed proof, with its text and key; null for a proof that passed or that no rule explains. */
function pickRules(f: Facts, ok: [boolean, boolean, boolean]): Picked[] {
  return ok.map((good, i) => {
    if (good) return null
    for (const r of RULES) {
      if (!r.proofs.includes(i as 0 | 1 | 2)) continue
      const line = r.line(f)
      if (line) return { line, key: r.key }
    }
    return null
  })
}

/** One line per failed proof (answer, safe to run again, gold is clean), by priority; null for a proof that passed. */
export function diagnose(f: Facts, ok: [boolean, boolean, boolean]): (string | null)[] {
  return pickRules(f, ok).map((p) => p?.line ?? null)
}

// ---------------------------------------------------------------- the story: first pass, then fix

export type Phase = 'first-pass' | 'fix'

/** A saved phase; a pipeline already solved before the story existed is past it. */
export function readPhase(phase: unknown, solved: boolean): Phase {
  return phase === 'first-pass' || phase === 'fix' ? phase : solved ? 'fix' : 'first-pass'
}

/**
 * After a run in the first pass: once the card has been built, the story moves on to the fix. `mismatch` is true when the card
 * does not say what the Head of Sales' own file says (the reference), which is what the first pass is built to do.
 */
export function afterRun(phase: Phase, journal: StepResult[], top: TopRow | null, ref: TopRow[]): { phase: Phase; mismatch: boolean } {
  if (phase === 'fix') return { phase, mismatch: false }
  const card = journal.find((r) => r.block === 'card-top-chain')
  if (card?.status !== 'succeeded' || !top || !ref[0]) return { phase, mismatch: false }
  const same = top.chain === ref[0].chain && Number(top.revenue) === Number(ref[0].revenue)
  return { phase: 'fix', mismatch: !same }
}
