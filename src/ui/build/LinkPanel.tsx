// The panel of the linking screen (docs/build-linking-screen.md 5.2): two slots, Many (N) refers to One (1), each a table
// select and the table's columns with type marks; Swap between them; the four chips; one line of diagnosis; the result in
// numbers; the SQL behind it; Create link. The column lists are the keyboard way and the way for a narrow window.
import { useState } from 'react'
import { ArrowUpDown, Check, ExternalLink, Lightbulb, Link2, Loader2, X } from 'lucide-react'
import { checkSqlText, typeFamily, type Fix, type LinkDiagnosis, type LinkFacts, type Slot } from '../../core/buildLinks'
import { LINK_TEXT, PASS_TABLES, TABLE_INFO, type Pass } from '../../data/build/linkData'
import type { ChainPeek } from '../../db/buildRun'
import { addTab } from '../store'
import type { TableView } from './LinkCanvas'
import { FoldedSql, money } from './BuildTable'

export interface SlotState {
  table: string | null
  column: string | null
}

export interface Run {
  busy: boolean
  facts: LinkFacts | null
  error: string | null
}

interface Props {
  pass: Pass
  tables: Record<string, TableView | undefined>
  many: SlotState
  one: SlotState
  onSlot: (which: 'many' | 'one', s: SlotState) => void
  onSwap: () => void
  run: Run
  diag: LinkDiagnosis | null
  peek: ChainPeek | null
  onCreate: () => void
  onFix: (fix: Fix) => void
}

const mark = (type: string) => {
  const f = typeFamily(type)
  return f === 'text' ? 'ABC' : f === 'number' ? '123' : f === 'date' ? 'DATE' : '?'
}
const fmt = (n: number) => n.toLocaleString('en-US')

