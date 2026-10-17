// DuckDB-WASM in a Web Worker. The database lives in the browser's private
// file system (OPFS) when it can, so tables survive a reload; otherwise it
// stays in memory for this tab only.
import * as duckdb from '@duckdb/duckdb-wasm'
import { tableFromIPC, type Table } from 'apache-arrow'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { downloadPercent } from '../core/progress'

/** Decompressed sizes of the two .wasm files, filled in by vite.config.ts. */
declare const __DUCKDB_WASM_BYTES__: { eh: number; mvp: number }

const DB_FILE = 'stratalab.duckdb'

export interface Engine {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  version: string
  persistent: boolean
}

/** What the first start is doing: fetching the engine (percent, null if unknown), then starting it. */
export type EngineProgress = { step: 'download'; percent: number | null } | { step: 'start' }

let enginePromise: Promise<Engine> | null = null

/** The first caller's `onProgress` hears about the start; later callers just wait. */
export function getEngine(onProgress?: (p: EngineProgress) => void): Promise<Engine> {
  enginePromise ??= start(onProgress ?? (() => {}))
  return enginePromise
}

async function start(onProgress: (p: EngineProgress) => void): Promise<Engine> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  })
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  const knownSize = bundle.mainModule === ehWasm ? __DUCKDB_WASM_BYTES__.eh : __DUCKDB_WASM_BYTES__.mvp
  const wasmUrl = await downloadWasm(bundle.mainModule, knownSize, onProgress)
  onProgress({ step: 'start' })
  try {
    await db.instantiate(wasmUrl, bundle.pthreadWorker)
  } finally {
    if (wasmUrl.startsWith('blob:')) URL.revokeObjectURL(wasmUrl)
  }

  let persistent = false
  try {
    await openPersistent(db)
    persistent = true
  } catch (e) {
    // No OPFS (old browser, private window) or the file is locked by another tab.
    console.warn('Using an in-memory database:', e)
    await db.open({})
  }

  const conn = await db.connect()
  const version = (await db.getVersion()).replace(/^v/, '')
  return { db, conn, version, persistent }
}

/**
 * Fetches the .wasm here, counting bytes, and hands DuckDB a blob: URL of it.
 * DuckDB's own progress callback only fires when chunks arrive more than 20 ms
 * apart, so on a decent connection the bar would sit at 0% and then jump.
 */
async function downloadWasm(url: string, knownSize: number, onProgress: (p: EngineProgress) => void): Promise<string> {
  onProgress({ step: 'download', percent: downloadPercent(0, knownSize, 0) })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download DuckDB (${res.status} ${res.statusText})`)
  if (!res.body) return url // no streams: let DuckDB fetch it (from the cache by now)
  const headerSize = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  let shown: number | null = -1
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    const percent = downloadPercent(loaded, knownSize, headerSize)
    if (percent !== shown) onProgress({ step: 'download', percent: (shown = percent) })
  }
  // application/wasm lets the worker compile it with instantiateStreaming.
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/wasm' }))
}

/**
 * DuckDB-WASM's own `opfs://` path registers the database file only when it
 * already has data (a new, empty file is never registered, so everything
 * silently stays in memory) and DuckDB 1.5 normalises `opfs://x` to `opfs:/x`.
 * So we register both files ourselves under plain names and open by that name.
 */
async function openPersistent(db: duckdb.AsyncDuckDB) {
  if (!('getDirectory' in (navigator.storage ?? {}))) throw new Error('OPFS is not supported')
  const dir = await navigator.storage.getDirectory()
  await emptyWal(dir)
  for (const name of [DB_FILE, `${DB_FILE}.wal`]) {
    const handle = await dir.getFileHandle(name, { create: true })
    await db.registerFileHandle(name, handle, duckdb.DuckDBDataProtocol.BROWSER_FSACCESS, true)
  }
  await db.open({ path: DB_FILE, accessMode: duckdb.DuckDBAccessMode.READ_WRITE, useDirectIO: true })
}

/**
 * After a CHECKPOINT, DuckDB-WASM empties the WAL only in its own bookkeeping: the OPFS file
 * keeps its old bytes. On the next start DuckDB may replay that stale tail and refuse to open
 * ("Failure while replaying WAL file: Table … already exists"), and the app fell back to an
 * empty in-memory database. Every write here is followed by a CHECKPOINT, so the database file
 * already holds everything: the WAL is emptied before opening. If another tab has the file
 * open, this throws, and that tab keeps the saved database (we fall back to memory).
 */
async function emptyWal(dir: FileSystemDirectoryHandle) {
  const wal = await dir.getFileHandle(`${DB_FILE}.wal`, { create: true })
  if (!('createWritable' in wal) || (await wal.getFile()).size === 0) return
  const w = await wal.createWritable({ keepExistingData: false })
  await w.close()
}

// One connection, one query at a time, in the order asked. The worker used to do this by
// itself; a sent (cancellable) query is polled in steps, and another query on the connection
// between two steps would end it.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

export function query(sql: string): Promise<Table> {
  return serial(async () => (await getEngine()).conn.query(sql))
}

/** The tab whose cancellable query is running, if any. */
let sending: string | null = null

/**
 * A query the Stop button can cancel: DuckDB runs it in steps (`send`), and between two steps
 * `cancelQuery` stops it ("query was canceled"). In a script, the statements before the last run
 * in one go when it starts; only the last one can be stopped. Returns the last statement's result.
 * `stopped`: asked when its turn comes, so a query stopped while it waited never starts.
 */
export function queryCancellable(sql: string, tag: string, stopped: () => boolean): Promise<Table> {
  return serial(async () => {
    if (stopped()) throw new Error('query was canceled')
    const { conn } = await getEngine()
    sending = tag
    try {
      return await tableFromIPC(await conn.send(sql))
    } finally {
      sending = null
    }
  })
}

/** Stops the query `queryCancellable` is running for `tag`; false if it isn't running one. */
export async function cancelQuery(tag: string): Promise<boolean> {
  if (sending !== tag) return false
  const { conn } = await getEngine()
  return conn.cancelSent()
}

export const isCancelled = (e: unknown) => /query was cancell?ed/i.test(String(e instanceof Error ? e.message : e))

/** Writes the database file to OPFS so that the next visit sees the changes. */
export async function checkpoint(): Promise<void> {
  const { persistent } = await getEngine()
  if (persistent) await query('CHECKPOINT')
}

/** A new table `name` in main from an Arrow table already in the page (a result in the grid). */
export function insertArrow(table: Table, name: string): Promise<void> {
  return serial(async () => (await getEngine()).conn.insertArrowTable(table, { name, create: true }))
}

export async function registerBuffer(name: string, bytes: Uint8Array): Promise<void> {
  const { db } = await getEngine()
  await db.registerFileBuffer(name, bytes)
}

export async function dropFile(name: string): Promise<void> {
  const { db } = await getEngine()
  await db.dropFile(name)
}

export async function readFile(name: string): Promise<Uint8Array> {
  const { db } = await getEngine()
  return db.copyFileToBuffer(name)
}
