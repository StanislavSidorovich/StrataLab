// Exports: a result grid as CSV / Excel (from the Arrow table already in
// memory), a whole table as CSV / Parquet (DuckDB's COPY, so nothing is
// limited by the grid). Parquet is the hand-over format to pandas.
import type { Table } from 'apache-arrow'
import { csvField } from '../core/csvWrite'
import { quoteIdent, quoteString } from '../core/sql'
import { dropFile, query, readFile } from './engine'
import { formatterFor } from './format'

export function download(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function resultRows(table: Table): { header: string[]; rows: (string | number | null)[][] } {
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

export async function exportTable(name: string, format: 'csv' | 'parquet') {
  const file = `export_${Date.now()}.${format}`
  const opts = format === 'csv' ? '(FORMAT csv, HEADER true)' : '(FORMAT parquet)'
  await query(`COPY ${quoteIdent(name)} TO ${quoteString(file)} ${opts}`)
  const bytes = await readFile(file)
  await dropFile(file).catch(() => {})
  download(bytes as BlobPart, `${name}.${format}`, format === 'csv' ? 'text/csv' : 'application/octet-stream')
}
