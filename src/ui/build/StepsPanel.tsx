// The working panel of one source in Clean (spec 2.6): a preview of its clean table, the toolbar with the four v1 buttons
// and their settings, and the list of applied steps (✕ rebuilds the chain; the given step cannot be removed).
import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import type { ResultData } from '../../core/check'
import { CLEAN_COLUMNS, addSpec, chainSql, removeSpec, shownSql, stepsOf, type BuildWork, type StepSpec } from '../../core/buildSteps'
import { BUILD_SOURCES, sourceById, type BuildSourceId } from '../../data/build/kaiyoSales'
import { previewTable } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { addTab } from '../store'
import { BuildTable, FoldedSql, fmtN } from './BuildTable'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [col, setCol] = useState(cols.includes('sku_code') ? 'sku_code' : cols[0])
  const [key, setKey] = useState(cols.includes('customer_id') ? 'customer_id' : cols[0])
  const [order, setOrder] = useState(cols.includes('updated_at') ? 'updated_at' : cols[cols.length - 1])
  const [dir, setDir] = useState<'newest' | 'oldest'>('newest')

  useEffect(() => {
    const c = CLEAN_COLUMNS[source]
    setCol(c.includes('sku_code') ? 'sku_code' : c[0])
    setKey(c.includes('customer_id') ? 'customer_id' : c[0])
    setOrder(c.includes('updated_at') ? 'updated_at' : c[c.length - 1])
    setError(null)
    setNote(null)
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
        const [d, n] = await Promise.all([previewTable(enginePort, clean), enginePort.query(`SELECT count(*) FROM build_kaiyo.${clean}`)])
        if (alive) {
          setData(d)
          setRows(Number(n.rows[0][0]))
        }
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e))
      }
    })()
    return () => {
      alive = false
    }
  }, [ready, connected, source, rev])

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
            {sourceById(source).clean}: {rows === null ? '…' : fmtN(rows)} rows
          </div>
          <BuildTable data={data} caption={`${sourceById(source).clean}, first rows`} />
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
            {busy && <Loader2 size={14} className="animate-spin" />}
          </div>
          {error && <div className="build-error" role="alert">{error}</div>}
          <div>
            <div className="build-steps-title">Applied steps</div>
            <ol className="build-steps" data-testid="build-steps">
              <li className="build-step is-source">
                <span className="build-step-label">Source: {sourceById(source).bronze}</span>
              </li>
              {steps.map((st, i) => (
                <li key={st.id} className="build-step" data-testid="build-step">
                  <div className="build-step-row">
                    <span className="build-step-label">{st.label}</span>
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
