// The two optional checks under the three answers: A4 (do the chains add up to the tile? the learner says, then sees the sum)
// and A5 (which line goes to the Head of Sales). Rules in src/core/buildReview.ts; they do not gate the step.
import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { reviewA4, reviewA5, type ReconFacts } from '../../core/buildReview'
import type { BuildWork } from '../../core/buildSteps'
import { A4_OPTIONS, A4_QUESTION, A5_LINES, A5_QUESTION, type A4Pick, type A5Pick } from '../../data/build/reviewChecks'
import { reconFacts } from '../../db/buildRecon'
import { enginePort } from '../../db/pipelinePort'
import './review.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
}

export function ReviewChecks({ work, setWork, ready }: Props) {
  const { a4, a5 } = work.dash.review
  const [facts, setFacts] = useState<ReconFacts | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    reconFacts(enginePort).then((f) => alive && setFacts(f)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [ready])
  const pick = (patch: Partial<{ a4: A4Pick | ''; a5: A5Pick | '' }>) => setWork((w) => ({ ...w, dash: { ...w.dash, review: { ...w.dash.review, ...patch } } }))
  const r4 = a4 && facts ? reviewA4(a4, facts) : null
  const r5 = a5 ? reviewA5(a5) : null

  return (
    <section className="rv" data-testid="answer-review">
      <div className="rv-title">Two checks a reviewer makes before they trust it (optional)</div>

      <div className="rv-q" data-testid="review-a4">
        <div className="font-semibold">{A4_QUESTION}</div>
        <div className="rv-opts" role="radiogroup" aria-label="A4">
          {A4_OPTIONS.map((o) => (
            <button key={o.value} className={`btn${a4 === o.value ? ' btn-primary' : ''}`} role="radio" aria-checked={a4 === o.value} onClick={() => pick({ a4: o.value })} data-testid={`a4-${o.value}`}>
              {o.label}
            </button>
          ))}
        </div>
        {a4 && !r4 && <div className="build-muted">{ready ? 'Adding up…' : 'Waiting for the data…'}</div>}
        {r4 && (
          <div className={`rv-out ${r4.ok ? 'is-ok' : 'is-off'}`} role="status" data-testid="a4-result">
            <b>{r4.ok ? <><Check size={13} /> You expected it</> : <><X size={13} /> Not quite</>}</b>
            {r4.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}
      </div>

      <div className="rv-q" data-testid="review-a5">
        <div className="font-semibold">{A5_QUESTION}</div>
        <div className="rv-lines" role="radiogroup" aria-label="A5">
          {A5_LINES.map((l) => (
            <button key={l.value} className={`rv-line${a5 === l.value ? ' is-picked' : ''}`} role="radio" aria-checked={a5 === l.value} onClick={() => pick({ a5: l.value })} data-testid={`a5-${l.value}`}>
              {l.text}
            </button>
          ))}
        </div>
        {r5 && (
          <div className={`rv-out ${r5.ok ? 'is-ok' : 'is-off'}`} role="status" data-testid="a5-result">
            <b>{r5.ok ? <><Check size={13} /> Send this one</> : <><X size={13} /> Not this one</>}</b>
            <p>{r5.line}</p>
            {!r5.ok && <p className="build-muted">Look at the other two lines again.</p>}
          </div>
        )}
      </div>
    </section>
  )
}
