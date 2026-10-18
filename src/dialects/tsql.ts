// T-SQL and SQLite → DuckDB (stage 4): asks the sqlglot worker to translate a script, statement by statement.
import type { TranslateRequest } from './sqlglotWorker'

export interface TranslatedStatement {
  /** the T-SQL or SQLite as written */
  source: string
  /** where it starts in the script */
  at: number
  /** DuckDB SQL, or null when sqlglot could not read the statement */
  target: string | null
  notes: string[]
  error: string | null
}

export type TranslatorProgress = 'download' | 'start'

export const SQLGLOT_VERSION = '30.23.0'

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, { resolve: (r: TranslatedStatement[]) => void; reject: (e: Error) => void }>()
let onProgress: ((p: TranslatorProgress) => void) | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./sqlglotWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const { id, result, error, progress } = e.data
    if (progress) return onProgress?.(progress)
    const w = waiting.get(id)
    waiting.delete(id)
    if (!w) return
    if (error) w.reject(new Error(error))
    else w.resolve(result)
  }
  return worker
}

let loaded = false
/** True once Python and sqlglot are up (a translation then takes milliseconds). */
export const translatorReady = () => loaded

/** The dialects sqlglot translates from. */
export type SourceDialect = 'tsql' | 'sqlite'

/**
 * `schema`: for SQLite, the column types of the tables bare names reach (src/core/sqliteDialect.ts).
 */
export function translateToDuckdb(
  script: string,
  read: SourceDialect,
  schema: Record<string, Record<string, string>> | null,
  progress?: (p: TranslatorProgress) => void,
): Promise<TranslatedStatement[]> {
  onProgress = progress ?? null
  const id = ++nextId
  const base = new URL('.', document.baseURI)
  const req: TranslateRequest = {
    id,
    script,
    read,
    schema,
    indexURL: new URL('pyodide/', base).href,
    wheelURL: new URL(`sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`, base).href,
  }
  return new Promise<TranslatedStatement[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    getWorker().postMessage(req)
  }).then((r) => {
    loaded = true
    return r
  })
}

/** The DuckDB script to run: every translated statement, in order. */
export function duckdbScript(statements: TranslatedStatement[]): string {
  return statements.map((s) => s.target).filter(Boolean).join(';\n\n') + ';'
}
