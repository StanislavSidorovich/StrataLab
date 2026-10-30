// Files → DuckDB tables. Every file is first registered in DuckDB's virtual
// file system under a private name, previewed with the detected options, and
// only then copied into a table (CREATE TABLE … AS SELECT * FROM read_…).
import type { WorkBook } from 'xlsx'
import { sniffCsv, type CsvOptions } from '../core/sniff'
import { cleanHeader, findHeaderRow, toCsv } from '../core/csvWrite'
import { quoteIdent, quoteString, tableNameFrom } from '../core/sql'
import { checkpoint, dropFile, query, registerBuffer, registerFile } from './engine'

export type SourceKind = 'csv' | 'excel' | 'parquet' | 'json'

export interface ImportSource {
  id: string
  fileName: string
  kind: SourceKind
  /** name of the file inside DuckDB's virtual file system */
  regName: string
  /** size of the file the user dropped, in bytes */
  size: number
  tableName: string
  /** the schema the table goes into: main (My tables) or one of the user's datasets */
  schema: string
  csv?: CsvOptions
  sheets?: string[]
  sheet?: string
  /** 0-based row of the sheet that holds the column names */
  headerRow?: number
  /** an existing table of `schema` to add the rows to (stage 2b), instead of creating a new one */
  target?: string | null
}

/** How much of a CSV is read to guess its encoding, separator and dates. */
const SNIFF_BYTES = 1 << 20
/** Bigger files are re-encoded in Blob parts of about this size, so the browser can keep them on disk. */
const PART_BYTES = 64 << 20

let counter = 0
const workbooks = new Map<string, WorkBook>()
/** Excel: the sheet row (1-based, as Excel shows it) of every data row, by source id. */
const sheetRows = new Map<string, number[]>()

export function kindOf(fileName: string): SourceKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (['csv', 'tsv', 'txt'].includes(ext)) return 'csv'
  if (['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'].includes(ext)) return 'excel'
  if (ext === 'parquet') return 'parquet'
  if (['json', 'jsonl', 'ndjson'].includes(ext)) return 'json'
  return null
}

export async function openSource(file: File): Promise<ImportSource> {
  const kind = kindOf(file.name)
  if (!kind) throw new Error(`${file.name}: Quaera Lab reads CSV, Excel, Parquet and JSON files`)
  const id = `src${++counter}`
  const base: ImportSource = { id, fileName: file.name, kind, regName: '', size: file.size, tableName: tableNameFrom(file.name), schema: 'main' }

  if (kind === 'csv') {
    // Only the start of the file is decoded to guess the options; the file itself is never turned
    // into one string (a browser hands back an empty one above ~512 MB, and the table came out empty).
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
    const { options } = sniffCsv(head, file.size > SNIFF_BYTES)
    const regName = `${id}.csv`
    // DuckDB reads UTF-8 only (and skips a BOM itself): cp1251 files are re-encoded as a stream.
    await registerFile(regName, options.encoding === 'utf-8' ? file : await recode(file, regName))
    return { ...base, regName, csv: options }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (kind === 'excel') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true })
    workbooks.set(id, wb)
    const sheets = wb.SheetNames.filter((n) => {
      const ws = wb.Sheets[n]
      return ws && ws['!ref']
    })
    if (!sheets.length) throw new Error(`${file.name}: the workbook has no sheets with data`)
    const src: ImportSource = { ...base, sheets, sheet: sheets[0], regName: `${id}.csv` }
    if (sheets.length > 1) src.tableName = tableNameFrom(sheets[0])
    return writeSheet(src)
  }
  const regName = `${id}.${kind}`
  await registerBuffer(regName, bytes)
  return { ...base, regName }
}

/** A UTF-8 copy of a Windows-1251 file, built chunk by chunk. */
async function recode(file: File, name: string): Promise<File> {
  const parts: Blob[] = []
  let chunks: Uint8Array[] = []
  let size = 0
  const flush = () => {
    if (chunks.length) parts.push(new Blob(chunks as BlobPart[]))
    chunks = []
    size = 0
  }
  const reader = file.stream().pipeThrough(new TextDecoderStream('windows-1251')).pipeThrough(new TextEncoderStream()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size >= PART_BYTES) flush()
  }
  flush()
  return new File(parts, name, { type: 'text/csv' })
}

