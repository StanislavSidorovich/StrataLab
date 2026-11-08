// Step 2 of the build page: Clean (spec section 3). Cards open one after the other; the panel under them shows any
// source with its toolbar and applied steps. This slice (Б4a): the given step and the watched example W.
import { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { activeCard, passedInOrder, type BuildWork, type StepSpec } from '../../core/buildSteps'
import { CLEAN_CARDS, GIVEN_NOTE, sourceById, type BuildSourceId, type CleanId } from '../../data/build/kaiyoSales'
import { StepsPanel } from './StepsPanel'
import { WatchRegions } from './WatchRegions'
import './clean.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
  /** sets a source's steps and rebuilds its clean table; resolves with an error message or null */
  rebuild: (source: BuildSourceId, specs: StepSpec[]) => Promise<string | null>
  rev: number
}

export function CleanScreen({ work, setWork, ready, rebuild, rev }: Props) {
  const active = activeCard(work.passed)
  const [source, setSource] = useState<BuildSourceId>('regions')
  const pass = (id: CleanId) => setWork((w) => ({ ...w, passed: passedInOrder([...w.passed, id]) }))
  const live = CLEAN_CARDS.filter((c) => c.id === 'W')
  const connected = work.connected.length === 4

  if (!connected) return <p className="build-muted">Connect the four sources first.</p>
  return (
    <div className="space-y-4" data-testid="build-clean">
      <details className="build-given">
        <summary>{GIVEN_NOTE}</summary>
        <p className="build-muted" style={{ margin: '6px 0 0' }}>It is the first step in the list of sales, marked “given”. Pick the sales tab below and open its SQL.</p>
      </details>
      <ol className="build-cards">
        {live.map((c) => {
          const passed = work.passed.includes(c.id)
          const open = active === c.id
          return (
            <li key={c.id} className={`build-clean-card${open ? ' is-open' : ''}${passed ? ' is-passed' : ''}`} data-testid={`clean-card-${c.id}`}>
              <div className="build-clean-head">
                <span className="build-chip-n">{passed ? <Check size={13} /> : open ? c.id : <Lock size={12} />}</span>
                <div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="build-muted">{sourceById(c.source).label}</div>
                </div>
              </div>
              {open && c.id === 'W' && (
                <WatchRegions
                  ready={ready}
                  onFix={(specs) => {
                    setSource('regions')
                    return rebuild('regions', specs)
                  }}
                  onDone={() => {
                    pass('W')
                    setSource('products')
                  }}
                />
              )}
              {open && c.id !== 'W' && <p>{c.text}</p>}
            </li>
          )
        })}
      </ol>
      <StepsPanel source={source} work={work} ready={ready} rev={rev} onChange={rebuild} onSource={setSource} />
    </div>
  )
}
