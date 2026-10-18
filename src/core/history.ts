// Query history (stage 6): every query run from a tab, kept in this browser between visits.
// Newest first; running the same SQL again moves it to the top instead of adding a copy.

export interface HistoryEntry {
  sql: string
  /** the tab's dialect: duckdb, tsql, postgres, sqlite or python */
  dialect: string
  /** when it finished (ms since 1970) */
  at: number
  ok: boolean
  /** rows and time, or the first line of the error */
  text: string
  /** the tab's title then */
  tab: string
}

/** Entries kept; the oldest go first. */
export const HISTORY_KEPT = 500
/** Longer scripts (a pasted dump) are not kept: they would fill the browser's storage. */
export const HISTORY_MAX_SQL = 20_000

const sameQuery = (a: HistoryEntry, b: HistoryEntry) => a.dialect === b.dialect && a.sql.trim() === b.sql.trim()

/** The history with `entry` added on top (an earlier run of the same SQL removed). */
export function remember(list: readonly HistoryEntry[], entry: HistoryEntry, kept = HISTORY_KEPT): HistoryEntry[] {
  if (!entry.sql.trim() || entry.sql.length > HISTORY_MAX_SQL) return [...list]
  return [entry, ...list.filter((e) => !sameQuery(e, entry))].slice(0, kept)
}

/** Entries whose SQL or tab title contains every word of `search` (any case); all for an empty search. */
export function searchHistory(list: readonly HistoryEntry[], search: string): HistoryEntry[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...list]
  return list.filter((e) => {
    const text = `${e.sql}\n${e.tab}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** The history saved in localStorage, with anything malformed dropped. */
export function parseHistory(json: string | null): HistoryEntry[] {
  try {
    const saved: unknown = JSON.parse(json ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved
      .filter((e): e is HistoryEntry => !!e && typeof e.sql === 'string' && typeof e.dialect === 'string' && typeof e.at === 'number' && typeof e.ok === 'boolean')
      .map((e) => ({ sql: e.sql, dialect: e.dialect, at: e.at, ok: e.ok, text: typeof e.text === 'string' ? e.text : '', tab: typeof e.tab === 'string' ? e.tab : '' }))
      .slice(0, HISTORY_KEPT)
  } catch {
    return []
  }
}

/** The heading an entry is listed under: Today, Yesterday, or its date. */
export function historyDay(at: number, now: number = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString()
  if (day(at) === day(now)) return 'Today'
  if (day(at) === day(now - 86_400_000)) return 'Yesterday'
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' })
}

/** A title for a tab opened from the history: the tab it ran in, or a generic one. */
export function historyTabTitle(e: HistoryEntry): string {
  return e.tab ? `${e.tab} (history)` : 'From history'
}