/** (Re)writes the chosen sheet as CSV for DuckDB. */
export async function writeSheet(src: ImportSource, headerRow?: number): Promise<ImportSource> {
  const XLSX = await import('xlsx')
  const wb = workbooks.get(src.id)
  if (!wb || !src.sheet) return src
  // Blank rows are kept so that row numbers match the ones Excel shows.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[src.sheet], { header: 1, raw: true, defval: null, blankrows: true })
  const h = headerRow ?? findHeaderRow(rows)
  const header = cleanHeader(rows[h] ?? [])
  const kept: number[] = []
  const body = rows
    .slice(h + 1)
    .filter((r, j) => r.some((c) => c !== null && c !== '') && kept.push(h + 2 + j))
    .map((r) => header.map((_, i) => r[i] ?? null))
  sheetRows.set(src.id, kept)
  await registerBuffer(src.regName, new TextEncoder().encode(toCsv([header, ...body])))
  return {
    ...src,
    headerRow: h,
    csv: { encoding: 'utf-8', delimiter: ',', decimalComma: false, dateFormat: null, timestampFormat: null, header: true },
  }
}

export function readExpr(src: ImportSource): string {
  const file = quoteString(src.regName)
  if (src.kind === 'parquet') return `read_parquet(${file})`
  if (src.kind === 'json') return `read_json_auto(${file})`
  const o = src.csv!
  const args = [file, `delim = ${quoteString(o.delimiter)}`, `header = ${o.header}`, 'sample_size = -1']
  if (o.decimalComma) args.push(`decimal_separator = ','`)
  if (o.dateFormat) args.push(`dateformat = ${quoteString(o.dateFormat)}`)
  if (o.timestampFormat) args.push(`timestampformat = ${quoteString(o.timestampFormat)}`)
  return `read_csv(${args.join(', ')})`
}

export async function previewSource(src: ImportSource, limit = 50) {
  const expr = readExpr(src)
  const [rows, count] = await Promise.all([
    query(`SELECT * FROM ${expr} LIMIT ${limit}`),
    query(`SELECT count(*)::INTEGER AS n FROM ${expr}`),
  ])
  const total = Number(count.get(0)?.n ?? 0)
  // An empty table from a big file would look like "the file has no data". Say what happened.
  if (total === 0 && src.size > 1 << 20)
    throw new Error(`Read 0 rows from ${src.fileName} (${(src.size / 1048576).toFixed(0)} MB). The file is too large for this browser to read, or it is not what its extension says. Try a smaller part of it.`)
  return { rows, total }
}

export async function createTable(src: ImportSource, replace: boolean): Promise<void> {
  const verb = replace ? 'CREATE OR REPLACE TABLE' : 'CREATE TABLE'
  await query(`${verb} ${src.schema === 'main' ? quoteIdent(src.tableName) : `${quoteIdent(src.schema)}.${quoteIdent(src.tableName)}`} AS SELECT * FROM ${readExpr(src)}`)
  await checkpoint()
}

/**
 * The row number the user sees in the file for row `rowid` (0-based) of a table copied from
 * the source: the line in a CSV, the row Excel shows (blank rows are skipped on the way).
 */
export function fileRowExpr(src: ImportSource, rowid = 'rowid'): string {
  if (src.kind === 'excel') {
    const rows = sheetRows.get(src.id) ?? []
    const first = rows[0] ?? (src.headerRow ?? 0) + 2
    // Usually the rows follow each other; otherwise look the number up in a list.
    if (rows.every((r, i) => r === first + i)) return `${rowid} + ${first}`
    return `[${rows.join(',')}][${rowid} + 1]`
  }
  if (src.kind === 'csv') return `${rowid} + ${src.csv?.header ? 2 : 1}`
  return `${rowid} + 1`
}

export async function closeSource(src: ImportSource): Promise<void> {
  workbooks.delete(src.id)
  sheetRows.delete(src.id)
  await dropFile(src.regName).catch(() => {})
}
