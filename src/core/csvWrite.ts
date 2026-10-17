// Writes rows as RFC 4180 CSV. Used to hand Excel sheets to DuckDB (so its
// type sniffer sees clean ISO dates and plain numbers) and to export results.

export function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (v instanceof Date) s = isoLocal(v)
  else s = String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel dates come in local time; a date without a time part stays a date. */
export function isoLocal(d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return date
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Finds the header row of a sheet: the first row with at least two non-empty cells. */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const filled = (rows[i] ?? []).filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length
    if (filled >= 2) return i
  }
  return 0
}

/** Makes header names unique and non-empty: ["", "a", "a"] → ["column1", "a", "a_2"]. */
export function cleanHeader(header: unknown[]): string[] {
  const seen = new Map<string, number>()
  return header.map((h, i) => {
    let name = h === null || h === undefined ? '' : String(h).trim()
    if (!name) name = `column${i + 1}`
    const key = name.toLowerCase()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return n ? `${name}_${n + 1}` : name
  })
}
