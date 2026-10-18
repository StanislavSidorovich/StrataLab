// `#s=<data>` share links (stage 5): which catalog datasets to load, whether the demo shop is
// needed, and the query tabs, packed like `#ddl=` (deflate-raw, base64url) in the URL fragment,
// which never reaches a server. The user's own tables (their files) are not in the link: they
// stay in this browser, and the share dialog says which ones a query uses (their own datasets'
// tables, `sales.orders`, too).
import { TooLarge, packText, unpackText } from './ddlLink'

export const SHARE_PARAM = 's'

/** A link that inflates past this many bytes is refused. */
export const MAX_SHARE_BYTES = 1_000_000
/** More tabs than this in one link are refused (a link is for a few queries, not a workspace). */
export const MAX_SHARED_TABS = 30

/** `sqlite`: SQLite as the Quaera trainer runs it, on its dataset (`quaera`), translated to DuckDB. */
export type SharedDialect = 'duckdb' | 'tsql' | 'postgres' | 'sqlite'

export interface SharedTab {
  title: string
  sql: string
  /** left out for DuckDB */
  dialect?: SharedDialect
}

export interface Share {
  /** catalog dataset ids, in the order to load them */
  datasets: string[]
  /** the queries use the demo shop's tables */
  demo: boolean
  tabs: SharedTab[]
}

const DIALECTS = new Set<string>(['duckdb', 'tsql', 'postgres', 'sqlite'])

/** The dataset a SQLite (Quaera) tab reads by bare table names (src/core/sqliteDialect.ts). */
const SQLITE_DATASET = 'quaera'

/** What a set of tabs needs, and the user's own tables they use that a link can't carry. */
export function planShare(
  tabs: SharedTab[],
  loaded: {
    datasets: string[]
    demoTables: string[]
    ownTables: string[]
    /** tables of the user's own datasets (`sales.orders`): their data can't travel either */
    ownDatasetTables?: { schema: string; name: string }[]
  },
): { share: Share; notShared: string[] } {
  const text = tabs.map((t) => stripComments(t.sql)).join('\n')
  const uses = (name: string) => new RegExp(`(^|[^\\w."])"?${escapeRe(name)}"?(?![\\w"])`, 'i').test(text)
  const usesSchema = (schema: string) => new RegExp(`(^|[^\\w."])"?${escapeRe(schema)}"?\\s*\\.`, 'i').test(text)
  // A SQLite (Quaera) tab names the trainer's tables bare (fact_sellout), so it needs their dataset.
  const sqlite = tabs.some((t) => t.dialect === 'sqlite')
  const datasets = loaded.datasets.filter((id) => usesSchema(id) || (sqlite && id === SQLITE_DATASET))
  if (sqlite && !datasets.includes(SQLITE_DATASET)) datasets.push(SQLITE_DATASET)
  const demoSet = new Set(loaded.demoTables.map((n) => n.toLowerCase()))
  const demo = loaded.demoTables.some(uses)
  const usesIn = (schema: string, name: string) =>
    new RegExp(`(^|[^\\w."])"?${escapeRe(schema)}"?\\s*\\.\\s*"?${escapeRe(name)}"?(?![\\w"])`, 'i').test(text)
  const notShared = [
    ...loaded.ownTables.filter((n) => !demoSet.has(n.toLowerCase()) && uses(n)),
    ...(loaded.ownDatasetTables ?? []).filter((t) => usesIn(t.schema, t.name)).map((t) => `${t.schema}.${t.name}`),
  ]
  return { share: { datasets, demo, tabs: tabs.map((t) => ({ title: t.title, sql: t.sql, ...(t.dialect && t.dialect !== 'duckdb' ? { dialect: t.dialect } : {}) })) }, notShared }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** SQL without its comments (both kinds) and string literals, so a name in them is not a use. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g, ' ')
}

/** The link's data: a short JSON (one-letter keys) packed for the fragment. */
export async function encodeShare(share: Share): Promise<string> {
  const json = { v: 1, d: share.datasets, ...(share.demo ? { m: 1 } : {}), t: share.tabs.map((t) => ({ n: t.title, q: t.sql, ...(t.dialect ? { l: t.dialect } : {}) })) }
  return packText(JSON.stringify(json))
}

/** The share back from {@link encodeShare}; anything damaged or unexpected throws a readable error. */
export async function decodeShare(data: string): Promise<Share> {
  let text: string
  try {
    text = await unpackText(data, MAX_SHARE_BYTES)
  } catch (e) {
    if (e instanceof TooLarge) throw new Error('The shared link is too large to open.')
    throw new Error('The shared link is damaged or incomplete (it may have been cut when it was copied).')
  }
  return parseShare(text)
}

/** Checks every field: a link is input from anyone. */
export function parseShare(text: string): Share {
  const bad = (why: string) => new Error(`The shared link can't be read: ${why}.`)
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    throw bad('it is not a Quaera Lab link')
  }
  if (!j || typeof j !== 'object') throw bad('it is not a Quaera Lab link')
  const o = j as Record<string, unknown>
  if (o.v !== 1) throw bad('it was made by a newer version of Quaera Lab; reload the page and try again')
  const d = o.d ?? []
  if (!Array.isArray(d) || !d.every((x) => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x))) throw bad('the dataset list is damaged')
  const t = o.t
  if (!Array.isArray(t) || t.length === 0) throw bad('it has no queries')
  if (t.length > MAX_SHARED_TABS) throw bad(`it has more than ${MAX_SHARED_TABS} queries`)
  const tabs = t.map((x): SharedTab => {
    const tab = x as Record<string, unknown>
    if (!x || typeof x !== 'object' || typeof tab.q !== 'string' || (tab.n != null && typeof tab.n !== 'string')) throw bad('a query is damaged')
    if (tab.l != null && (typeof tab.l !== 'string' || !DIALECTS.has(tab.l))) throw bad('a query has an unknown dialect')
    const title = (typeof tab.n === 'string' ? tab.n : '').trim().slice(0, 80) || 'Shared query'
    return { title, sql: tab.q, ...(tab.l && tab.l !== 'duckdb' ? { dialect: tab.l as SharedDialect } : {}) }
  })
  return { datasets: [...new Set(d as string[])], demo: o.m === 1, tabs }
}

/** The `s` data in a URL fragment, or null when there is none. */
export function shareDataFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get(SHARE_PARAM) || null
}

/** The fragment without its `s` part ('' when nothing else is left). */
export function hashWithoutShare(hash: string): string {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  p.delete(SHARE_PARAM)
  const rest = p.toString()
  return rest ? `#${rest}` : ''
}

/** The address to send: `https://lab.quaera.app/#s=…`. */
export function shareUrl(origin: string, pathname: string, data: string): string {
  return `${origin}${pathname}#${SHARE_PARAM}=${data}`
}
