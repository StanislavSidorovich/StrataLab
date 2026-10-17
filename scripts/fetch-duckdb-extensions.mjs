// Downloads the DuckDB extensions the site serves itself (src/core/extensions.ts) into
// public/duckdb-ext/, for the DuckDB inside the installed @duckdb/duckdb-wasm. Run before a build
// (the deploy workflow does): `npm run extensions`. Files already there are kept.
// Without them the app still works, fetching extensions from extensions.duckdb.org.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EXTENSIONS_DIR, ownExtensionPaths } from '../src/core/extensions.ts'

const require = createRequire(import.meta.url)
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
const dist = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'))
const bundles = { mvp: { mainModule: join(dist, 'duckdb-mvp.wasm'), mainWorker: '' }, eh: { mainModule: join(dist, 'duckdb-eh.wasm'), mainWorker: '' } }
const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
await db.instantiate()
const version = db.getVersion()

for (const path of ownExtensionPaths(version)) {
  const out = join('public', EXTENSIONS_DIR, path)
  if (existsSync(out)) continue
  const url = `https://extensions.duckdb.org/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`${out}  ${(bytes.length / 1e6).toFixed(1)} MB`)
}
