// The build page (`#build=kaiyo-sales`): five steps from the files to an answer. Connect and Clean are real (Б4); the linking screen,
// the Dashboard and the Answer are Б6. The rules are in src/core/build.ts. Under 768 px the whole
// page is the "Open on a laptop" screen, as on the pipeline page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, Hammer, Laptop, Lock, Share2, X } from 'lucide-react'
import { BUILD_ID, STEP_IDS, STEP_LABEL, goNext, loadBuild, markDone, modelDone, nextStep, openStep, saveBuild, statusOf } from '../../core/build'
import type { Link } from '../../core/buildLinks'
import { answersDone, dashboardDone } from '../../core/buildDashboard'
import { cleanDone, type BuildWork, type StepSpec } from '../../core/buildSteps'
import { BUILD_RETURN_URL, BUILD_SOURCES, type BuildSourceId } from '../../data/build/kaiyoSales'
import { applySteps, restore } from '../../db/buildRun'
import { checkpoint } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { openBuild, refreshCatalog, useLab } from '../store'
import { CleanScreen } from './CleanScreen'
import { AnswerScreen } from './AnswerScreen'
import { ConnectScreen } from './ConnectScreen'
import { DashboardScreen } from './DashboardScreen'
import { ModelScreen } from './ModelScreen'
import './build.css'
import './clean.css'

/** Where the finish will lead back to. The trainer does not read this format yet, so nothing links here. */
export const RETURN_URL = BUILD_RETURN_URL

export function BuildPage() {
  const id = useLab((s) => s.build)
  if (!id) return null
  return <Shell />
}

function useWide(): boolean {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

function PhoneNotice() {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${location.pathname}#build=${BUILD_ID}`
  const send = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Quaera Lab: build it by hand', url })
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    location.href = `mailto:?subject=${encodeURIComponent('Quaera Lab: build it by hand')}&body=${encodeURIComponent(url)}`
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* the link is shown below to copy by hand */
    }
  }
  return (
    <div className="build-phone" data-testid="build-phone">
      <div className="max-w-sm w-full text-center flex flex-col gap-4">
        <Laptop size={40} className="mx-auto" style={{ color: 'var(--accent)' }} />
        <h1 className="m-0 text-xl font-semibold">Open on a laptop</h1>
        <p className="m-0" style={{ color: 'var(--muted)' }}>
          Building from the files to a dashboard needs a laptop: you work with tables, buttons and SQL side by side.
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary justify-center" onClick={() => void send()}>
            <Share2 size={14} /> Send me the link
          </button>
          <button className="btn justify-center" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="m-0 break-all" style={{ color: 'var(--muted)', fontSize: 12 }}>
          {url}
        </p>
      </div>
    </div>
  )
}

