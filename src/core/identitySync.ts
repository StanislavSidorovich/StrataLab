// A T-SQL IDENTITY column becomes a sequence used as the column's default (src/dialects/translate.py). A script
// that loads rows with their own ids (SET IDENTITY_INSERT ... ON, as SSMS writes them) leaves that sequence
// at 1, so the next INSERT without an id would collide with a row that is already there. After the script runs,
// each such sequence is moved forward to the highest id of its column (SQL Server does the same by itself).
import type { TranslatedStatement } from '../dialects/tsql'
import { quoteString } from './sql'

/** Ids above this are not walked to (the sequence moves one step at a time); such a sequence stays as it is. */
export const SYNC_LIMIT = 1_000_000

/**
 * One statement per IDENTITY sequence of the script. Each reads where the sequence stands (`last_value` is empty
 * until it was used, and a table filled by INSERTs without ids has already moved it) and takes only the missing
 * steps, so running it twice, or after ids from the sequence itself, leaves no gaps. It returns one row, `moved`.
 * Names resolve through the search path, as the script's own statements did.
 */
export function identitySyncSql(statements: TranslatedStatement[]): string[] {
  return statements.flatMap((st) =>
    (st.target ? (st.identity ?? []) : []).map(({ sequence, table, column }) => {
      const seq = quoteString(sequence)
      return (
        `WITH s AS (SELECT coalesce(max(last_value), 0) AS l FROM duckdb_sequences() WHERE sequence_name = ${seq} AND schema_name = current_schema()), ` +
        `t AS (SELECT CAST(max(${column}) AS BIGINT) AS m FROM ${table}) ` +
        `SELECT count(nextval(${seq})) AS moved FROM s, t, range(CASE WHEN t.m - s.l BETWEEN 1 AND ${SYNC_LIMIT} THEN t.m - s.l ELSE 0 END) r`
      )
    }),
  )
}
