// One file at a time: what we detected, a live preview with column types, and where the
// rows go: a new table, or an existing one (stage 2b) with its columns matched and every
// row checked against its types and keys first. Changing any option re-reads the preview.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, Loader2, X } from 'lucide-react'
import type { Table } from 'apache-arrow'
import { DataGrid } from './DataGrid'
import { cancelImport, confirmImport, emptyTableNamed, finishFill, ownTables, updateImport, useLab } from './store'
import { previewSource, writeSheet, type ImportSource } from '../db/importer'
import { SHOWN_PROBLEMS, checkFill, insertFill, loadTarget, sourceColumns, type FillReport } from '../db/fill'
import { autoMap, mappingProblems, PROBLEM_LABELS, type FillTarget, type Mapping, type SourceColumn } from '../core/fill'
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

const rows = (n: number) => `${n.toLocaleString()} row${n === 1 ? '' : 's'}`
const message = (e: unknown) => String(e instanceof Error ? e.message : e)

export function ImportDialog() {
  const src = useLab((s) => s.imports[0])
  const queued = useLab((s) => s.imports.length)
  if (!src) return null
  return <Dialog key={src.id} src={src} queued={queued} />
}

type Preview = { rows: Table; total: number }

function Dialog({ src, queued }: { src: ImportSource; queued: number }) {
  const tables = useLab((s) => s.tables)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    previewSource(src)
      .then((p) => alive && (setPreview(p), setError(null)))
      .catch((e) => alive && (setPreview(null), setError(message(e))))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [src])

  const setCsv = (patch: Partial<CsvOptions>) => updateImport({ ...src, csv: { ...src.csv!, ...patch } })
  const o = src.csv
  const fill = src.target ?? null
  const targets = ownTables(tables).filter((t) => t.kind === 'table')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }}>
      <div role="dialog" aria-label={`Import ${src.fileName}`} className="w-full max-w-6xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">
              {fill ? `Add rows from ${src.fileName} to ${fill}` : `Import ${src.fileName}`}
            </div>
            {queued > 1 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queued - 1} more file(s) after this one</div>}
          </div>
          <button className="btn btn-ghost" onClick={() => void cancelImport(src)} aria-label="Skip this file">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-3 items-end" style={{ borderBottom: '1px solid var(--line)' }}>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Put the rows into</span>
            <select className="field" value={fill ?? ''} onChange={(e) => updateImport({ ...src, target: e.target.value || null })}>
              <option value="">a new table</option>
              <optgroup label="an existing table">
                {targets.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.rows === 0 ? 'empty' : `${t.rows?.toLocaleString() ?? '?'} rows`})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {!fill && (
            <label className="flex flex-col gap-1">
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Table name</span>
              <input className="field mono w-56" value={src.tableName} onChange={(e) => updateImport({ ...src, tableName: e.target.value })} onBlur={(e) => updateImport({ ...src, tableName: tableNameFrom(e.target.value) })} />
            </label>
          )}

          {src.kind === 'excel' && src.sheets && (
            <>
              <label className="flex flex-col gap-1">
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sheet</span>
                <select
                  className="field"
                  value={src.sheet}
                  onChange={async (e) => {
                    const many = src.sheets!.length > 1
                    const tableName = many ? tableNameFrom(e.target.value) : src.tableName
                    const target = many ? (emptyTableNamed(tableName) ?? src.target) : src.target
                    updateImport(await writeSheet({ ...src, sheet: e.target.value, tableName, target }))
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

        {fill ? (
          <FillBody key={fill} src={src} table={fill} preview={preview} previewError={error} loading={loading} />
        ) : (
          <NewTableBody src={src} preview={preview} error={error} setError={setError} loading={loading} />
        )}
      </div>
    </div>
  )
}

function PreviewPane({ preview, error, loading }: { preview: Preview | null; error: string | null; loading: boolean }) {
  return (
    <>
      {loading && !preview && (
        <div className="flex-1 flex items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
          <Loader2 size={16} className="animate-spin" /> Reading the file…
        </div>
      )}
      {error && <ErrorBox text={error} />}
      {preview && !error && <DataGrid table={preview.rows} compact />}
    </>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <pre className="m-4 p-3 rounded-lg mono whitespace-pre-wrap" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
      {text}
    </pre>
  )
}

function NewTableBody({ src, preview, error, setError, loading }: { src: ImportSource; preview: Preview | null; error: string | null; setError: (e: string) => void; loading: boolean }) {
  const tables = useLab((s) => s.tables)
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(false)
  const exists = ownTables(tables).some((t) => t.name.toLowerCase() === src.tableName.toLowerCase())

  const create = async () => {
    setBusy(true)
    try {
      await confirmImport(src, replace)
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="min-h-0 flex flex-col" style={{ flex: '1 1 360px' }}>
        <PreviewPane preview={preview} error={error} loading={loading} />
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
    </>
  )
}

/** Badges for a table column: what the rows will be checked against. */
function columnRules(target: FillTarget, name: string): string[] {
  const out: string[] = []
  for (const k of target.constraints) {
    if (k.kind === 'check' || !k.columns.includes(name)) continue
    if (k.kind === 'primary') out.push('PK')
    else if (k.kind === 'unique') out.push('UNIQUE')
    else out.push(`→ ${k.refTable}`)
  }
  const c = target.columns.find((c) => c.name === name)
  if (c && !c.nullable && !out.includes('PK')) out.push('NOT NULL')
  return out
}

function FillBody({ src, table, preview, previewError, loading }: { src: ImportSource; table: string; preview: Preview | null; previewError: string | null; loading: boolean }) {
  const [target, setTarget] = useState<FillTarget | null>(null)
  const [cols, setCols] = useState<SourceColumn[] | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [report, setReport] = useState<FillReport | null>(null)
  const [checking, setChecking] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'preview' | 'report'>('report')

  useEffect(() => {
    let alive = true
    loadTarget(table)
      .then((t) => alive && setTarget(t))
      .catch((e) => alive && setError(message(e)))
    return () => {
      alive = false
    }
  }, [table])

  useEffect(() => {
    let alive = true
    setCols(null)
    sourceColumns(src)
      .then((c) => alive && setCols(c))
      .catch(() => alive && setCols([]))
    return () => {
      alive = false
    }
  }, [src])

  useEffect(() => {
    if (target && cols) setMapping(autoMap(cols, target.columns))
  }, [target, cols])

  const blockers = useMemo(() => (target ? mappingProblems(target, mapping) : []), [target, mapping])
  const ready = !!target && !!cols && cols.length > 0 && Object.keys(mapping).length > 0 && !previewError

  // Every change of the file options or of the matching checks the rows again.
  useEffect(() => {
    setReport(null)
    if (!ready || blockers.length) return
    let alive = true
    const timer = setTimeout(() => {
      setChecking(true)
      setError(null)
      checkFill(src, target!, mapping)
        .then((r) => alive && (setReport(r), setView(r.badRows ? 'report' : 'preview')))
        .catch((e) => alive && setError(message(e)))
        .finally(() => alive && setChecking(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [ready, blockers, src, target, mapping])

  const insert = async () => {
    if (!report) return
    setInserting(true)
    try {
      const added = await insertFill(report.badRows > 0)
      await finishFill(src, added, report.badRows)
    } catch (e) {
      setError(message(e))
      setInserting(false)
    }
  }

  const good = report ? report.total - report.badRows : 0
  const copyReport = () => {
    if (!report) return
    const lines = ['row\tproblem\tcolumn\tdetails', ...report.problems.map((p) => `${p.row}\t${PROBLEM_LABELS[p.kind]}\t${p.col}\t${p.message}`)]
    void navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <>
      <div className="min-h-0 flex flex-col md:flex-row" style={{ flex: '1 1 420px' }}>
        <div className="md:w-[380px] shrink-0 overflow-auto max-h-56 md:max-h-none" style={{ borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <div className="px-4 pt-3 pb-1 font-semibold" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 0.4 }}>
            TABLE COLUMN ← FILE COLUMN
          </div>
          {!target && !error && (
            <p className="px-4 py-2 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Reading {table}…
            </p>
          )}
          {target && (
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {target.columns.map((c) => (
                  <tr key={c.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="pl-4 pr-2 py-1.5 align-top">
                      <div className="mono truncate max-w-40" title={c.name}>{c.name}</div>
                      <div className="flex flex-wrap gap-1 mt-0.5" style={{ fontSize: 10.5 }}>
                        <span className="mono" style={{ color: 'var(--muted)' }}>{c.type.toLowerCase()}</span>
                        {columnRules(target, c.name).map((r) => (
                          <span key={r} className="px-1 rounded" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="pr-4 py-1.5 align-top">
                      <select
                        className="field w-full"
                        aria-label={`File column for ${c.name}`}
                        value={mapping[c.name] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [c.name]: e.target.value || null })}
                      >
                        <option value="">{c.hasDefault ? '— default value —' : '— leave empty —'}</option>
                        {(cols ?? []).map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name} ({f.type.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {blockers.length > 0 && (
            <ul className="m-4 flex flex-col gap-1.5">
              {blockers.map((b) => (
                <li key={b} className="rounded-md px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center gap-1 px-3 pt-2 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
            {(['report', 'preview'] as const).map((v) => (
              <button
                key={v}
                className="px-3 py-1.5 rounded-t-md"
                style={view === v ? { background: 'var(--panel-2)', fontWeight: 600 } : { color: 'var(--muted)' }}
                onClick={() => setView(v)}
              >
                {v === 'report' ? `Check${report ? (report.badRows ? ` · ${report.badRows.toLocaleString()} rows with problems` : ' · all rows fit') : ''}` : 'File preview'}
              </button>
            ))}
          </div>
          {view === 'preview' ? (
            <PreviewPane preview={preview} error={previewError} loading={loading} />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              {error && <ErrorBox text={error} />}
              {checking && (
                <p className="px-4 py-3 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={14} className="animate-spin" /> Checking every row against {table}…
                </p>
              )}
              {!checking && !report && !error && blockers.length > 0 && (
                <p className="px-4 py-3" style={{ color: 'var(--muted)' }}>Match the columns on the left; the rows are checked as soon as they can be.</p>
              )}
              {report && !checking && <ReportView report={report} table={table} src={src} onCopy={copyReport} />}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
        <span style={{ color: 'var(--muted)' }}>
          {report
            ? `${rows(report.total)} in the file · ${good.toLocaleString()} fit ${table}`
            : preview && !previewError
              ? `${preview.total.toLocaleString()} rows in the file`
              : ''}
        </span>
        <div className="flex-1" />
        <button className="btn" onClick={() => void cancelImport(src)}>
          Skip
        </button>
        <button className="btn btn-primary" disabled={!report || checking || inserting || good === 0} onClick={() => void insert()}>
          {inserting && <Loader2 size={14} className="animate-spin" />}
          {!report ? 'Insert rows' : `Insert ${rows(good)}${report.badRows ? `, skip ${report.badRows.toLocaleString()}` : ''}`}
        </button>
      </div>
    </>
  )
}

function ReportView({ report, table, src, onCopy }: { report: FillReport; table: string; src: ImportSource; onCopy: () => void }) {
  if (!report.badRows)
    return (
      <div className="px-4 py-4 flex items-start gap-2">
        <CheckCircle2 size={18} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <div>
          <div className="font-semibold">All {report.total.toLocaleString()} rows fit {table}.</div>
          <div style={{ color: 'var(--muted)' }}>Types, empty values, keys, references and CHECK rules were checked. Nothing has been written yet.</div>
        </div>
      </div>
    )
  const rowWord = src.kind === 'excel' ? 'Rows are numbered as in Excel.' : src.kind === 'csv' ? 'Rows are numbered as lines of the file.' : ''
  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="shrink-0" style={{ color: 'var(--danger)' }} />
        <div className="flex-1">
          <div className="font-semibold">
            {report.badRows.toLocaleString()} of {report.total.toLocaleString()} rows would not fit {table}.
          </div>
          <div style={{ color: 'var(--muted)' }}>
            Fix them in the file and drop it again, or insert the other rows and leave these out. {rowWord}
          </div>
        </div>
        <button className="btn btn-ghost shrink-0" onClick={onCopy} title="Copy the problems (paste into Excel)">
          <Copy size={14} /> Copy
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {report.counts.map((c) => (
          <span key={c.kind} className="px-2 py-0.5 rounded-md" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
            {PROBLEM_LABELS[c.kind]}: {rows(c.rows)}
          </span>
        ))}
      </div>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
            <th className="py-1 pr-3 font-normal">row</th>
            <th className="py-1 pr-3 font-normal">problem</th>
            <th className="py-1 font-normal">details</th>
          </tr>
        </thead>
        <tbody>
          {report.problems.map((p, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
              <td className="py-1 pr-3 align-top tabular-nums mono">{p.row}</td>
              <td className="py-1 pr-3 align-top whitespace-nowrap" style={{ color: 'var(--muted)' }}>{PROBLEM_LABELS[p.kind]}</td>
              <td className="py-1 align-top mono">{p.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.problems.length >= SHOWN_PROBLEMS && (
        <p style={{ color: 'var(--muted)' }}>Showing the first {SHOWN_PROBLEMS} problems.</p>
      )}
    </div>
  )
}
