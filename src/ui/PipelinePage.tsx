// The data pipeline page (`#pipeline=kaiyo-sellout`, docs/pipeline-mvp-spec.md): three lanes with fixed slots, a palette
// of blocks, each block's settings, a run that fills a journal, and "Check my pipeline". The rules are in
// src/core/pipeline.ts, the engine in src/db/pipelineRun.ts. Under 768 px there is no board: a laptop is needed.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, Laptop, Lightbulb, ListChecks, Loader2, Play, RotateCcw, Share2, Undo2, Trash2, Workflow, X } from 'lucide-react'
import { afterRun, checkBlank, emptyState, missingAll, missingSetting, nextSlotFor, nextStep, place, slotOf, progressNote, readPhase, readState, remove, runOrder, softNotes, unsetOf, type Phase, type PipelineState, type StepResult, type StepStatus } from '../core/pipeline'
import type { ResultData } from '../core/check'
import {
  BLOCKS,
  BLOCK_TIPS,
  INTRO,
  LANE_COLOR,
  LANES,
  LANE_LINES,
  LANE_PLAN,
  NEXT_TEXT,
  PIPELINE_ID,
  PROOF_TITLES,
  RETURN_URL,
  TWIST,
  SCHEMA,
  SILVER_HINTS,
  SILVER_PROMPT,
  ROLE_NAME,
  WHEN_TIP,
  blockById,
  laneOfSlot,
  silverSql,
  silverTemplate,
  slotId,
  type Block,
  type BlockId,
  type LaneId,
  type Settings,
} from '../data/pipelines/kaiyoSellout'
import { checkPipeline, currentTop, prepare, referenceTop, resetWork, runAll, type CheckReport } from '../db/pipelineRun'
import { takeSnapshot } from '../db/pipelineSnapshot'
import { MODE_KEY, STEPS, activeStep, freshOnly, helpFor, lastStep, prefixState, readMode, type Mode } from '../core/pipelineSteps'
import { CameOut, StageStrip, StepPanel, type Kept } from './PipelineSteps'
import { enginePort } from '../db/pipelinePort'
import { checkpoint } from '../db/engine'
import { openPipeline, refreshCatalog, useLab } from './store'
import { PipelineTutorial } from './PipelineTutorial'
import { TUT_STORAGE } from '../data/pipelines/storesByRegion'
import { followQuaeraLink } from '../core/quaeraLink'

const KEY = `stratalab.pipeline.${PIPELINE_ID}`
const URL_HERE = () => `${location.origin}${location.pathname}#pipeline=${PIPELINE_ID}`

const INFO: Record<BlockId, string> = Object.fromEntries(Object.entries(BLOCK_TIPS).map(([k, v]) => [k, v.does])) as Record<BlockId, string>

interface Twist {
  /** the card disagreed with the Head of Sales' file */
  mismatch: boolean
  /** what the card said, "Nagisa, 95,406.98" */
  mine: string
}

interface Saved {
  state: PipelineState
  hints: number
  solved: boolean
  phase: Phase
  twist: Twist | null
}

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    const p = raw ? JSON.parse(raw) : {}
    const solved = p?.solved === true
    const t = p?.twist
    const twist = t && typeof t.mine === 'string' && typeof t.mismatch === 'boolean' ? { mismatch: t.mismatch, mine: t.mine } : null
    return { state: readState(raw), hints: p?.hints === 1 || p?.hints === 2 ? p.hints : 0, solved, phase: readPhase(p?.phase, solved), twist }
  } catch {
    return { state: emptyState(), hints: 0, solved: false, phase: 'first-pass', twist: null }
  }
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

const money = (v: unknown) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('en-US'))

// ---------------------------------------------------------------- the page

export function PipelinePage() {
  const id = useLab((s) => s.pipeline)
  if (!id) return null
  return <Shell />
}

/** The warm-up is offered once: not to someone who has already built something, finished it or skipped it. */
function readIntro(): boolean {
  try {
    return localStorage.getItem(TUT_STORAGE) === null && localStorage.getItem(KEY) === null
  } catch {
    return false
  }
}
function markIntro(v: 'done' | 'skipped') {
  try {
    localStorage.setItem(TUT_STORAGE, v)
  } catch {
    /* not kept: the warm-up is offered again next time */
  }
}

function Shell() {
  const wide = useWide()
  const [intro, setIntro] = useState(readIntro)
  return (
    <div className="absolute inset-0 z-30 flex flex-col min-w-0" style={{ background: 'var(--bg)', zoom: 'var(--practice-zoom, 1)' }} data-testid="pipeline">
      <header className="shrink-0 flex items-center gap-3 px-4 py-2" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
        <Workflow size={18} style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Data pipeline on Kaiyo Trading</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>From the distributor files to one answer, through three roles</div>
        </div>
        <button className="btn btn-ghost" onClick={() => openPipeline(null)} aria-label="Close the pipeline" title="Back to the workbench">
          <X size={16} />
        </button>
      </header>
      {wide ? intro ? <PipelineTutorial onDone={() => (markIntro('done'), setIntro(false))} onSkip={() => (markIntro('skipped'), setIntro(false))} /> : <Board onWarmUp={() => setIntro(true)} /> : <PhoneNotice />}
    </div>
  )
}

// ---------------------------------------------------------------- phone

