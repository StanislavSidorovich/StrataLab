// "Progress" of the build page (docs/build-kaiyo-sales-spec.md, "Progress and demo"): three places in the browser. The learner's own
// run (BUILD_KEY), one saved run (My saved run: Start over puts the run there before it clears the page), and the demo run (its own
// slot, which the learner's work never touches). Pure; the page is src/ui/build/ProgressMenu.tsx and BuildPage.tsx.
import { BUILD_KEY, emptyBuild, readBuild, type BuildState } from './build'

export const SAVED_KEY = `${BUILD_KEY}.saved`
export const DEMO_KEY = `${BUILD_KEY}.demo`

export interface Saved {
  /** when it was put there (ms) */
  at: number
  state: BuildState
}

/** What is kept of a state: everything but the [Error] count, which the page measures. */
export function keptJson(state: BuildState): string {
  const { errors: _errors, ...kept } = state
  return JSON.stringify(kept)
}

/** The run itself, without which step happens to be open: two states with the same key are the same work. */
export function runKey(state: BuildState): string {
  const { open: _open, errors: _errors, ...run } = readBuild(keptJson(state))
  return JSON.stringify(run)
}

/** Nothing done yet: a first visit looks like this. */
export const isEmptyRun = (state: BuildState): boolean => runKey(state) === runKey(emptyBuild())

export const sameRun = (a: BuildState, b: BuildState): boolean => runKey(a) === runKey(b)

/** The saved run as it was written; anything unreadable is no saved run. */
export function readSaved(raw: string | null): Saved | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || typeof p.at !== 'number' || !Number.isFinite(p.at) || !p.state || typeof p.state !== 'object') return null
    return { at: p.at, state: readBuild(JSON.stringify(p.state)) }
  } catch {
    return null
  }
}

export const savedJson = (saved: Saved): string => JSON.stringify({ at: saved.at, state: JSON.parse(keptJson(saved.state)) })

/**
 * Start over: the run goes to the saved slot and the page is empty again. An empty run is not worth keeping (it would
 * replace a good saved run), and a run that already is the saved one keeps its date.
 */
export function startOver(current: BuildState, saved: Saved | null, now: number): { saved: Saved | null; state: BuildState } {
  if (isEmptyRun(current) || (saved && sameRun(current, saved.state))) return { saved, state: emptyBuild() }
  return { saved: { at: now, state: readBuild(keptJson(current)) }, state: emptyBuild() }
}

/** Restoring replaces the work on the page: ask first when that work is something and is not the saved run. */
export const restoreNeedsConfirm = (current: BuildState, saved: Saved): boolean => !isEmptyRun(current) && !sameRun(current, saved.state)

/** The state a restore puts on the page (a copy, so the saved slot stays as it is). */
export const restoreSaved = (saved: Saved): BuildState => readBuild(keptJson(saved.state))

/** "10 Nov 2026, 14:05" */
export const savedDate = (at: number): string => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------- the slots in localStorage

export function loadSlot(key: string): BuildState {
  try {
    return readBuild(localStorage.getItem(key))
  } catch {
    return emptyBuild()
  }
}

export function saveSlot(key: string, state: BuildState) {
  try {
    localStorage.setItem(key, keptJson(state))
  } catch {
    /* not kept: the steps start again next time */
  }
}

export function loadSaved(): Saved | null {
  try {
    return readSaved(localStorage.getItem(SAVED_KEY))
  } catch {
    return null
  }
}

export function writeSaved(saved: Saved) {
  try {
    localStorage.setItem(SAVED_KEY, savedJson(saved))
  } catch {
    /* not kept */
  }
}
