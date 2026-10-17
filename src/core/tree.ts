// The object tree's search box: which tables to show for what was typed.

/** How a table matches the search: by its name, or only by some of its columns. */
export interface TreeMatch {
  byName: boolean
  /** the columns whose names contain the search (empty when it matched by name only) */
  columns: string[]
}

/**
 * Whether a table matches the tree's search, ignoring case: its name, its `schema.name`
 * (so "chinook.al" finds chinook.Album), or the name of one of its columns. Null when it
 * doesn't; everything matches an empty search.
 */
export function treeMatch(schema: string, name: string, columns: string[], search: string): TreeMatch | null {
  const q = search.trim().toLowerCase()
  if (!q) return { byName: true, columns: [] }
  const byName = name.toLowerCase().includes(q) || `${schema}.${name}`.toLowerCase().includes(q)
  const cols = q.includes('.') ? [] : columns.filter((c) => c.toLowerCase().includes(q))
  return byName || cols.length ? { byName, columns: cols } : null
}
