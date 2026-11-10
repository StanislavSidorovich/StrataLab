// The Answer step shows the dashboard again, read only: the same three visuals, compact, drawn from the tables the tiles
// made. The tiles are run again with the learner's saved blanks, so it also works after the page was opened afresh.
import { useEffect, useState } from 'react'
import type { Table } from 'apache-arrow'
import { money } from './BuildTable'
import { BarChart } from './BarChart'
import { ChartView } from '../Chart'
import { PinTile, usePinResults } from './PinTiles'
import type { ResultData } from '../../core/check'
import type { BuildWork } from '../../core/buildSteps'
import { TILE_CARDS, TILE_IDS, TILE_TABLE, T, type TileId } from '../../data/build/kaiyoSales'
import { runTile } from '../../db/buildRun'
import { query } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import './dashboard.css'

interface Views {
  kpi: ResultData | null
  chains: ResultData | null
  line: Table | null
}

export function DashCopy({ work, ready }: { work: BuildWork; ready: boolean }) {
  const [views, setViews] = useState<Views>({ kpi: null, chains: null, line: null })
  const [error, setError] = useState<string | null>(null)
  const blanks = work.dash.blanks
  const pinResults = usePinResults(work.more.pins, ready)

  useEffect(() => {
    if (!ready) return
    let alive = true
    void (async () => {
      try {
        const next: Views = { kpi: null, chains: null, line: null }
        for (const id of TILE_IDS) {
          const r = await runTile(enginePort, id, blanks[id])
          if (!r.ok || !r.data) continue
          if (id === 'line') next.line = await query(`SELECT * FROM ${T(TILE_TABLE.line)}`)
          else next[id] = r.data
        }
        if (alive) setViews(next)
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e))
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const title = (id: TileId) => TILE_CARDS.find((c) => c.id === id)!.title
  return (
    <aside className="ba-dash" aria-label="Your dashboard" data-testid="answer-dashboard">
      <div className="ba-dash-title">Your dashboard</div>
      {error && <div className="build-error">{error}</div>}
      <section className="ba-dash-tile" data-testid="copy-kpi">
        <div className="bd-tile-title">{title('kpi')}</div>
        {views.kpi ? <div className="bd-kpi">{money(views.kpi.rows[0][0] as string)}</div> : <div className="build-muted">{ready ? 'Loading…' : 'Waiting for the data…'}</div>}
      </section>
      <section className="ba-dash-tile" data-testid="copy-line">
        <div className="bd-tile-title">{title('line')}</div>
        {views.line ? (
          <div className="bd-chart">
            <ChartView table={views.line} tabId="build-line-copy" fileName="kaiyo-revenue-by-month" />
          </div>
        ) : (
          <div className="build-muted">{ready ? 'Loading…' : 'Waiting for the data…'}</div>
        )}
      </section>
      <section className="ba-dash-tile" data-testid="copy-chains">
        <div className="bd-tile-title">{title('chains')}</div>
        {views.chains ? <BarChart data={views.chains} label={title('chains')} compact /> : <div className="build-muted">{ready ? 'Loading…' : 'Waiting for the data…'}</div>}
      </section>
      {work.more.pins.map((p) => (
        <PinTile key={p.q} pin={p} loaded={pinResults[p.q]} compact />
      ))}
    </aside>
  )
}
