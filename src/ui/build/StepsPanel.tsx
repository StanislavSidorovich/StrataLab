// The working panel of one source in Clean (spec 2.6): a preview of its clean table, the toolbar with the four v1 buttons
// and their settings, and the list of applied steps (✕ rebuilds the chain; the given step cannot be removed).
import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import type { ResultData } from '../../core/check'
import { CLEAN_COLUMNS, TYPE_WORD, addSpec, chainSql, removeSpec, rowsChange, shownSql, stepsOf, type BuildWork, type StepSpec, type TypeTo } from '../../core/buildSteps'
import { BUILD_SOURCES, sourceById, type BuildSourceId } from '../../data/build/kaiyoSales'
import { previewSales, previewTable, salesErrors, stepCounts, stepErrors, type ErrorColumn, type SalesPreview } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { addTab } from '../store'
import { BuildTable, FoldedSql, fmtN } from './BuildTable'
import './errors.css'

export interface PanelProps {
  source: BuildSourceId
  work: BuildWork
  ready: boolean
  /** bumped after every rebuild of a clean table, so the preview reloads */
  rev: number
  /** sets the source's steps and rebuilds its clean table; resolves with an error message or null */
  onChange: (source: BuildSourceId, specs: StepSpec[]) => Promise<string | null>
  onSource: (source: BuildSourceId) => void
}

