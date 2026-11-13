// The build page (`#build=kaiyo-sales`): five steps from the files to an answer. Connect and Clean are real (Б4); the linking screen,
// the Dashboard and the Answer are Б6. The rules are in src/core/build.ts. Under 768 px the whole
// page is the "Open on a laptop" screen, as on the pipeline page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, Hammer, Laptop, Lock, RotateCcw, Share2, Wand2, X } from 'lucide-react'
import { BUILD_ID, BUILD_KEY, MORE_STEP, REFRESH_STEP, isOptional, STEP_IDS, STEP_LABEL, STRIP_IDS, demoFromHash, emptyBuild, goNext, hashWithDemo, isUnlocked, markDone, modelDone, nextStep, openStep, saveBuild, statusOf } from '../../core/build'
import { canFillBefore, fillBefore, fillBeforeTouchesTables, fillUnit, touchesTables, type FillUnit } from '../../core/buildFill'
import { DEMO_KEY, isEmptyRun, loadSaved, loadSlot, restoreNeedsConfirm, restoreSaved, startOver, writeSaved, type Saved } from '../../core/buildProgress'
import type { Link } from '../../core/buildLinks'
import { answersDone, dashboardDone } from '../../core/buildDashboard'
import { NO_SLICE, type SliceFilter } from '../../core/buildSlice'
import { cleanDone, type BuildWork, type StepSpec } from '../../core/buildSteps'
import { BUILD_RETURN_URL, BUILD_SOURCES, type BuildSourceId } from '../../data/build/kaiyoSales'
import { applySteps, prepare, resetWork, restore, salesLock } from '../../db/buildRun'
import { checkpoint } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { openBuild, refreshCatalog, useLab } from '../store'
import { MoreScreen } from './MoreScreen'
import { RefreshScreen } from './RefreshScreen'
import type { JournalRow } from '../../core/buildRefresh'
import { CleanScreen } from './CleanScreen'
import { AnswerScreen } from './AnswerScreen'
import { ConnectScreen } from './ConnectScreen'
import { DashboardScreen } from './DashboardScreen'
import { ModelScreen } from './ModelScreen'
import './build.css'
import './clean.css'
import './progress.css'
import { DemoContext } from './DemoContext'
import { SliceContext } from './SliceContext'
import { ProgressMenu } from './ProgressMenu'

