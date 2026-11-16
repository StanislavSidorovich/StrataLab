// The engine side of the Power BI practice page: the three CSV files of the Kaiyo star fetched from the site and registered
// with DuckDB, and the truth of a task computed over them (src/core/powerBiPractice.ts `withStar`). Nothing is created in
// the learner's database: the files are read by `read_csv` inside the query.
import { EXTRA, STAR, extraFile, extraText, numberOf, starFile, starUrl, withStar, type StarName } from '../core/powerBiPractice'
import { dropFile, query, registerBuffer } from './engine'
import { resultRows } from './export'

let bytes: Promise<Record<StarName, Uint8Array>> | null = null

/** The files' bytes, fetched once (a failed fetch is tried again next time). */
export function starBytes(): Promise<Record<StarName, Uint8Array>> {
  if (!bytes) {
    bytes = (async () => {
      const out = {} as Record<StarName, Uint8Array>
      for (const n of STAR) {
        const url = new URL(starUrl(n), document.baseURI).href
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Could not download ${n}.csv (${res.status}). Check your connection and try again.`)
        out[n] = new Uint8Array(await res.arrayBuffer())
      }
      return out
    })()
    bytes.catch(() => (bytes = null))
  }
  return bytes
}

let registered = false

async function register(): Promise<void> {
  const files = await starBytes()
  for (const n of STAR) {
    await dropFile(starFile(n)).catch(() => {})
    // a copy: the engine takes the buffer over, and the zip still needs these bytes
    await registerBuffer(starFile(n), files[n].slice())
  }
  for (const n of EXTRA) {
    await dropFile(extraFile(n)).catch(() => {})
    await registerBuffer(extraFile(n), new TextEncoder().encode(extraText(n, files)))
  }
  registered = true
}

const memo = new Map<string, Promise<number>>()

/** The number a query over the star returns (computed once per query text). */
export function truth(sql: string): Promise<number> {
  let p = memo.get(sql)
  if (!p) {
    p = (async () => {
      if (!registered) await register()
      try {
        return numberOf(resultRows(await query(withStar(sql))).rows)
      } catch (e) {
        // the engine may have been restarted: the files are gone, register them again once
        await register()
        void e
        return numberOf(resultRows(await query(withStar(sql))).rows)
      }
    })()
    memo.set(sql, p)
    p.catch(() => memo.delete(sql))
  }
  return p
}
