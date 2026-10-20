// DuckDB-WASM in a Web Worker. The database lives in the browser's private
// file system (OPFS) when it can, so tables survive a reload; otherwise it
// stays in memory for this tab only.
import * as duckdb from '@duckdb/duckdb-wasm'
import { Table, tableFromIPC } from 'apache-arrow'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { downloadPercent } from '../core/progress'
import { EXTENSIONS_DIR, hasOwnExtensions } from '../core/extensions'
import { takeRows } from '../core/rowLimit'
import { DB_CHANNEL, DB_LOCK, HELD_KEY, LEFT_KEY, lockPlan, memoryReason, type DbMessage, type MemoryReason } from '../core/dbLock'

/** Decompressed sizes of the two .wasm files, filled in by vite.config.ts. */
declare const __DUCKDB_WASM_BYTES__: { eh: number; mvp: number }
/** Paths under duckdb-ext/ served with the site (vite.config.ts). */
declare const __OWN_DUCKDB_EXTENSIONS__: string[]

const DB_FILE = 'stratalab.duckdb'

export interface Engine {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  version: string
  persistent: boolean
  /** why it is in memory (when not persistent) */
  memoryReason?: MemoryReason
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
  let reason: MemoryReason | undefined
  try {
    if (!(await takeDbLock())) throw new Error('The database is locked by another tab')
    await openPersistent(db)
    persistent = true
    holdDatabase(db)
  } catch (e) {
    // No OPFS (old browser, private window) or the file is held by another tab.
    console.warn('Using an in-memory database:', e)
    reason = memoryReason(e)
    storageSet(() => sessionStorage, HELD_KEY, null)
    releaseLock?.()
    releaseLock = null
    await db.open({})
  }

  const conn = await db.connect()
  const version = (await db.getVersion()).replace(/^v/, '')
  // Parquet and ICU from this site, not extensions.duckdb.org (src/core/extensions.ts).
  if (hasOwnExtensions(__OWN_DUCKDB_EXTENSIONS__, version, bundle.mainModule === ehWasm ? 'wasm_eh' : 'wasm_mvp'))
    await conn.query(`SET custom_extension_repository = '${new URL(EXTENSIONS_DIR, new URL(import.meta.env.BASE_URL, location.href)).href}'`)
  return { db, conn, version, persistent, memoryReason: reason }
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
  // Right after a reload the old page's worker may hold the file a moment longer.
  for (let attempt = 0; ; attempt++) {
    try {
      await emptyWal(dir)
      break
    } catch (e) {
      if (attempt >= 4 || !releaseLock || (e as Error).name !== 'NoModificationAllowedError') throw e
      await new Promise((done) => setTimeout(done, 300))
    }
  }
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

let releaseLock: (() => void) | null = null

const storageGet = (store: () => Storage, key: string) => {
  try {
    return store().getItem(key)
  } catch {
    return null
  }
}
const storageSet = (store: () => Storage, key: string, value: string | null) => {
  try {
    if (value === null) store().removeItem(key)
    else store().setItem(key, value)
  } catch {
    /* ignore */
  }
}

/**
 * Takes the Web Lock that says "this tab has the saved database" and keeps it until the page goes
 * (src/core/dbLock.ts). False when another Lab page holds it. Without Web Locks: true, and the file
 * itself decides (opening it fails while another tab has it).
 */
async function takeDbLock(): Promise<boolean> {
  if (!navigator.locks) return true
  const leftAt = Number(storageGet(() => localStorage, LEFT_KEY)) || null
  const { waitMs, delayMs } = lockPlan(storageGet(() => sessionStorage, HELD_KEY) === '1', leftAt, Date.now())
  if (delayMs) await new Promise((done) => setTimeout(done, delayMs))
  return new Promise<boolean>((resolve) => {
    const abort = new AbortController()
    const timer = waitMs ? setTimeout(() => abort.abort(), waitMs) : undefined
    const options: LockOptions = waitMs ? { signal: abort.signal } : { ifAvailable: true }
    navigator.locks
      .request(DB_LOCK, options, (lock) => {
        clearTimeout(timer)
        if (!lock) {
          resolve(false)
          return
        }
        resolve(true)
        return new Promise<void>((release) => (releaseLock = release))
      })
      .catch(() => resolve(false))
  })
}

const movedListeners = new Set<() => void>()
/** Called when this tab gave the saved database to another tab ("Use this tab" there). */
export function onDatabaseMoved(listener: () => void) {
  movedListeners.add(listener)
}

/** The holder's side: remembers it holds the file (for its own reload) and answers "Use this tab". */
function holdDatabase(db: duckdb.AsyncDuckDB) {
  storageSet(() => sessionStorage, HELD_KEY, '1')
  // Leaving the page (reload, Update, close): other tabs coming back from the same reload let this one go first.
  window.addEventListener('pagehide', () => storageSet(() => localStorage, LEFT_KEY, String(Date.now())))
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(DB_CHANNEL)
  channel.onmessage = async (e: MessageEvent<DbMessage>) => {
    if (e.data?.type !== 'release' || !releaseLock) return
    storageSet(() => sessionStorage, HELD_KEY, null)
    // Ending the worker closes the file; then the lock goes.
    await db.terminate().catch(() => {})
    releaseLock()
    releaseLock = null
    channel.postMessage({ type: 'released' } satisfies DbMessage)
    channel.close()
    movedListeners.forEach((l) => l())
  }
}

/**
 * "Use this tab": asks the tab that has the saved database to let it go, then reloads this one,
 * which waits for its turn and opens it. Reloads after a few seconds even without an answer
 * (an older Lab page that does not listen): the reload then takes the file if it is free.
 */
export function takeDatabaseHere() {
  storageSet(() => sessionStorage, HELD_KEY, '1')
  const reload = () => location.reload()
  if (typeof BroadcastChannel === 'undefined') return reload()
  const channel = new BroadcastChannel(DB_CHANNEL)
  const timer = setTimeout(reload, 4000)
  channel.onmessage = (e: MessageEvent<DbMessage>) => {
    if (e.data?.type !== 'released') return
    clearTimeout(timer)
    reload()
  }
  channel.postMessage({ type: 'release' } satisfies DbMessage)
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

/**
 * `queryCancellable` that brings in at most `limit` rows of the last statement's result
 * (src/core/rowLimit.ts): DuckDB streams it and stops making rows once the limit is passed,
 * so a `SELECT *` on millions of rows costs no more than the rows shown. `more`: it had more.
 */
export function queryLimited(sql: string, tag: string, stopped: () => boolean, limit: number): Promise<{ table: Table; more: boolean }> {
  return serial(async () => {
    if (stopped()) throw new Error('query was canceled')
    const { conn } = await getEngine()
    sending = tag
    try {
      const reader = await conn.send(sql, true)
      const { batches, more } = await takeRows(reader, limit)
      // The rows past the limit are never fetched; the next query on the connection drops them.
      return { table: new Table(reader.schema, batches), more }
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
