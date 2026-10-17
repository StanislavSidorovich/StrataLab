// A model opened from model.quaera.app: ask before replacing tables that already exist,
// then say what DuckDB could not take as it was.
import { AlertTriangle, Loader2, Network, X } from 'lucide-react'
import { closeDdl, runDdl, useLab } from './store'

export function DdlDialog() {
  const ddl = useLab((s) => s.ddl)
  if (!ddl) return null

  const title =
    ddl.phase === 'error' ? 'The model could not be opened' : `Model${'plan' in ddl && ddl.plan.title ? ` “${ddl.plan.title}”` : ddl.phase === 'report' && ddl.title ? ` “${ddl.title}”` : ''} from model.quaera.app`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }}>
      <div role="dialog" aria-label={title} className="w-full max-w-2xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          {ddl.phase === 'error' ? <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /> : <Network size={18} style={{ color: 'var(--accent)' }} />}
          <div className="flex-1 min-w-0 font-semibold truncate">{title}</div>
          {ddl.phase !== 'running' && (
            <button className="btn btn-ghost" onClick={closeDdl} aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-4 py-3 overflow-auto min-h-0 flex flex-col gap-3">
          {ddl.phase === 'error' && <p>{ddl.message}</p>}

          {ddl.phase === 'running' && (
            <p className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Creating {ddl.plan.tables.length} tables…
            </p>
          )}

          {ddl.phase === 'confirm' && (
            <>
              <p>
                The model has {ddl.plan.tables.length} tables. {ddl.clashing.length === 1 ? 'One of them already exists' : `${ddl.clashing.length} of them already exist`} in
                this browser:
              </p>
              <p className="mono">{ddl.clashing.map((c) => c.name).join(', ')}</p>
              <p style={{ color: 'var(--muted)' }}>Replacing drops them with their rows. Keeping them creates only the other tables.</p>
            </>
          )}

          {ddl.phase === 'report' && (
            <>
              <p>
                {ddl.created.length ? (
                  <>
                    Created {ddl.created.length} empty table{ddl.created.length === 1 ? '' : 's'}: <span className="mono">{ddl.created.join(', ')}</span>.
                  </>
                ) : (
                  'No table was created.'
                )}{' '}
                {ddl.notes.length > 0 && 'DuckDB could not take everything as it was written:'}
              </p>
              <ul className="flex flex-col gap-2">
                {ddl.notes.map((n, i) => (
                  <li key={i} className="rounded-md px-3 py-2" style={{ background: 'var(--warn-soft)' }}>
                    <div className="mono truncate" style={{ fontSize: 12, color: 'var(--muted)' }} title={n.statement}>
                      {n.statement}
                    </div>
                    <div style={{ color: 'var(--warn-text)' }}>{n.message}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          {ddl.phase === 'confirm' ? (
            <>
              <button className="btn" onClick={closeDdl}>
                Cancel
              </button>
              <button className="btn" onClick={() => void runDdl(ddl.plan, false)}>
                Keep them, create the rest
              </button>
              <button className="btn btn-primary" onClick={() => void runDdl(ddl.plan, true)}>
                Replace {ddl.clashing.length === 1 ? 'it' : `all ${ddl.clashing.length}`}
              </button>
            </>
          ) : (
            ddl.phase !== 'running' && (
              <button className="btn btn-primary" onClick={closeDdl}>
                OK
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
