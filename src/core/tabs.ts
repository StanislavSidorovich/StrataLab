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
