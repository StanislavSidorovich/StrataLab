// The data generator (stage 2): pick the tables and how many rows each gets; the rows are made
// up inside DuckDB and respect the keys (src/core/generate.ts). Then what each table got.
import { AlertTriangle, Loader2, Sparkles, X } from 'lucide-react'
import { closeGenerate, generationPlan, runGenerate, setGenerateCount, useLab } from './store'
import { parentsFirst } from '../core/generate'

export function GenerateDialog() {
  const g = useLab((s) => s.generate)
  if (!g) return null
  const plan = g.phase === 'choose' ? generationPlan(g) : g.phase === 'running' ? g.plan : null
  const problems = new Map((g.phase === 'report' ? g.problems : plan?.problems ?? []).map((p) => [p.table, p.message]))
  const rowsToMake = plan?.steps.reduce((n, s) => n + s.count, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => g.phase === 'choose' && e.target === e.currentTarget && closeGenerate()}>
      <div role="dialog" aria-label="Generate sample rows" className="w-full max-w-2xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Generate sample rows</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Made up in this browser, keeping every key: foreign keys point at existing rows, keys don't repeat, CHECKs hold. Parents are filled first.
            </div>
          </div>
          {g.phase !== 'running' && (
            <button className="btn btn-ghost" onClick={closeGenerate} aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="overflow-auto min-h-0 px-4 py-3">
          {g.phase === 'choose' && (
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: 12 }}>
                  <th className="text-left font-normal pb-1">Table</th>
                  <th className="text-right font-normal pb-1 pr-3">Rows now</th>
                  <th className="text-right font-normal pb-1">Add</th>
                </tr>
              </thead>
              <tbody>
                {parentsFirst(g.tables).map((t) => {
                  const n = g.counts[t.name] ?? 0
                  const refs = [...new Set(t.foreignKeys.map((fk) => fk.refTable).filter((r) => r !== t.name))]
                  const problem = problems.get(t.name)
                  return (
                    <tr key={t.name} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="py-1.5 pr-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={n > 0} onChange={(e) => setGenerateCount(t.name, e.target.checked ? 100 : 0)} />
                          <span className="mono">{t.name}</span>
                          {refs.length > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>→ {refs.join(', ')}</span>}
                        </label>
                        {problem && n > 0 && (
                          <div className="flex items-start gap-1 mt-1" style={{ color: 'var(--warn-text)', fontSize: 12 }}>
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {problem}
                          </div>
                        )}
                      </td>
                      <td className="text-right pr-3 mono" style={{ color: 'var(--muted)' }}>{t.rows.toLocaleString()}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          step={10}
                          value={n}
                          aria-label={`Rows to add to ${t.name}`}
                          onChange={(e) => setGenerateCount(t.name, Number(e.target.value))}
                          className="w-24 text-right rounded px-2 py-1 mono"
                          style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {g.phase === 'running' && (
            <p className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Filling {g.plan.steps[g.step]?.table} ({g.step + 1} of {g.plan.steps.length})…
            </p>
          )}

          {g.phase === 'report' && (
            <ul className="flex flex-col gap-2">
              {g.outcomes.map((o) => (
                <li key={o.table} className="rounded-md px-3 py-2" style={{ background: o.error ? 'var(--danger-soft)' : o.added < o.asked ? 'var(--warn-soft)' : 'var(--panel-2)' }}>
                  <span className="mono">{o.table}</span>:{' '}
                  {o.error ? (
                    <span style={{ color: 'var(--danger)' }}>{o.error}</span>
                  ) : o.added < o.asked ? (
                    <span style={{ color: 'var(--warn-text)' }}>
                      {o.added.toLocaleString()} of {o.asked.toLocaleString()} rows (the others broke a CHECK or would repeat a key; there may not be enough distinct combinations)
                    </span>
                  ) : (
                    `${o.added.toLocaleString()} rows added`
                  )}
                </li>
              ))}
              {[...problems].map(([table, message]) => (
                <li key={table} className="rounded-md px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
                  <span className="mono">{table}</span>: not filled, {message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          {g.phase === 'choose' && (
            <>
              <button className="btn" onClick={closeGenerate}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!plan?.steps.length} onClick={() => void runGenerate()}>
                Add {rowsToMake.toLocaleString()} rows to {plan?.steps.length ?? 0} table{plan?.steps.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {g.phase === 'report' && (
            <button className="btn btn-primary" onClick={closeGenerate}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