function SlotBox({
  which,
  title,
  sub,
  pass,
  tables,
  value,
  onChange,
  facts,
}: {
  which: 'many' | 'one'
  title: string
  sub: string
  pass: Pass
  tables: Props['tables']
  value: SlotState
  onChange: (s: SlotState) => void
  facts: LinkFacts | null
}) {
  const cols = value.table ? tables[value.table]?.columns ?? [] : []
  // the chosen column is pinned on top of the list
  const ordered = value.column ? [...cols.filter((c) => c.name === value.column), ...cols.filter((c) => c.name !== value.column)] : cols
  const side = facts ? facts[which] : null
  return (
    <div className={`lk-slot${value.column ? ' is-set' : ''}`} data-testid={`link-slot-${which}`}>
      <div className="lk-slot-head">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <select className="build-select" aria-label={`${title}: table`} value={value.table ?? ''} onChange={(e) => onChange({ table: e.target.value || null, column: null })}>
        <option value="">Choose a table…</option>
        {PASS_TABLES[pass].map((t) => (
          <option key={t} value={t}>
            {TABLE_INFO[t]?.short ?? t}
          </option>
        ))}
      </select>
      {cols.length > 0 && (
        <ul className="lk-cols" aria-label={`${title}: columns`}>
          {ordered.map((c) => (
            <li key={c.name}>
              <button className={`lk-colbtn${c.name === value.column ? ' is-on' : ''}`} aria-pressed={c.name === value.column} onClick={() => onChange({ table: value.table, column: c.name === value.column ? null : c.name })} data-testid={`link-pick-${which}-${c.name}`}>
                <span className="lk-ctype">{mark(c.type)}</span>
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {side && (
        <div className="lk-stats">
          {fmt(side.rows)} rows · {fmt(side.distinct)} distinct
          {side.samples.length > 0 && <> · e.g. {side.samples.map((s) => (typeFamily(side.type) === 'text' ? `'${s}'` : s)).join(', ')}</>}
        </div>
      )}
    </div>
  )
}

export function LinkPanel({ pass, tables, many, one, onSlot, onSwap, run, diag, peek, onCreate, onFix }: Props) {
  const [hint, setHint] = useState(0)
  const hints = pass === 1 ? LINK_TEXT.hint1 : LINK_TEXT.hint2
  const full = !!(many.column && one.column)
  const chipState = (id: string) => diag?.chips.find((c) => c.id === id)
  const sql = many.table && many.column && one.table && one.column ? checkSqlText({ table: many.table, column: many.column }, { table: one.table, column: one.column }) : ''
  const fixLabel = (f: Fix) => (f.kind === 'swap' ? 'Swap' : f.kind === 'region' ? 'Fix region_id in Clean' : 'Back to Clean')
  return (
    <aside className="lk-panel" data-testid="link-panel" aria-label="New link">
      <h3>New link</h3>
      <SlotBox which="many" title="Many (N)" sub="the column that refers" pass={pass} tables={tables} value={many} onChange={(s) => onSlot('many', s)} facts={run.facts} />
      <button className="btn lk-swap" onClick={onSwap} disabled={!many.table && !one.table} data-testid="link-swap" title="Swap the two columns">
        <ArrowUpDown size={14} /> Swap
      </button>
      <SlotBox which="one" title="One (1)" sub="the column it refers to" pass={pass} tables={tables} value={one} onChange={(s) => onSlot('one', s)} facts={run.facts} />
      <div className="lk-shape" data-testid="link-shape">{LINK_TEXT.shape}</div>

      <div className="lk-chips" role="list" aria-label="Checks">
        {(['types', 'one', 'found', 'pair'] as const).map((id) => {
          const c = chipState(id)
          const label = { types: 'Types', one: 'One side', found: 'Found', pair: 'Right pair' }[id]
          const state = full && run.busy ? 'run' : c?.state ?? 'wait'
          return (
            <span key={id} role="listitem" className={`lk-chip${state === 'pass' ? ' is-pass' : state === 'fail' ? ' is-fail' : ''}`} title={c?.hint ?? 'Waits for both columns'} data-testid={`chip-${id}`} data-state={state}>
              {state === 'pass' ? <Check size={12} /> : state === 'fail' ? <X size={12} /> : state === 'run' ? <Loader2 size={12} className="animate-spin" /> : null}
              {label}
              <span className="sr-only"> {state === 'wait' ? 'waiting' : state === 'skip' ? 'not run' : state}</span>
            </span>
          )
        })}
      </div>

      {run.error && <div className="lk-diag is-bad" role="alert">{run.error}</div>}
      {diag && !run.busy && (
        <div className={`lk-diag ${diag.ok ? 'is-ok' : 'is-bad'}`} role={diag.ok ? 'status' : 'alert'} data-testid="link-line" data-key={diag.key}>
          {diag.line}
          {diag.fix && (
            <div className="lk-diag-fix">
              <button className="btn" onClick={() => onFix(diag.fix!)} data-testid="link-fix">
                {fixLabel(diag.fix)}
              </button>
            </div>
          )}
        </div>
      )}
      {!full && !run.error && <div className="lk-caption build-muted">{many.column || one.column ? 'Now the other end.' : LINK_TEXT.idle}</div>}
      {diag && !run.busy && (
        <div className="lk-result" data-testid="link-result">
          {diag.result}
        </div>
      )}
      {diag && !run.busy && diag.notes.length > 0 && (
        <ul className="lk-notes">
          {diag.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {peek && diag && !run.busy && (
        <div className="lk-peek" data-testid="link-peek">
          {LINK_TEXT.peekTitle}
          <table>
            <tbody>
              {peek.top.map(([name, revenue]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{money(revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="build-muted">{fmt(peek.rows)} rows after the join.</div>
        </div>
      )}

      {sql && (
        <FoldedSql summary="Show the SQL" sql={sql}>
          <button className="btn" onClick={() => addTab(sql, 'link check')}>
            <ExternalLink size={14} /> Open in a tab
          </button>
        </FoldedSql>
      )}
      <button className="btn btn-primary" disabled={!diag?.ok || run.busy} onClick={onCreate} data-testid="link-create">
        <Link2 size={14} /> Create link
      </button>
      {hint > 0 && (
        <ul className="m-0 pl-5" style={{ fontSize: 13 }} data-testid="link-hints">
          {hints.slice(0, hint).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {hint < hints.length && (
        <button className="btn" onClick={() => setHint(hint + 1)}>
          <Lightbulb size={14} /> {hint === 0 ? 'Hint' : 'Another hint'}
        </button>
      )}
    </aside>
  )
}

export type { Slot }
