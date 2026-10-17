// Guesses how a CSV file was written, so that files saved by a Russian or
// Portuguese Excel (cp1251, ";" between fields, "3,5" for numbers, 17.10.2026
// for dates) load without the user touching any option. DuckDB's own sniffer
// handles the rest (header, quoting, types).

export type Encoding = 'utf-8' | 'windows-1251'

export interface CsvOptions {
  encoding: Encoding
  delimiter: string
  decimalComma: boolean
  /** strftime format for DuckDB's `dateformat`, or null to let DuckDB guess */
  dateFormat: string | null
  /** strftime format for `timestampformat`, or null */
  timestampFormat: string | null
  header: boolean
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: Encoding } {
  let start = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3
  const body = start ? bytes.subarray(start) : bytes
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1251').decode(body), encoding: 'windows-1251' }
  }
}

const DELIMITERS = [',', ';', '\t', '|']

/** Splits one CSV line into fields, honouring double quotes. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function sampleLines(text: string, max = 50): string[] {
  const lines: string[] = []
  let pos = 0
  while (lines.length < max && pos < text.length) {
    let end = text.indexOf('\n', pos)
    if (end === -1) end = text.length
    const line = text.slice(pos, end).replace(/\r$/, '')
    if (line.trim() !== '') lines.push(line)
    pos = end + 1
  }
  return lines
}

export function detectDelimiter(lines: string[]): string {
  let best = ','
  let bestScore = 0
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length)
    const first = counts[0] ?? 1
    if (first < 2) continue
    const same = counts.filter((c) => c === first).length
    // Most lines with the same number of fields wins; more fields breaks ties.
    const score = same * 100 + first
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

const DECIMAL_COMMA = /^-?\d+(?:[  ]\d{3})*,\d+$/
const DECIMAL_DOT = /^-?\d+\.\d+$/

export function detectDecimalComma(rows: string[][], delimiter: string): boolean {
  if (delimiter === ',') return false
  let comma = 0
  let dot = 0
  for (const row of rows)
    for (const f of row) {
      const v = f.trim()
      if (DECIMAL_COMMA.test(v)) comma++
      else if (DECIMAL_DOT.test(v)) dot++
    }
  return comma > 0 && comma >= dot
}

export function detectDateFormats(rows: string[][]): { date: string | null; timestamp: string | null } {
  let dotted = 0
  let dottedTime: string | null = null
  let slashDayFirst = 0
  let slashMonthFirst = 0
  let slash = 0
  for (const row of rows)
    for (const f of row) {
      const v = f.trim()
      const m = /^(\d{1,2})([./])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2}:\d{2})(:\d{2})?)?$/.exec(v)
      if (!m) continue
      const sep = m[2]
      if (m[5]) dottedTime = m[6] ? ' %H:%M:%S' : ' %H:%M'
      if (sep === '.') dotted++
      else {
        slash++
        if (Number(m[1]) > 12) slashDayFirst++
        if (Number(m[3]) > 12) slashMonthFirst++
      }
    }
  let base: string | null = null
  if (dotted > 0) base = '%d.%m.%Y'
  else if (slash > 0) base = slashMonthFirst > slashDayFirst ? '%m/%d/%Y' : '%d/%m/%Y'
  if (!base) return { date: null, timestamp: null }
  return { date: base, timestamp: base + (dottedTime ?? ' %H:%M:%S') }
}

export function sniffCsv(bytes: Uint8Array): { text: string; options: CsvOptions } {
  const { text, encoding } = decodeText(bytes)
  const lines = sampleLines(text)
  const delimiter = detectDelimiter(lines)
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter))
  const dates = detectDateFormats(rows)
  return {
    text,
    options: {
      encoding,
      delimiter,
      decimalComma: detectDecimalComma(rows, delimiter),
      dateFormat: dates.date,
      timestampFormat: dates.timestamp,
      header: true,
    },
  }
}
