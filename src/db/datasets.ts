// Loads a catalog dataset (src/data/datasets.ts): downloads its Parquet files from the site,
// creates its schema and tables with their keys, and fills them.
import { checkpoint, dropFile, query, registerBuffer } from './engine'
import type { Dataset, DatasetTable } from '../data/datasets'
import { quoteIdent, quoteString } from '../core/sql'

export interface DatasetProgress {
  step: 'download' | 'load'
  /** 0…1 */
  share: number
}

async function download(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status} ${res.statusText})`)
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer())
    onBytes(all.byteLength)
    return all
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    onBytes(value.byteLength)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) out.set(c, (at += c.byteLength) - c.byteLength)
  return out
}

export async function isLoaded(id: string): Promise<boolean> {
  const t = await query(`SELECT count(*)::INTEGER AS n FROM duckdb_schemas() WHERE database_name = current_database() AND schema_name = ${quoteString(id)}`)
  return Number(t.get(0)?.n ?? 0) > 0
}

/**
 * DuckDB checks a foreign key against the rows already in the table, so a table that refers to
 * itself (an employee's boss) is filled in rounds: rows whose parent is empty or already there.
 */
async function insertTable(target: string, from: string, t: DatasetTable) {
  if (!t.selfRef) {
    await query(`INSERT INTO ${target} BY NAME SELECT * FROM ${from}`)
    return
  }
  const { columns, refColumns, key } = t.selfRef
  const has = key.map((k) => `x.${quoteIdent(k)} = s.${quoteIdent(k)}`).join(' AND ')
  const parent = columns.map((c, i) => `x.${quoteIdent(refColumns[i])} = s.${quoteIdent(c)}`).join(' AND ')
  const empty = columns.map((c) => `s.${quoteIdent(c)} IS NULL`).join(' OR ')
  for (let round = 0; round < t.rows + 1; round++) {
    const r = await query(
      `INSERT INTO ${target} BY NAME SELECT s.* FROM ${from} s WHERE NOT EXISTS (SELECT 1 FROM ${target} x WHERE ${has}) AND (${empty} OR EXISTS (SELECT 1 FROM ${target} x WHERE ${parent}))`,
    )
    if (!Number(r.get(0)?.Count ?? 0)) break
  }
}

/** Creates the dataset's schema (replacing it if it is there) and fills its tables. */
export async function loadDataset(d: Dataset, onProgress: (p: DatasetProgress) => void): Promise<void> {
  const total = d.tables.reduce((n, t) => n + t.bytes, 0) || 1
  let got = 0
  onProgress({ step: 'download', share: 0 })
  const files = await Promise.all(
    d.tables.map(async (t) => {
      const url = new URL(`datasets/${d.id}/${t.file}`, document.baseURI).href
      const bytes = await download(url, (n) => onProgress({ step: 'download', share: Math.min(1, (got += n) / total) }))
      const reg = `ds_${d.id}_${t.file}`
      await registerBuffer(reg, bytes)
      return reg
    }),
  )
  // Not one transaction: after a dataset was dropped from a reopened database file, DuckDB 1.5
  // refuses to commit several CREATE TABLEs with foreign keys together ("Could not commit creation
  // of dependency, subject … has been deleted"); one statement at a time works. A failed load
  // removes what it made.
  const schema = quoteIdent(d.id)
  try {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await query(`CREATE SCHEMA ${schema}`)
    for (const stmt of d.ddl) await query(stmt)
    for (const [i, t] of d.tables.entries()) {
      onProgress({ step: 'load', share: i / d.tables.length })
      await insertTable(`${schema}.${quoteIdent(t.name)}`, `read_parquet(${quoteString(files[i])})`, t)
    }
  } catch (e) {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
    throw e
  } finally {
    await checkpoint()
    for (const f of files) await dropFile(f).catch(() => {})
  }
}

export async function removeDataset(id: string): Promise<void> {
  await query(`DROP SCHEMA IF EXISTS ${quoteIdent(id)} CASCADE`)
  await checkpoint()
}
