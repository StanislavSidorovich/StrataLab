// Files → DuckDB tables. Every file is first registered in DuckDB's virtual
// file system under a private name, previewed with the detected options, and
// only then copied into a table (CREATE TABLE … AS SELECT * FROM read_…).
import type { WorkBook } from 'xlsx'
import { sniffCsv, type CsvOptions } from '../core/sniff'
import { cleanHeader, findHeaderRow, toCsv } from '../core/csvWrite'
import { quoteIdent, quoteString, tableNameFrom } from '../core/sql'
import { checkpoint, dropFile, query, registerBuffer } from './engine'

export type SourceKind = 'csv' | 'excel' | 'parquet' | 'json'

export interface ImportSource {
  id: string
  fileName: string
  kind: SourceKind
  /** name of the file inside DuckDB's virtual file system */
  regName: string
  tableName: string
  csv?: CsvOptions
  sheets?: string[]
  sheet?: string
  /** 0-based row of the sheet that holds the column names */
  headerRow?: number
  /** an existing table to add the rows to (stage 2b), instead of creating a new one */
  target?: string | null
}

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
  if (!kind) throw new Error(`${file.name}: StrataLab reads CSV, Excel, Parquet and JSON files`)
  const id = `src${++counter}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const base: ImportSource = { id, fileName: file.name, kind, regName: '', tableName: tableNameFrom(file.name) }

  if (kind === 'csv') {
    const { text, options } = sniffCsv(bytes)
    const regName = `${id}.csv`
    // DuckDB reads UTF-8 only: re-encode cp1251 files (and drop the BOM).
    await registerBuffer(regName, new TextEncoder().encode(text))
    return { ...base, regName, csv: options }
  }
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
  return { rows, total: Number(count.get(0)?.n ?? 0) }
}

export async function createTable(src: ImportSource, replace: boolean): Promise<void> {
  const verb = replace ? 'CREATE OR REPLACE TABLE' : 'CREATE TABLE'
  await query(`${verb} ${quoteIdent(src.tableName)} AS SELECT * FROM ${readExpr(src)}`)
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
