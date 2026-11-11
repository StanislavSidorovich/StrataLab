// Step 4 of the build page: the Dashboard (spec section 5). Three tiles over the gold tables: a number, a line and bars
// of chains, each SQL a plain SELECT with one blank. The step is done when all three pass.
import { useEffect, useState, type ReactNode } from 'react'
import type { Table } from 'apache-arrow'
import { Check, CheckCircle2, Lightbulb, Loader2 } from 'lucide-react'
import { dashboardDone, tileSql } from '../../core/buildDashboard'
import { removePin } from '../../core/buildMore'
import { slicerAdds, sliceOn, toggleSlice, type SliceVariant } from '../../core/buildSlice'
import type { ResultData } from '../../core/check'
import type { BuildWork } from '../../core/buildSteps'
import { TILE_CARDS, TILE_IDS, TILE_SQL, T, TILE_TABLE, type TileCard, type TileId } from '../../data/build/kaiyoSales'
import { runTile, type TileRun } from '../../db/buildRun'
import { slicedSql, withSlice } from '../../db/buildSlice'
import { query } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { ChartView } from '../Chart'
import { BarChart } from './BarChart'
import { BuildTable, money } from './BuildTable'
import { FillButton } from './DemoContext'
import { PinnedGrid } from './PinTiles'
import { useSlice } from './SliceContext'
import { SlicerBar } from './SlicerBar'
import { StarPanel } from './StarPanel'
import './dashboard.css'
import './slicer.css'

/** What the tiles show under the slicers (the checks and the Answer always read the unfiltered tables). */
interface Sliced {
  kpi?: ResultData
  chains?: ResultData
  line?: Table
}

/** The chains tile keeps every chain: it leaves its own slicer out. */
const variantOf = (id: TileId): SliceVariant => (id === 'chains' ? 'nochain' : 'all')

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
  const { filter, setFilter } = useSlice()
  const on = sliceOn(filter)
  const [sliced, setSliced] = useState<Sliced>({})

  // a slicer is on: the passed tiles are read again from the slice (views replaced first, then the tiles, in one queue)
  useEffect(() => {
    if (!ready || !on) return setSliced({})
    let alive = true
    void (async () => {
      const next: Sliced = {}
      for (const id of TILE_IDS) {
        if (!dash.tiles.includes(id) || !runs[id]?.ok) continue
        const sql = slicedSql(tileSql(id, dash.blanks[id]), variantOf(id))
        try {
          if (id === 'line') next.line = await withSlice(enginePort, filter, () => query(sql))
          else next[id] = await withSlice(enginePort, filter, () => enginePort.query(sql))
        } catch {
          /* the tile keeps the unfiltered picture */
        }
      }
      if (alive) setSliced(next)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, on, filter.chain, filter.brand, dash.tiles.join(','), runs])

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
      slicerSql={on && runs[id]?.ok && dash.tiles.includes(id) ? slicerAdds(tileSql(id, dash.blanks[id]), filter, variantOf(id)) : null}
      filtered={on && id === 'kpi'}
    >
      {id === 'kpi' && runs.kpi?.data && runs.kpi.ok && (
        <>
          <div className="bd-kpi" data-testid="tile-kpi-value">
            {(() => {
              const v = on && sliced.kpi ? sliced.kpi.rows[0]?.[0] : runs.kpi.data.rows[0][0]
              return v == null ? '–' : money(v as string)
            })()}
          </div>
          {work.peek && !on && (
            <div className="bd-peek" data-testid="tile-kpi-peek">
              Your Quick look showed {money(work.peek.kpi)}. Cleaning took out the sales sent twice and the stores counted twice.
            </div>
          )}
        </>
      )}
      {id === 'kpi' && runs.kpi?.data && !runs.kpi.ok && <BuildTable data={runs.kpi.data} caption="KPI tile result" />}
      {id === 'line' && lineTable && (
        <div className="bd-chart" data-testid="tile-line-chart">
          <ChartView table={on && sliced.line ? sliced.line : lineTable} tabId="build-line" fileName="kaiyo-revenue-by-month" />
        </div>
      )}
      {id === 'chains' && runs.chains?.data && runs.chains.ok && (
        <>
          <BarChart data={on && sliced.chains ? sliced.chains : runs.chains.data} label="Revenue by chain" selected={filter.chain} onPick={(name) => setFilter(toggleSlice(filter, 'chain', name))} />
          <p className="build-muted sl-note">Click a bar to slice by that chain. This tile ignores the Chain slicer: every chain stays, the one you picked is lit.</p>
        </>
      )}
      {id === 'chains' && runs.chains?.data && !runs.chains.ok && <BuildTable data={runs.chains.data} caption="Chains tile result" />}
    </Tile>
  )

  return (
    <div className="space-y-4" data-testid="build-dashboard">
      <p className="build-lead">Three tiles for the Head of Sales, all read from the star you built. Write the blank in each tile.</p>
      <StarPanel ready={ready} />
      <SlicerBar ready={ready} />
      <div className="bd-grid">
        {tile('kpi')}
        {tile('chains')}
        {tile('line', 'bd-wide')}
      </div>
      <PinnedGrid slice={filter} pins={work.more.pins} ready={ready} onRemove={(q) => setWork((w) => ({ ...w, more: { ...w.more, pins: removePin(w.more.pins, q) } }))} />
      {dashboardDone(dash.tiles) && (
        <div className="build-quick" data-testid="dashboard-done">
          <b>The dashboard is ready.</b> Next, read it and answer the question the Head of Sales asked.
        </div>
      )}
    </div>
  )
}

function Tile({ card, className, blank, onBlank, passed, result, busy, ready, onRun, slicerSql, filtered, children }: {
  card: TileCard
  className: string
  blank: string
  onBlank: (v: string) => void
  passed: boolean
  result?: TileRun
  busy: boolean
  ready: boolean
  onRun: () => void
  /** what the slicers add to this tile's SQL (null when no slicer is on) */
  slicerSql: string | null
  /** the tile shows a filtered number: not the one the Answer step checks */
  filtered: boolean
  children?: ReactNode
}) {
  const [hints, setHints] = useState(0)
  const [before, after] = TILE_SQL[card.id].split('____')
  return (
    <section className={`bd-tile ${className}${passed ? ' is-passed' : ''}`} data-testid={`tile-${card.id}`}>
      <div className="bd-tile-head">
        <div className="bd-tile-title">{card.title}</div>
        {filtered && (
          <span className="sl-tag" title="A slicer is on: this is not the number the Answer step checks" data-testid="tile-filtered">
            Filtered
          </span>
        )}
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
        <FillButton unit={{ step: 'dashboard', tile: card.id }} hidden={passed} />
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
      {slicerSql && (
        <details className="sl-sql" open data-testid={`tile-slicer-sql-${card.id}`}>
          <summary>SQL it runs with the slicers</summary>
          <pre>{slicerSql}</pre>
        </details>
      )}
    </section>
  )
}
