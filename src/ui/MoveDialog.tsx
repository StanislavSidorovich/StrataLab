// “Move to dataset”: a table of the user's goes to another of their datasets (or to My tables),
// together with the tables linked to it by foreign keys, since DuckDB keeps keys inside one schema.
import { useState } from 'react'
import { FolderInput, Loader2, X } from 'lucide-react'
import { closeMove, newDataset, ownDatasets, runMove, schemaLabel, useLab } from './store'

const NEW = '\u0000new'

export function MoveDialog() {
  const move = useLab((s) => s.move)
  const schemas = useLab((s) => s.schemas)
  const targets = ['main', ...ownDatasets(schemas)].filter((s) => s !== move?.schema)
  const [to, setTo] = useState<string>('')
  if (!move) return null
  const chosen = targets.includes(to) ? to : move.to && targets.includes(move.to) ? move.to : (targets[0] ?? NEW)
  const others = move.tables.filter((t) => t !== move.table)

  const go = async () => {
    let target = chosen
    if (target === NEW) {
      const made = await newDataset()
      if (!made) return
      target = made
      setTo(made)
    }
    await runMove(target)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && !move.busy && closeMove()}>
      <div role="dialog" aria-label="Move to dataset" className="w-full max-w-md max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <FolderInput size={18} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">Move {move.table} to another dataset</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              From {schemaLabel(move.schema)}. The rows, keys and CHECKs go with it; queries name it by its new place afterwards.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeMove} disabled={move.busy} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto min-h-0 px-4 py-3 space-y-3">
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Move to</span>
            <select className="field" value={chosen} onChange={(e) => setTo(e.target.value)} disabled={move.busy}>
              {targets.map((s) => (
                <option key={s} value={s}>
                  {schemaLabel(s)}
                </option>
              ))}
              <option value={NEW}>New dataset…</option>
            </select>
          </label>
          {others.length > 0 && (
            <p className="rounded-md px-3 py-2" style={{ background: 'var(--panel-2)', fontSize: 12 }}>
              Linked by foreign keys, so {others.length === 1 ? 'this table moves' : 'these tables move'} too: <b>{others.join(', ')}</b>.
            </p>
          )}
          {move.error && (
            <pre className="p-3 rounded-lg mono whitespace-pre-wrap" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
              {move.error}
            </pre>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={closeMove} disabled={move.busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void go()} disabled={move.busy}>
              {move.busy && <Loader2 size={14} className="animate-spin" />} {move.tables.length > 1 ? `Move ${move.tables.length} tables` : 'Move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