export function StepsPanel({ source, work, ready, rev, onChange, onSource }: PanelProps) {
  const connected = work.connected.includes(source)
  const specs = work.steps[source]
  const steps = stepsOf(source, specs)
  const cols = CLEAN_COLUMNS[source]
  const [data, setData] = useState<ResultData | null>(null)
  const [rows, setRows] = useState<number | null>(null)
  /** rows of bronze, then after each step; null while loading */
  const [counts, setCounts] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [col, setCol] = useState(source === 'sales' ? 'customer_name' : cols.includes('sku_code') ? 'sku_code' : cols[0])
  const [key, setKey] = useState(cols.includes('customer_id') ? 'customer_id' : cols[0])
  const [order, setOrder] = useState(cols.includes('updated_at') ? 'updated_at' : cols[cols.length - 1])
  const [dir, setDir] = useState<'newest' | 'oldest'>('newest')
  // Change type (sales): the column, the type, the decimal separator; Replace values: find and with
  const [tcol, setTcol] = useState('sale_date')
  const [tto, setTto] = useState<TypeTo>('date')
  const [tsep, setTsep] = useState<'point' | 'comma'>('point')
  const [find, setFind] = useState('')
  const [withText, setWithText] = useState('')
  // [Error] cells (sales): the preview with its mask, rows that have one, per step, per column
  const [errOnly, setErrOnly] = useState(false)
  const [sp, setSp] = useState<SalesPreview | null>(null)
  const [stepErr, setStepErr] = useState<number[] | null>(null)
  const [colErr, setColErr] = useState<Record<ErrorColumn, number> | null>(null)

  useEffect(() => {
    const c = CLEAN_COLUMNS[source]
    setCol(source === 'sales' ? 'customer_name' : c.includes('sku_code') ? 'sku_code' : c[0])
    setKey(c.includes('customer_id') ? 'customer_id' : c[0])
    setOrder(c.includes('updated_at') ? 'updated_at' : c[c.length - 1])
    setError(null)
    setNote(null)
    setErrOnly(false)
  }, [source])

  useEffect(() => {
    if (!ready || !connected) {
      setData(null)
      return
    }
    let alive = true
    const clean = sourceById(source).clean
    void (async () => {
      try {
        const sales = source === 'sales'
        const [d, n, c, prev, se, ce] = await Promise.all([
          previewTable(enginePort, clean),
          enginePort.query(`SELECT count(*) FROM build_kaiyo.${clean}`),
          stepCounts(enginePort, source, work.steps[source]),
          sales ? previewSales(enginePort, errOnly) : Promise.resolve(null),
          sales ? stepErrors(enginePort, work.steps.sales) : Promise.resolve(null),
          sales ? salesErrors(enginePort) : Promise.resolve(null),
        ])
        if (alive) {
          setSp(prev)
          setStepErr(se)
          setColErr(ce)
          setData(d)
          setRows(Number(n.rows[0][0]))
          setCounts(c)
        }
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e))
      }
    })()
    return () => {
      alive = false
    }
  }, [ready, connected, source, rev, errOnly])

  const apply = async (next: StepSpec[]) => {
    setBusy(true)
    setError(null)
    setNote(null)
    const err = await onChange(source, next)
    if (err) setError(err)
    setBusy(false)
  }
  const add = (kind: Parameters<typeof addSpec>[1], params: Record<string, string> = {}) => void apply(addSpec(specs, kind, params))
  const off = !ready || !connected || busy

  const select = (value: string, set: (v: string) => void, label: string) => (
    <select className="build-select" value={value} onChange={(e) => set(e.target.value)} aria-label={label} disabled={off}>
      {cols.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )

  const pickTypeColumn = (c: string) => {
    setTcol(c)
    // the usual type of the column, as a start; the learner can change it
    setTto(c === 'revenue' ? 'decimal' : c === 'units' ? 'whole' : c === 'sale_date' ? 'date' : tto)
  }
  const errCells = colErr ? Object.values(colErr).reduce((a, b) => a + b, 0) : 0

  const fullSql = connected ? chainSql(source, steps) : ''
  return (
    <section className="build-panel" data-testid="build-panel">
      <div className="build-panel-tabs" role="tablist" aria-label="Source">
        {BUILD_SOURCES.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === source} className={`build-tab${s.id === source ? ' is-on' : ''}`} onClick={() => onSource(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {!connected ? (
        <div className="build-muted">This source is not connected yet. Go back to Connect.</div>
      ) : (
        <>
          <div className="build-muted" data-testid="build-rows">
            {counts && rows !== null ? (
              <span data-testid="build-rows-change">
                {sourceById(source).bronze}: <b>{fmtN(counts[0])} rows</b> → {sourceById(source).clean}: <b>{fmtN(rows)} rows</b>
              </span>
            ) : (
              <>
                {sourceById(source).clean}: {rows === null ? '…' : fmtN(rows)} rows
              </>
            )}
          </div>
          {source === 'sales' && colErr && (
            <div className="build-errbar" data-testid="build-errbar">
              {errCells > 0 ? (
                <>
                  <span className="build-errchip" data-testid="build-errors">
                    Errors: {(Object.entries(colErr) as [ErrorColumn, number][]).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${fmtN(n)}`).join(' · ')}
                  </span>
                  <button className="btn" onClick={() => setErrOnly((v) => !v)} data-testid="build-show-errors" aria-pressed={errOnly}>
                    {errOnly ? 'Show all rows' : 'Show error rows'}
                  </button>
                </>
              ) : (
                <span className="build-errchip is-clear" data-testid="build-errors">No errors</span>
              )}
            </div>
          )}
          <BuildTable data={source === 'sales' && sp ? sp.data : data} errors={source === 'sales' && sp ? sp.errors : undefined} caption={`${sourceById(source).clean}, ${source === 'sales' && errOnly ? 'rows with an error' : 'first rows'}`} />
          <div className="build-toolbar" role="group" aria-label="Buttons">
            <div className="build-tool">
              <button className="btn" disabled={off} onClick={() => add('distinct')}>Remove duplicates</button>
            </div>
            <div className="build-tool">
              <button className="btn" disabled={off} onClick={() => add('trim', { column: col })}>Trim</button>
              {select(col, setCol, 'Column to trim, uppercase or extract the number from')}
              <button className="btn" disabled={off} onClick={() => add('upper', { column: col })}>Uppercase</button>
              <button className="btn" disabled={off} onClick={() => add('extract', { column: col })} title="Keep the digits of a text as a whole number: R-03 becomes 3">Extract number</button>
            </div>
            <div className="build-tool">
              <button className="btn" disabled={off} onClick={() => add('latest', { key, order, direction: dir })}>Keep latest row per key</button>
              <label className="build-set">key {select(key, setKey, 'Key')}</label>
              <label className="build-set">order by {select(order, setOrder, 'Order column')}</label>
              <select className="build-select" value={dir} onChange={(e) => setDir(e.target.value as 'newest' | 'oldest')} aria-label="Newest or oldest" disabled={off}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
            <div className="build-tool">
              <button className="btn" disabled={off || !find} onClick={() => add('replace', { column: col, find, with: withText })} title="Replace a piece of text in the column chosen next to Trim" data-testid="build-replace">Replace values</button>
              <label className="build-set">
                find <input className="build-input" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find" spellCheck={false} disabled={off} />
              </label>
              <label className="build-set">
                with <input className="build-input" value={withText} onChange={(e) => setWithText(e.target.value)} aria-label="Replace with" spellCheck={false} disabled={off} />
              </label>
            </div>
            {source === 'sales' && (
              <div className="build-tool">
                <button className="btn" disabled={off} onClick={() => add('type', { column: tcol, to: tto, sep: tto === 'date' ? 'point' : tsep })} data-testid="build-change-type">Change type</button>
                <label className="build-set">column {select(tcol, pickTypeColumn, 'Column to change the type of')}</label>
                <label className="build-set">
                  to
                  <select className="build-select" value={tto} onChange={(e) => setTto(e.target.value as TypeTo)} aria-label="Type" disabled={off}>
                    {(Object.keys(TYPE_WORD) as TypeTo[]).map((t) => (
                      <option key={t} value={t}>{TYPE_WORD[t]}</option>
                    ))}
                  </select>
                </label>
                {tto !== 'date' && (
                  <label className="build-set">
                    decimal separator
                    <select className="build-select" value={tsep} onChange={(e) => setTsep(e.target.value as 'point' | 'comma')} aria-label="Decimal separator" disabled={off}>
                      <option value="point">point (3.5)</option>
                      <option value="comma">comma (3,5)</option>
                    </select>
                  </label>
                )}
              </div>
            )}
            {busy && <Loader2 size={14} className="animate-spin" />}
          </div>
          {error && <div className="build-error" role="alert">{error}</div>}
          <div>
            <div className="build-steps-title">Applied steps</div>
            <ol className="build-steps" data-testid="build-steps">
              <li className="build-step is-source">
                <span className="build-step-label">Source: {sourceById(source).bronze}</span>
                {counts && <span className="build-count">{fmtN(counts[0])} rows</span>}
              </li>
              {steps.map((st, i) => (
                <li key={st.id} className={`build-step${stepErr && stepErr[i] > 0 ? ' is-failing' : ''}`} data-testid="build-step">
                  <div className="build-step-row">
                    <span className="build-step-label">{st.label}</span>
                    {counts && counts.length > i + 1 && (
                      <span className="build-count" data-testid="build-step-rows">
                        {rowsChange(counts[i], counts[i + 1])}
                      </span>
                    )}
                    {stepErr && stepErr[i] > 0 && (
                      <span className="build-err-badge" data-testid="build-step-errors">
                        {fmtN(stepErr[i])} rows [Error]
                      </span>
                    )}
                    {st.given ? (
                      <span className="build-badge">given</span>
                    ) : (
                      <button className="build-x" disabled={off} aria-label={`Remove step: ${st.label}`} title="Remove this step" onClick={() => void apply(removeSpec(specs, st.id))}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <FoldedSql summary="SQL" sql={shownSql(steps, i)} />
                </li>
              ))}
            </ol>
            <FoldedSql summary="View full SQL" sql={fullSql}>
              <button
                className="btn"
                onClick={() => {
                  addTab(fullSql, `clean_${source}`)
                  setNote('Opened as a tab in the workbench behind this page. Close the page (✕) to see it.')
                }}
              >
                <ExternalLink size={14} /> Open in a tab
              </button>
              {note && <span className="build-muted" style={{ marginLeft: 8 }}>{note}</span>}
            </FoldedSql>
          </div>
        </>
      )}
    </section>
  )
}