function Shell() {
  const wide = useWide()
  // while the build is open the page behind it does not scroll: the wheel at the end of a step stops there (the class is taken off on close)
  useEffect(() => {
    document.documentElement.classList.add('build-open')
    return () => document.documentElement.classList.remove('build-open')
  }, [])
  const [state, setState] = useState(loadBuild)
  useEffect(() => saveBuild(state), [state])
  const stateRef = useRef(state)
  stateRef.current = state

  // the engine: prepare once, then connect again what was connected and rebuild the clean tables from the saved steps
  const [engine, setEngine] = useState<'loading' | 'ready' | string>('loading')
  const [rev, setRev] = useState(0)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!wide) return
    let alive = true
    setEngine('loading')
    const now = stateRef.current
    restore(enginePort, now.work, { links: now.links, star: now.star, done: now.done.includes('model') })
      .then(async () => {
        await checkpoint()
        await refreshCatalog()
        if (alive) {
          setEngine('ready')
          setRev((n) => n + 1)
        }
      })
      .catch((e) => alive && setEngine(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [wide, tries])
  const ready = engine === 'ready'

  // Model: the links, Build the star, Try it, and the trips to Clean and back
  const [cleanFocus, setCleanFocus] = useState<BuildSourceId | undefined>(undefined)
  const setLinks = useCallback((links: Link[], star: boolean) => setState((s) => ({ ...s, links, star })), [])
  const markStar = useCallback(() => setState((s) => ({ ...s, star: true, v1: false })), [])
  const tryIt = useCallback(() => setState((s) => ({ ...s, links: [], star: false, v1: false })), [])
  const toClean = useCallback((source: BuildSourceId, asked: boolean) => {
    setCleanFocus(source)
    setState((s) => openStep({ ...s, work: asked && !s.work.p7 ? { ...s.work, p7: 'asked' } : s.work }, 'clean'))
  }, [])
  const backToModel = useCallback(() => setState((s) => openStep(s, 'model')), [])

  const setWork = useCallback((f: (w: BuildWork) => BuildWork) => setState((s) => ({ ...s, work: f(s.work) })), [])
  /** Sets a source's steps and rebuilds its clean table. A step the engine refuses is not kept: the old list is rebuilt. */
  const rebuild = useCallback(async (source: BuildSourceId, specs: StepSpec[]): Promise<string | null> => {
    const before = stateRef.current.work.steps[source]
    try {
      await applySteps(enginePort, source, specs)
    } catch (e) {
      await applySteps(enginePort, source, before).catch(() => undefined)
      setRev((n) => n + 1)
      return String(e instanceof Error ? e.message : e)
    }
    setState((s) => ({ ...s, work: { ...s.work, steps: { ...s.work.steps, [source]: specs } } }))
    await checkpoint()
    await refreshCatalog()
    setRev((n) => n + 1)
    return null
  }, [])

  // Connect is done when the four sources are in; Clean when its four cards have passed
  const work = state.work
  useEffect(() => {
    if (work.connected.length === BUILD_SOURCES.length) setState((s) => markDone(s, 'connect'))
  }, [work.connected.length])
  useEffect(() => {
    if (cleanDone(work.passed)) setState((s) => markDone(s, 'clean'))
  }, [work.passed])

  useEffect(() => {
    if (dashboardDone(work.dash.tiles)) setState((s) => markDone(s, 'dashboard'))
  }, [work.dash.tiles])
  useEffect(() => {
    if (answersDone(work.dash.answered)) setState((s) => markDone(s, 'answer'))
  }, [work.dash.answered])

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
      {!wide ? (
        <PhoneNotice />
      ) : (
        <>
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
              {engine !== 'loading' && !ready && (
                <div className="build-error" role="alert">
                  The data could not be prepared: {engine}{' '}
                  <button className="btn" onClick={() => setTries((n) => n + 1)}>Try again</button>
                </div>
              )}
              {open === 'connect' ? (
                <ConnectScreen work={work} setWork={setWork} ready={ready} />
              ) : open === 'clean' ? (
                <CleanScreen work={work} setWork={setWork} ready={ready} rebuild={rebuild} rev={rev} focus={cleanFocus} onBackToModel={backToModel} />
              ) : open === 'model' ? (
                <ModelScreen
                  ready={ready}
                  rev={rev}
                  done={state.done.includes('model')}
                  links={state.links}
                  star={state.star}
                  v1={state.v1}
                  onLinks={setLinks}
                  onStar={markStar}
                  onTryIt={tryIt}
                  onContinue={() => setState((x) => (modelDone(x) ? goNext(markDone(x, 'model')) : x))}
                  onFixRegions={() => toClean('regions', true)}
                  onBackToClean={(source) => toClean(source, false)}
                />
              ) : open === 'dashboard' ? (
                <DashboardScreen work={work} setWork={setWork} ready={ready} />
              ) : (
                <AnswerScreen work={work} setWork={setWork} />
              )}
            </section>
          </main>
          <footer className="build-foot shrink-0">
            <button className="btn btn-ghost" onClick={() => openBuild(null)}>Back to Lab</button>
            <button className="btn" disabled={!next} onClick={() => setState(goNext(state))}>
              Next step <ArrowRight size={14} />
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
