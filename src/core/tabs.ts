// Rules for the query tabs' menu (right-click on a tab): duplicate, close others, reopen.

/** "Query 1" → "Query 1 (copy)", then "Query 1 (copy 2)"…; a copy of a copy is named after the original. */
export function copyTitle(title: string, taken: Iterable<string>): string {
  const base = title.replace(/\s*\(copy(?: \d+)?\)$/, '') || title
  const names = new Set(taken)
  if (!names.has(`${base} (copy)`)) return `${base} (copy)`
  for (let i = 2; ; i++) if (!names.has(`${base} (copy ${i})`)) return `${base} (copy ${i})`
}

/** The tabs “Close others” or “Close tabs to the right” of `id` closes, in order. */
export function tabsToClose(ids: string[], id: string, which: 'others' | 'right'): string[] {
  const at = ids.indexOf(id)
  if (at < 0) return []
  return which === 'others' ? ids.filter((x) => x !== id) : ids.slice(at + 1)
}

/** How many closed tabs “Reopen closed tab” remembers (this visit only). */
export const CLOSED_TABS_KEPT = 20

/** The closed tabs, newest last, with `closed` added; the oldest are forgotten past the limit. Empty tabs are not kept. */
export function rememberClosed<T extends { sql: string }>(stack: T[], closed: T[]): T[] {
  return [...stack, ...closed.filter((t) => t.sql.trim())].slice(-CLOSED_TABS_KEPT)
}

/**
 * What choosing `to` on a tab that speaks `from` does to the tab. SQL and Python don't mix: the SQL
 * left in a tab that becomes Python (or Python in one that becomes SQL) would only fail, so a tab with
 * text opens a new tab of the other kind and stays as it is; an empty tab, or a switch between SQL
 * dialects, changes in place.
 */
export function dialectSwitch(from: string, to: string, text: string): 'in-place' | 'new-tab' {
  if (from === to) return 'in-place'
  const crossesKinds = (from === 'python') !== (to === 'python')
  return crossesKinds && text.trim() ? 'new-tab' : 'in-place'
}
