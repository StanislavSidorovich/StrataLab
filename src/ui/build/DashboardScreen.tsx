// Step 4 of the build page: the Dashboard (spec section 5). Three tiles over the gold tables: a number, a line and bars
// of chains, each SQL a plain SELECT with one blank. The step is done when all three pass.
import { useEffect, useState, type ReactNode } from 'react'
import type { Table } from 'apache-arrow'
import { Check, CheckCircle2, Lightbulb, Loader2 } from 'lucide-react'
import { dashboardDone } from '../../core/buildDashboard'
import { removePin } from '../../core/buildMore'
import type { BuildWork } from '../../core/buildSteps'
import { TILE_CARDS, TILE_IDS, TILE_SQL, T, TILE_TABLE, type TileCard, type TileId } from '../../data/build/kaiyoSales'
import { runTile, type TileRun } from '../../db/buildRun'
import { query } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { ChartView } from '../Chart'
import { BarChart } from './BarChart'
import { BuildTable, money } from './BuildTable'
import { PinnedGrid } from './PinTiles'
import { StarPanel } from './StarPanel'
import './dashboard.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
}

export function DashboardScreen({ work, setWork, ready }: Props) {
  const [runs, setRuns] = useState<Partial<Record<TileId, TileRun>>>({})
  const [lineTable, setLineTable] = useState<Table | null>(null)
  const [busy, setBusy] = useState<TileId | null>(null)
  const dash = work.dash

  const run = async (id: TileId, blank: string) => {
    setBusy(id)
    try {
      const r = await runTile(enginePort, id, blank)
      setRuns((x) => ({ ...x, [id]: r }))
      if (id === 'line') setLineTable(r.data ? await query(`SELECT * FROM ${T(TILE_TABLE.line)}`) : null)
      setWork((w) => ({ ...w, dash: { ...w.dash, tiles: TILE_IDS.filter((t) => (t === id ? r.ok : w.dash.tiles.includes(t))) } }))
    } catch (e) {
      setRuns((x) => ({ ...x, [id]: { ok: false, line: String(e instanceof Error ? e.message : e), data: null } }))
    } finally {
      setBusy(null)
    }
  }

  // the page was opened again: show the tiles that had passed
  useEffect(() => {
    if (!ready) return
    void (async () => {
      for (const id of dash.tiles) await run(id, dash.blanks[id])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const card = (id: TileId) => TILE_CARDS.find((c) => c.id === id)!
  const tile = (id: TileId, className = '') => (
    <Tile
      key={id}
      card={card(id)}
      className={className}
      blank={dash.blanks[id]}
      onBlank={(v) => setWork((w) => ({ ...w, dash: { ...w.dash, blanks: { ...w.dash.blanks, [id]: v } } }))}
      passed={dash.tiles.includes(id)}
      result={runs[id]}
      busy={busy === id}
      ready={ready && busy === null}
      onRun={() => void run(id, dash.blanks[id])}
    >
      {id === 'kpi' && runs.kpi?.data && runs.kpi.ok && (
        <>
          <div className="bd-kpi" data-testid="tile-kpi-value">{money(runs.kpi.data.rows[0][0] as string)}</div>
          {work.peek && (
            <div className="bd-peek" data-testid="tile-kpi-peek">
              Your Quick look showed {money(work.peek.kpi)}. Cleaning took out the sales sent twice and the stores counted twice.
            </div>
          )}
        </>
      )}
      {id === 'kpi' && runs.kpi?.data && !runs.kpi.ok && <BuildTable data={runs.kpi.data} caption="KPI tile result" />}
      {id === 'line' && lineTable && (
        <div className="bd-chart" data-testid="tile-line-chart">
          <ChartView table={lineTable} tabId="build-line" fileName="kaiyo-revenue-by-month" />
        </div>
      )}
      {id === 'chains' && runs.chains?.data && runs.chains.ok && <BarChart data={runs.chains.data} label="Revenue by chain" />}
      {id === 'chains' && runs.chains?.data && !runs.chains.ok && <BuildTable data={runs.chains.data} caption="Chains tile result" />}
    </Tile>
  )

  return (
    <div className="space-y-4" data-testid="build-dashboard">
      <p className="build-lead">Three tiles for the Head of Sales, all read from the star you built. Write the blank in each tile.</p>
      <StarPanel ready={ready} />
      <div className="bd-grid">
        {tile('kpi')}
        {tile('chains')}
        {tile('line', 'bd-wide')}
      </div>
      <PinnedGrid pins={work.more.pins} ready={ready} onRemove={(q) => setWork((w) => ({ ...w, more: { ...w.more, pins: removePin(w.more.pins, q) } }))} />
      {dashboardDone(dash.tiles) && (
        <div className="build-quick" data-testid="dashboard-done">
          <b>The dashboard is ready.</b> Next, read it and answer the question the Head of Sales asked.
        </div>
      )}
    </div>
  )
}

function Tile({ card, className, blank, onBlank, passed, result, busy, ready, onRun, children }: {
  card: TileCard
  className: string
  blank: string
  onBlank: (v: string) => void
  passed: boolean
  result?: TileRun
  busy: boolean
  ready: boolean
  onRun: () => void
  children?: ReactNode
}) {
  const [hints, setHints] = useState(0)
  const [before, after] = TILE_SQL[card.id].split('____')
  return (
    <section className={`bd-tile ${className}${passed ? ' is-passed' : ''}`} data-testid={`tile-${card.id}`}>
      <div className="bd-tile-head">
        <div className="bd-tile-title">{card.title}</div>
        {passed && (
          <span className="build-ok">
            <Check size={14} /> Passed
          </span>
        )}
      </div>
      <p style={{ margin: 0 }}>{card.prompt}</p>
      <pre className="pl-code" data-testid={`tile-${card.id}-sql`}>
        {before}
        <input
          className="pl-blank"
          aria-label={`The blank of the ${card.title} tile`}
          spellCheck={false}
          autoComplete="off"
          value={blank}
          placeholder="____"
          size={Math.max(8, Math.min(60, blank.length + 1))}
          onChange={(e) => onBlank(e.target.value.replace(/\r?\n/g, ' '))}
          onKeyDown={(e) => e.key === 'Enter' && ready && onRun()}
        />
        {after}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!ready} onClick={onRun} data-testid={`tile-run-${card.id}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Run and check
        </button>
        {card.hints.length > 0 && hints < card.hints.length && (
          <button className="btn" onClick={() => setHints(hints + 1)}>
            <Lightbulb size={14} /> {hints === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
      </div>
      {hints > 0 && (
        <ul className="m-0 pl-5" style={{ fontSize: 13 }}>
          {card.hints.slice(0, hints).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {result && !result.ok && (
        <div className="build-error" role="alert" data-testid={`tile-line-${card.id}`}>
          {result.line}
        </div>
      )}
      {children}
    </section>
  )
}
