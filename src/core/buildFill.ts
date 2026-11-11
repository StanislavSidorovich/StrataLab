// The demo mode's Fill buttons (docs/build-kaiyo-sales-spec.md, "Progress and demo"): the right answer of every card, tile and
// question as a change of the saved state, so a guest can be walked from Connect to Answer without typing code. Pure: the page
// applies the new state and, when a unit touches the tables, rebuilds them from it (the same road as opening the page again).
import { ANSWERS, MORE_IDS, TILE_IDS, moreQuestion, type AnswerId, type BuildSourceId, type CleanId, type MoreId, type TileId } from '../data/build/kaiyoSales'
import { EXPECTED_LINKS } from '../data/build/linkData'
import { STEP_IDS, markDone, openStep, type BuildState, type StripId } from './build'
import { answersDone, dashboardDone } from './buildDashboard'
import { addLink, modelLinked, type Link } from './buildLinks'
import { DEDUP_KEY, SOLVED_SALES } from './buildSolved'
import { cleanDone, nextId, passCard, typedColumn, type BuildWork, type StepSpec } from './buildSteps'

export type FillUnit =
  | { step: 'connect' }
  | { step: 'clean'; card: CleanId | 'P4' | 'P7' }
  | { step: 'model' }
  | { step: 'dashboard'; tile: TileId }
  | { step: 'answer'; q: AnswerId }
  | { step: 'more'; q: MoreId }

/** The right blank of each tile (spec 5.1 to 5.3). */
export const RIGHT_BLANKS: Record<TileId, string> = { kpi: 'SUM(revenue)', line: "date_trunc('month', sale_date)", chains: 'customer_id' }

type Kind = StepSpec['kind']
const spec = (kind: Kind, params: Record<string, string>) => ({ kind, params })
const solvedFrom = (ids: string[]) => SOLVED_SALES.filter((s) => ids.includes(s.id)).map((s) => spec(s.kind, s.params))

interface CardFill {
  source: BuildSourceId
  /** the learner's own tries on the same problem, taken out first */
  drop: (s: StepSpec) => boolean
  specs: { kind: Kind; params: Record<string, string> }[]
}

const onColumn = (s: StepSpec, ...cols: string[]) => cols.includes(s.params.column) && ['trim', 'upper', 'replace', 'type', 'extract'].includes(s.kind)

/** What each Clean card puts in the lists. The extra cards P4 and P7 are the Model step's. */
const CARDS: Record<CleanId | 'P4' | 'P7', CardFill> = {
  W: { source: 'regions', drop: (s) => s.kind === 'distinct', specs: [spec('distinct', {})] },
  P1: { source: 'products', drop: (s) => onColumn(s, 'sku_code'), specs: [spec('trim', { column: 'sku_code' }), spec('upper', { column: 'sku_code' })] },
  P2: { source: 'sales', drop: (s) => s.kind === 'dedup', specs: [spec('dedup', { blank: DEDUP_KEY })] },
  P3: { source: 'customers', drop: (s) => s.kind === 'latest' || s.kind === 'distinct', specs: [spec('latest', { key: 'customer_id', order: 'updated_at', direction: 'newest' })] },
  P5: { source: 'sales', drop: (s) => typedColumn(s) === 'sale_date', specs: solvedFrom(['f1']) },
  P6: { source: 'sales', drop: (s) => ['revenue', 'units'].includes(typedColumn(s) ?? ''), specs: solvedFrom(['f2', 'f3']) },
  P4: { source: 'sales', drop: (s) => (s.kind === 'trim' || s.kind === 'replace') && s.params.column === 'customer_name', specs: solvedFrom(['f4', 'f5']) },
  P7: { source: 'regions', drop: (s) => s.kind === 'extract', specs: [spec('extract', { column: 'region_id' })] },
}

function putCard(work: BuildWork, card: CleanId | 'P4' | 'P7'): BuildWork {
  const fill = CARDS[card]
  let list = work.steps[fill.source].filter((s) => !fill.drop(s))
  for (const s of fill.specs) list = [...list, { id: nextId(list), kind: s.kind, params: s.params }]
  let next: BuildWork = { ...work, steps: { ...work.steps, [fill.source]: list } }
  if (card === 'P2') next = { ...next, blank: DEDUP_KEY }
  if (card === 'P5') next = { ...next, format: '%d/%m/%Y' }
  if (card === 'P4') return { ...next, p4: 'done' }
  if (card === 'P7') return { ...next, p7: 'done' }
  return { ...next, passed: passCard(next, card) }
}

