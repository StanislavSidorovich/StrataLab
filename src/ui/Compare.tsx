// Compare dialects: common tasks written in DuckDB, T-SQL, PostgreSQL and pandas, side by side on
// one practice table. Content (each cell run by tests/compare.test.ts): src/data/compare.ts.
// Opened from the SQL button's menu and from the first-use note of T-SQL / PostgreSQL.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Scale, TableProperties, X } from 'lucide-react'
import { addTab, openCompare, useLab } from './store'
import { COLUMNS, COMPARE, PRACTICE_PANDAS, PRACTICE_SQL, type CompareRow } from '../data/compare'

/** The code with the parts that make the difference in bold. */
function marked(code: string, parts: string[] = []) {
  const spans: [number, number][] = []
  for (const p of parts) {
    const at = code.indexOf(p)
    if (at >= 0 && !spans.some(([a, b]) => at < b && at + p.length > a)) spans.push([at, at + p.length])
  }
  spans.sort((a, b) => a[0] - b[0])
  const out: ReactNode[] = []
  let pos = 0
  spans.forEach(([a, b], i) => {
    if (a > pos) out.push(code.slice(pos, a))
    out.push(<b key={i} style={{ color: 'var(--accent)' }}>{code.slice(a, b)}</b>)
    pos = b
  })
  out.push(code.slice(pos))
  return out
}

function Code({ code, parts, label }: { code: string; parts?: string[]; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative min-w-0">
      <pre className="mono p-1.5 pr-7 rounded whitespace-pre-wrap break-words" style={{ background: 'var(--code-bg)', border: '1px solid var(--line)', fontSize: 12 }}>
        {marked(code, parts)}
      </pre>
      <button
        className="btn btn-ghost absolute top-0 right-0"
        style={{ padding: 3 }}
        title="Copy"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(code)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }}
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

const GRID = 'md:grid-cols-[7.5rem_repeat(4,minmax(0,1fr))]'

export function CompareDialog() {
  const open = useLab((s) => s.compareOpen)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openCompare(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null

  const rowsOf = (r: CompareRow) => COLUMNS.map((c) => [c, r[c.id], r.hl?.[c.id]] as const)
  const openTable = () => {
    openCompare(false)
    addTab(PRACTICE_SQL, 'Practice: sales')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && openCompare(false)}>
      <div role="dialog" aria-label="Compare dialects" className="w-full max-w-7xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Scale size={18} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Same task, four ways</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>What changes between DuckDB, T-SQL, PostgreSQL and pandas. The part that differs is in colour.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => openCompare(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto min-h-0 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 min-w-[16rem]" style={{ color: 'var(--muted)' }}>
              Every line below was run on the same small table, <span className="mono">sales</span>, and the four give the same values. The SQL runs here as it is shown (T-SQL is translated to DuckDB first); in pandas, <span className="mono">{PRACTICE_PANDAS}</span>
            </p>
            <button className="btn" onClick={openTable} title="Opens a new SQL tab with the CREATE TABLE and INSERT for sales; run it once, then try any line">
              <TableProperties size={14} /> Open the practice table
            </button>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            <div className={`hidden md:grid ${GRID} gap-3 px-3 py-1.5 font-semibold`} style={{ background: 'var(--panel-2)', fontSize: 12 }}>
              <span>Task</span>
              {COLUMNS.map((c) => (
                <span key={c.id}>{c.label}</span>
              ))}
            </div>
            {COMPARE.map((r) => (
              <div key={r.task} className="px-3 py-2" style={{ borderTop: '1px solid var(--line)' }}>
                <div className={`grid ${GRID} gap-x-3 gap-y-2 items-start`}>
                  <span className="font-semibold">{r.task}</span>
                  {rowsOf(r).map(([c, code, parts]) => (
                    <Fragment key={c.id}>
                      <div className="min-w-0">
                        <div className="md:hidden mb-0.5" style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600 }}>
                          {c.label}
                        </div>
                        <Code code={code} parts={parts} label={`${c.label}: ${r.task}`} />
                      </div>
                    </Fragment>
                  ))}
                </div>
                {r.note && (
                  <p className="mt-1.5" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                    {r.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
