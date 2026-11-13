// The rules of the build page (`#build=kaiyo-sales`): the address, the five steps, which one is open and which are
// done. A step opens only after the one before it is done. Pure; the page is src/ui/build/BuildPage.tsx.

import { emptyWork, readWork, type BuildWork } from './buildSteps'
import { modelLinked, readLinks, type Link } from './buildLinks'
import { moreDone } from './buildMore'

// ---------------------------------------------------------------- the address

export const BUILD_ID = 'kaiyo-sales'
const KNOWN = [BUILD_ID]

/** The build asked for in the address, if Lab has it. */
export function buildFromHash(hash: string): string | null {
  const id = /(?:^#|&)build=([a-z0-9-]+)(?:&|$)/i.exec(hash)?.[1].toLowerCase()
  return id && KNOWN.includes(id) ? id : null
}

/** `#build=kaiyo-sales&demo=1` opens the build in demo mode (docs spec, "Progress and demo"). */
export const demoFromHash = (hash: string): boolean => !!buildFromHash(hash) && /(?:^#|&)demo=1(?:&|$)/i.test(hash)

export function hashWithDemo(hash: string, on: boolean): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^demo=/i.test(p))
  if (on) rest.push('demo=1')
  return rest.length ? '#' + rest.join('&') : ''
}

export function hashWithoutBuild(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^build=/i.test(p) && !/^demo=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

export function hashWithBuild(hash: string, id: string): string {
  const rest = hashWithoutBuild(hash).replace(/^#/, '')
  return `#build=${id}${rest ? `&${rest}` : ''}`
}

// ---------------------------------------------------------------- the steps

export const STEP_IDS = ['connect', 'clean', 'model', 'dashboard', 'answer'] as const
export type StepId = (typeof STEP_IDS)[number]

/** The optional sixth step, after Answer: five more questions with the learner's own SQL (spec 5.5). It is not one of the five. */
export const MORE_STEP = 'more' as const
/** The optional seventh step, after More: a new file arrives and the whole chain runs again (spec 5.7). Unlocked with Answer, like More. */
export const REFRESH_STEP = 'refresh' as const
export type StripId = StepId | typeof MORE_STEP | typeof REFRESH_STEP
/** The chips of the step bar: the five, then the two optional ones. */
export const STRIP_IDS: readonly StripId[] = [...STEP_IDS, MORE_STEP, REFRESH_STEP]
/** An optional step: not one of the five, never "done" by the frame. */
export const isOptional = (s: StripId): s is typeof MORE_STEP | typeof REFRESH_STEP => s === MORE_STEP || s === REFRESH_STEP

export const STEP_LABEL: Record<StripId, string> = {
  connect: 'Connect',
  clean: 'Clean',
  model: 'Model',
  dashboard: 'Dashboard',
  answer: 'Answer',
  more: 'More',
  refresh: 'Refresh',
}

export type StepStatus = 'done' | 'current' | 'locked'

// ---------------------------------------------------------------- progress

export interface BuildState {
  /** steps marked done */
  done: StepId[]
  /** the step on screen */
  open: StripId
  /** what the learner did: sources connected, applied steps, the blank, cards passed (src/core/buildSteps.ts) */
  work: BuildWork
  /** the links the learner made (src/core/buildLinks.ts) */
  links: Link[]
  /** Build the star ran: the id links of the second pass are open */
  star: boolean
  /** saved by the first version of the Model step (no links): Model stays done, shown read-only with Try it */
  v1: boolean
  /** cells of the clean sales that are [Error] now (spec 3.6); the Dashboard stays locked while there are any. Set by the page, not saved */
  errors: number
}

export const emptyBuild = (): BuildState => ({ done: [], open: 'connect', work: emptyWork(), links: [], star: false, v1: false, errors: 0 })

/** The Model step can be marked done: F1 and F2 are made. */
export const modelDone = (state: BuildState) => modelLinked(state.links)

const isStep = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v)
const isStrip = (v: unknown): v is StripId => isStep(v) || v === MORE_STEP || v === REFRESH_STEP

/** Done steps in order, with no gaps: a step counts only if every step before it is done. */
function contiguous(done: Iterable<StepId>): StepId[] {
  const set = new Set(done)
  const out: StepId[] = []
  for (const s of STEP_IDS) {
    if (!set.has(s)) break
    out.push(s)
  }
  return out
}

/** The first step that is not done; the last step once all are. */
export function currentStep(state: BuildState): StepId {
  return STEP_IDS.find((s) => !state.done.includes(s)) ?? STEP_IDS[STEP_IDS.length - 1]
}

export function isUnlocked(state: BuildState, step: StripId): boolean {
  if (isOptional(step)) return state.done.includes('answer')
  const i = STEP_IDS.indexOf(step)
  if (step === 'dashboard' && state.errors > 0) return false
  return i === 0 || state.done.includes(STEP_IDS[i - 1])
}

export function statusOf(state: BuildState, step: StripId): StepStatus {
  if (step === MORE_STEP) return moreDone(state.work.more) ? 'done' : isUnlocked(state, step) ? 'current' : 'locked'
  if (step === REFRESH_STEP) return state.work.refresh.done ? 'done' : isUnlocked(state, step) ? 'current' : 'locked'
  if (state.done.includes(step)) return 'done'
  return isUnlocked(state, step) ? 'current' : 'locked'
}

/** Show a step; a locked one is refused (the state stays as it is). */
export function openStep(state: BuildState, step: StripId): BuildState {
  return isUnlocked(state, step) ? { ...state, open: step } : state
}

/** Mark a step done (the open one by default), if it can be. Marking it again changes nothing. */
export function markDone(state: BuildState, step: StripId = state.open): BuildState {
  if (isOptional(step)) return state
  if (!isUnlocked(state, step) || state.done.includes(step)) return state
  return { ...state, done: contiguous([...state.done, step]) }
}

/** The step after the open one, once the open one is done. */
export function nextStep(state: BuildState): StepId | null {
  if (isOptional(state.open) || !state.done.includes(state.open)) return null
  return STEP_IDS[STEP_IDS.indexOf(state.open) + 1] ?? null
}

/** Go to the next step, if the open one is done. */
export function goNext(state: BuildState): BuildState {
  const n = nextStep(state)
  return n ? openStep(state, n) : state
}

/** Every step done. */
export const allDone = (state: BuildState) => STEP_IDS.every((s) => state.done.includes(s))

// ---------------------------------------------------------------- what is kept

export const BUILD_KEY = 'stratalab.build.kaiyo-sales'

/**
 * The version of what is kept in the browser (the `version` field of the saved JSON). 0 = a run saved before v0.38.0, which had
 * no version; 1 = v0.38.0 (the optional checks A4 and A5 under `work.dash.review`). Raise it when the shape changes, add a step
 * to MIGRATIONS, and add a fixture `tests/fixtures/build/v<N>.json`: tests/buildVersion.test.ts loads one per version.
 */
export const SAVED_VERSION = 1

/** One step per version: takes the parsed JSON of version `n - 1` and returns that of version `n`. */
const MIGRATIONS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 -> 1: nothing to convert (readDash gives `review` its empty default); the step is here so the version moves and the fixture runs it
  1: (p) => p,
}

