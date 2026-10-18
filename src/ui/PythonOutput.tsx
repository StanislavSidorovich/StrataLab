// A Python tab's result (stage 7): each cell's output as Jupyter shows it (printed text, the last
// line's value, figures, errors), and the last DataFrame in the grid below, where Chart, Copy,
// Export and Save as table work on it. Only text and images are shown: never HTML from the code.
import { AlertTriangle, Loader2, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Output } from '../core/ipynb'
import { useLab, type PyCellRun, type TabResult } from './store'
import { pythonLoading, useSlowLoading } from './DialectBar'
import { pythonNameHint } from '../core/dialect'

const pre = 'mono whitespace-pre-wrap break-words'

/** A NameError on a dataset or table name: says how to read it. */
function NameHint({ evalue }: { evalue: string }) {
  const tables = useLab((s) => s.tables)
  const hint = pythonNameHint(evalue, tables)
  return hint ? <div className="mt-1.5 font-semibold">{hint}</div> : null
}

function OutputView({ o, inGrid, rows }: { o: Output; inGrid: boolean; rows: string }) {
  if (o.output_type === 'stream')
    return (
      <pre className={pre} style={{ fontSize: 12.5, color: o.name === 'stderr' ? 'var(--warn-text)' : 'var(--text)' }}>
        {o.text.replace(/\n$/, '')}
      </pre>
    )
  if (o.output_type === 'error')
    return (
      <div className="rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold">
            {o.ename}: {o.evalue}
          </div>
          {o.traceback.length > 1 && (
            <pre className={pre} style={{ fontSize: 12, marginTop: 4 }}>
              {o.traceback.slice(0, -1).join('\n')}
            </pre>
          )}
          <NameHint evalue={o.evalue} />
        </div>
      </div>
    )
  const png = o.data['image/png']
  if (png) return <img src={`data:image/png;base64,${png}`} alt={o.data['text/plain'] ?? 'Figure'} className="max-w-full rounded" style={{ background: '#fff', maxHeight: 440, objectFit: 'contain', objectPosition: 'left' }} />
  if (inGrid)
    return (
      <div className="flex items-center gap-1.5" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
        <Table2 size={14} /> DataFrame in the grid below: {rows}
      </div>
    )
  // A value (a DataFrame's columns) keeps its lines: it scrolls sideways rather than wrapping.
  return (
    <pre className="mono whitespace-pre overflow-x-auto" style={{ fontSize: 12.5 }}>
      {o.data['text/plain'] ?? ''}
    </pre>
  )
}

function CellView({ run, rows }: { run: PyCellRun; rows: string }) {
  const kernel = useLab((s) => s.python)
  const slow = useSlowLoading(kernel.status === 'loading')
  const label = run.index >= 0 ? `cell ${run.index + 1}` : 'selection'
  let body: ReactNode
  if (run.running)
    body = (
      <div className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
        <Loader2 size={13} className="animate-spin" />
        {kernel.status === 'loading' ? `${pythonLoading(kernel, slow)} (once, then kept in this browser)` : 'Running… Stop restarts Python.'}
      </div>
    )
  else if (!run.outputs.length) body = <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Done, no output.</div>
  else
    body = (
      <div className="space-y-1.5 min-w-0">
        {run.outputs.map((o, i) => (
          <OutputView key={i} o={o} inGrid={run.gridAt === i} rows={rows} />
        ))}
      </div>
    )
  return (
    <div className="flex gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="mono shrink-0 text-right leading-tight" style={{ color: 'var(--muted)', fontSize: 11.5, width: 52 }} title={`${label}, line ${run.line} of the tab`}>
        [{run.count || ' '}]<div className="hidden sm:block" style={{ fontSize: 10.5 }}>{label}</div>
      </div>
      <div className="flex-1 min-w-0">{body}</div>
    </div>
  )
}

/** The cells' outputs; the grid (given by the result pane) under them when a DataFrame was shown. */
export function PythonOutput({ res, grid }: { res: TabResult; grid: ReactNode | null }) {
  const t = res.table
  const rows = t ? `${t.numRows.toLocaleString()}${res.more ? '+' : ''} rows × ${t.numCols} columns` : ''
  const cells = res.cells ?? []
  return (
    <div className="h-full flex flex-col">
      <div className="overflow-auto" data-python-output style={{ flex: grid ? '1 1 55%' : '1 1 auto', minHeight: 0 }}>
        {cells.map((c, i) => (
          <CellView key={i} run={c} rows={rows} />
        ))}
        {res.status === 'error' && res.error && (
          <div className="m-3 rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{res.error}</span>
          </div>
        )}
      </div>
      {grid && (
        <div style={{ flex: '1 1 45%', minHeight: 120, borderTop: '1px solid var(--line)' }}>
          {grid}
        </div>
      )}
    </div>
  )
}
