// SQLite (Quaera) tabs: SQL written for the Quaera trainer (quaera.app runs SQLite) gives the same
// result here. sqlglot translates it to DuckDB (src/dialects/translate.py, read="sqlite"); this
// file holds what the page adds around it: how DuckDB's session is set while the tab runs, and the
// column types the translator is told. scripts/sqlite-coverage.py measures the lot on the
// trainer's own queries.

/** The trainer's dataset (Kaiyo Trading): a catalog dataset whose tables the trainer names bare. */
export const QUAERA_DATASET = 'quaera'

/**
 * Statements run before and after a SQLite tab's statements, on the same connection with nothing
 * in between: bare table names find the trainer's tables (`fact_sellout` is `quaera.fact_sellout`;
 * the user's own tables in `main` after them), and 7 / 2 is 3, as SQLite divides whole numbers.
 * Without the dataset loaded the search path stays (DuckDB refuses a schema that isn't there).
 */
export function sqliteSession(schemas: string[]): { before: string[]; after: string[] } {
  const path = schemas.includes(QUAERA_DATASET)
  return {
    before: [...(path ? [`SET search_path = '${QUAERA_DATASET},main'`] : []), 'SET integer_division = true'],
    after: [...(path ? ['RESET search_path'] : []), 'RESET integer_division'],
  }
}

interface CatalogTable {
  schema: string
  name: string
  columns: { name: string; type: string }[]
}

/**
 * The column types of the tables a bare name reaches, as the search path finds them (the trainer's
 * dataset first, then the user's own): `{ fact_sellout: { revenue: 'DOUBLE', … } }`. The translator
 * uses them to sum REAL columns as SQLite does and to leave text columns as they are.
 */
export function sqliteSchema(tables: CatalogTable[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const schema of [QUAERA_DATASET, 'main'])
    for (const t of tables) {
      const key = t.name.toLowerCase()
      if (t.schema !== schema || key in out) continue
      out[key] = Object.fromEntries(t.columns.map((c) => [c.name, c.type]))
    }
  return out
}
