// Share (stage 5): a link with the datasets a query needs and the query tabs, as DB Fiddle does.
// Everything is in the link's fragment (`#s=`), which never reaches a server; the user's own
// tables can't travel that way, and the dialog says which ones the queries use.
import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Info, Link2, X } from 'lucide-react'
import { openShare, ownTables, tabDialect, useLab } from './store'
import { encodeShare, planShare, shareUrl } from '../core/shareLink'
import { DEMO_TABLES } from '../data/demo'
import { datasetById } from '../data/datasets'

/** Messengers and mail cut long links; past this the dialog warns. */
const LONG_LINK = 8000

export function ShareDialog() {
  const open = useLab((s) => s.shareOpen)
  const tabs = useLab((s) => s.tabs)
  const activeTab = useLab((s) => s.activeTab)
  const tables = useLab((s) => s.tables)
  const [scope, setScope] = useState<'tab' | 'all'>('tab')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const chosen = scope === 'all' ? tabs : tabs.filter((t) => t.id === activeTab)
  const datasets = [...new Set(tables.map((t) => t.schema))].filter((s) => datasetById(s))
  const own = ownTables(tables).map((t) => t.name)
  const hasDemo = DEMO_TABLES.every((n) => own.includes(n))
  const { share, notShared } = planShare(
    chosen.map((t) => ({ title: t.title, sql: t.sql, dialect: tabDialect(t) })),
    { datasets, demoTables: hasDemo ? DEMO_TABLES : [], ownTables: own },
  )
  const key = JSON.stringify(share)

  useEffect(() => {
    if (!open) return
    let live = true
    void encodeShare(JSON.parse(key)).then((data) => live && setUrl(shareUrl(location.origin, location.pathname, data)))
    return () => {
      live = false
    }
  }, [open, key])

  if (!open) return null
  const close = () => openShare(false)
  const copy = () => {
    void navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const empty = chosen.every((t) => !t.sql.trim())
  const postgres = chosen.some((t) => tabDialect(t) === 'postgres')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Share" className="w-full max-w-xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Link2 size={18} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Share a link</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Whoever opens it gets the same queries in new tabs, with the sample datasets they need loaded. The link holds everything itself: nothing is uploaded.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto min-h-0 px-4 py-3 space-y-3">
          <div role="radiogroup" aria-label="What to share" className="flex rounded-md p-0.5 w-fit" style={{ background: 'var(--panel-2)' }}>
            {(['tab', 'all'] as const).map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={scope === v}
                className="px-3 py-1 rounded whitespace-nowrap"
                style={scope === v ? { background: 'var(--panel)', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' } : { color: 'var(--muted)' }}
                onClick={() => setScope(v)}
              >
                {v === 'tab' ? 'This tab' : `All tabs (${tabs.length})`}
              </button>
            ))}
          </div>

          <ul className="space-y-1">
            <li className="flex gap-2">
              <Check size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <span>
                {share.tabs.length === 1 ? <>The query <b>{share.tabs[0].title}</b></> : <>{share.tabs.length} queries</>}
                {share.tabs.some((t) => t.dialect) && ', each in its dialect'}
              </span>
            </li>
            {share.datasets.map((id) => (
              <li key={id} className="flex gap-2">
                <Check size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <span>
                  Dataset <b>{datasetById(id)?.title ?? id}</b>, as published (changes you made to its tables are not in the link)
                </span>
              </li>
            ))}
            {share.demo && (
              <li className="flex gap-2">
                <Check size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <span>The demo shop (customers, products, orders, order_items), as everyone has it</span>
              </li>
            )}
          </ul>

          {notShared.length > 0 && (
            <div className="rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                Not in the link: your own table{notShared.length === 1 ? '' : 's'} <b>{notShared.join(', ')}</b>. Their data stays in this browser; send the file too (or a backup
                from the ⋯ next to TABLES), and the query works once it is imported under the same name.
              </span>
            </div>
          )}
          {postgres && (
            <div className="rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
              <Info size={15} className="shrink-0 mt-0.5" />
              <span>PostgreSQL tabs open as PostgreSQL tabs; the tables they read are copied to PostgreSQL from the tree’s ⋯ menu after opening.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <textarea className="field w-full mono" style={{ fontSize: 11.5, height: 72, resize: 'none' }} readOnly value={url} aria-label="The link" onFocus={(e) => e.target.select()} />
            <div className="flex items-center gap-2">
              <span style={{ color: url.length > LONG_LINK ? 'var(--warn-text)' : 'var(--muted)', fontSize: 12 }}>
                {url.length.toLocaleString()} characters{url.length > LONG_LINK && ': long, some messengers cut links like this; share one tab, or send the .sql file'}
              </span>
              <div className="flex-1" />
              <button className="btn btn-primary" onClick={copy} disabled={!url || empty}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {empty && <p style={{ color: 'var(--muted)', fontSize: 12 }}>The tab is empty: write a query first.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
