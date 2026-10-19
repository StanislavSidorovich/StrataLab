// A Python tab's Output view (stage 7): each cell's output as Jupyter shows it (printed text, the
// last line's value, figures, errors), in one column as in Colab. Every DataFrame shows inline as a
// small table of its first rows, with a link that opens that one in the DataFrame view (Copy, Export
// and Save as table work there); the last one is there already. Only text and images are shown:
// never HTML from the code.
import { AlertTriangle, Loader2, TableProperties } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { DataType } from 'apache-arrow'
import type { Output } from '../core/ipynb'
import { INLINE_COLS, frameShape, inlineNumber, inlineRows } from '../core/pyOutput'
import { formatterFor, isNumericField } from '../db/format'
import type { ShownFrame } from '../python/kernel'
import { openFrame, useLab, type PyCellRun, type TabResult } from './store'
import { pythonLoading, useSlowLoading } from './DialectBar'
import { pythonNameHint } from '../core/dialect'

const pre = 'mono whitespace-pre-wrap break-words'

/** A NameError on a dataset or table name: says how to read it. */
function NameHint({ evalue }: { evalue: string }) {
  const tables = useLab((s) => s.tables)
  const hint = pythonNameHint(evalue, tables)
  return hint ? <div className="mt-1.5 font-semibold">{hint}</div> : null
}

/** A DataFrame inline: its first rows as a compact table, and a link to the whole of it. */
function FrameView({ f, open, shown }: { f: ShownFrame; open: () => void; shown: boolean }) {
  const t = f.table
  const cols = useMemo(
    () =>
      t.schema.fields.slice(0, INLINE_COLS).map((field, i) => {
        const fmt = formatterFor(field)
        const float = DataType.isFloat(field.type)
        // Missing values as pandas prints them.
        const missing = DataType.isTimestamp(field.type) || DataType.isDate(field.type) ? 'NaT' : float ? 'NaN' : isNumericField(field) ? '<NA>' : 'None'
        return { name: field.name, vec: t.getChildAt(i), num: isNumericField(field), missing, fmt: (v: unknown) => (float && typeof v === 'number' ? inlineNumber(v) : fmt(v)) }
      }),
    [t],
  )
  const n = inlineRows(f.total)
  const moreRows = f.total - n
  const moreCols = t.numCols - cols.length
  const cell = { padding: '2px 8px', borderBottom: '1px solid var(--line)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const
  return (
    <div className="min-w-0" data-frame>
      <div className="overflow-x-auto">
        <table className="mono" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th style={{ ...cell, color: 'var(--muted)' }} />
              {cols.map((c, i) => (
                <th key={i} style={{ ...cell, textAlign: c.num ? 'right' : 'left', fontFamily: 'var(--q-font-sans)' }} title={c.name}>
                  {c.name}
                </th>
              ))}
              {moreCols > 0 && <th style={{ ...cell, color: 'var(--muted)', fontWeight: 400 }}>…</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, r) => (
              <tr key={r}>
                <td style={{ ...cell, color: 'var(--muted)', textAlign: 'right' }}>{r}</td>
                {cols.map((c, i) => {
                  const v = c.fmt(c.vec?.get(r))
                  return (
                    <td key={i} style={{ ...cell, textAlign: c.num ? 'right' : 'left' }} title={v == null ? undefined : String(v)}>
                      {v == null ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{c.missing}</span> : String(v)}
                    </td>
                  )
                })}
                {moreCols > 0 && <td style={{ ...cell, color: 'var(--muted)' }}>…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 mt-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
        {(moreRows > 0 || moreCols > 0) && (
          <span>
            {moreRows > 0 && `… ${moreRows.toLocaleString('en-US')} more row${moreRows === 1 ? '' : 's'}`}
            {moreRows > 0 && moreCols > 0 && ', '}
            {moreCols > 0 && `${moreCols} more column${moreCols === 1 ? '' : 's'}`}
          </span>
        )}
        <button
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: 'var(--accent)' }}
          onClick={open}
          title={shown ? 'This DataFrame is in the DataFrame view: open it there, on the whole pane, with Copy, Export and Save as table' : 'Show this DataFrame in the DataFrame view, on the whole pane, with Copy, Export and Save as table'}
        >
          <TableProperties size={13} /> Open in DataFrame view · {frameShape(f.total, t.numCols)}
        </button>
      </div>
    </div>
  )
}

function OutputView({ o, frame }: { o: Output; frame?: ReactNode }) {
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
  if (frame) return frame
  // A value (a DataFrame's columns) keeps its lines: it scrolls sideways rather than wrapping.
  return (
    <pre className="mono whitespace-pre overflow-x-auto" style={{ fontSize: 12.5 }}>
      {o.data['text/plain'] ?? ''}
    </pre>
  )
}

function CellView({ run, at, tabId, from }: { run: PyCellRun; at: number; tabId: string; from?: TabResult['tableFrom'] }) {
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
          <OutputView key={i} o={o} frame={run.frames?.[i] && <FrameView f={run.frames[i]} open={() => openFrame(tabId, at, i)} shown={from?.run === at && from.at === i} />} />
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

/** The cells' outputs, one under the other; the pane scrolls. */
export function PythonOutput({ res }: { res: TabResult }) {
  const tabId = useLab((s) => s.activeTab)
  const cells = res.cells ?? []
  return (
    <div className="h-full overflow-auto" data-python-output>
      {cells.map((c, i) => (
        <CellView key={i} run={c} at={i} tabId={tabId} from={res.tableFrom} />
      ))}
      {res.status === 'error' && res.error && (
        <div className="m-3 rounded-lg p-2.5 flex gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{res.error}</span>
        </div>
      )}
    </div>
  )
}
