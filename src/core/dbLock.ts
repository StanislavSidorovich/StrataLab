// One saved database per browser: the tab that opens it holds a Web Lock for as long as it lives,
// and a second Lab page works in memory. These are the rules around that (src/db/engine.ts does it).

/** The Web Lock held by the tab that has the saved database open. */
export const DB_LOCK = 'stratalab-db'
/** BroadcastChannel between Lab pages: "Use this tab" asks the holder to let the database go. */
export const DB_CHANNEL = 'stratalab-db'
/** sessionStorage (survives this tab's reload): this tab held the database, or asked for it. */
export const HELD_KEY = 'stratalab.db-held'
/** localStorage: when the holder last left its page (a reload, an Update, a close), ms since epoch. */
export const LEFT_KEY = 'stratalab.db-left'

export type DbMessage = { type: 'release' } | { type: 'released' }

/** Why a tab works in memory: another Lab page has the file, no OPFS here, or the file would not open. */
export type MemoryReason = 'locked' | 'unsupported' | 'failed'

/** How long a reload waits for its turn at the database (an Update reloads every Lab tab at once). */
export const HOLDER_WAIT_MS = 5000
/** A tab that did not hold the database lets one that did go first when it has just left its page. */
export const HEAD_START_MS = 2500
/** How recent the holder's leaving must be for others to give it that head start. */
export const LEFT_RECENT_MS = 10000

/**
 * How this tab asks for the lock. `held`: it had the database before this reload (or asked for
 * it with "Use this tab"): it waits its turn. Otherwise it takes the lock only when free, after
 * a head start for a holder that has just left (it is coming back from the same reload).
 */
export function lockPlan(held: boolean, leftAt: number | null, now: number): { waitMs: number; delayMs: number } {
  if (held) return { waitMs: HOLDER_WAIT_MS, delayMs: 0 }
  const recent = leftAt !== null && now - leftAt >= 0 && now - leftAt < LEFT_RECENT_MS
  return { waitMs: 0, delayMs: recent ? HEAD_START_MS : 0 }
}

/** What went wrong opening the file in OPFS, in the terms the page shows. */
export function memoryReason(error: unknown): MemoryReason {
  const name = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException) ? (error as Error).name : ''
  const text = String(error instanceof Error ? error.message : error)
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError' || /another tab|locked|NoModificationAllowed|Access Handles cannot be created/i.test(text)) return 'locked'
  if (/OPFS is not supported|SecurityError|getDirectory/i.test(text) || name === 'SecurityError') return 'unsupported'
  return 'failed'
}

/** The badge's tooltip and the banner's text for a tab in memory. */
export function memoryNote(reason: MemoryReason): string {
  switch (reason) {
    case 'locked':
      return 'Quaera Lab is open in another tab or window, and that one has your saved tables. This tab works in memory: tables you load or make here are gone when it closes or reloads (an Update reloads it too).'
    case 'unsupported':
      return 'This browser keeps no files for this site (a private window, or an old browser), so tables last until this tab closes. Download a backup (⋯ next to TABLES) to keep them.'
    default:
      return 'The saved database would not open, so this tab works in memory: tables last until it closes. The saved file is left as it was.'
  }
}

/** The question before Update in a tab that works in memory and has tables of its own. */
export function updateLosesTables(names: string[]): string {
  const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '')
  return `This tab works in memory: ${shown} will be gone after the update (it reloads every Quaera Lab tab). Download a backup first (⋯ next to TABLES), or press OK to update anyway.`
}
