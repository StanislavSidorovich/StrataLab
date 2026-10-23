// Asked before a script that makes many tables runs: into a dataset of their own, or My tables
// (src/core/scriptDataset.ts has the rule, store.ts runs the script).
import { useEffect, useState } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { answerScriptDataset, useLab } from './store'

export function ScriptDatasetDialog() {
  const ask = useLab((s) => s.scriptDataset)
  const [name, setName] = useState('')
  useEffect(() => {
    if (ask) setName(ask.name)
  }, [ask])
  if (!ask) return null
  const shown = ask.tables.slice(0, 6).join(', ') + (ask.tables.length > 6 ? ` and ${ask.tables.length - 6} more` : '')
  const go = () => answerScriptDataset({ dataset: name })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && answerScriptDataset('cancel')}>
      <div
        role="dialog"
        aria-label="Put the new tables in a dataset"
        className="w-full max-w-md max-h-full flex flex-col rounded-xl shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onKeyDown={(e) => e.key === 'Escape' && answerScriptDataset('cancel')}
      >
        <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <FolderPlus size={18} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">This script makes {ask.tables.length} tables</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Keep them together in a dataset, so My tables stays tidy.</div>
          </div>
          <button className="btn btn-ghost" onClick={() => answerScriptDataset('cancel')} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto min-h-0 px-4 py-3 space-y-3">
          <p className="mono break-words" style={{ background: 'var(--panel-2)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
            {shown}
          </p>
          <label className="flex flex-col gap-1">
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Dataset name (a name that exists adds the tables to that dataset)</span>
            <input className="field" value={name} autoFocus spellCheck={false} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          </label>
          {ask.problem && (
            <p className="rounded-md px-3 py-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12 }}>
              {ask.problem}
            </p>
          )}
          <div className="flex justify-end gap-2 flex-wrap">
            <button className="btn" onClick={() => answerScriptDataset('main')}>
              Keep in My tables
            </button>
            <button className="btn btn-primary" onClick={go}>
              Create dataset and run
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