/** Where the finish leads back to (`#lab-done=build:kaiyo-sales`; More and Refresh have keys of their own). */
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
  // two places for the work: the learner's own run and the demo run; the page shows one of them and writes only to that one
  const [demo, setDemo] = useState(() => demoFromHash(location.hash))
  const [state, setState] = useState(() => loadSlot(demoFromHash(location.hash) ? DEMO_KEY : BUILD_KEY))
  useEffect(() => saveBuild(state, demo ? DEMO_KEY : BUILD_KEY), [state, demo])
  const stateRef = useRef(state)
  stateRef.current = state
  const demoRef = useRef(demo)
  demoRef.current = demo
  const [saved, setSaved] = useState<Saved | null>(loadSaved)
  // the slicers of the dashboard (Chain, Brand); not saved, cleared when the run changes
  const [filter, setFilter] = useState<SliceFilter>(NO_SLICE)

  /** [Error] cells in the clean sales (spec 3.6): the Dashboard stays locked while there are any, and a step bar already on it goes back to Clean */
  const refreshErrors = useCallback(async () => {
    const connected = stateRef.current.work.connected.includes('sales')
    const n = connected ? await salesLock(enginePort) : 0
    setState((s) => {
      const next = { ...s, errors: n }
      return n > 0 && !isUnlocked(next, s.open) ? { ...next, open: 'clean' } : next
    })
  }, [])

  // the engine: prepare once, then connect again what was connected and rebuild the clean tables from the saved steps
  const [engine, setEngine] = useState<'loading' | 'ready' | string>('loading')
  const [rev, setRev] = useState(0)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!wide) return
    let alive = true
    setEngine('loading')
    const now = stateRef.current
    // the tables are made again from the state on the page, so a run put in (or a start over) never meets the tables of another
    prepare(enginePort)
      .then(() => resetWork(enginePort))
      .then(() => restore(enginePort, now.work, { links: now.links, star: now.star, done: now.done.includes('model') }))
      .then(async () => {
        await checkpoint()
        await refreshCatalog()
        if (alive) await refreshErrors().catch(() => undefined)
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

  // Progress: Start over, My saved run, Demo mode, and the Fill buttons of demo mode (src/core/buildProgress.ts, buildFill.ts)
  const reload = useCallback(() => {
    setCleanFocus(undefined)
    setFilter(NO_SLICE)
    // not ready in the same render that brings the new state: a screen must not read tables that are being made again
    setEngine('loading')
    setTries((n) => n + 1)
  }, [])
  const startAgain = () => {
    const r = startOver(stateRef.current, saved, Date.now())
    if (r.saved && r.saved !== saved) {
      writeSaved(r.saved)
      setSaved(r.saved)
    }
    setState(r.state)
    reload()
  }
  const restoreRun = () => {
    if (!saved) return
    setState(restoreSaved(saved))
    reload()
  }
  const goDemo = useCallback((on: boolean) => {
    if (on === demoRef.current) return
    history.replaceState(null, '', location.pathname + location.search + hashWithDemo(location.hash, on))
    setDemo(on)
    setState(on ? emptyBuild() : loadSlot(BUILD_KEY))
    setEngine('loading')
    setTries((n) => n + 1)
    setCleanFocus(undefined)
    setFilter(NO_SLICE)
  }, [])
  // a link to #build=kaiyo-sales&demo=1 followed in the open page
  useEffect(() => {
    const on = () => goDemo(demoFromHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [goDemo])
  const fill = useCallback((unit: FillUnit) => {
    setState((s) => fillUnit(s, unit))
    if (touchesTables(unit)) reload()
  }, [reload])
  const fillTo = (step: (typeof STRIP_IDS)[number]) => {
    setState((s) => fillBefore(s, step))
    if (fillBeforeTouchesTables(step)) reload()
  }

  // Model: the links, Build the star, Try it, and the trips to Clean and back
  const [cleanFocus, setCleanFocus] = useState<BuildSourceId | undefined>(undefined)
  const setLinks = useCallback((links: Link[], star: boolean) => setState((s) => ({ ...s, links, star })), [])
  const markStar = useCallback(() => setState((s) => ({ ...s, star: true, v1: false })), [])
  const tryIt = useCallback(() => setState((s) => ({ ...s, links: [], star: false, v1: false })), [])
  /** `ask`: the Model step asks for an extra card (P7 region ids, P4 names of the sales) */
  const toClean = useCallback((source: BuildSourceId, ask: 'p7' | 'p4' | null) => {
    setCleanFocus(source)
    setState((s) => openStep({ ...s, work: ask && !s.work[ask] ? { ...s.work, [ask]: 'asked' } : s.work }, 'clean'))
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
    if (source === 'sales') await refreshErrors().catch(() => undefined)
    setRev((n) => n + 1)
    return null
  }, [refreshErrors])

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
  const num = isOptional(open) ? 0 : STEP_IDS.indexOf(open) + 1
  /** a journal line of Refresh was clicked: open the step it is about */
  const openFromJournal = (row: JournalRow) => {
    if (row.stage === 'clean' && row.source) setCleanFocus(row.source)
    setState((s) => openStep(s, row.stage === 'bronze' ? 'connect' : row.stage === 'clean' ? 'clean' : row.stage === 'model' ? 'model' : 'dashboard'))
  }
  /** a run changed the tables: save, refresh the tree, measure the [Error] cells, redraw what reads them */
  const afterRun = useCallback(async () => {
    await checkpoint()
    await refreshCatalog()
    await refreshErrors().catch(() => undefined)
    setRev((n) => n + 1)
  }, [refreshErrors])

  return (
    <DemoContext.Provider value={{ demo, ready: ready && engine === 'ready', fill }}>
    <SliceContext.Provider value={{ filter, setFilter }}>
    <div className="build-page absolute inset-0 z-30 flex flex-col min-w-0" data-testid="build">
      <header className="build-head shrink-0 flex items-center gap-3 px-4 py-2">
        <Hammer size={18} style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Build it by hand: Kaiyo Trading sales</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>From the file to a decision: five steps, two optional</div>
        </div>
        {wide && (demo || state.done.includes('connect') || !!saved) && (
          <ProgressMenu
            demo={demo}
            saved={saved}
            empty={!demo && isEmptyRun(state)}
            restoreAsks={!!saved && restoreNeedsConfirm(state, saved)}
            onStartOver={startAgain}
            onRestore={restoreRun}
            onDemo={() => goDemo(true)}
            onExitDemo={() => goDemo(false)}
          />
        )}
        <button className="btn btn-ghost" onClick={() => openBuild(null)} aria-label="Close the build" title="Back to the workbench">
          <X size={16} />
        </button>
      </header>
      {demo && wide && (
        <div className="demo-banner" role="status" data-testid="demo-banner">
          <Wand2 size={14} style={{ color: 'var(--accent)' }} />
          <span><b>Demo:</b> nothing here counts. Your own run is kept as it was.</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => { setState(emptyBuild()); reload() }} data-testid="demo-restart"><RotateCcw size={12} /> Restart demo</button>
          <button className="btn" onClick={() => goDemo(false)} data-testid="demo-exit">Exit</button>
        </div>
      )}
      {!wide ? (
        <PhoneNotice />
      ) : (
        <>
          <ol className="build-strip shrink-0" aria-label="Steps">
            {STRIP_IDS.map((s, i) => {
              const st = statusOf(state, s)
              return (
                <li key={s} className={demo ? 'build-chip-wrap' : undefined} style={demo ? undefined : { display: 'contents' }}>
                  <button
                    className={`build-chip is-${st}${s === open ? ' is-open' : ''}`}
                    disabled={st === 'locked'}
                    aria-current={s === open ? 'step' : undefined}
                    onClick={() => setState(openStep(state, s))}
                    title={st === 'locked' ? (isOptional(s) ? 'Finish Answer first' : 'Finish the step before it first') : s === MORE_STEP ? 'Optional: six more questions' : s === REFRESH_STEP ? 'Optional: a new file arrives' : STEP_LABEL[s]}
                  >
                    <span className="build-chip-n">{st === 'done' ? <Check size={13} /> : st === 'locked' ? <Lock size={12} /> : i + 1}</span>
                    <span className="build-chip-label">{STEP_LABEL[s]}{isOptional(s) && <span className="build-chip-opt"> optional</span>}</span>
                  </button>
                  {demo && canFillBefore(s) && (
                    <button className="demo-fill-to" disabled={!ready} onClick={() => fillTo(s)} title="Demo: fill every step before this one and open it" data-testid={`fill-to-${s}`}>
                      <Wand2 size={11} /> <span>Fill to here</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
          <main className="build-body">
            <section className="build-card" data-testid={`build-step-${open}`}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{isOptional(open) ? 'Optional, after the five steps' : `Step ${num} of ${STEP_IDS.length}`}</div>
              <h2 className="font-semibold" style={{ fontSize: 20, margin: '2px 0 8px' }}>{STEP_LABEL[open]}</h2>
              {engine !== 'loading' && !ready && (
                <div className="build-error" role="alert">
                  The data could not be prepared: {engine}{' '}
                  <button className="btn" onClick={() => setTries((n) => n + 1)} data-testid="engine-retry">Try again</button>{' '}
                  <button className="btn" onClick={() => (demo ? (setState(emptyBuild()), reload()) : startAgain())} title={demo ? 'Empties the demo' : "Keeps this run under My saved run, then goes back to step 1"} data-testid="engine-start-over">Start over</button>
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
                  onFixRegions={() => toClean('regions', 'p7')}
                  onFixNames={() => toClean('sales', 'p4')}
                  onBackToClean={(source) => toClean(source, null)}
                />
              ) : open === 'dashboard' ? (
                <DashboardScreen work={work} setWork={setWork} ready={ready} />
              ) : open === 'answer' ? (
                <AnswerScreen work={work} setWork={setWork} ready={ready} links={state.links} errors={state.errors} onMore={() => setState((s) => openStep(s, MORE_STEP))} />
              ) : open === REFRESH_STEP ? (
                <RefreshScreen work={work} setWork={setWork} ready={ready} model={{ links: state.links, star: state.star }} onRan={afterRun} onOpen={openFromJournal} onDashboard={() => setState((s) => openStep(s, 'dashboard'))} />
              ) : (
                <MoreScreen work={work} setWork={setWork} ready={ready} onDashboard={() => setState((s) => openStep(s, 'dashboard'))} />
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
    </SliceContext.Provider>
    </DemoContext.Provider>
  )
}
