// The warm-up before the real pipeline (src/data/pipelines/storesByRegion.ts): 1. Watch, a small pipeline builds itself with a
// line on every block and every "Runs when" arrow; 2. Now you, the same pipeline empty and built by the learner with hints;
// then "Now the real one". Worked example, then completion, then the full problem.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Lightbulb, Loader2, Play, SkipForward, Trash2 } from 'lucide-react'
import type { ResultData } from '../core/check'
import { LANE_COLOR, LANES, ROLE_NAME, type LaneId } from '../data/pipelines/kaiyoSellout'
import {
  ARROW_CAPTION,
  TUT_BLOCKS,
  TUT_LANES,
  TUT_QUESTION,
  TUT_SCHEMA,
  TUT_TABLES,
  WATCH_CAPTIONS,
  tutBlock,
  tutSlot,
  type TutBlock,
  type TutBlockId,
} from '../data/pipelines/storesByRegion'
import { enginePort } from '../db/pipelinePort'
import { checkpoint } from '../db/engine'
import { prepareTutorial, previewTable, resetTutorial, runTutorial, type TutPlacedStep, type TutStep } from '../db/tutorialRun'
import { refreshCatalog } from './store'

type When = 'succeeded' | 'completed' | null
type Slots = Record<string, TutBlockId | null>
type Whens = Partial<Record<TutBlockId, When>>

const ALL_SLOTS = TUT_LANES.flatMap((l) => Array.from({ length: l.slots }, (_, i) => tutSlot(l.id, i)))
const emptySlots = (): Slots => Object.fromEntries(ALL_SLOTS.map((s) => [s, null]))
const laneOf = (slot: string) => slot.slice(0, slot.lastIndexOf('-')) as LaneId
const laneLabel = (id: LaneId) => LANES.find((l) => l.id === id)!.label

/** Placed blocks in run order: lanes top to bottom, slots left to right. */
function orderOf(slots: Slots): TutBlockId[] {
  return ALL_SLOTS.map((s) => slots[s]).filter((x): x is TutBlockId => !!x)
}

function nextBlock(slots: Slots): TutBlock | null {
  const placed = new Set(orderOf(slots))
  return TUT_BLOCKS.find((b) => !placed.has(b.id)) ?? null
}

/** The slot to light up: first free slot of the lane to the right of what is placed there. */
function nextSlot(slots: Slots, b: TutBlock): string | null {
  const lane = TUT_LANES.find((l) => l.id === b.lane)!
  const idx = Array.from({ length: lane.slots }, (_, i) => i)
  const free = idx.filter((i) => !slots[tutSlot(b.lane, i)])
  const last = Math.max(-1, ...idx.filter((i) => slots[tutSlot(b.lane, i)]))
  const i = free.find((n) => n > last) ?? free[0]
  return i === undefined ? null : tutSlot(b.lane, i)
}

