// The canvas of Clean (design docs/clean-canvas-design.md, 1): ribbon, queries pane, SQL of the step, the grid, Applied steps and the
// status bar, for one source at a time. A click on a step shows the table after that step; the SQL line always says what that step ran.
// ✕ rebuilds the chain; the given step cannot be removed. The task bar above (CleanScreen) says what to do.
import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { ColumnProfile } from '../../core/buildProfile'
import type { ResultData } from '../../core/check'
import { typeFamily } from '../../core/buildLinks'
import { CLEAN_COLUMNS, addSpec, chainSql, previewAtSql, removeSpec, rowsChange, shownSql, stepsOf, typesAtSql, type BuildWork, type StepKind, type StepSpec } from '../../core/buildSteps'
import { BUILD_SOURCES, sourceById, type BuildSourceId } from '../../data/build/kaiyoSales'
import { clearProfiles, previewSales, previewSalesAt, profileAt, salesErrors, stepCounts, stepErrors, type ErrorColumn, type SalesPreview } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { addTab } from '../store'
import { FoldedSql, fmtN } from './BuildTable'
import { CleanRibbon } from './CleanRibbon'
import { ProfileStrip } from './ProfileStrip'
import './errors.css'

export const GRID_ROWS = 50

export interface PanelProps {
  source: BuildSourceId
  work: BuildWork
  ready: boolean
  /** bumped after every rebuild of a clean table, so the preview reloads */
  rev: number
  /** sets the source's steps and rebuilds its clean table; resolves with an error message or null */
  onChange: (source: BuildSourceId, specs: StepSpec[]) => Promise<string | null>
  onSource: (source: BuildSourceId) => void
  /** the column the Model step sent the learner to fix (selected on arrival), or none */
  focusColumn?: { source: BuildSourceId; column: string }
  /** open problems per source (the dot in the queries pane) */
  openCount: Record<BuildSourceId, number>
  /** shown in the centre in place of the grid (W) */
  centre?: ReactNode
  /** the Advanced: SQL panel (P2 blank, P5 format), over the grid; undefined = no Advanced button */
  advanced?: ReactNode
  advancedOpen: boolean
  onAdvanced: () => void
}

const TYPE_MARK: Record<string, string> = { text: 'ABC', number: '123', date: 'date', other: '?' }

