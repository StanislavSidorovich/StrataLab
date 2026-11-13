// "Take it to Power BI" on the Answer step: the star the learner built, as a .zip with CSV files and a page of steps.
import { useState } from 'react'
import { Download } from 'lucide-react'
import type { Link } from '../../core/buildLinks'
import { POWER_BI_ZIP, exportBlocker, powerBiZip } from '../../core/powerBi'
import { download } from '../../db/export'
import { enginePort } from '../../db/pipelinePort'
import { starTables } from '../../db/powerBiRun'
import './powerBi.css'

export function PowerBiBridge({ links, ready, errors }: { links: readonly Link[]; ready: boolean; errors: number }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const tables = await starTables(enginePort)
      const why = exportBlocker({ ready, errors, tables: tables.map((t) => t.table) })
      if (why) return setMsg(why)
      const zip = powerBiZip(tables, links)
      download(zip as BlobPart, POWER_BI_ZIP, 'application/zip')
      setMsg(`${POWER_BI_ZIP}: ${tables.length} CSV files and steps.html. Open steps.html first.`)
    } catch (e) {
      setMsg(`Could not make the archive: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const blocked = exportBlocker({ ready, errors, tables: ['gold_fact_sales'] })
  return (
    <div className="more-card" data-testid="answer-card-powerbi">
      <div className="more-card-title">Take it to Power BI</div>
      <div className="build-muted">Your star as CSV files plus a short list of steps for the free Power BI Desktop (Windows): load, link, measures, visuals, and the numbers to check.</div>
      <button className="btn" onClick={run} disabled={!!blocked || busy} data-testid="answer-powerbi">
        <Download size={14} /> Download {POWER_BI_ZIP}
      </button>
      {blocked && <div className="build-muted pbi-note" data-testid="answer-powerbi-why">{blocked}</div>}
      {msg && <div className="build-muted pbi-note" role="status" data-testid="answer-powerbi-msg">{msg}</div>}
    </div>
  )
}
