// The dataset catalog (stage 3): sample databases that load in one click into their own
// schema, with where they come from and their licence. Also the card shown while one loads.
import { useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Library, Link2, Loader2, X } from 'lucide-react'
import { closeDatasetError, openCatalog, openDataset, useLab } from './store'
import { DATASETS, datasetBytes, datasetRows } from '../data/datasets'

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function CatalogDialog() {
  const open = useLab((s) => s.catalogOpen)
  const tables = useLab((s) => s.tables)
  const [copied, setCopied] = useState<string | null>(null)
  if (!open) return null
  const loaded = new Set(tables.map((t) => t.schema))

  const copyLink = (id: string) => {
    void navigator.clipboard.writeText(`${location.origin}${location.pathname}#ds=${id}`)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && openCatalog(false)}>
      <div role="dialog" aria-label="Sample datasets" className="w-full max-w-3xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Library size={18} style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Sample datasets</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Each one loads into its own schema (chinook.Track, sakila.film…), next to your tables. Downloaded once, kept in this browser.{' '}
              <a className="underline" href="datasets/NOTICE.md" target="_blank" rel="noreferrer">
                Sources and licences
              </a>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => openCatalog(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <ul className="overflow-auto min-h-0 p-3 grid gap-3 sm:grid-cols-2">
          {DATASETS.map((d) => {
            const isLoaded = loaded.has(d.id)
            return (
              <li key={d.id} className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel-2)' }}>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-[14px]">{d.title}</span>
                  <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{d.id}.*</span>
                  {isLoaded && (
                    <span className="ml-auto flex items-center gap-1" style={{ color: 'var(--accent)', fontSize: 12 }}>
                      <Check size={13} /> loaded
                    </span>
                  )}
                </div>
                <p>{d.about}</p>
                <p style={{ color: 'var(--muted)' }}>{d.practise}</p>
                <p style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {d.tables.length} tables · {datasetRows(d).toLocaleString()} rows · {size(datasetBytes(d))} · {d.licence} ·{' '}
                  <a className="underline inline-flex items-center gap-0.5" href={d.source.url} target="_blank" rel="noreferrer">
                    {d.source.label} <ExternalLink size={11} />
                  </a>
                </p>
                {d.notes && <p style={{ color: 'var(--muted)', fontSize: 12 }}>{d.notes}</p>}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <button className="btn btn-primary" onClick={() => void openDataset(d)}>
                    {isLoaded ? 'New query' : 'Load'}
                  </button>
                  {isLoaded && (
                    <button className="btn" onClick={() => confirm(`Load ${d.title} again? Changes made to its tables are lost.`) && void openDataset(d, true)}>
                      Reload
                    </button>
                  )}
                  <button className="btn btn-ghost ml-auto" onClick={() => copyLink(d.id)} title="A link that opens Quaera Lab with this dataset loaded">
                    {copied === d.id ? <Check size={14} /> : <Link2 size={14} />} {copied === d.id ? 'Copied' : 'Link'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function DatasetProgressCard() {
  const ds = useLab((s) => s.dataset)
  if (!ds) return null
  const d = ds.dataset
  if (ds.phase === 'error')
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }}>
        <div role="alertdialog" aria-label={`${d.title} could not be loaded`} className="w-full max-w-lg rounded-xl shadow-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /> {d.title} could not be loaded
          </div>
          <pre className="p-3 rounded-lg mono whitespace-pre-wrap" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
            {ds.message}
          </pre>
          <p style={{ color: 'var(--muted)' }}>Whatever part of it had loaded was removed again. Your own tables are untouched.</p>
          <div className="flex justify-end">
            <button className="btn" onClick={closeDatasetError}>Close</button>
          </div>
        </div>
      </div>
    )
  const { step, share } = ds.progress
  const percent = Math.round(share * 100)
  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 rounded-xl shadow-lg p-4 flex flex-col gap-2" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} role="status" aria-live="polite">
      <div className="flex items-center gap-2 font-semibold">
        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} /> Loading {d.title}
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }} role="progressbar" aria-label={`${d.title} loading`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(percent, 2)}%`, background: 'var(--accent)' }} />
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {step === 'download' ? `Downloading ${size(datasetBytes(d))} · ${percent}%` : `Creating tables · ${Math.round(share * d.tables.length) + 1} of ${d.tables.length}`}
      </div>
    </div>
  )
}
