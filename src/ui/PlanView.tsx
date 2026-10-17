// The Plan view (Explain): how the database runs the tab's query, as a tree of steps, each with
// what it does in plain words, the rows it passed on and where the time went. Rules in
// src/core/plan.ts.
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Info, ListTree, Loader2, TriangleAlert } from 'lucide-react'
import { countSteps, planTips, stepHint, withoutInternal, type PlanNode } from '../core/plan'
import { splitError } from '../core/dialect'
import { STOPPED, explainSql, tabDialect, useLab } from './store'
import { activeSql } from './SqlEditor'

const rowsText = (n: number) => `${n.toLocaleString()} row${n === 1 ? '' : 's'}`
const msText = (ms: number) => (ms < 0.1 ? '<0.1 ms' : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms).toLocaleString()} ms`)

export function PlanView() {
  const tabId = useLab((s) => s.activeTab)
  const state = useLab((s) => s.plans[s.activeTab])
  const dialect = useLab((s) => tabDialect(s.tabs.find((t) => t.id === s.activeTab)))
  const ready = useLab((s) => s.engine.status === 'ready')
  const [internal, setInternal] = useState(false)
  const shown = useMemo(() => (state?.status === 'done' ? (internal ? state.plan : withoutInternal(state.plan)) : null), [state, internal])
  const tips = useMemo(() => (shown ? planTips(shown) : []), [shown])

  if (!state)
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: 'var(--muted)' }}>
        <div>Explain shows how the database runs this tab’s query: its steps, the rows at each step and where the time goes.{dialect === 'tsql' ? ' A T-SQL tab shows the plan of its DuckDB translation.' : ''}</div>
        <button className="btn btn-ghost" disabled={!ready} onClick={() => void explainSql(tabId, activeSql())}>
          <ListTree size={14} /> Explain
        </button>
      </div>
    )
  if (state.status === 'running')
    return (
      <div className="h-full flex items-center justify-center gap-2 p-6 text-center" style={{ color: 'var(--muted)' }}>
        <Loader2 size={16} className="animate-spin shrink-0" /> Running the query to measure each step…{dialect !== 'postgres' && ' Stop cancels it.'}
      </div>
    )
  if (state.status === 'error') {
    if (state.error === STOPPED) return <div className="h-full flex items-center justify-center p-6" style={{ color: 'var(--muted)' }}>Stopped before the query finished, so there is no plan.</div>
    const { kind, text } = splitError(state.error)
    return (
      <div className="h-full overflow-auto p-4">
        <div className="rounded-lg p-3 flex gap-3" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold mb-1">Could not explain: {kind}</div>
            <pre className="mono whitespace-pre-wrap break-words" style={{ fontSize: 12.5 }}>{text}</pre>
            <div className="mt-2" style={{ color: 'var(--text)' }}>Explain works on one query: SELECT, or INSERT, UPDATE, DELETE (those are only planned, not run).</div>
          </div>
        </div>
      </div>
    )
  }

  const plan = shown!
  const engine = plan.engine === 'postgres' ? 'PostgreSQL' : 'DuckDB'
  const slowest = plan.analyzed ? Math.max(...collect(plan.root).map((n) => n.ms ?? 0)) : 0
  return (
    <div className="h-full overflow-auto p-2 sm:p-3 space-y-2" style={{ fontSize: 13 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">
          {plan.analyzed ? `${engine} ran it in ${msText(plan.totalMs ?? 0)}` : `${engine}’s estimated plan (not run)`} · {countSteps(plan.root)} step{countSteps(plan.root) === 1 ? '' : 's'}
          {plan.analyzed && plan.root.rows != null && ` · ${rowsText(plan.root.rows)} out`}
        </span>
        {(plan.hidden > 0 || internal) && (
          <label className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }} title="DuckDB moves and packs columns between steps; these steps take next to no time">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Show internal steps{plan.hidden > 0 ? ` (${plan.hidden})` : ''}
          </label>
        )}
      </div>
      {state.notes.map((n) => (
        <Note key={n} text={n} />
      ))}
      {tips.map((t) => (
        <Note key={t.text} text={t.text} warn={t.warn} />
      ))}
      <div style={{ color: 'var(--muted)' }}>
        Read it from the bottom up: rows start at the tables (the deepest steps) and flow up to the result at the top. Click a step for its details.
      </div>
      <ul className="space-y-1">
        <Step node={plan.root} analyzed={plan.analyzed} pg={plan.engine === 'postgres'} slowest={slowest} depth={0} />
      </ul>
    </div>
  )
}

function collect(n: PlanNode): PlanNode[] {
  return [n, ...n.children.flatMap(collect)]
}

function Note({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <div className="rounded-md px-2.5 py-1.5 flex gap-2" style={warn ? { background: 'var(--warn-soft)', color: 'var(--warn-text)' } : { background: 'var(--accent-soft)' }}>
      {warn ? <TriangleAlert size={14} className="shrink-0 mt-0.5" /> : <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />}
      <span>{text}</span>
    </div>
  )
}

function Step({ node, analyzed, pg, slowest, depth }: { node: PlanNode; analyzed: boolean; pg: boolean; slowest: number; depth: number }) {
  const [open, setOpen] = useState(false)
  const hint = stepHint(node.kind)
  const isSlowest = analyzed && slowest > 0 && node.ms === slowest && node.share < 0.999
  const estimateOff = pg && analyzed && node.rows != null && node.estimate != null && node.estimate > 0 && (node.rows / node.estimate > 10 || node.estimate / Math.max(node.rows, 1) > 10)
  return (
    <li>
      <button
        className="w-full text-left rounded-md px-1.5 sm:px-2 py-1.5 flex gap-1.5 sm:gap-2 hover:bg-[var(--panel-2)]"
        style={isSlowest ? { background: 'var(--panel-2)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{node.title}</span>
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>
              {node.op}
            </span>
            {isSlowest && (
              <span className="rounded px-1" style={{ background: 'var(--accent)', color: 'var(--panel)', fontSize: 10.5, fontWeight: 600 }}>
                slowest
              </span>
            )}
          </span>
          {node.summary && (
            <span className="block mono truncate" style={{ fontSize: 12 }} title={node.summary}>
              {node.summary}
            </span>
          )}
          {hint && (
            <span className="block" style={{ color: 'var(--muted)', fontSize: 12 }}>
              {hint}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right" style={{ fontSize: 12, minWidth: 64 }}>
          {node.rows != null ? (
            <span className="block whitespace-nowrap">{rowsText(node.rows)}</span>
          ) : node.estimate != null ? (
            <span className="block whitespace-nowrap" style={{ color: 'var(--muted)' }} title="The planner’s estimate">
              ~{rowsText(node.estimate)}
            </span>
          ) : null}
          {node.scanned != null && (
            <span className="block whitespace-nowrap" style={{ color: 'var(--muted)' }}>
              read {node.scanned.toLocaleString()}
            </span>
          )}
          {node.ms != null && (
            <>
              <span className="block whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                {msText(node.ms)} · {Math.round(node.share * 100)}%
              </span>
              <span className="block ml-auto mt-0.5 rounded-full overflow-hidden" style={{ width: 64, height: 4, background: 'var(--line)' }} aria-hidden>
                <span className="block h-full" style={{ width: `${Math.max(node.share > 0 ? 3 : 0, node.share * 100)}%`, background: 'var(--accent)' }} />
              </span>
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="ml-6 mr-1 mb-1 rounded-md p-2 space-y-1" style={{ background: 'var(--panel-2)', fontSize: 12 }}>
          {analyzed && node.estimate != null && node.rows != null && (
            <div>
              Expected {rowsText(node.estimate)}, got {rowsText(node.rows)}.
              {estimateOff && ' The guess was far off: fresh statistics (ANALYZE table_name) help PostgreSQL choose a better plan.'}
            </div>
          )}
          {node.details.length === 0 && <div style={{ color: 'var(--muted)' }}>No more details for this step.</div>}
          {node.details.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-2">
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span className="mono break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
      {node.children.length > 0 && (
        <ul className="space-y-1 mt-1" style={{ marginLeft: depth < 5 ? 12 : 4, paddingLeft: depth < 5 ? 8 : 4, borderLeft: '1px solid var(--line)' }}>
          {node.children.map((c, i) => (
            <Step key={i} node={c} analyzed={analyzed} pg={pg} slowest={slowest} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
