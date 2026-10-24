// Exports: a result grid as CSV / Excel / JSON (from the Arrow table already in
// memory) or Parquet (the same table handed to DuckDB), a whole table as CSV /
// Parquet (DuckDB's COPY, so nothing is limited by the grid), a whole dataset as CSV files in a
// folder or a .zip. Parquet is the hand-over format to pandas.
import { DataType, type Table } from 'apache-arrow'
import { csvField } from '../core/csvWrite'
import { decimalJson, rowsToJson } from '../core/jsonWrite'
import { quoteIdent, quoteString } from '../core/sql'
import { exportFileNames, zipEntry, zipFiles, type ZipEntry } from '../core/zip'
import { dropFile, insertArrow, query, readFile } from './engine'
import { formatterFor } from './format'

export function download(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** A result's header and rows as the grid shows them (dates as ISO text, DECIMAL as text). */
export function resultRows(table: Table): { header: string[]; rows: (string | number | null)[][] } {
  const fields = table.schema.fields
  const fmt = fields.map(formatterFor)
  const cols = fields.map((_, i) => table.getChildAt(i))
  const rows: (string | number | null)[][] = []
  for (let r = 0; r < table.numRows; r++) rows.push(cols.map((c, i) => fmt[i](c?.get(r))))
  return { header: fields.map((f) => f.name), rows }
}

export function resultToCsv(table: Table): string {
  const { header, rows } = resultRows(table)
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

export function exportResultCsv(table: Table, name: string) {
  // BOM so that Excel opens UTF-8 (Cyrillic, accents) correctly
  download('﻿' + resultToCsv(table), `${name}.csv`, 'text/csv;charset=utf-8')
}

export async function exportResultXlsx(table: Table, name: string) {
  const XLSX = await import('xlsx')
  const { header, rows } = resultRows(table)
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31) || 'result')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  download(out, `${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

/** JSON keeps numbers and true / false as such; dates and times are ISO text as in the grid. */
export function exportResultJson(table: Table, name: string) {
  const fields = table.schema.fields
  const fmt = fields.map(formatterFor)
  const cols = fields.map((_, i) => table.getChildAt(i))
  const cell = fields.map((f, i) => {
    if (DataType.isBool(f.type)) return (v: unknown) => (v == null ? null : Boolean(v))
    if (DataType.isDecimal(f.type)) return (v: unknown) => {
      const text = fmt[i](v)
      return text == null ? null : decimalJson(String(text))
    }
    return fmt[i]
  })
  const rows: unknown[][] = []
  for (let r = 0; r < table.numRows; r++) rows.push(cols.map((c, i) => cell[i](c?.get(r))))
  download(rowsToJson(fields.map((f) => f.name), rows), `${name}.json`, 'application/json')
}

/** Parquet keeps the column types: the result goes into DuckDB for a moment and out by COPY. */
export async function exportResultParquet(table: Table, name: string) {
  const tmp = `__result_export_${Date.now()}`
  await insertArrow(table, tmp)
  try {
    await exportTable(quoteIdent(tmp), name, 'parquet')
  } finally {
    await query(`DROP TABLE IF EXISTS ${quoteIdent(tmp)}`)
  }
}

/** A table through DuckDB's COPY, as the file's bytes. CSV starts with a BOM so that Excel reads UTF-8. */
async function copyOut(sqlName: string, format: 'csv' | 'parquet'): Promise<Uint8Array> {
  const file = `export_${Date.now()}.${format}`
  const opts = format === 'csv' ? '(FORMAT csv, HEADER true)' : '(FORMAT parquet)'
  await query(`COPY ${sqlName} TO ${quoteString(file)} ${opts}`)
  const bytes = await readFile(file)
  await dropFile(file).catch(() => {})
  if (format === 'parquet') return bytes
  const out = new Uint8Array(bytes.length + 3)
  out.set([0xef, 0xbb, 0xbf])
  out.set(bytes, 3)
  return out
}

/** `sqlName`: the table as written in SQL (maybe schema-qualified); `fileName` without extension. */
export async function exportTable(sqlName: string, fileName: string, format: 'csv' | 'parquet') {
  const bytes = await copyOut(sqlName, format)
  download(bytes as BlobPart, `${fileName}.${format}`, format === 'csv' ? 'text/csv' : 'application/octet-stream')
}

interface DirHandle {
  name: string
  getDirectoryHandle(name: string, o: { create: boolean }): Promise<DirHandle>
  getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: BlobPart): Promise<void>; close(): Promise<void> }> }>
}
declare global {
  interface Window {
    showDirectoryPicker?: (o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<DirHandle>
  }
}

/** Chrome and Edge can write files into a folder the user picks; Firefox and Safari get a .zip. */
export const canPickFolder = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

/** Asks for a folder (call it straight from the click: the picker needs the gesture). Null when cancelled. */
export async function pickFolder(): Promise<DirHandle | null> {
  try {
    return await window.showDirectoryPicker!({ id: 'lab-export', mode: 'readwrite', startIn: 'downloads' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return undefined
  }
}

/**
 * Every table of `tables` as CSV, one at a time: into `folder`/`subfolder` (one file per table) or,
 * without a folder, as one `<subfolder>-csv.zip` download. What it wrote, for Messages.
 */
export async function exportTablesCsv(
  tables: { sqlName: string; name: string }[],
  subfolder: string,
  folder: DirHandle | null,
  progress: (table: string, done: number) => void,
): Promise<string> {
  const files = exportFileNames(tables.map((t) => t.name), 'csv')
  const dir = folder && (await folder.getDirectoryHandle(subfolder, { create: true }))
  const entries: ZipEntry[] = []
  let size = 0
  for (const [i, t] of tables.entries()) {
    progress(t.name, i)
    const bytes = await copyOut(t.sqlName, 'csv')
    size += bytes.length
    if (dir) {
      const w = await (await dir.getFileHandle(files[i], { create: true })).createWritable()
      await w.write(bytes as BlobPart)
      await w.close()
    } else entries.push(zipEntry(files[i], bytes, await deflateRaw(bytes)))
  }
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
  if (dir) return `${files.length} CSV files (${mb(size)}) in the folder ${folder.name}/${subfolder}`
  const zip = zipFiles(entries)
  download(zip as BlobPart, `${subfolder}-csv.zip`, 'application/zip')
  return `${subfolder}-csv.zip (${mb(zip.length)}): ${files.length} CSV files, ${mb(size)} unzipped`
}