export function StepsPanel({ source, work, ready, rev, onChange, onSource, focusColumn, openCount, centre, advanced, advancedOpen, onAdvanced }: PanelProps) {
  const connected = work.connected.includes(source)
  const specs = work.steps[source]
  const steps = stepsOf(source, specs)
  const cols = CLEAN_COLUMNS[source]
  const sales = source === 'sales'
  const [data, setData] = useState<ResultData | null>(null)
  const [types, setTypes] = useState<string[]>([])
  /** the table after this step is on show: 0 = the file as loaded, n = after step n; null = the latest */
  const [viewAt, setViewAt] = useState<number | null>(null)
  const [sel, setSel] = useState<string | null>(focusColumn && focusColumn.source === source ? focusColumn.column : null)
  /** rows of bronze, then after each step; null while loading */
  const [counts, setCounts] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // [Error] cells (sales): the grid with its mask, rows that have one, per step, per column
  const [errOnly, setErrOnly] = useState(false)
  const [mask, setMask] = useState<boolean[][] | null>(null)
  const [stepErr, setStepErr] = useState<number[] | null>(null)
  const [colErr, setColErr] = useState<Record<ErrorColumn, number> | null>(null)
  /** the column profile of the table on show (null while loading) */
  const [profile, setProfile] = useState<ColumnProfile[] | null>(null)

  const latest = steps.length
  const k = Math.min(viewAt ?? latest, latest)
  const fullSql = connected ? chainSql(source, steps) : ''

  useEffect(() => {
    setSel(focusColumn && focusColumn.source === source ? focusColumn.column : null)
    setError(null)
    setNote(null)
    setErrOnly(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])
  // a step added or removed brings the grid back to the latest table
  useEffect(() => setViewAt(null), [source, latest])

  // the files or the clean tables changed: what was measured is stale (read before the load effect below)
  useEffect(() => clearProfiles(), [rev])

  useEffect(() => {
    if (!ready || !connected) {
      setData(null)
      return
    }
    let alive = true
    void (async () => {
      try {
        const atLatest = k === latest
        const [d, t, c, se, ce, pr] = await Promise.all([
          sales && atLatest ? previewSales(enginePort, errOnly, GRID_ROWS) : sales && k > 0 ? previewSalesAt(enginePort, work.steps.sales, k, GRID_ROWS) : enginePort.query(previewAtSql(source, steps, k, GRID_ROWS)),
          enginePort.query(typesAtSql(source, steps, k)),
          stepCounts(enginePort, source, work.steps[source]),
          sales ? stepErrors(enginePort, work.steps.sales) : Promise.resolve(null),
          sales ? salesErrors(enginePort) : Promise.resolve(null),
          profileAt(enginePort, source, work.steps[source], k),
        ])
        if (alive) {
          const prev = 'errors' in d ? (d as SalesPreview | { data: ResultData; errors: boolean[][] }) : null
          setMask(prev ? prev.errors : null)
          setData(prev ? prev.data : (d as ResultData))
          setTypes(t.rows[0]?.map(String) ?? [])
          setStepErr(se)
          setColErr(ce)
          setCounts(c)
          setProfile(pr)
        }
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e))
      }
    })()
    return () => {
      alive = false
    }
    // the chain is read through fullSql (steps are rebuilt every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, connected, source, rev, errOnly, k, fullSql])

  const apply = async (next: StepSpec[]) => {
    setBusy(true)
    setError(null)
    setNote(null)
    const err = await onChange(source, next)
    if (err) setError(err)
    setBusy(false)
  }
  const add = (kind: StepKind, params: Record<string, string> = {}) => void apply(addSpec(specs, kind, params))
  const off = !ready || !connected || busy
  const errCells = colErr ? Object.values(colErr).reduce((a, b) => a + b, 0) : 0
  const stepSql = k === 0 ? `SELECT * FROM ${sourceById(source).bronze}` : shownSql(steps, k - 1)

  return (
    <section className="cc" data-testid="build-panel">
      {connected && (
        <CleanRibbon source={source} selected={sel} off={off} busy={busy} onAdd={add} onAdvanced={advanced ? onAdvanced : undefined} advancedOpen={advancedOpen} />
      )}
      <div className="cc-body">
        <div className="cc-queries" role="tablist" aria-label="Source" data-testid="clean-queries">
          <div className="cc-pane-title">Queries</div>
          {BUILD_SOURCES.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === source} className={`cc-query${s.id === source ? ' is-on' : ''}`} onClick={() => onSource(s.id)}>
              <span className="cc-query-name">{s.label}</span>
              {openCount[s.id] > 0 && (
                <span className="cc-dot" title={`${openCount[s.id]} open ${openCount[s.id] === 1 ? 'problem' : 'problems'}`} data-testid={`clean-dot-${s.id}`}>
                  {openCount[s.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="cc-centre">
          {!connected ? (
            <div className="build-muted">This source is not connected yet. Go back to Connect.</div>
          ) : (
            <>
              {advancedOpen && advanced && (
                <div className="cc-advanced" data-testid="clean-advanced-panel">
                  <div className="cc-pane-title">Advanced: SQL</div>
                  {advanced}
                </div>
              )}
              {error && (
                <div className="build-error" role="alert">
                  {error}
                </div>
              )}
              {centre ? (
                <div className="cc-watch">{centre}</div>
              ) : (
                <>
                  <pre className="cc-sql pl-code" data-testid="clean-step-sql" aria-label={`SQL of this step`}>
                    {stepSql}
                  </pre>
                  {sales && colErr && (
                    <div className="build-errbar" data-testid="build-errbar">
                      {errCells > 0 ? (
                        <>
                          <span className="build-errchip" data-testid="build-errors">
                            Errors: {(Object.entries(colErr) as [ErrorColumn, number][]).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${fmtN(n)}`).join(' · ')}
                          </span>
                          {k === latest && (
                            <button className="btn" onClick={() => setErrOnly((v) => !v)} data-testid="build-show-errors" aria-pressed={errOnly}>
                              {errOnly ? 'Show all rows' : 'Show error rows'}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="build-errchip is-clear" data-testid="build-errors">No errors</span>
                      )}
                    </div>
                  )}
                  <Grid data={data} types={types} mask={mask} profile={profile} source={source} selected={sel} onSelect={(c) => setSel((x) => (x === c ? null : c))} caption={`${sourceById(source).clean} after step ${k}`} />
                </>
              )}
            </>
          )}
        </div>
        {connected && (
          <aside className="cc-steps" aria-label="Applied steps">
            <div className="cc-pane-title">Applied steps</div>
            <ol className="build-steps" data-testid="build-steps">
              <li className={`build-step is-source${k === 0 ? ' is-viewing' : ''}`}>
                <button className="cc-step-main" aria-current={k === 0 ? 'true' : undefined} onClick={() => setViewAt(0)} title="Show the table as it was loaded">
                  <span className="build-step-label">Source: {sourceById(source).bronze}</span>
                  {counts && <span className="build-count">{fmtN(counts[0])} rows</span>}
                </button>
              </li>
              {steps.map((st, i) => (
                <li key={st.id} className={`build-step${stepErr && stepErr[i] > 0 ? ' is-failing' : ''}${k === i + 1 ? ' is-viewing' : ''}`} data-testid="build-step">
                  <div className="build-step-row">
                    <button className="cc-step-main" aria-current={k === i + 1 ? 'true' : undefined} onClick={() => setViewAt(i + 1)} title="Show the table after this step">
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
                    </button>
                    {st.given ? (
                      <span className="build-badge">given</span>
                    ) : (
                      <button className="build-x" disabled={off} aria-label={`Remove step: ${st.label}`} title="Remove this step" onClick={() => void apply(removeSpec(specs, st.id))}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
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
          </aside>
        )}
      </div>
      {connected && (
        <div className="cc-status" data-testid="build-rows" role="status">
          <span>Columns <b>{cols.length}</b></span>
          <span data-testid="build-rows-change">
            {counts && counts.length > k ? (
              k === 0 ? (
                <>
                  Rows <b>{fmtN(counts[0])}</b> as loaded
                </>
              ) : (
                <>Rows {rowsChange(counts[k - 1], counts[k])}</>
              )
            ) : (
              'Rows …'
            )}
          </span>
          <span>First {GRID_ROWS} rows shown</span>
          {k !== latest && <span className="cc-status-old">Showing the table after step {k}, not the latest</span>}
        </div>
      )}
    </section>
  )
}

/** The table as a grid: a click on a header selects the column (accent outline); the column profile strip sits under the name. */
function Grid({ data, types, mask, profile, source, selected, onSelect, caption }: { data: ResultData | null; types: string[]; mask: boolean[][] | null; profile: ColumnProfile[] | null; source: BuildSourceId; selected: string | null; onSelect: (c: string) => void; caption: string }) {
  if (!data) return <div className="build-muted">Loading…</div>
  return (
    <div className="cc-grid" tabIndex={0} role="region" aria-label={caption} data-testid="clean-grid">
      <table className="build-table">
        <thead>
          <tr>
            {data.header.map((c, j) => {
              const fam = typeFamily(types[j] ?? '')
              return (
                <th key={c} className={selected === c ? 'is-selected' : undefined}>
                  <button className="cc-head" aria-pressed={selected === c} onClick={() => onSelect(c)} data-testid={`clean-col-${c}`}>
                    <span className="cc-type" title={types[j]?.toLowerCase()}>{TYPE_MARK[fam]}</span>
                    <span className="cc-head-name">{c}</span>
                  </button>
                  <div className="cc-profile-slot" data-col={c}>
                    {profile?.find((x) => x.col === c) && <ProfileStrip source={source} p={profile.find((x) => x.col === c)!} />}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={mask?.[i]?.[j] ? 'is-error' : c === null ? 'is-null' : undefined} data-error={mask?.[i]?.[j] ? 'true' : undefined}>
                  {mask?.[i]?.[j] ? '[Error]' : c === null ? 'null' : String(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
