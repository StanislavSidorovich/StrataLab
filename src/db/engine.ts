// DuckDB-WASM in a Web Worker. The database lives in the browser's private
// file system (OPFS) when it can, so tables survive a reload; otherwise it
// stays in memory for this tab only.
import * as duckdb from '@duckdb/duckdb-wasm'
import type { Table } from 'apache-arrow'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const DB_FILE = 'sql-lab.duckdb'

export interface Engine {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  version: string
  persistent: boolean
}

let enginePromise: Promise<Engine> | null = null

export function getEngine(): Promise<Engine> {
  enginePromise ??= start()
  return enginePromise
}

async function start(): Promise<Engine> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  })
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

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
 * DuckDB-WASM's own `opfs://` path registers the database file only when it
 * already has data (a new, empty file is never registered, so everything
 * silently stays in memory) and DuckDB 1.5 normalises `opfs://x` to `opfs:/x`.
 * So we register both files ourselves under plain names and open by that name.
 */
async function openPersistent(db: duckdb.AsyncDuckDB) {
  if (!('getDirectory' in (navigator.storage ?? {}))) throw new Error('OPFS is not supported')
  const dir = await navigator.storage.getDirectory()
  for (const name of [DB_FILE, `${DB_FILE}.wal`]) {
    const handle = await dir.getFileHandle(name, { create: true })
    await db.registerFileHandle(name, handle, duckdb.DuckDBDataProtocol.BROWSER_FSACCESS, true)
  }
  await db.open({ path: DB_FILE, accessMode: duckdb.DuckDBAccessMode.READ_WRITE, useDirectIO: true })
}

export async function query(sql: string): Promise<Table> {
  const { conn } = await getEngine()
  return conn.query(sql)
}

/** Writes the database file to OPFS so that the next visit sees the changes. */
export async function checkpoint(): Promise<void> {
  const { conn, persistent } = await getEngine()
  if (persistent) await conn.query('CHECKPOINT')
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
