// Exports: a result grid as CSV / Excel / JSON (from the Arrow table already in
// memory) or Parquet (the same table handed to DuckDB), a whole table as CSV /
// Parquet (DuckDB's COPY, so nothing is limited by the grid). Parquet is the
// hand-over format to pandas.
import { DataType, type Table } from 'apache-arrow'
import { csvField } from '../core/csvWrite'
import { decimalJson, rowsToJson } from '../core/jsonWrite'
import { quoteIdent, quoteString } from '../core/sql'
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

/** `sqlName`: the table as written in SQL (maybe schema-qualified); `fileName` without extension. */
export async function exportTable(sqlName: string, fileName: string, format: 'csv' | 'parquet') {
  const file = `export_${Date.now()}.${format}`
  const opts = format === 'csv' ? '(FORMAT csv, HEADER true)' : '(FORMAT parquet)'
  await query(`COPY ${sqlName} TO ${quoteString(file)} ${opts}`)
  const bytes = await readFile(file)
  await dropFile(file).catch(() => {})
  download(bytes as BlobPart, `${fileName}.${format}`, format === 'csv' ? 'text/csv' : 'application/octet-stream')
}
