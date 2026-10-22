// T-SQL → DuckDB (stage 4): asks the sqlglot worker to translate a script, statement by statement.
import { foldKeys, runOrder } from '../core/pdScript'
import type { TranslateRequest } from './sqlglotWorker'

export interface TranslatedStatement {
  /** the T-SQL as written */
  source: string
  /** where it starts in the script */
  at: number
  /** DuckDB SQL; null when sqlglot could not read the statement, empty when there is nothing to run for it */
  target: string | null
  notes: string[]
  error: string | null
  /** Where it runs when that is not its place in the script (PowerDesigner scripts: see core/pdScript.ts) */
  rank?: number
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

export function translateTsql(script: string, progress?: (p: TranslatorProgress) => void): Promise<TranslatedStatement[]> {
  onProgress = progress ?? null
  const id = ++nextId
  const base = new URL('.', document.baseURI)
  const req: TranslateRequest = {
    id,
    script,
    indexURL: new URL('pyodide/', base).href,
    wheelURL: new URL(`sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`, base).href,
  }
  return new Promise<TranslatedStatement[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    getWorker().postMessage(req)
  }).then((r) => {
    loaded = true
    return foldKeys(r)
  })
}

/** The DuckDB script to run: every translated statement, in the order they run. */
export function duckdbScript(statements: TranslatedStatement[]): string {
  return runOrder(statements).join(';\n\n') + ';'
}
