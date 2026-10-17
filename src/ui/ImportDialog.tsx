// One file at a time: what we detected, a live preview with column types,
// and the table name. Changing any option re-reads the preview.
import { useEffect, useState } from 'react'
import { FileSpreadsheet, Loader2, X } from 'lucide-react'
import type { Table } from 'apache-arrow'
import { DataGrid } from './DataGrid'
import { cancelImport, confirmImport, updateImport, useLab } from './store'
import { previewSource, writeSheet, type ImportSource } from '../db/importer'
import { tableNameFrom } from '../core/sql'
import type { CsvOptions } from '../core/sniff'

const DELIMS: [string, string][] = [
  [',', 'comma ,'],
  [';', 'semicolon ;'],
  ['\t', 'tab'],
  ['|', 'pipe |'],
]
const DATES: [string, string][] = [
  ['', 'detect automatically'],
  ['%d.%m.%Y', '31.12.2026'],
  ['%d/%m/%Y', '31/12/2026'],
  ['%m/%d/%Y', '12/31/2026'],
  ['%Y-%m-%d', '2026-12-31'],
]

export function ImportDialog() {
  const src = useLab((s) => s.imports[0])
  const queued = useLab((s) => s.imports.length)
  if (!src) return null
  return <Dialog key={src.id} src={src} queued={queued} />
}

function Dialog({ src, queued }: { src: ImportSource; queued: number }) {
  const tables = useLab((s) => s.tables)
  const [preview, setPreview] = useState<{ rows: Table; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const exists = tables.some((t) => t.name.toLowerCase() === src.tableName.toLowerCase())
  const [replace, setReplace] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    previewSource(src)
      .then((p) => alive && (setPreview(p), setError(null)))
      .catch((e) => alive && (setPreview(null), setError(String(e instanceof Error ? e.message : e))))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [src])

  const setCsv = (patch: Partial<CsvOptions>) => updateImport({ ...src, csv: { ...src.csv!, ...patch } })
  const o = src.csv

  const create = async () => {
    setBusy(true)
    try {
      await confirmImport(src, replace)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }}>
      <div className="w-full max-w-5xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">Import {src.fileName}</div>
            {queued > 1 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queued - 1} more file(s) after this one</div>}
          </div>
          <button className="btn btn-ghost" onClick={() => void cancelImport(src)} aria-label="Skip this file">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-3 items-end" style={{ borderBottom: '1px solid var(--line)' }}>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Table name</span>
            <input className="field mono w-56" value={src.tableName} onChange={(e) => updateImport({ ...src, tableName: e.target.value })} onBlur={(e) => updateImport({ ...src, tableName: tableNameFrom(e.target.value) })} />
          </label>

          {src.kind === 'excel' && src.sheets && (
            <>
              <label className="flex flex-col gap-1">
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sheet</span>
                <select
                  className="field"
                  value={src.sheet}
                  onChange={async (e) => {
                    const next = await writeSheet({ ...src, sheet: e.target.value, tableName: src.sheets!.length > 1 ? tableNameFrom(e.target.value) : src.tableName })
                    updateImport(next)
                  }}
                >
                  {src.sheets.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Header row</span>
                <input
                  className="field w-20"
                  type="number"
                  min={1}
                  value={(src.headerRow ?? 0) + 1}
                  onChange={async (e) => updateImport(await writeSheet(src, Math.max(0, Number(e.target.value) - 1)))}
                />
              </label>
            </>
          )}

          {src.kind === 'csv' && o && (
            <>
              <label className="flex flex-col gap-1">
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Separator</span>
                <select className="field" value={o.delimiter} onChange={(e) => setCsv({ delimiter: e.target.value, decimalComma: e.target.value === ',' ? false : o.decimalComma })}>
                  {DELIMS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Dates look like</span>
                <select className="field" value={o.dateFormat ?? ''} onChange={(e) => setCsv({ dateFormat: e.target.value || null, timestampFormat: e.target.value ? e.target.value + ' %H:%M:%S' : null })}>
                  {DATES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1.5">
                <input type="checkbox" checked={o.decimalComma} disabled={o.delimiter === ','} onChange={(e) => setCsv({ decimalComma: e.target.checked })} />
                Decimal comma (3,5)
              </label>
              <label className="flex items-center gap-2 pb-1.5">
                <input type="checkbox" checked={o.header} onChange={(e) => setCsv({ header: e.target.checked })} />
                First row is the header
              </label>
              <span className="pb-1.5" style={{ color: 'var(--muted)', fontSize: 12 }}>
                Encoding: {o.encoding === 'windows-1251' ? 'Windows-1251 (Cyrillic)' : 'UTF-8'}
              </span>
            </>
          )}
        </div>

        <div className="min-h-0 flex flex-col" style={{ flex: '1 1 360px' }}>
          {loading && !preview && (
            <div className="flex-1 flex items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={16} className="animate-spin" /> Reading the file…
            </div>
          )}
          {error && (
            <pre className="m-4 p-3 rounded-lg mono whitespace-pre-wrap" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
              {error}
            </pre>
          )}
          {preview && !error && <DataGrid table={preview.rows} compact />}
        </div>

        <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--muted)' }}>
            {preview && !error ? `${preview.total.toLocaleString()} rows · ${preview.rows.numCols} columns · preview shows the first ${preview.rows.numRows}` : ''}
          </span>
          <div className="flex-1" />
          {exists && (
            <label className="flex items-center gap-2" style={{ color: 'var(--danger)' }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Table {src.tableName} exists — replace it
            </label>
          )}
          <button className="btn" onClick={() => void cancelImport(src)}>
            Skip
          </button>
          <button className="btn btn-primary" disabled={busy || !!error || !preview || !src.tableName || (exists && !replace)} onClick={() => void create()}>
            {busy && <Loader2 size={14} className="animate-spin" />} Create table
          </button>
        </div>
      </div>
    </div>
  )
}
