// Step 1 of the build page: Connect (spec 2.5). One card per source on the desk with a preview of the file and a Connect
// button, then the Quick look at the dirty numbers (hub addition) once all four are in.
import { useEffect, useState } from 'react'
import { Check, Database, Loader2, Plug } from 'lucide-react'
import type { ResultData } from '../../core/check'
import type { BuildWork } from '../../core/buildSteps'
import { BUILD_SOURCES, CONNECT_SQL, QUICK_LOOK_SQL, QUICK_LOOK_TEXT, sourceById, type BuildSourceId } from '../../data/build/kaiyoSales'
import { applySteps, connect, describeTable, previewFile, previewTable, quickLook } from '../../db/buildRun'
import { checkpoint } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { refreshCatalog } from '../store'
import { BuildTable, FoldedSql, fmtN, money, shortType } from './BuildTable'
import { FillButton } from './DemoContext'

type Props = { work: BuildWork; setWork: (f: (w: BuildWork) => BuildWork) => void; ready: boolean }

/** The 30 registered names of the sales exports (the same ones `prepare` registers), for showing the SQL. */
const SALES_NAMES = Array.from({ length: 30 }, (_, i) => `build_kaiyo/sales/export_${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}.csv`)

const BLURB: Record<BuildSourceId, string> = {
  sales: 'A folder of 30 monthly exports from the distributors, January 2024 to June 2026. Every line is one sale as the distributor wrote it.',
  customers: 'Kaiyo’s list of stores and distributors, one row per customer.',
  products: 'The product list: one row per SKU, with brand and category.',
  regions: 'The prefectures Kaiyo sells in, with their macro region.',
}

export function ConnectScreen({ work, setWork, ready }: Props) {
  const [previews, setPreviews] = useState<Partial<Record<BuildSourceId, ResultData>>>({})
  const [bronze, setBronze] = useState<Partial<Record<BuildSourceId, { data: ResultData; types: Record<string, string> }>>>({})
  const [busy, setBusy] = useState<BuildSourceId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    let alive = true
    void (async () => {
      for (const s of BUILD_SOURCES) {
        try {
          if (work.connected.includes(s.id)) {
            const [data, cols] = await Promise.all([previewTable(enginePort, s.bronze), describeTable(enginePort, s.bronze)])
            if (alive) setBronze((b) => ({ ...b, [s.id]: { data, types: Object.fromEntries(cols.map((c) => [c.name, shortType(c.type)])) } }))
          } else {
            const data = await previewFile(enginePort, s.id)
            if (alive) setPreviews((p) => ({ ...p, [s.id]: data }))
          }
        } catch (e) {
          if (alive) setError(String(e instanceof Error ? e.message : e))
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, work.connected.join(',')])

  const doConnect = async (id: BuildSourceId) => {
    setBusy(id)
    setError(null)
    try {
      await connect(enginePort, id)
      await applySteps(enginePort, id, work.steps[id])
      await checkpoint()
      await refreshCatalog()
      setWork((w) => (w.connected.includes(id) ? w : { ...w, connected: BUILD_SOURCES.map((s) => s.id).filter((x) => x === id || w.connected.includes(x)) }))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(null)
    }
  }

  const all = work.connected.length === BUILD_SOURCES.length
  return (
    <div className="space-y-4" data-testid="build-connect">
      <p className="build-lead">
        Four sources are on the desk. Connect each one: Lab reads the file into a table of its own, as it came, nothing changed. This is the bronze layer.
      </p>
      {!ready && <div className="build-muted" role="status">Preparing the data…</div>}
      <FillButton unit={{ step: 'connect' }} hidden={work.connected.length === BUILD_SOURCES.length} />
      {error && <div className="build-error" role="alert">{error}</div>}
      <div className="build-sources">
        {BUILD_SOURCES.map((s) => {
          const on = work.connected.includes(s.id)
          const b = bronze[s.id]
          return (
            <section key={s.id} className={`build-source${on ? ' is-on' : ''}`} data-testid={`build-source-${s.id}`}>
              <header className="build-source-head">
                <Database size={16} style={{ color: 'var(--accent)' }} />
                <div className="build-source-name">{s.label}</div>
                <div className="build-muted">{s.id === 'sales' ? '30 files · ' : ''}{fmtN(s.fileRows)} rows</div>
              </header>
              <p className="build-muted" style={{ margin: 0 }}>{BLURB[s.id]}</p>
              {on ? <BuildTable data={b?.data ?? null} types={b?.types} caption={`${s.bronze}, first rows`} /> : <BuildTable data={previews[s.id] ?? null} caption={`${s.label}, first rows`} />}
              <footer className="build-source-foot">
                {on ? (
                  <span className="build-ok">
                    <Check size={14} /> Connected as {s.bronze} · {fmtN(s.fileRows)} rows
                  </span>
                ) : (
                  <button className="btn btn-primary" disabled={!ready || busy !== null} onClick={() => void doConnect(s.id)}>
                    {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Connect
                  </button>
                )}
                <FoldedSql summary="SQL it runs" sql={CONNECT_SQL(sourceById(s.id), SALES_NAMES)} />
              </footer>
            </section>
          )
        })}
      </div>
      {all && ready && <QuickLook work={work} setWork={setWork} />}
    </div>
  )
}

function QuickLook({ work, setWork }: Pick<Props, 'work' | 'setWork'>) {
  const [error, setError] = useState<string | null>(null)
  const peek = work.peek
  useEffect(() => {
    if (peek) return
    let alive = true
    quickLook(enginePort)
      .then((p) => alive && setWork((w) => ({ ...w, peek: p })))
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [peek, setWork])
  return (
    <section className="build-quick" data-testid="build-quicklook">
      <h3 className="build-quick-title">{QUICK_LOOK_TEXT.title}</h3>
      <p style={{ margin: 0 }}>{QUICK_LOOK_TEXT.lead}</p>
      {error && <div className="build-error">{error}</div>}
      {peek ? (
        <div className="build-quick-nums">
          <div>
            <div className="build-muted">{QUICK_LOOK_TEXT.kpiLabel}</div>
            <div className="build-big" data-testid="quick-kpi">{money(peek.kpi)}</div>
          </div>
          <div>
            <div className="build-muted">{QUICK_LOOK_TEXT.chainLabel}</div>
            <div className="build-big" data-testid="quick-chain">
              {peek.chain} · {money(peek.chainRevenue)}
            </div>
          </div>
        </div>
      ) : (
        !error && <div className="build-muted"><Loader2 size={13} className="animate-spin inline" /> Looking…</div>
      )}
      <p className="build-remember">{QUICK_LOOK_TEXT.remember}</p>
      <FoldedSql summary="SQL of the quick look" sql={`-- revenue, January to June 2026\n${QUICK_LOOK_SQL.kpi}\n\n-- the first chain\n${QUICK_LOOK_SQL.chain}`} />
    </section>
  )
}