/** The five links of the model as the learner makes them; the star is built from the first three. */
const RIGHT_LINKS: Link[] = EXPECTED_LINKS.reduce<Link[]>((acc, e) => addLink(acc, { id: e.id, many: { ...e.many }, one: { ...e.one } }), [])

const CONNECTED: BuildSourceId[] = ['sales', 'customers', 'products', 'regions']

/** Marks done every step whose work is complete, in order (the page does the same with effects when it is used by hand). */
export function settle(state: BuildState): BuildState {
  let s = state
  const w = s.work
  if (w.connected.length === 4) s = markDone(s, 'connect')
  if (cleanDone(w.passed)) s = markDone(s, 'clean')
  if (s.star && modelLinked(s.links)) s = markDone(s, 'model')
  if (dashboardDone(w.dash.tiles)) s = markDone(s, 'dashboard')
  if (answersDone(w.dash.answered)) s = markDone(s, 'answer')
  return s
}

/** One unit's right answer put into the state. */
export function fillUnit(state: BuildState, unit: FillUnit): BuildState {
  const work = state.work
  switch (unit.step) {
    case 'connect':
      return settle({ ...state, work: { ...work, connected: CONNECTED } })
    case 'clean':
      return settle({ ...state, work: putCard(work, unit.card) })
    case 'model': {
      // the star needs the names of the sales and the region ids to link: P4 and P7 are done with it, as after the Model step asks for them
      let w = work
      if (w.p4 !== 'done') w = putCard(w, 'P4')
      if (w.p7 !== 'done') w = putCard(w, 'P7')
      return settle({ ...state, work: w, links: RIGHT_LINKS, star: true, v1: false })
    }
    case 'dashboard': {
      const dash = work.dash
      const tiles = TILE_IDS.filter((t) => t === unit.tile || dash.tiles.includes(t))
      return settle({ ...state, work: { ...work, dash: { ...dash, blanks: { ...dash.blanks, [unit.tile]: RIGHT_BLANKS[unit.tile] }, tiles } } })
    }
    case 'answer': {
      const q = ANSWERS.find((a) => a.id === unit.q)!
      const dash = work.dash
      const answered = ANSWERS.map((a) => a.id).filter((id) => id === unit.q || dash.answered.includes(id))
      const input = { pick: q.right.pick ?? '', number: String(q.right.value) }
      return settle({ ...state, work: { ...work, dash: { ...dash, answers: { ...dash.answers, [unit.q]: input }, answered } } })
    }
    case 'more': {
      const q = moreQuestion(unit.q)
      const more = work.more
      const done = MORE_IDS.filter((id) => id === unit.q || more.done.includes(id))
      const input = { pick: q.right.pick ?? '', number: String(q.right.value) }
      return { ...state, work: { ...work, more: { ...more, sql: q.slicers ? more.sql : { ...more.sql, [unit.q]: q.solution }, answers: { ...more.answers, [unit.q]: input }, done } } }
    }
  }
}

const CLEAN_ORDER: CleanId[] = ['W', 'P1', 'P2', 'P3', 'P5', 'P6']
const ORDER: StripId[] = [...STEP_IDS, 'more']

/** Every unit of a step, in the order the page asks for them. */
export function unitsOf(step: StripId): FillUnit[] {
  switch (step) {
    case 'connect':
      return [{ step: 'connect' }]
    case 'clean':
      return CLEAN_ORDER.map((card) => ({ step: 'clean', card }))
    case 'model':
      return [{ step: 'model' }]
    case 'dashboard':
      return TILE_IDS.map((tile) => ({ step: 'dashboard', tile }))
    case 'answer':
      return ANSWERS.map((a) => ({ step: 'answer', q: a.id }))
    case 'more':
      return MORE_IDS.map((q) => ({ step: 'more', q }))
  }
}

/** Fill to here: every step before `step`, then `step` is opened. */
export function fillBefore(state: BuildState, step: StripId): BuildState {
  let s = state
  for (const before of ORDER.slice(0, ORDER.indexOf(step))) for (const u of unitsOf(before)) s = fillUnit(s, u)
  return openStep(s, step)
}

/** The unit touches the tables (they are rebuilt from the state after it); answers and the More questions do not. */
export const touchesTables = (unit: FillUnit): boolean => unit.step !== 'answer' && unit.step !== 'more'

/** Filling the steps before `step` touches the tables. */
export const fillBeforeTouchesTables = (step: StripId): boolean => ORDER.slice(0, ORDER.indexOf(step)).some((s) => s !== 'answer' && s !== 'more')

/** Connect has nothing before it. */
export const canFillBefore = (step: StripId): boolean => ORDER.indexOf(step) > 0
