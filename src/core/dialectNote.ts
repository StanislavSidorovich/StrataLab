// What each SQL dialect is for, in one line: the "Write as…" menu shows it, and the first time a tab
// uses T-SQL or PostgreSQL a small note above the editor says it again (closed once per dialect).

export type SqlDialect = 'duckdb' | 'tsql' | 'postgres'

export const SQL_DIALECTS: { id: SqlDialect; label: string; hint: string }[] = [
  { id: 'duckdb', label: 'DuckDB', hint: 'The default: runs as written. Close to PostgreSQL.' },
  { id: 'tsql', label: 'T-SQL (SQL Server)', hint: 'Your course or job uses SQL Server: TOP, GETDATE(). Lab translates it to DuckDB to run.' },
  { id: 'postgres', label: 'PostgreSQL', hint: 'Your course or job uses PostgreSQL. Runs on a real PostgreSQL in this browser: a separate database, copy tables into it.' },
]

/** The name on the tab bar's button: "SQL · DuckDB", "SQL · T-SQL", "SQL · PostgreSQL". */
export const sqlLabel = (d: SqlDialect) => `SQL · ${d === 'tsql' ? 'T-SQL' : SQL_DIALECTS.find((x) => x.id === d)!.label}`

/** DuckDB needs no note: it is the default. */
export const needsNote = (d: string): d is 'tsql' | 'postgres' => d === 'tsql' || d === 'postgres'

export const noteKey = (d: string) => `stratalab.dialect-note.${d}`

export function noteDismissed(d: string, store: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return store?.getItem(noteKey(d)) === '1'
  } catch {
    return false
  }
}

export function dismissNote(d: string, store: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    store?.setItem(noteKey(d), '1')
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
