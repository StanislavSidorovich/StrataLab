// Transactions in a SQL tab. Lab keeps ONE DuckDB connection, so a BEGIN that nothing ends stays open for the next Run,
// and a statement that fails inside BEGIN ... COMMIT leaves the transaction "aborted": every later statement fails with
// "Current transaction is aborted (please ROLLBACK)", and in a saved database so does the CHECKPOINT after each Run.
// Rules (tests/transaction.test.ts):
//   - a script fails while a transaction is open: ROLLBACK at once, and a line in Messages says so;
//   - a script ends with a transaction still open: kept open (a course exercise runs BEGIN TRAN, looks, then ROLLBACK in a
//     second Run), CHECKPOINT is skipped until it ends, and a note says "Transaction open: run COMMIT or ROLLBACK";
//   - no transaction involved: nothing changes.
// A reload starts a fresh connection, which starts clean, so an open transaction cannot outlive the page.

/** Words that can start or end a transaction. A hit only means "ask DuckDB": an unrelated 'begin' in a string costs one probe. */
const TRANSACTION_WORDS = /\b(begin|start|commit|rollback|abort)\b/i

export const mentionsTransaction = (sql: string): boolean => TRANSACTION_WORDS.test(sql)

export const TRANSACTION_OPEN_NOTE = 'Transaction open: run COMMIT or ROLLBACK. Nothing is saved to this browser until then.'

export interface RunEnd {
  /** the 1-based number of the statement that failed, `unknown` when the script went to DuckDB in one piece, null when none failed */
  failedAt: number | 'unknown' | null
  /** DuckDB says a transaction is open (or aborted) now */
  inTransaction: boolean
}

export interface TransactionAction {
  /** send ROLLBACK now */
  rollback: boolean
  /** a CHECKPOINT after this run is safe */
  checkpoint: boolean
  /** a line for Messages (and the notice bar when the transaction stays open); null for nothing to say */
  note: string | null
}

/** What to do when a run ends, from the two facts above. */
export function afterRun({ failedAt, inTransaction }: RunEnd): TransactionAction {
  if (!inTransaction) return { rollback: false, checkpoint: true, note: null }
  if (failedAt !== null) {
    const which = failedAt === 'unknown' ? 'A statement' : `Statement ${failedAt}`
    return { rollback: true, checkpoint: true, note: `${which} failed inside a transaction; Lab rolled it back, nothing from BEGIN onwards was kept.` }
  }
  return { rollback: false, checkpoint: false, note: TRANSACTION_OPEN_NOTE }
}

export interface TransactionIo {
  /** DuckDB says a transaction is open or aborted (engine.ts `inTransaction`) */
  inTransaction: () => Promise<boolean>
  rollback: () => Promise<void>
}

export interface Settled {
  /** the line for Messages: the rollback note after a failed script, the "open" note after one that left it open */
  note: string | null
  /** a transaction is open now (CHECKPOINT must wait) */
  open: boolean
}

/**
 * The whole rule for the end of a run. `remembered` is true while an earlier Run left a transaction open. DuckDB is asked
 * only when this script (`sql`) or that earlier Run could have started one, so a plain script costs nothing extra.
 * A probe that itself fails leaves the connection as it is.
 */
export async function settleTransaction(sql: string, failedAt: RunEnd['failedAt'], remembered: boolean, io: TransactionIo): Promise<Settled> {
  const none: Settled = { note: null, open: false }
  if (!remembered && !mentionsTransaction(sql)) return none
  try {
    const action = afterRun({ failedAt, inTransaction: await io.inTransaction() })
    if (action.rollback) await io.rollback()
    return { note: action.note, open: !action.checkpoint }
  } catch {
    return { note: null, open: remembered }
  }
}
