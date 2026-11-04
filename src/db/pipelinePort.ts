// The pipeline's port to Lab's own DuckDB (src/db/engine.ts): queries one at a time, Parquet files fetched from the
// site like a catalog dataset, the 30 exports registered as text files.
import { resultRows } from './export'
import { dropFile, query, registerBuffer } from './engine'
import type { SqlPort } from './pipelineRun'

export const enginePort: SqlPort = {
  query: async (sql) => resultRows(await query(sql)),
  registerText: async (name, text) => {
    await dropFile(name).catch(() => {})
    await registerBuffer(name, new TextEncoder().encode(text))
  },
  parquet: async (folder, file) => {
    const url = new URL(`datasets/${folder}/${file}`, document.baseURI).href
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not download ${url} (${res.status} ${res.statusText})`)
    const name = `pipe_${folder}_${file}`
    await dropFile(name).catch(() => {})
    await registerBuffer(name, new Uint8Array(await res.arrayBuffer()))
    return name
  },
}