/** The saved JSON brought up to SAVED_VERSION. A run saved by a newer Lab is read as it is (what is not known is dropped). */
export function migrateSaved(p: Record<string, unknown>): Record<string, unknown> {
  let v = typeof p.version === 'number' && Number.isInteger(p.version) && p.version >= 0 ? p.version : 0
  let out = p
  while (v < SAVED_VERSION) {
    v += 1
    out = MIGRATIONS[v](out)
  }
  return { ...out, version: Math.max(v, typeof p.version === 'number' ? p.version : 0) }
}

/** What is written: the state without the [Error] count, with its version. */
export function keptState(state: BuildState): Record<string, unknown> {
  const { errors: _errors, ...kept } = state
  return { version: SAVED_VERSION, ...kept }
}

/** What was saved, repaired: anything unreadable starts afresh, gaps in the done steps are dropped, an older version is migrated. */
export function readBuild(raw: string | null): BuildState {
  if (!raw) return emptyBuild()
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyBuild()
    const p = migrateSaved(parsed as Record<string, unknown>) as Record<string, any>
    const done = contiguous(Array.isArray(p.done) ? p.done.filter(isStep) : [])
    const star = p.star === true
    const state: BuildState = {
      done,
      open: currentStep({ ...emptyBuild(), done }),
      work: readWork(p.work),
      links: readLinks(p.links, star),
      star,
      v1: done.includes('model') && !('links' in p),
      errors: 0,
    }
    return isStrip(p.open) ? openStep(state, p.open) : state
  } catch {
    return emptyBuild()
  }
}

export function loadBuild(): BuildState {
  try {
    return readBuild(localStorage.getItem(BUILD_KEY))
  } catch {
    return emptyBuild()
  }
}

export function saveBuild(state: BuildState, key: string = BUILD_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(keptState(state)))
  } catch {
    /* not kept: the steps start again next time */
  }
}