function Preview({ title, data }: { title: string; data: ResultData | null }) {
  if (!data) return null
  return (
    <div className="overflow-x-auto">
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{title}</div>
      <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            {data.header.map((c) => (
              <th key={c} className="pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="pr-3">
                  {c === null ? '' : String(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Journal({ journal }: { journal: TutStep[] }) {
  const chip: Record<TutStep['status'], string> = { queued: '#6b7280', running: '#2563eb', succeeded: '#16a34a', failed: '#dc2626', skipped: '#9ca3af' }
  const word: Record<TutStep['status'], string> = { queued: 'Queued', running: 'In progress', succeeded: 'Succeeded', failed: 'Failed', skipped: 'Skipped' }
  return (
    <section aria-label="Journal" className="rounded-lg overflow-x-auto" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} data-testid="tutorial-journal">
      <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {journal.map((r, i) => (
            <tr key={r.block} style={{ borderTop: i ? '1px solid var(--line)' : undefined }}>
              <td className="px-3 py-1.5">{i + 1}</td>
              <td className="px-3 py-1.5">{tutBlock(r.block)!.label}</td>
              <td className="px-3 py-1.5">
                <span className="pl-chip" style={{ ['--c' as string]: chip[r.status] }}>
                  {r.status === 'running' && <Loader2 size={11} className="animate-spin" />}
                  {word[r.status]}
                </span>
              </td>
              <td className="px-3 py-1.5" style={{ color: r.status === 'failed' ? 'var(--danger)' : 'var(--text)' }}>
                {r.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Lanes({
  slots,
  next,
  picked,
  open,
  attn,
  onSlot,
}: {
  slots: Slots
  next: string | null
  picked: TutBlockId | null
  open: TutBlockId | null
  attn: TutBlockId[]
  onSlot: (slot: string) => void
}) {
  const order = orderOf(slots)
  return (
    <div className="space-y-2">
      {TUT_LANES.map((lane) => (
        <div key={lane.id} className="pl-lane" style={{ ['--lane' as string]: LANE_COLOR[lane.id] }}>
          <div className="pl-lane-label">{laneLabel(lane.id)}</div>
          <div className="pl-slots" style={{ gridTemplateColumns: `repeat(${lane.slots}, minmax(120px, 190px))` }}>
            {Array.from({ length: lane.slots }, (_, i) => {
              const slot = tutSlot(lane.id, i)
              const id = slots[slot]
              const b = id ? tutBlock(id)! : null
              const target = picked !== null && tutBlock(picked)!.lane === lane.id
              const isNext = next === slot && !b
              return (
                <div key={slot} className={`pl-slot${b ? ' filled' : ''}${target ? ' target' : ''}${isNext ? ' next' : ''}`} data-slot={slot}>
                  {b ? (
                    <button
                      className={`pl-block${open === b.id ? ' picked' : ''}${attn.includes(b.id) ? ' attn' : ''}`}
                      style={{ ['--lane' as string]: LANE_COLOR[b.lane] }}
                      onClick={() => onSlot(slot)}
                      aria-expanded={open === b.id}
                    >
                      <span className="pl-no">{order.indexOf(b.id) + 1}</span>
                      {b.label}
                    </button>
                  ) : (
                    <button className="pl-empty" onClick={() => onSlot(slot)} disabled={!target} aria-label={`Empty slot ${i + 1} in the ${laneLabel(lane.id)} lane${isNext ? ' (next step goes here)' : ''}`}>
                      {target ? 'Place here' : isNext ? 'Next block here' : ''}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PipelineTutorial({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [mode, setMode] = useState<'watch' | 'build'>('watch')
  const [prep, setPrep] = useState<'loading' | 'ready' | string>('loading')
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let alive = true
    setPrep('loading')
    prepareTutorial(enginePort)
      .then(async () => {
        await checkpoint()
        await refreshCatalog()
        if (alive) setPrep('ready')
      })
      .catch((e) => alive && setPrep(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [tries])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])

  return (
    <div className="flex-1 min-h-0 overflow-auto" data-testid="pipeline-tutorial">
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>A short warm-up before the real pipeline: step {mode === 'watch' ? 1 : 2} of 2</div>
            <h1 className="m-0 text-lg font-semibold">{mode === 'watch' ? 'Watch a small pipeline build itself' : 'Now you build it'}</h1>
          </div>
          <button className="btn btn-ghost" onClick={onSkip} data-testid="tutorial-skip">
            <SkipForward size={14} /> Skip, I know pipelines
          </button>
        </div>
        <div className="rounded-lg px-4 py-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Head of Sales</div>
          <div className="font-semibold">{TUT_QUESTION}</div>
          <div style={{ fontSize: 13 }}>One small file, four steps. A pipeline is a chain of steps that turns raw files into one answer; each step starts when the one before it is done.</div>
        </div>
        {prep !== 'ready' && (
          <div style={{ fontSize: 13, color: prep === 'loading' ? 'var(--muted)' : 'var(--danger)' }} role="status">
            {prep === 'loading' ? 'Preparing the data…' : `The data could not be prepared: ${prep}`}{' '}
            {prep !== 'loading' && (
              <button className="btn" onClick={() => setTries((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        )}
        {mode === 'watch' ? <Watch ready={prep === 'ready'} alive={alive} onNext={() => setMode('build')} /> : <Build ready={prep === 'ready'} onDone={onDone} />}
      </div>
    </div>
  )
}

/** The answer line and the three tables the run built, shared by both parts. */
function Built({ previews }: { previews: Record<string, ResultData | null> }) {
  const top = previews.report_regions?.rows[0]
  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>What each step built (in the tree under {TUT_SCHEMA})</div>
        <Preview title="bronze_stores: the file as it came, all text" data={previews.bronze_stores ?? null} />
        <Preview title="silver_stores: real numbers, only active stores" data={previews.silver_stores ?? null} />
        <Preview title="gold_stores_by_region: stores per region" data={previews.gold_stores_by_region ?? null} />
      </div>
      {top && (
        <div className="rounded-lg p-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} data-testid="tutorial-answer">
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>The answer</div>
          <div className="text-xl font-semibold">
            {String(top[0])}, {String(top[1])} stores
          </div>
        </div>
      )}
    </div>
  )
}

async function loadPreviews(): Promise<Record<string, ResultData | null>> {
  const out: Record<string, ResultData | null> = {}
  for (const t of TUT_TABLES) out[t] = await previewTable(enginePort, t, t === 'report_regions' ? 3 : 5)
  return out
}

// ---------------------------------------------------------------- 1. Watch

function Watch({ ready, alive, onNext }: { ready: boolean; alive: React.MutableRefObject<boolean>; onNext: () => void }) {
  const [slots, setSlots] = useState<Slots>(emptySlots)
  const [captions, setCaptions] = useState<{ key: string; text: string; arrow?: boolean }[]>([])
  /** blocks placed so far; null before Start; TUT_BLOCKS.length means all placed, Run is next */
  const [step, setStep] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [journal, setJournal] = useState<TutStep[]>([])
  const [previews, setPreviews] = useState<Record<string, ResultData | null>>({})
  const placed = useRef<Slots>(emptySlots())
  const steps = useRef<TutPlacedStep[]>([])
  const total = TUT_BLOCKS.length

  const start = async () => {
    setRunning(true)
    setDone(false)
    setSlots(emptySlots())
    setCaptions([])
    setJournal([])
    setPreviews({})
    placed.current = emptySlots()
    steps.current = []
    await resetTutorial(enginePort)
    if (!alive.current) return
    setRunning(false)
    setStep(0)
  }

  // One press of Next: the next block goes in (with the arrow that joins it to the one before), then Run.
  const next = async () => {
    if (step === null || running) return
    if (step < total) {
      const b = TUT_BLOCKS[step]
      const slot = nextSlot(placed.current, b)!
      placed.current[slot] = b.id
      setSlots({ ...placed.current })
      steps.current.push({ id: b.id, when: step === 0 ? null : 'succeeded' })
      setCaptions((c) => [
        ...c,
        { key: b.id, text: `${b.label}. ${WATCH_CAPTIONS[b.id]} In Fabric: ${b.fabric}` },
        ...(step > 0 ? [{ key: `${b.id}-arrow`, text: step === 1 ? ARROW_CAPTION : `Runs when the previous step: Succeeded, again.`, arrow: true }] : []),
      ])
      setStep(step + 1)
      return
    }
    setRunning(true)
    setCaptions((c) => [...c, { key: 'run', text: 'Now Run: the steps go one after another, each only after the one before it succeeded.' }])
    const j = await runTutorial(enginePort, steps.current, setJournal)
    setJournal(j)
    await checkpoint()
    await refreshCatalog()
    if (!alive.current) return
    setPreviews(await loadPreviews())
    setRunning(false)
    setDone(true)
    setStep(total + 1)
  }

  const nextLabel = step === null ? '' : step < total ? `Next: place ${TUT_BLOCKS[step].label}` : 'Next: Run the pipeline'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {step === null || done ? (
          <button className="btn btn-primary" onClick={() => void start()} disabled={!ready || running} data-testid="tutorial-play">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {done ? 'Watch again' : 'Start'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void next()} disabled={!ready || running} data-testid="tutorial-step">
            {running ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} {nextLabel}
          </button>
        )}
        {!ready && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Start works when the data is ready.</span>}
        {done && (
          <button className="btn btn-primary" onClick={onNext} data-testid="tutorial-next">
            <ArrowRight size={14} /> Now you build it
          </button>
        )}
      </div>
      <Lanes slots={slots} next={null} picked={null} open={null} attn={[]} onSlot={() => undefined} />
      {captions.length > 0 && (
        <ol className="m-0 pl-5 space-y-1" style={{ fontSize: 13 }} data-testid="tutorial-captions" aria-live="polite">
          {captions.map((c) => (
            <li key={c.key} style={c.arrow ? { color: 'var(--muted)' } : undefined}>
              {c.text}
            </li>
          ))}
        </ol>
      )}
      {journal.length > 0 && <Journal journal={journal} />}
      {done && <Built previews={previews} />}
    </div>
  )
}

// ---------------------------------------------------------------- 2. Now you

function Build({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [slots, setSlots] = useState<Slots>(emptySlots)
  const [whens, setWhens] = useState<Whens>({})
  const [picked, setPicked] = useState<TutBlockId | null>(null)
  const [open, setOpen] = useState<TutBlockId | null>(null)
  const [hint, setHint] = useState<{ for: TutBlockId | null; level: number }>({ for: null, level: 0 })
  const [busy, setBusy] = useState(false)
  const [journal, setJournal] = useState<TutStep[]>([])
  const [previews, setPreviews] = useState<Record<string, ResultData | null>>({})
  const [note, setNote] = useState<string | null>(null)
  const [attn, setAttn] = useState<{ ids: TutBlockId[]; text: string } | null>(null)
  const [ranOk, setRanOk] = useState(false)

  const order = orderOf(slots)
  const next = nextBlock(slots)
  const nextAt = next ? nextSlot(slots, next) : null
  const level = hint.for === next?.id ? hint.level : 0
  const palette = TUT_BLOCKS.filter((b) => !order.includes(b.id))
  const needWhen = order.filter((id, i) => i > 0 && !whens[id])
  const shown = picked ?? open

  const place = (id: TutBlockId, slot: string) => {
    setSlots((s) => {
      const n = { ...s }
      for (const k of ALL_SLOTS) if (n[k] === id) n[k] = null
      n[slot] = id
      return n
    })
    setPicked(null)
    setOpen(id)
    setAttn(null)
  }
  const remove = (id: TutBlockId) => {
    setSlots((s) => Object.fromEntries(ALL_SLOTS.map((k) => [k, s[k] === id ? null : s[k]])))
    setOpen(null)
  }
  const clickSlot = (slot: string) => {
    const there = slots[slot]
    if (picked) {
      if (tutBlock(picked)!.lane === laneOf(slot)) place(picked, slot)
      return
    }
    if (there) setOpen(open === there ? null : there)
  }

  const explain = (): boolean => {
    if (!ready) setAttn({ ids: [], text: 'Still preparing the data: try again in a moment.' })
    else if (order.length === 0) setAttn({ ids: [], text: 'Nothing to run yet: place the first block in the Data engineer lane.' })
    else if (needWhen.length > 0) {
      setAttn({ ids: needWhen, text: `${needWhen.length} block${needWhen.length === 1 ? ' needs' : 's need'} "Runs when the previous step": ${needWhen.map((id) => tutBlock(id)!.label).join('; ')}. Click the block and choose Succeeded.` })
      setOpen(needWhen[0])
    } else return false
    return true
  }

  const run = async () => {
    if (explain()) return
    setBusy(true)
    setNote(null)
    setPreviews({})
    try {
      const steps: TutPlacedStep[] = order.map((id, i) => ({ id, when: i === 0 ? null : (whens[id] ?? 'succeeded') }))
      const j = await runTutorial(enginePort, steps, setJournal)
      setJournal(j)
      await checkpoint()
      await refreshCatalog()
      setPreviews(await loadPreviews())
      const ok = j.every((r) => r.status === 'succeeded') && TUT_BLOCKS.every((b) => order.includes(b.id))
      setRanOk(ok)
      if (!ok && j.every((r) => r.status === 'succeeded')) {
        const n = nextBlock(slots)
        setNote(`Ran ${j.length} step${j.length === 1 ? '' : 's'}. The run stops here because nothing is placed after it yet. Next: ${n?.next}.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const help = (b: TutBlock) => (
    <div className="rounded-lg px-3 py-2" style={{ border: `1px solid ${LANE_COLOR[b.lane]}`, background: 'var(--panel)', fontSize: 13 }} data-testid="tutorial-block-info">
      <b>{b.label}.</b> {b.does} <span style={{ color: LANE_COLOR[b.lane], fontWeight: 600 }}>Whose job: the {ROLE_NAME[b.lane]}.</span> <span style={{ color: 'var(--muted)' }}>In Fabric: {b.fabric}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }} data-testid="tutorial-next-line">
        <ArrowRight size={14} style={{ color: 'var(--accent)' }} />
        <span className="flex-1 min-w-0" style={{ fontSize: 14 }}>
          {next ? (
            <>
              <b>Next:</b> {next.next} <span style={{ color: 'var(--muted)' }}>(the highlighted slot in the {laneLabel(next.lane)} lane)</span>
            </>
          ) : needWhen.length > 0 ? (
            <>
              <b>Next:</b> click each block marked ? and say when it runs
            </>
          ) : ranOk ? (
            <>
              <b>Done:</b> your pipeline works
            </>
          ) : (
            <>
              <b>Next:</b> press Run
            </>
          )}
        </span>
        {next && level < 3 && (
          <button className="btn btn-ghost" onClick={() => setHint({ for: next.id, level: level + 1 })}>
            <Lightbulb size={14} /> {level === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
      </div>
      {next && level > 0 && (
        <ul className="m-0 pl-5 space-y-1" style={{ fontSize: 13 }}>
          <li>
            Look in the <b>{laneLabel(next.lane)}</b> lane, at the highlighted slot.
          </li>
          {level > 1 && (
            <li>
              Take <b>“{next.label}”</b> from the blocks below and put it there.
            </li>
          )}
          {level > 2 && (
            <li>
              <button className="btn" onClick={() => nextAt && place(next.id, nextAt)}>
                Place it for me
              </button>
            </li>
          )}
        </ul>
      )}

      <Lanes slots={slots} next={nextAt} picked={picked} open={open} attn={attn?.ids ?? []} onSlot={clickSlot} />

      <section aria-label="Blocks" className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{picked ? `Now tap a free slot in the ${laneLabel(tutBlock(picked)!.lane)} lane.` : 'Tap a block, then tap a slot in its lane. Tap a placed block to set it up.'}</div>
        <div className="flex flex-wrap gap-2">
          {palette.map((b) => (
            <button
              key={b.id}
              className={`pl-block pl-chipblock${picked === b.id ? ' picked' : ''}`}
              style={{ ['--lane' as string]: LANE_COLOR[b.lane] }}
              onClick={() => setPicked(picked === b.id ? null : b.id)}
              aria-pressed={picked === b.id}
            >
              {b.label}
            </button>
          ))}
          {palette.length === 0 && <span style={{ color: 'var(--muted)' }}>All blocks are placed.</span>}
        </div>
        {shown && help(tutBlock(shown)!)}
      </section>

      {open && order.includes(open) && (
        <section className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: `1.5px solid ${LANE_COLOR[tutBlock(open)!.lane]}` }} data-testid="tutorial-settings">
          <div className="flex items-center gap-2">
            <b className="flex-1">{tutBlock(open)!.label}</b>
            <button className="btn btn-ghost" onClick={() => remove(open)}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
          {order[0] === open ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>This is the first step, so it always runs.</div>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ fontSize: 13, minWidth: 190 }}>Runs when the previous step</span>
                <span role="radiogroup" aria-label="Runs when the previous step" className="inline-flex rounded-md overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                  {(['succeeded', 'completed'] as const).map((w) => (
                    <button
                      key={w}
                      role="radio"
                      aria-checked={whens[open] === w}
                      className="px-3 py-1"
                      style={{ fontSize: 13, background: whens[open] === w ? 'var(--accent)' : 'var(--panel)', color: whens[open] === w ? 'var(--accent-ink)' : 'var(--text)' }}
                      onClick={() => {
                        setWhens((x) => ({ ...x, [open]: w }))
                        setAttn(null)
                      }}
                    >
                      {w === 'succeeded' ? 'Succeeded' : 'Completed'}
                    </button>
                  ))}
                </span>
                {!whens[open] && <span className="pl-unset">?</span>}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Succeeded: start only if the step before worked (the green arrow in Fabric). Completed: start even after a failure (the blue arrow).</div>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy} aria-disabled={!ready || order.length === 0 || needWhen.length > 0} data-testid="tutorial-run">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
        </button>
        <span style={{ fontSize: 13, color: needWhen.length > 0 || order.length === 0 ? 'var(--warn-text)' : 'var(--muted)' }}>
          {order.length === 0 ? 'Place a block first.' : needWhen.length > 0 ? `${needWhen.length} block${needWhen.length === 1 ? ' needs' : 's need'} "Runs when" before Run.` : 'Run goes as far as what is placed: you can run after every block.'}
        </span>
      </div>
      {attn && (
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', fontSize: 13 }} role="alert" data-testid="tutorial-attention">
          {attn.text}
        </div>
      )}
      {note && <div style={{ fontSize: 13 }} data-testid="tutorial-note">{note}</div>}
      {journal.length > 0 && <Journal journal={journal} />}
      {Object.keys(previews).length > 0 && <Built previews={previews} />}
      {ranOk && (
        <section className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--panel)', border: '1px solid #16a34a' }} data-testid="tutorial-finished">
          <Check size={16} style={{ color: '#16a34a' }} />
          <span className="flex-1 min-w-0">You built it. The real pipeline has the same steps, with messier data.</span>
          <button className="btn btn-primary" onClick={onDone} data-testid="tutorial-real">
            Now the real one <ArrowRight size={14} />
          </button>
        </section>
      )}
    </div>
  )
}
