// The build page (`#build=kaiyo-sales`): five steps from the files to an answer. This is the frame only: each step is
// a stub with a temporary "Mark done". The rules are in src/core/build.ts.
import { useEffect, useState } from 'react'
import { ArrowRight, Check, Hammer, Lock, X } from 'lucide-react'
import { STEP_IDS, STEP_LABEL, goNext, loadBuild, markDone, nextStep, openStep, saveBuild, statusOf, type StepId } from '../../core/build'
import { openBuild, useLab } from '../store'
import './build.css'

/** Where the finish will lead back to. The trainer does not read this format yet, so nothing links here. */
export const RETURN_URL = 'https://quaera.app/#lab-done=build:kaiyo-sales'

const SOON: Record<StepId, string> = {
  connect: 'Here you will bring the Kaiyo Trading sales files into Lab.',
  clean: 'Here you will find what is wrong in the raw rows and fix it.',
  model: 'Here you will link the cleaned tables into a model that can be queried.',
  dashboard: 'Here you will build the views that show how sales are going.',
  answer: 'Here you will read the dashboard and answer the business question.',
}

export function BuildPage() {
  const id = useLab((s) => s.build)
  if (!id) return null
  return <Shell />
}

function Shell() {
  const [state, setState] = useState(loadBuild)
  useEffect(() => saveBuild(state), [state])
  const open = state.open
  const next = nextStep(state)
  const num = STEP_IDS.indexOf(open) + 1

  return (
    <div className="build-page absolute inset-0 z-30 flex flex-col min-w-0" data-testid="build">
      <header className="build-head shrink-0 flex items-center gap-3 px-4 py-2">
        <Hammer size={18} style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Build it by hand: Kaiyo Trading sales</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>From the file to a decision, in five steps</div>
        </div>
        <button className="btn btn-ghost" onClick={() => openBuild(null)} aria-label="Close the build" title="Back to the workbench">
          <X size={16} />
        </button>
      </header>
      <ol className="build-strip shrink-0" aria-label="Steps">
        {STEP_IDS.map((s, i) => {
          const st = statusOf(state, s)
          return (
            <li key={s} style={{ display: 'contents' }}>
              <button
                className={`build-chip is-${st}${s === open ? ' is-open' : ''}`}
                disabled={st === 'locked'}
                aria-current={s === open ? 'step' : undefined}
                onClick={() => setState(openStep(state, s))}
                title={st === 'locked' ? 'Finish the step before it first' : STEP_LABEL[s]}
              >
                <span className="build-chip-n">{st === 'done' ? <Check size={13} /> : st === 'locked' ? <Lock size={12} /> : i + 1}</span>
                <span className="build-chip-label">{STEP_LABEL[s]}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <main className="build-body">
        <section className="build-card" data-testid={`build-step-${open}`}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Step {num} of {STEP_IDS.length}</div>
          <h2 className="font-semibold" style={{ fontSize: 20, margin: '2px 0 8px' }}>{STEP_LABEL[open]}</h2>
          <p style={{ margin: '0 0 16px' }}>{SOON[open]}</p>
          {state.done.includes(open) ? (
            <span style={{ color: 'var(--accent)' }}>
              <Check size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Done
            </span>
          ) : (
            <button className="btn" onClick={() => setState(markDone(state))}>Mark done</button>
          )}
        </section>
      </main>
      <footer className="build-foot shrink-0">
        <button className="btn btn-ghost" onClick={() => openBuild(null)}>Back to Lab</button>
        <button className="btn" disabled={!next} onClick={() => setState(goNext(state))}>
          Next step <ArrowRight size={14} />
        </button>
      </footer>
    </div>
  )
}