function PhoneNotice() {
  const [copied, setCopied] = useState(false)
  const url = URL_HERE()
  const send = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Quaera Lab pipeline', url })
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    location.href = `mailto:?subject=${encodeURIComponent('Quaera Lab pipeline')}&body=${encodeURIComponent(url)}`
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
    <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6" data-testid="pipeline-phone">
      <div className="max-w-sm w-full text-center flex flex-col gap-4">
        <Laptop size={40} className="mx-auto" style={{ color: 'var(--accent)' }} />
        <h1 className="m-0 text-xl font-semibold">Open on a laptop</h1>
        <p className="m-0" style={{ color: 'var(--muted)' }}>
          The pipeline needs a laptop: it&apos;s built by placing blocks side by side.
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

// ---------------------------------------------------------------- the board

function Board({ onWarmUp }: { onWarmUp: () => void }) {
  const [saved] = useState(readSaved)
  const [state, setState] = useState<PipelineState>(saved.state)
  const [hints, setHints] = useState(saved.hints)
  const [solved, setSolved] = useState(saved.solved)
  const [phase, setPhase] = useState<Phase>(saved.phase)
  const [twist, setTwist] = useState<Twist | null>(saved.twist)
  const [picked, setPicked] = useState<BlockId | null>(null)
  const [open, setOpen] = useState<BlockId | null>(null)
  const [prep, setPrep] = useState<'loading' | 'ready' | string>('loading')
  const [busy, setBusy] = useState<null | 'run' | 'check'>(null)
  const [ran, setRan] = useState(false)
  const [journal, setJournal] = useState<StepResult[]>([])
  const [report, setReport] = useState<CheckReport | null>(null)
  const [answer, setAnswer] = useState<ResultData | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** blocks the last click on a grey-looking button pointed at */
  const [attention, setAttention] = useState<{ ids: BlockId[]; text: string } | null>(null)
  const [prepTry, setPrepTry] = useState(0)
  const [tip, setTip] = useState<{ id: BlockId; x: number; top: number; bottom: number } | null>(null)
  const [hint, setHint] = useState<{ for: BlockId | null; level: number }>({ for: null, level: 0 })
  const [demo, setDemo] = useState<{ lane: LaneId; steps: { block: BlockId; caption: string }[]; busy: boolean } | null>(null)
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      return readMode(localStorage.getItem(MODE_KEY), saved.solved)
    } catch {
      return readMode(null, saved.solved)
    }
  })
  /** the first rows of what each step built, kept for the strip: page state only, a reload starts without them */
  const [snaps, setSnaps] = useState<Partial<Record<string, Kept>>>({})
  const [viewed, setViewed] = useState<BlockId | null>(null)
  /** the line "placed for you" under the step, by block */
  const [captions, setCaptions] = useState<Partial<Record<BlockId, string>>>({})
  const alive = useRef(true)
  const autoShown = useRef(new Set<BlockId>())
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* not kept: the choice is lost on reload */
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, hints, solved, phase, twist }))
    } catch {
      /* private mode: the pipeline just is not kept */
    }
  }, [state, hints, solved, phase, twist])

  useEffect(() => {
    let alive = true
    setPrep('loading')
    prepare(enginePort)
      .then(async () => {
        await checkpoint()
        await refreshCatalog()
        if (alive) setPrep('ready')
      })
      .catch((e) => alive && setPrep(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [prepTry])

  /** What runs: the first pass has no de-duplication (and no blank); the fix has both. */
  const eff = useMemo(() => ({ ...state, dedup: phase === 'fix' }), [state, phase])
  const order = useMemo(() => runOrder(state), [state])
  const missing = missingSetting(eff)
  const unsetAll = missingAll(eff)
  const reason = prep === 'loading' ? 'Preparing the data…' : prep !== 'ready' ? 'The data could not be prepared' : order.length === 0 ? 'Place a block first' : (missing?.message ?? null)
  const placed = new Set(order)
  const palette = BLOCKS.filter((b) => !placed.has(b.id))
  /** A click on Run, Check or Start from scratch that cannot go on: say why and point at the blocks, never just stay grey. */
  const explain = (): boolean => {
    if (prep === 'loading') setAttention({ ids: [], text: 'Still preparing the data: this takes a few seconds the first time. Try again in a moment.' })
    else if (prep !== 'ready') setAttention({ ids: [], text: `The data could not be prepared: ${prep}. Press Try again.` })
    else if (order.length === 0) setAttention({ ids: [], text: 'There is nothing to run yet: place a block in the Data engineer lane first.' })
    else if (unsetAll.length > 0) {
      setAttention({
        ids: unsetAll.map((m) => m.block),
        text: `${unsetAll.length} block${unsetAll.length === 1 ? ' needs' : 's need'} a setting before Run: ${unsetAll.map((m) => blockById(m.block)!.label).join('; ')}. Open each block marked ? and choose.`,
      })
      setOpen(unsetAll[0].block)
    } else return false
    return true
  }
  /** The same for "Run this step": say why it cannot go on and point at the blocks, never just stay grey. */
  const explainStep = (): boolean => {
    if (prep === 'loading') setAttention({ ids: [], text: 'Still preparing the data: this takes a few seconds the first time. Try again in a moment.' })
    else if (prep !== 'ready') setAttention({ ids: [], text: `The data could not be prepared: ${prep}. Press Try again.` })
    else if (active && !activePlaced) setAttention({ ids: [], text: `Place “${blockById(active)!.label}” first: it goes in the highlighted slot of the ${LANES.find((l) => l.id === blockById(active)!.lane)!.label} lane.` })
    else if (stepUnset.length > 0) {
      setAttention({ ids: stepUnset.map((m) => m.block), text: `${stepUnset.length} block${stepUnset.length === 1 ? ' needs' : 's need'} a setting before this step runs: ${stepUnset.map((m) => blockById(m.block)!.label).join('; ')}. Open each block marked ? and choose.` })
      setOpen(stepUnset[0].block)
    } else return false
    return true
  }
  useEffect(() => setAttention(null), [state, phase])
  // a line placed for the first pass does not describe the fix
  useEffect(() => setCaptions({}), [phase])

  const next = nextStep(eff, { ran, solved, firstPass: phase === 'first-pass' })
  const stepMode = mode === 'step'
  const fresh = useMemo(() => freshOnly(snaps, phase), [snaps, phase])
  const active = activeStep(fresh)
  const stepIdx = active ? STEPS.indexOf(active) : STEPS.length
  const help = active ? helpFor(stepIdx) : null
  const activePlaced = active ? slotOf(state, active) !== null : false
  /** the one slot the learner may use now */
  const allowedSlot = stepMode && active && !activePlaced ? nextSlotFor(state, active) : null
  const hintLevel = stepMode ? (hint.for === active ? hint.level : 0) : hint.for === next.block ? hint.level : 0
  const stepUnset = active ? missingAll(prefixState(eff, active)) : []
  const stepReason =
    prep === 'loading' ? 'Preparing the data…' : prep !== 'ready' ? 'The data could not be prepared' : !active ? null : !activePlaced ? `Place “${blockById(active)!.label}” first` : (stepUnset[0]?.message ?? null)
  const rest = active && activePlaced ? lastStep(eff) : null
  const viewedSnap = viewed ? snaps[viewed] : undefined

  const tipProps = (id: BlockId) => ({
    'aria-describedby': tip?.id === id ? 'pl-tip' : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(id, e.currentTarget),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(id, e.currentTarget),
    onBlur: () => setTip(null),
  })
  const showTip = (id: BlockId, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setTip({ id, x: Math.max(8, Math.min(r.left, window.innerWidth - 328)), top: r.top, bottom: r.bottom })
  }
  useEffect(() => {
    if (!tip) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [tip])

  /** Hint 3: builds one lane, a block at a time, with a line on each. The SQL blank is never filled. */
  const showLane = async (lane: LaneId) => {
    const plan = LANE_PLAN[lane]
    setDemo({ lane, steps: [], busy: true })
    setOpen(null)
    setPicked(null)
    setState((s) => {
      let n = s
      for (const b of BLOCKS.filter((b) => b.lane === lane)) n = remove(n, b.id)
      return n
    })
    for (const [i, step] of plan.entries()) {
      await new Promise((r) => setTimeout(r, 700))
      if (!alive.current) return
      setState((s) => {
        const n = place(s, step.block, slotId(lane, i))
        n.settings[step.block] = { ...n.settings[step.block], when: 'succeeded', ...(step.block === 'copy-files' ? { files: 'all', format: 'text', delim: ';', header: true, mode: 'replace' } : {}) }
        return { ...n, settings: { ...n.settings } }
      })
      setDemo((d) => d && { ...d, steps: [...d.steps, step] })
    }
    setDemo((d) => d && { ...d, busy: false })
  }

  /** "Show me this step": the block goes in its slot with its settings, except the part that is the learner's (when it runs, the blank). */
  const showStep = (block: BlockId) => {
    const step = LANE_PLAN[blockById(block)!.lane].find((p) => p.block === block)
    setState((s) => {
      const slot = slotOf(s, block) ? null : nextSlotFor(s, block)
      if (!slot) return s
      const n = place(s, block, slot)
      return { ...n, settings: { ...n.settings, [block]: { ...n.settings[block], ...(block === 'copy-files' ? { files: 'all', format: 'text', delim: ';', header: true, mode: 'replace' } : {}) } } }
    })
    // the first pass has no blank yet: it comes with the twist
    const caption = (step?.caption ?? NEXT_TEXT[block]).replace(phase === 'first-pass' ? ' Its one blank is yours to fill.' : '\u0000', '')
    setCaptions((c) => ({ ...c, [block]: caption }))
    setOpen(block)
    setPicked(null)
  }
  // The first two steps place their block themselves, a moment after they come up.
  useEffect(() => {
    if (!stepMode || !active || help !== 'show' || activePlaced || autoShown.current.has(active)) return
    const t = setTimeout(() => {
      autoShown.current.add(active)
      showStep(active)
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepMode, active, help, activePlaced])

  const setSettings = (id: BlockId, patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, [id]: { ...s.settings[id], ...patch } } }))

  const clickSlot = (slot: string) => {
    const there = state.slots[slot]
    if (picked) {
      if (stepMode && slot !== allowedSlot) return
      const block = blockById(picked)!
      if (laneOfSlot(slot) !== block.lane) return
      setState(place(state, picked, slot))
      setOpen(picked)
      setPicked(null)
      return
    }
    if (there) setOpen(open === there ? null : there)
  }

  const afterRunSync = async () => {
    await checkpoint()
    await refreshCatalog()
  }
  const readAnswer = async (): Promise<ResultData | null> => {
    try {
      const r = await enginePort.query(`SELECT chain_name, revenue FROM ${SCHEMA}.report_top_chain`)
      return r.rows.length ? r : null
    } catch {
      return null
    }
  }

  /** After a run: the first rows of every step that built its table, for "What came out" and the strip. */
  const capture = async (j: StepResult[]) => {
    const got: Partial<Record<string, Kept>> = {}
    let last: BlockId | null = null
    for (const b of STEPS) {
      if (!j.some((r) => r.block === b && r.status === 'succeeded')) continue
      try {
        const s = await takeSnapshot(enginePort, b, { dedup: phase === 'fix' })
        if (s) {
          got[b] = { ...s, phase }
          last = b
        }
      } catch {
        /* the table cannot be read: this step just has no picture */
      }
    }
    if (!alive.current) return
    setSnaps((p) => ({ ...p, ...got }))
    if (last) setViewed(last)
  }

  /** Run (all at once), or a run up to and including `through` (step by step). */
  const run = async (through?: BlockId) => {
    setBusy('run')
    setReport(null)
    setNote(null)
    try {
      const part = through ? prefixState(eff, through) : eff
      const j = await runAll(enginePort, part, setJournal)
      setJournal(j)
      setRan(true)
      await afterRunSync()
      setAnswer(await readAnswer())
      await capture(j)
      setNote(through ? null : progressNote(eff, j))
      const top = await currentTop(enginePort)
      const moved = afterRun(phase, j, top, await referenceTop(enginePort))
      if (moved.phase !== phase) {
        setPhase(moved.phase)
        setTwist({ mismatch: moved.mismatch, mine: top ? `${top.chain}, ${money(top.revenue)}` : '' })
      }
    } finally {
      setBusy(null)
    }
  }
  const check = async () => {
    setBusy('check')
    setNote(null)
    try {
      const r = await checkPipeline(enginePort, eff, (j) => setJournal(j))
      setJournal(r.run2)
      setRan(true)
      setReport(r)
      setAnswer(r.answer && r.answer.rows.length ? r.answer : null)
      if (r.solved && phase === 'fix') setSolved(true)
      await afterRunSync()
      await capture(r.run2)
    } finally {
      setBusy(null)
    }
  }
  const scratch = async () => {
    setBusy('run')
    try {
      await resetWork(enginePort)
      setJournal([])
      setReport(null)
      setAnswer(null)
      setRan(false)
      setSnaps({})
      setViewed(null)
      setNote(`The tables in ${SCHEMA} are dropped. The source tables stay.`)
      await afterRunSync()
    } finally {
      setBusy(null)
    }
  }

  const replay = async () => {
    setBusy('run')
    try {
      await resetWork(enginePort)
      setJournal([])
      setReport(null)
      setAnswer(null)
      setRan(false)
      setSolved(false)
      setPhase('first-pass')
      setTwist(null)
      setHints(0)
      setSnaps({})
      setViewed(null)
      setNote('The story starts again from the first pass. Your blocks stay where they are.')
      await afterRunSync()
    } finally {
      setBusy(null)
    }
  }

  const openBlock = open && placed.has(open) ? blockById(open)! : null

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Head of Sales</div>
            <div className="font-semibold">Which retail chain sold the most from January to June 2026, and how much?</div>
          </div>
          {solved && (
            <span className="pl-chip" style={{ ['--c' as string]: '#16a34a' }}>
              <Check size={12} /> Solved
            </span>
          )}
        </div>

        {twist && <TwistCard twist={twist} phase={phase} solved={solved} />}

        {stepMode && (
          <>
            <StageStrip snaps={snaps} fresh={fresh} viewed={viewed} active={active} onView={setViewed} />
            <StepPanel
              active={active}
              index={stepIdx}
              help={help}
              hintLevel={hintLevel}
              placed={activePlaced}
              caption={active ? (captions[active] ?? null) : null}
              note={phase === 'fix' && active === 'sql-silver' && activePlaced ? 'The SQL step has a blank now: open it, fill it, then Run this step.' : null}
              closing={next.text === 'nothing, the pipeline works' ? 'The pipeline works.' : `Next: ${next.text}.`}
              onHint={() => active && setHint({ for: active, level: Math.min(2, hintLevel + 1) })}
              onShow={() => active && showStep(active)}
            />
          </>
        )}

        <Intro />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 12, color: 'var(--muted)' }}>
          <span>
            New to pipelines?{' '}
            <button className="underline" style={{ background: 'transparent', border: 0, color: 'var(--accent)', cursor: 'pointer' }} onClick={onWarmUp} data-testid="pipeline-warmup">
              Do the three-minute warm-up first
            </button>
          </span>
          <span className="flex-1" />
          <span data-testid="pipeline-mode" data-mode={mode}>
            {stepMode ? 'Step by step: one step, then what it built.' : 'All at once: the whole board.'}{' '}
            <button className="underline" style={{ background: 'transparent', border: 0, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setMode(stepMode ? 'all' : 'step')} data-testid="pipeline-mode-switch">
              {stepMode ? 'Build it all at once' : 'Go step by step'}
            </button>
          </span>
        </div>

        {!stepMode && (
        <>
        <div className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }} data-testid="pipeline-next">
          <ArrowRight size={14} style={{ color: 'var(--accent)' }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 14 }}>
            <b>Next:</b> {next.text}
            {next.slot && <span style={{ color: 'var(--muted)' }}> (the highlighted slot in the {LANES.find((l) => l.id === blockById(next.block!)!.lane)!.label} lane)</span>}
          </span>
          {next.block && hintLevel < 3 && (
            <button className="btn btn-ghost" onClick={() => setHint({ for: next.block, level: hintLevel + 1 })}>
              <Lightbulb size={14} /> {hintLevel === 0 ? 'Hint' : 'Another hint'}
            </button>
          )}
        </div>
        {next.block && hintLevel > 0 && (
          <ul className="m-0 pl-5 space-y-1" style={{ fontSize: 13 }} data-testid="pipeline-hints">
            <li>
              Look in the <b>{LANES.find((l) => l.id === blockById(next.block!)!.lane)!.label}</b> lane, at the highlighted slot: {LANES.find((l) => l.id === blockById(next.block!)!.lane)!.layer}.
            </li>
            {hintLevel > 1 && (
              <li>
                Take <b>“{blockById(next.block)!.label}”</b> from the blocks below and put it there.
              </li>
            )}
            {hintLevel > 2 && (
              <li>
                <button className="btn" onClick={() => void showLane(blockById(next.block!)!.lane)} disabled={demo?.busy}>
                  Show me this lane
                </button>{' '}
                <span style={{ color: 'var(--muted)' }}>It rebuilds the {ROLE_NAME[blockById(next.block!)!.lane]}&apos;s lane step by step; blocks you placed in that lane go back to the palette.</span>
              </li>
            )}
          </ul>
        )}
        {next.block && hintLevel === 2 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Still stuck? One more hint can build this lane for you, one block at a time.</div>}
        {demo && (
          <section aria-label="This lane, step by step" className="rounded-lg p-3 space-y-1" style={{ border: `1.5px solid ${LANE_COLOR[demo.lane]}`, background: 'var(--panel)' }} data-testid="pipeline-demo">
            <div className="flex items-center gap-2">
              <b className="flex-1">{LANES.find((l) => l.id === demo.lane)!.label} lane, step by step</b>
              {demo.busy && <Loader2 size={14} className="animate-spin" />}
              <button className="btn btn-ghost" onClick={() => setDemo(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <ol className="m-0 pl-5" style={{ fontSize: 13 }}>
              {demo.steps.map((st) => (
                <li key={st.block}>
                  <b>{blockById(st.block)!.label}.</b> {st.caption}
                </li>
              ))}
            </ol>
          </section>
        )}
        </>
        )}

        <div className="space-y-2">
          {LANES.map((lane) => (
            <div key={lane.id} className="pl-lane" style={{ ['--lane' as string]: LANE_COLOR[lane.id] }}>
              <div className="pl-lane-label">
                {lane.label}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>{lane.layer}</div>
              </div>
              <div className="pl-slots" style={{ gridTemplateColumns: `repeat(${lane.slots}, minmax(100px, 168px))` }}>
                {Array.from({ length: lane.slots }, (_, i) => {
                  const slot = slotId(lane.id, i)
                  const id = state.slots[slot]
                  const block = id ? blockById(id) : undefined
                  const target = picked !== null && blockById(picked)!.lane === lane.id
                  const dim = picked !== null && !target
                  const isNext = !block && (stepMode ? allowedSlot === slot && (help !== 'self' || hintLevel > 0) : next.slot === slot)
                  const muted = stepMode && !block && slot !== allowedSlot
                  return (
                    <div
                      key={slot}
                      className={`pl-slot${block ? ' filled' : ''}${target && !muted ? ' target' : ''}${dim ? ' dim' : ''}${isNext ? ' next' : ''}${muted ? ' muted' : ''}`}
                      data-next={isNext ? 'true' : undefined}
                      data-slot={slot}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const dragged = e.dataTransfer.getData('text/plain') as BlockId
                        const b = blockById(dragged)
                        if (b && b.lane === lane.id && (!stepMode || slot === allowedSlot)) {
                          setState(place(state, dragged, slot))
                          setOpen(dragged)
                        }
                      }}
                    >
                      {block ? (
                        <PlacedBlock block={block} state={eff} index={order.indexOf(block.id)} active={open === block.id} onClick={() => clickSlot(slot)} tip={tipProps(block.id)} attn={attention?.ids.includes(block.id) ?? false} />
                      ) : (
                        <button className="pl-empty" aria-label={`Empty slot ${i + 1} in the ${lane.label} lane${isNext ? ' (next step goes here)' : ''}`} onClick={() => clickSlot(slot)} disabled={!target || muted}>
                          {target && !muted ? 'Place here' : isNext ? 'Next block here' : ''}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <section aria-label="Blocks" className="rounded-lg p-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <div className="mb-2" style={{ color: 'var(--muted)', fontSize: 12 }}>
            {picked ? (
              <>
                Now tap a free slot in the <b>{LANES.find((l) => l.id === blockById(picked)!.lane)!.label}</b> lane for “{blockById(picked)!.label}”.
              </>
            ) : stepMode ? (
              'Tap a block, then tap the highlighted slot. Tap a placed block to set it up. Not every block belongs in the pipeline.'
            ) : (
              'Tap a block, then tap a slot in its lane. Tap a placed block to set it up. Not every block belongs in the pipeline.'
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {palette.map((b) => (
              <button
                key={b.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}
                className={`pl-block pl-chipblock${picked === b.id ? ' picked' : ''}`}
                style={{ ['--lane' as string]: LANE_COLOR[b.lane] }}
                onClick={() => setPicked(picked === b.id ? null : b.id)}
                aria-pressed={picked === b.id}
                {...tipProps(b.id)}
              >
                {b.label}
              </button>
            ))}
            {palette.length === 0 && <span style={{ color: 'var(--muted)' }}>All blocks are placed.</span>}
          </div>
        </section>

        {openBlock && (
          <BlockSettings
            block={openBlock}
            state={eff}
            phase={phase}
            first={order[0] === openBlock.id}
            set={(p) => setSettings(openBlock.id, p)}
            setBlank={(blank) => setState((s) => ({ ...s, blank }))}
            hints={hints}
            moreHint={() => setHints((h) => Math.min(2, h + 1))}
            journal={journal}
            onRemove={() => {
              setState(remove(state, openBlock.id))
              setOpen(null)
            }}
            onClose={() => setOpen(null)}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {stepMode ? (
            <>
              <button
                className="btn btn-primary"
                onClick={() => (active === null ? void run(lastStep(eff) ?? undefined) : explainStep() ? undefined : void run(active))}
                disabled={busy !== null}
                aria-disabled={stepReason !== null}
                title={stepReason ?? 'Runs the pipeline up to this step and shows what it built'}
                data-testid="pipeline-run-step"
              >
                {busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {active === null ? 'Run again' : 'Run this step'}
              </button>
              {rest && rest !== active && (
                <button className="btn" onClick={() => (explainStep() ? undefined : void run(rest))} disabled={busy !== null} aria-disabled={stepReason !== null} title="The next steps are already on the board: run them all, then look at the last table" data-testid="pipeline-run-rest">
                  <Play size={14} /> Run the rest
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => (explain() ? undefined : void run())} disabled={busy !== null} aria-disabled={reason !== null} title={reason ?? 'Run the pipeline once on what is there now'}>
              {busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {ran ? 'Run again' : 'Run'}
            </button>
          )}
          <button className="btn" onClick={() => (phase === 'first-pass' ? setAttention({ ids: [], text: 'Run the pipeline first: the Head of Sales will look at the number, and then Check opens.' }) : explain() ? undefined : void check())} disabled={busy !== null} aria-disabled={reason !== null || phase === 'first-pass'} title={reason ?? (phase === 'first-pass' ? 'Run the pipeline first: the Head of Sales will look at the number' : 'Start from scratch, run it twice and judge the result')}>
            {busy === 'check' ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Check my pipeline
          </button>
          <button className="btn btn-ghost" onClick={() => (prep !== 'ready' ? void explain() : void scratch())} disabled={busy !== null} aria-disabled={prep !== 'ready'} title={`Drops the tables the pipeline built in ${SCHEMA} (bronze, silver, gold, report). Your blocks and settings stay where they are.`}>
            <RotateCcw size={14} /> Start from scratch
          </button>
          {(twist || solved) && (
            <button className="btn btn-ghost" onClick={() => void replay()} disabled={busy !== null || prep !== 'ready'} title="Go back to the first pass of the story. Your blocks stay where they are.">
              <Undo2 size={14} /> Replay the story
            </button>
          )}
          {prep !== 'ready' && prep !== 'loading' && (
            <button className="btn" onClick={() => setPrepTry((n) => n + 1)}>
              Try again
            </button>
          )}
          <span style={{ color: (stepMode ? stepReason : reason) ? 'var(--warn-text)' : 'var(--muted)', fontSize: 13 }} data-testid="pipeline-reason">{(stepMode ? stepReason : reason) ?? (stepMode ? 'Runs everything up to this step, then shows what it built.' : `Start from scratch drops the tables built in ${SCHEMA} and keeps your blocks. Open the tables in the tree.`)}</span>
          {typeof prep === 'string' && prep !== 'loading' && prep !== 'ready' && (
            <span style={{ color: 'var(--danger)', fontSize: 12 }}>{prep}</span>
          )}
        </div>

        {attention && (
          <div className="rounded-lg px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', fontSize: 13 }} role="alert" data-testid="pipeline-attention">
            {attention.text}
          </div>
        )}
        {note && (
          <div style={{ fontSize: 13 }} data-testid="pipeline-note">
            {note}
          </div>
        )}
        {stepMode && viewedSnap && <CameOut snap={viewedSnap} stale={viewedSnap.phase !== phase && viewedSnap.block !== 'copy-files'} />}
        {journal.length > 0 && <Journal journal={journal} />}
        {answer && <Card answer={answer} />}
        {report && <Report report={report} notes={softNotes(eff)} fixed={twist?.mismatch === true} />}
        {!report && journal.length > 0 && softNotes(eff).length > 0 && <Notes notes={softNotes(eff)} />}
        {solved && <BackToQuaera />}
      </div>
      {tip && <BlockTip id={tip.id} x={tip.x} top={tip.top} bottom={tip.bottom} />}
    </div>
  )
}

function PlacedBlock({ block, state, index, active, onClick, tip, attn }: { block: Block; state: PipelineState; index: number; active: boolean; onClick: () => void; tip: React.HTMLAttributes<HTMLElement>; attn: boolean }) {
  const unset = unsetOf(state, block.id, index)
  return (
    <button
      className={`pl-block${active ? ' picked' : ''}${attn ? ' attn' : ''}`}
      style={{ ['--lane' as string]: LANE_COLOR[block.lane] }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', block.id)}
      onClick={onClick}
      aria-expanded={active}
      {...tip}
    >
      <span className="pl-no">{index + 1}</span>
      {block.label}
      {unset && (
        <span className="pl-unset" aria-label={unset}>
          ?
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------- the strip for newcomers, and the block tips

const INTRO_KEY = 'stratalab.pipeline.intro-open'

function Intro() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(INTRO_KEY, open ? 'closed' : 'open')
    } catch {
      /* not kept */
    }
  }
  return (
    <section aria-label={INTRO.title} className="rounded-lg" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }} data-testid="pipeline-intro">
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left" onClick={toggle} aria-expanded={open} style={{ background: 'transparent', border: 0, color: 'var(--text)' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-semibold">{INTRO.title}</span>
        {!open && <span style={{ color: 'var(--muted)', fontSize: 12 }}>source → bronze → silver → gold → report</span>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <ol className="m-0 pl-5" style={{ fontSize: 13 }}>
            {INTRO.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-1" aria-label="source, bronze, silver, gold, report">
            {INTRO.stages.map((st, i) => (
              <span key={st.name} className="inline-flex items-center gap-1">
                {i > 0 && <ArrowRight size={14} style={{ color: 'var(--muted)' }} />}
                <span className="pl-stage" style={{ ['--lane' as string]: st.lane ? LANE_COLOR[st.lane] : '#6b7280' }}>
                  <b>{st.name}</b> <span style={{ fontWeight: 400 }}>{st.note}</span>
                </span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3" style={{ fontSize: 12 }}>
            {LANES.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1">
                <span className="pl-dot" style={{ background: LANE_COLOR[l.id] }} /> {l.label}
              </span>
            ))}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{INTRO.fabric}</div>
        </div>
      )}
    </section>
  )
}

/** A block's tip (hover, focus, tap): what it does, whose job it is, its Fabric name. One popover for the page, fixed so no lane clips it. */
function BlockTip({ id, x, top, bottom }: { id: BlockId; x: number; top: number; bottom: number }) {
  const b = blockById(id)!
  const ref = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(bottom + 6)
  // Below the block when it fits, else above it, else pinned inside the window: the tray sits at the bottom edge.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const below = bottom + 6
    const fits = below + h <= window.innerHeight - 8
    setY(fits ? below : Math.max(8, Math.min(top - h - 6, window.innerHeight - h - 8)))
  }, [id, top, bottom])
  return (
    <div ref={ref} id="pl-tip" role="tooltip" className="pl-tip" style={{ left: x, top: y }}>
      <div className="font-semibold">{b.label}</div>
      <div>{BLOCK_TIPS[id].does}</div>
      <div style={{ color: LANE_COLOR[b.lane], fontWeight: 600, fontSize: 12 }}>Whose job: the {ROLE_NAME[b.lane]}</div>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>In Fabric: {BLOCK_TIPS[id].fabric}</div>
    </div>
  )
}

// ---------------------------------------------------------------- settings

function Choice<T extends string | boolean | null>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span style={{ fontSize: 13, minWidth: 190 }}>{label}</span>
      <span role="radiogroup" aria-label={label} className="inline-flex rounded-md overflow-hidden" style={{ border: '1px solid var(--line)' }}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className="px-3 py-1"
            style={{ fontSize: 13, background: value === o.v ? 'var(--accent)' : 'var(--panel)', color: value === o.v ? 'var(--accent-ink)' : 'var(--text)', borderRight: '1px solid var(--line)' }}
          >
            {o.text}
          </button>
        ))}
      </span>
      {value === null && <span className="pl-unset" aria-label="not chosen yet">?</span>}
    </div>
  )
}

function BlockSettings({
  block,
  state,
  phase,
  first,
  set,
  setBlank,
  hints,
  moreHint,
  journal,
  onRemove,
  onClose,
}: {
  block: Block
  state: PipelineState
  phase: Phase
  first: boolean
  set: (p: Partial<Settings>) => void
  setBlank: (b: string) => void
  hints: number
  moreHint: () => void
  journal: StepResult[]
  onRemove: () => void
  onClose: () => void
}) {
  const s = state.settings[block.id]
  const copy = block.id === 'copy-files'
  return (
    <section aria-label={`Settings: ${block.label}`} className="rounded-lg p-3 space-y-3" style={{ background: 'var(--panel)', border: `1.5px solid ${LANE_COLOR[block.lane]}` }} data-testid="pipeline-settings">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{block.label}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{INFO[block.id]}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Whose job: the {ROLE_NAME[block.lane]}. In Fabric: {BLOCK_TIPS[block.id].fabric}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onRemove} title="Put the block back in the palette">
          <Trash2 size={14} /> Remove
        </button>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close the settings">
          <X size={16} />
        </button>
      </div>
      {copy && (
        <div className="space-y-2">
          <Choice label="Files" value={s.files} onChange={(files) => set({ files })} options={[{ v: 'all', text: 'All 30 monthly files' }, { v: 'latest', text: 'Latest file only' }]} />
          <Choice label="Format" value={s.format} onChange={(format) => set({ format })} options={[{ v: 'text', text: 'Delimited text' }, { v: 'binary', text: 'Binary' }]} />
          {s.format === 'text' && (
            <>
              <Choice label="Delimiter" value={s.delim} onChange={(delim) => set({ delim })} options={[{ v: ';', text: ';' }, { v: ',', text: ',' }]} />
              <Choice label="First row is the header" value={s.header} onChange={(header) => set({ header })} options={[{ v: true, text: 'Yes' }, { v: false, text: 'No' }]} />
            </>
          )}
          <Choice label="Write mode" value={s.mode} onChange={(mode) => set({ mode })} options={[{ v: 'replace', text: 'Replace' }, { v: 'append', text: 'Append' }]} />
        </div>
      )}
      {block.id === 'card-top-chain' && (
        <Choice label="Measure" value={s.measure} onChange={(measure) => set({ measure })} options={[{ v: 'sum', text: 'Sum of revenue' }, { v: 'distinct', text: 'Sum of revenue over distinct rows' }]} />
      )}
      {block.id === 'sql-silver' && <SqlStep phase={phase} blank={state.blank} setBlank={setBlank} hints={hints} moreHint={moreHint} result={journal.find((j) => j.block === 'sql-silver')} />}
      {first ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>This is the first step, so it always runs.</div>
      ) : (
        <>
          <Choice label="Runs when the previous step" value={s.when} onChange={(when) => set({ when })} options={[{ v: 'succeeded', text: 'Succeeded' }, { v: 'completed', text: 'Completed' }]} />
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{WHEN_TIP}</div>
        </>
      )}
    </section>
  )
}

function SqlStep({ phase, blank, setBlank, hints, moreHint, result }: { phase: Phase; blank: string; setBlank: (b: string) => void; hints: number; moreHint: () => void; result?: StepResult }) {
  const { before, after } = useMemo(silverTemplate, [])
  const bad = blank.trim() ? checkBlank(blank) : null
  const ref = useRef<HTMLInputElement>(null)
  const exact = result?.verdict && result.verdict.extra === 0 && result.verdict.missing === 0
  if (phase === 'first-pass')
    return (
      <div className="space-y-2">
        <div className="font-medium">{TWIST.prompt}</div>
        <pre className="pl-code" data-testid="pipeline-sql">
          {silverSql('', { dedup: false })}
        </pre>
        {result && result.status === 'failed' && (
          <div style={{ color: 'var(--danger)', fontSize: 13 }} data-testid="pipeline-verdict">
            {result.message}
          </div>
        )}
      </div>
    )
  return (
    <div className="space-y-2">
      <div className="font-medium">{SILVER_PROMPT}</div>
      <pre className="pl-code" data-testid="pipeline-sql">
        {before}
        <input
          ref={ref}
          className="pl-blank"
          aria-label="The blank: what makes two rows the same sale"
          spellCheck={false}
          autoComplete="off"
          value={blank}
          placeholder="____"
          size={Math.max(8, Math.min(60, blank.length + 1))}
          onChange={(e) => setBlank(e.target.value.replace(/\r?\n/g, ' '))}
        />
        {after}
      </pre>
      {bad && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{bad}</div>}
      {result && result.status === 'failed' && (
        <div style={{ color: 'var(--danger)', fontSize: 13 }} data-testid="pipeline-verdict">
          {result.message}
        </div>
      )}
      {result && result.status === 'succeeded' && (
        <div style={{ color: exact ? '#16a34a' : 'var(--warn-text)', fontSize: 13 }} data-testid="pipeline-verdict">
          {exact ? <Check size={13} className="inline mr-1" /> : null}
          {result.message}
        </div>
      )}
      {hints > 0 && (
        <ul className="m-0 pl-5" style={{ fontSize: 13 }}>
          {SILVER_HINTS.slice(0, hints).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {hints < SILVER_HINTS.length && (
        <button className="btn" onClick={moreHint}>
          <Lightbulb size={14} /> {hints === 0 ? 'Hint' : 'Another hint'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the story, the return

/** Whether row i is the first step of its lane that the run has reached (running, done or failed; not queued or skipped). */
function reachedFirst(journal: StepResult[], i: number): boolean {
  const reached = (r: StepResult) => r.status === 'running' || r.status === 'succeeded' || r.status === 'failed'
  const lane = blockById(journal[i].block)!.lane
  if (!reached(journal[i])) return false
  return !journal.slice(0, i).some((r) => blockById(r.block)!.lane === lane && reached(r))
}

function Why({ text, id }: { text: string; id: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1" style={{ fontSize: 13 }}>
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`pipeline-why-${id}`}>
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open && (
        <div className="mt-1" style={{ color: 'var(--text)' }} data-testid={`pipeline-why-text-${id}`}>
          {text}
        </div>
      )}
    </div>
  )
}

/** The Head of Sales answers the first pass: the card does not match his own file. */
function TwistCard({ twist, phase, solved }: { twist: Twist; phase: Phase; solved: boolean }) {
  return (
    <section aria-label={TWIST.title} className="rounded-lg px-4 py-3 space-y-1" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} data-testid="pipeline-twist">
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Head of Sales{twist.mismatch ? `: ${TWIST.title.toLowerCase()}` : ''}</div>
      <div className="font-semibold">“{twist.mismatch ? TWIST.ask(twist.mine) : TWIST.askSame}”</div>
      {twist.mismatch && phase === 'fix' && !solved && <div style={{ fontSize: 13 }}>{TWIST.next}</div>}
    </section>
  )
}

/** After all three proofs: back to the trainer, which keeps a mark (a new tab, so the pipeline stays open here). */
function BackToQuaera() {
  return (
    <section className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--panel)', border: '1px solid #16a34a' }} data-testid="pipeline-back">
      <Check size={16} style={{ color: '#16a34a' }} />
      <span className="flex-1 min-w-0">You built a working pipeline. Quaera will remember it.</span>
      <a className="btn btn-primary" href={RETURN_URL} target="_blank" rel="noopener" onClick={(e) => followQuaeraLink(e, RETURN_URL)}>
        Back to Quaera
      </a>
    </section>
  )
}

// ---------------------------------------------------------------- journal, card, proofs

const STATUS: Record<StepStatus, { text: string; color: string }> = {
  queued: { text: 'Queued', color: '#6b7280' },
  running: { text: 'In progress', color: '#2563eb' },
  succeeded: { text: 'Succeeded', color: '#16a34a' },
  failed: { text: 'Failed', color: '#dc2626' },
  skipped: { text: 'Skipped', color: '#9ca3af' },
}

function Journal({ journal }: { journal: StepResult[] }) {
  return (
    <section aria-label="Journal" className="rounded-lg overflow-x-auto" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
      <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }} data-testid="pipeline-journal">
        <thead>
          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
            {['#', 'Step', 'Status', 'Time', 'Rows', 'Message'].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {journal.map((r, i) => (
            <Fragment key={`${r.block}-${i}`}>
              {reachedFirst(journal, i) && (
                <tr data-testid="pipeline-line" style={{ borderTop: '1px solid var(--line)' }}>
                  <td colSpan={6} className="px-3 py-1.5" style={{ fontSize: 13 }}>
                    <b style={{ color: LANE_COLOR[blockById(r.block)!.lane] }}>{LANES.find((l) => l.id === blockById(r.block)!.lane)!.label}:</b> “{LANE_LINES[blockById(r.block)!.lane]}”
                  </td>
                </tr>
              )}
            <tr style={{ borderTop: '1px solid var(--line)' }}>
              <td className="px-3 py-1.5">{i + 1}</td>
              <td className="px-3 py-1.5">{blockById(r.block)!.label}</td>
              <td className="px-3 py-1.5">
                <span className="pl-chip" style={{ ['--c' as string]: STATUS[r.status].color }}>
                  {r.status === 'running' && <Loader2 size={11} className="animate-spin" />}
                  {STATUS[r.status].text}
                </span>
              </td>
              <td className="px-3 py-1.5" style={{ color: 'var(--muted)' }}>
                {r.ms == null ? '' : `${r.ms} ms`}
              </td>
              <td className="px-3 py-1.5" data-testid="pipeline-rows">
                {typeof r.rows === 'number' ? fmt(r.rows) : (r.rows ?? '')}
              </td>
              <td className="px-3 py-1.5" style={{ color: r.status === 'failed' ? 'var(--danger)' : 'var(--text)' }}>
                {r.message}
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Card({ answer }: { answer: ResultData }) {
  const max = Math.max(...answer.rows.map((r) => Number(r[1])))
  const top = answer.rows[0]
  return (
    <section aria-label="The answer" className="rounded-lg p-4 space-y-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} data-testid="pipeline-card">
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Top chain, January to June 2026</div>
      <div className="text-2xl font-semibold">
        {String(top[0])}, {money(top[1])}
      </div>
      <div className="space-y-1">
        {answer.rows.map((r) => (
          <div key={String(r[0])} className="flex items-center gap-2" style={{ fontSize: 13 }}>
            <span style={{ width: 80 }}>{String(r[0])}</span>
            <span className="flex-1 rounded" style={{ background: 'var(--panel-2)', height: 14 }}>
              <span className="block rounded" style={{ width: `${(Number(r[1]) / max) * 100}%`, height: 14, background: 'var(--accent)' }} />
            </span>
            <span style={{ width: 90, textAlign: 'right' }}>{money(r[1])}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="m-0 pl-5" style={{ color: 'var(--muted)', fontSize: 13 }}>
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}

function Report({ report, notes, fixed }: { report: CheckReport; notes: string[]; fixed: boolean }) {
  const { proofs, answer, gold } = report
  const lines = [proofs.answer, proofs.again, proofs.clean]
  const shown = [
    answer?.rows[0] ? `Answer: ${String(answer.rows[0][0])}, ${money(answer.rows[0][1])}` : 'No answer reached the card',
    proofs.again.ok ? 'Every table has the same rows after the second run' : 'The second run changed a table',
    proofs.clean.ok
      ? `${fmt(gold.rows)} sales, every one with its store and product, none twice`
      : gold.rows == null
        ? 'Gold was not built'
        : `${fmt(gold.rows)} sales, ${fmt(gold.noKey)} without a store or product, ${fmt(gold.dupGroups)} sold twice`,
  ]
  const tables = Object.keys(report.counts1).concat(Object.keys(report.counts2)).filter((t, i, a) => a.indexOf(t) === i) as (keyof typeof report.counts1)[]
  return (
    <section aria-label="Proofs" className="rounded-lg p-4 space-y-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} data-testid="pipeline-proofs">
      {lines.map((p, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="pl-mark" style={{ background: p.ok ? '#16a34a' : '#dc2626' }} aria-label={p.ok ? 'passed' : 'not passed'}>
            {p.ok ? <Check size={13} /> : <X size={13} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{PROOF_TITLES[i]}</div>
            <div style={{ fontSize: 13 }}>{shown[i]}</div>
            {p.diagnosis && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }} data-testid={`pipeline-diagnosis-${i + 1}`}>
                <ChevronRight size={12} className="inline" /> {p.diagnosis}
              </div>
            )}
            {p.why && <Why text={p.why} id={i + 1} />}
            {i === 1 && (
              <table className="mt-2" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                    <th className="pr-4 font-medium">Table</th>
                    <th className="pr-4 font-medium">Run 1</th>
                    <th className="font-medium">Run 2</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => {
                    const a = report.counts1[t] ?? null
                    const b = report.counts2[t] ?? null
                    return (
                      <tr key={t} style={{ color: a === b ? 'var(--text)' : 'var(--danger)', fontWeight: a === b ? 400 : 600 }}>
                        <td className="pr-4">{t}</td>
                        <td className="pr-4">{fmt(a)}</td>
                        <td>{fmt(b)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}
      {proofs.note && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{proofs.note}</div>}
      {report.solved && (
        <div className="font-semibold" style={{ color: '#16a34a' }}>
          All three proofs passed. The pipeline works.{fixed ? ` ${TWIST.fixed}` : ''}
        </div>
      )}
      {notes.length > 0 && <Notes notes={notes} />}
    </section>
  )
}
