// W, watched (spec 3.2): the Osaka-twice problem in regions.csv, one step at a time, each with a caption and its SQL.
// After the warm-up of the pipeline (src/ui/PipelineTutorial.tsx): Next goes on, nothing to type; "Now you" opens P1.
import { useState } from 'react'
import { ArrowRight, Loader2, Wand2 } from 'lucide-react'
import type { ResultData } from '../../core/check'
import { addSpec } from '../../core/buildSteps'
import { WATCH_CLOSING, WATCH_STEPS } from '../../data/build/kaiyoSales'
import { enginePort } from '../../db/pipelinePort'
import { BuildTable } from './BuildTable'

interface Shown {
  data: ResultData | null
}

export function WatchRegions({ ready, onFix, onDone }: { ready: boolean; onFix: (specs: ReturnType<typeof addSpec>) => Promise<string | null>; onDone: () => void }) {
  const [shown, setShown] = useState<Shown[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = shown.length
  const finished = n === WATCH_STEPS.length

  const next = async () => {
    const step = WATCH_STEPS[n]
    setBusy(true)
    setError(null)
    try {
      if (step.sql === null) {
        // the button step: the step is put on regions (always the same one, so Next twice changes nothing)
        const err = await onFix(addSpec([], 'distinct'))
        if (err) throw new Error(err)
        setShown((s) => [...s, { data: null }])
      } else {
        const data = await enginePort.query(step.sql)
        setShown((s) => [...s, { data }])
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3" data-testid="build-watch">
      <ol className="build-watch-steps">
        {shown.map((s, i) => (
          <li key={i} className="build-watch-step">
            <div className="build-watch-title">
              {i + 1}. {WATCH_STEPS[i].title}
            </div>
            <p style={{ margin: '2px 0 6px' }}>{WATCH_STEPS[i].caption}</p>
            {WATCH_STEPS[i].sql ? <pre className="pl-code">{WATCH_STEPS[i].sql}</pre> : <div className="build-watch-fix"><Wand2 size={14} /> Remove duplicates → step “Removed duplicates”: <code>SELECT DISTINCT * FROM {'{prev}'}</code></div>}
            {s.data && <BuildTable data={s.data} caption={WATCH_STEPS[i].title} />}
          </li>
        ))}
      </ol>
      {error && <div className="build-error" role="alert">{error}</div>}
      {finished ? (
        <>
          <p style={{ margin: 0 }}>{WATCH_CLOSING}</p>
          <button className="btn btn-primary" onClick={onDone} data-testid="watch-now-you">
            Now you <ArrowRight size={14} />
          </button>
        </>
      ) : (
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void next()} data-testid="watch-next">
          {busy && <Loader2 size={14} className="animate-spin" />}
          {n === 0 ? 'Start' : WATCH_STEPS[n].sql === null ? 'Press Remove duplicates' : 'Next'} <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}
