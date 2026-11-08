// The rules of the build page (`#build=kaiyo-sales`): the address, the five steps, which one is open and which are
// done. A step opens only after the one before it is done. Pure; the page is src/ui/build/BuildPage.tsx.

import { emptyWork, readWork, type BuildWork } from './buildSteps'

// ---------------------------------------------------------------- the address

export const BUILD_ID = 'kaiyo-sales'
const KNOWN = [BUILD_ID]

/** The build asked for in the address, if Lab has it. */
export function buildFromHash(hash: string): string | null {
  const id = /(?:^#|&)build=([a-z0-9-]+)(?:&|$)/i.exec(hash)?.[1].toLowerCase()
  return id && KNOWN.includes(id) ? id : null
}

export function hashWithoutBuild(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^build=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

export function hashWithBuild(hash: string, id: string): string {
  const rest = hashWithoutBuild(hash).replace(/^#/, '')
  return `#build=${id}${rest ? `&${rest}` : ''}`
}

// ---------------------------------------------------------------- the steps

export const STEP_IDS = ['connect', 'clean', 'model', 'dashboard', 'answer'] as const
export type StepId = (typeof STEP_IDS)[number]

export const STEP_LABEL: Record<StepId, string> = {
  connect: 'Connect',
  clean: 'Clean',
  model: 'Model',
  dashboard: 'Dashboard',
  answer: 'Answer',
}

export type StepStatus = 'done' | 'current' | 'locked'

// ---------------------------------------------------------------- progress

export interface BuildState {
  /** steps marked done */
  done: StepId[]
  /** the step on screen */
  open: StepId
  /** what the learner did: sources connected, applied steps, the blank, cards passed (src/core/buildSteps.ts) */
  work: BuildWork
}

export const emptyBuild = (): BuildState => ({ done: [], open: 'connect', work: emptyWork() })

const isStep = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v)

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

export function isUnlocked(state: BuildState, step: StepId): boolean {
  const i = STEP_IDS.indexOf(step)
  return i === 0 || state.done.includes(STEP_IDS[i - 1])
}

export function statusOf(state: BuildState, step: StepId): StepStatus {
  if (state.done.includes(step)) return 'done'
  return isUnlocked(state, step) ? 'current' : 'locked'
}

/** Show a step; a locked one is refused (the state stays as it is). */
export function openStep(state: BuildState, step: StepId): BuildState {
  return isUnlocked(state, step) ? { ...state, open: step } : state
}

/** Mark a step done (the open one by default), if it can be. Marking it again changes nothing. */
export function markDone(state: BuildState, step: StepId = state.open): BuildState {
  if (!isUnlocked(state, step) || state.done.includes(step)) return state
  return { ...state, done: contiguous([...state.done, step]) }
}

/** The step after the open one, once the open one is done. */
export function nextStep(state: BuildState): StepId | null {
  if (!state.done.includes(state.open)) return null
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

/** What was saved, repaired: anything unreadable starts afresh, gaps in the done steps are dropped. */
export function readBuild(raw: string | null): BuildState {
  if (!raw) return emptyBuild()
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return emptyBuild()
    const done = contiguous(Array.isArray(p.done) ? p.done.filter(isStep) : [])
    const state: BuildState = { done, open: currentStep({ done, open: 'connect', work: emptyWork() }), work: readWork(p.work) }
    return isStep(p.open) ? openStep(state, p.open) : state
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

export function saveBuild(state: BuildState) {
  try {
    localStorage.setItem(BUILD_KEY, JSON.stringify(state))
  } catch {
    /* not kept: the steps start again next time */
  }
}
