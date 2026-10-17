// T-SQL next to the DuckDB SQL it became (stage 4): one row per statement, what was taken out in
// red on the left, what came in green on the right, and sqlglot's notes under it.
import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCopy, ExternalLink, Info, Loader2 } from 'lucide-react'
import { sideBySide, type Segment } from '../core/diff'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../dialects/tsql'
import { addTab, useLab } from './store'

export function TranslationView() {
  const tabId = useLab((s) => s.activeTab)
  const title = useLab((s) => s.tabs.find((t) => t.id === s.activeTab)?.title ?? 'Query')
  const t = useLab((s) => s.translations[s.activeTab])
  const [copied, setCopied] = useState(false)

  if (!t)
    return <Note>Run the tab, or press “Show translation”, to see the T-SQL next to the DuckDB SQL it becomes.</Note>
  if (t.status === 'loading')
    return (
      <Note>
        <Loader2 size={16} className="animate-spin" />
        {t.progress === 'download' ? 'Downloading the translator (Python + sqlglot, about 12 MB, once)…' : 'Starting Python…'}
      </Note>
    )
  if (t.status === 'error')
    return (
      <div className="p-4">
        <div className="rounded-lg p-3 flex gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> The translator could not start: {t.error}
        </div>
      </div>
    )
  if (!t.statements.length) return <Note>Nothing to translate: the tab has no statement.</Note>

  const script = duckdbScript(t.statements)
  return (
    <div className="h-full flex flex-col" key={tabId}>
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5" style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: 12 }}>
        <span>
          {t.statements.length} statement{t.statements.length === 1 ? '' : 's'} · translated by sqlglot {SQLGLOT_VERSION} in {t.ms.toFixed(0)} ms · <Mark kind="old">taken out</Mark> <Mark kind="new">put in</Mark>
        </span>
        <div className="flex-1" />
        <button className="btn btn-ghost" onClick={() => (void navigator.clipboard.writeText(script), setCopied(true), setTimeout(() => setCopied(false), 1500))}>
          <ClipboardCopy size={13} /> {copied ? 'Copied' : 'Copy DuckDB SQL'}
        </button>
        <button className="btn btn-ghost" onClick={() => addTab(script + '\n', `${title} · DuckDB`)} title="Open the DuckDB version in a new DuckDB tab">
          <ExternalLink size={13} /> Open as DuckDB
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="hidden sm:grid grid-cols-2 sticky top-0 z-10 font-semibold" style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
          <div className="px-3 py-1">SQL Server (T-SQL) — as written</div>
          <div className="px-3 py-1" style={{ borderLeft: '1px solid var(--line)' }}>DuckDB — what runs</div>
        </div>
        {t.statements.map((st, i) => (
          <StatementRow key={i} n={i + 1} st={st} />
        ))}
      </div>
    </div>
  )
}

function StatementRow({ n, st }: { n: number; st: TranslatedStatement }) {
  const diff = useMemo(() => (st.target == null ? null : sideBySide(st.source, st.target)), [st])
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="grid sm:grid-cols-2">
        <Code label={`${n} · T-SQL`} segments={diff?.left ?? [{ text: st.source, changed: false }]} kind="old" />
        <div className="sm:border-l" style={{ borderColor: 'var(--line)' }}>
          {st.target == null ? (
            <div className="p-3 flex gap-2" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Could not read this statement: {st.error}
            </div>
          ) : (
            <Code label={`${n} · DuckDB${diff ? ` · ${diff.changes ? `${diff.changes} change${diff.changes === 1 ? '' : 's'}` : 'the same'}` : ''}`} segments={diff!.right} kind="new" />
          )}
        </div>
      </div>
      {st.notes.length > 0 && (
        <ul className="px-3 pb-2 space-y-0.5" style={{ color: 'var(--warn-text)', fontSize: 12 }}>
          {st.notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <Info size={13} className="shrink-0 mt-0.5" /> {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Code({ label, segments, kind }: { label: string; segments: Segment[]; kind: 'old' | 'new' }) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div className="mb-1" style={{ color: 'var(--muted)', fontSize: 11 }}>{label}</div>
      <pre className="mono whitespace-pre-wrap break-words" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
        {segments.map((s, i) => (s.changed ? <Mark key={i} kind={kind}>{s.text}</Mark> : <span key={i}>{s.text}</span>))}
      </pre>
    </div>
  )
}

function Mark({ kind, children }: { kind: 'old' | 'new'; children: React.ReactNode }) {
  return (
    <span
      className="rounded px-0.5"
      style={kind === 'old' ? { background: 'var(--danger-soft)', color: 'var(--danger)', textDecoration: 'line-through', textDecorationThickness: 1 } : { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 }}
    >
      {children}
    </span>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center gap-2 p-6 text-center" style={{ color: 'var(--muted)' }}>
      {children}
    </div>
  )
}
