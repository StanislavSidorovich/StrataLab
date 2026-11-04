// The data pipeline page (`#pipeline=kaiyo-sellout`, docs/pipeline-mvp-spec.md): three lanes with fixed slots, a palette
// of blocks, each block's settings, a run that fills a journal, and "Check my pipeline". The rules are in
// src/core/pipeline.ts, the engine in src/db/pipelineRun.ts. Under 768 px there is no board: a laptop is needed.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, Laptop, Lightbulb, ListChecks, Loader2, Play, RotateCcw, Share2, Trash2, Workflow, X } from 'lucide-react'
import { checkBlank, emptyState, missingSetting, place, readState, remove, runOrder, softNotes, unsetOf, type PipelineState, type StepResult, type StepStatus } from '../core/pipeline'
import type { ResultData } from '../core/check'
import {
  BLOCKS,
  LANES,
  PIPELINE_ID,
  PROOF_TITLES,
  SCHEMA,
  SILVER_HINTS,
  SILVER_PROMPT,
  blockById,
  laneOfSlot,
  silverTemplate,
  slotId,
  type Block,
  type BlockId,
  type LaneId,
  type Settings,
} from '../data/pipelines/kaiyoSellout'
import { checkPipeline, prepare, resetWork, runAll, type CheckReport } from '../db/pipelineRun'
import { enginePort } from '../db/pipelinePort'
import { checkpoint } from '../db/engine'
import { openPipeline, refreshCatalog, useLab } from './store'

const KEY = `stratalab.pipeline.${PIPELINE_ID}`
const LANE_COLOR: Record<LaneId, string> = { engineer: '#3b82f6', ae: '#a855f7', analyst: '#10b981' }
const URL_HERE = () => `${location.origin}${location.pathname}#pipeline=${PIPELINE_ID}`

const INFO: Record<BlockId, string> = {
  'copy-files': 'Brings the distributor files into the bronze table, as they came.',
  'clear-bronze': 'Empties the bronze table.',
  'notify-team': 'Tells the team the load is done. It does not touch any data.',
  'sql-silver': 'Turns bronze into silver: real dates and numbers, one row per sale.',
  'check-unique': 'Fails when two rows in silver are the same sale.',
  'check-rows': 'Fails when silver has no rows.',
  'check-keys': 'Fails when a sale finds no store or no product in gold.',
  'dim-customer': 'Builds the stores table in gold.',
  'dim-product': 'Builds the products table in gold.',
  'fact-sellout': 'Builds the sales table in gold, with a store and a product on every sale.',
  'card-top-chain': 'The answer for the Head of Sales: revenue per chain, January to June 2026.',
  'card-row-count': 'Counts the sales in January to June 2026. Useful to find out what went wrong.',
}

interface Saved {
  state: PipelineState
  hints: number
  solved: boolean
}

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    const p = raw ? JSON.parse(raw) : {}
    return { state: readState(raw), hints: p?.hints === 1 || p?.hints === 2 ? p.hints : 0, solved: p?.solved === true }
  } catch {
    return { state: emptyState(), hints: 0, solved: false }
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

function Shell() {
  const wide = useWide()
  return (
    <div className="absolute inset-0 z-30 flex flex-col min-w-0" style={{ background: 'var(--bg)' }} data-testid="pipeline">
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
      {wide ? <Board /> : <PhoneNotice />}
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

function Board() {
  const [saved] = useState(readSaved)
  const [state, setState] = useState<PipelineState>(saved.state)
  const [hints, setHints] = useState(saved.hints)
  const [solved, setSolved] = useState(saved.solved)
  const [picked, setPicked] = useState<BlockId | null>(null)
  const [open, setOpen] = useState<BlockId | null>(null)
  const [prep, setPrep] = useState<'loading' | 'ready' | string>('loading')
  const [busy, setBusy] = useState<null | 'run' | 'check'>(null)
  const [ran, setRan] = useState(false)
  const [journal, setJournal] = useState<StepResult[]>([])
  const [report, setReport] = useState<CheckReport | null>(null)
  const [answer, setAnswer] = useState<ResultData | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, hints, solved }))
    } catch {
      /* private mode: the pipeline just is not kept */
    }
  }, [state, hints, solved])

  useEffect(() => {
    let alive = true
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
  }, [])

  const order = useMemo(() => runOrder(state), [state])
  const missing = missingSetting(state)
  const reason = prep === 'loading' ? 'Preparing the data…' : prep !== 'ready' ? 'The data could not be prepared' : order.length === 0 ? 'Place a block first' : (missing?.message ?? null)
  const placed = new Set(order)
  const palette = BLOCKS.filter((b) => !placed.has(b.id))

  const setSettings = (id: BlockId, patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, [id]: { ...s.settings[id], ...patch } } }))

  const clickSlot = (slot: string) => {
    const there = state.slots[slot]
    if (picked) {
      const block = blockById(picked)!
      if (laneOfSlot(slot) !== block.lane) return
      setState(place(state, picked, slot))
      setOpen(picked)
      setPicked(null)
      return
    }
    if (there) setOpen(open === there ? null : there)
  }

  const afterRun = async () => {
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

  const run = async () => {
    setBusy('run')
    setReport(null)
    setNote(null)
    try {
      const j = await runAll(enginePort, state, setJournal)
      setJournal(j)
      setRan(true)
      await afterRun()
      setAnswer(await readAnswer())
    } finally {
      setBusy(null)
    }
  }
  const check = async () => {
    setBusy('check')
    setNote(null)
    try {
      const r = await checkPipeline(enginePort, state, (j) => setJournal(j))
      setJournal(r.run2)
      setRan(true)
      setReport(r)
      setAnswer(r.answer && r.answer.rows.length ? r.answer : null)
      if (r.solved) setSolved(true)
      await afterRun()
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
      setNote(`The tables in ${SCHEMA} are dropped. The source tables stay.`)
      await afterRun()
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
                  return (
                    <div
                      key={slot}
                      className={`pl-slot${block ? ' filled' : ''}${target ? ' target' : ''}${dim ? ' dim' : ''}`}
                      data-slot={slot}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const dragged = e.dataTransfer.getData('text/plain') as BlockId
                        const b = blockById(dragged)
                        if (b && b.lane === lane.id) {
                          setState(place(state, dragged, slot))
                          setOpen(dragged)
                        }
                      }}
                    >
                      {block ? (
                        <PlacedBlock block={block} state={state} index={order.indexOf(block.id)} active={open === block.id} onClick={() => clickSlot(slot)} />
                      ) : (
                        <button className="pl-empty" aria-label={`Empty slot ${i + 1} in the ${lane.label} lane`} onClick={() => clickSlot(slot)} disabled={!target}>
                          {target ? 'Place here' : ''}
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
                title={INFO[b.id]}
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
            state={state}
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
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy !== null || reason !== null} title={reason ?? 'Run the pipeline once on what is there now'}>
            {busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {ran ? 'Run again' : 'Run'}
          </button>
          <button className="btn" onClick={() => void check()} disabled={busy !== null || reason !== null} title={reason ?? 'Start from scratch, run it twice and judge the result'}>
            {busy === 'check' ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Check my pipeline
          </button>
          <button className="btn btn-ghost" onClick={() => void scratch()} disabled={busy !== null || prep !== 'ready'} title={`Drop the tables the pipeline built in ${SCHEMA}`}>
            <RotateCcw size={14} /> Start from scratch
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{reason ?? note ?? `The tables are in the ${SCHEMA} schema: open them in the tree.`}</span>
          {typeof prep === 'string' && prep !== 'loading' && prep !== 'ready' && (
            <span style={{ color: 'var(--danger)', fontSize: 12 }}>{prep}</span>
          )}
        </div>

        {journal.length > 0 && <Journal journal={journal} />}
        {answer && <Card answer={answer} />}
        {report && <Report report={report} notes={softNotes(state)} />}
        {!report && journal.length > 0 && softNotes(state).length > 0 && <Notes notes={softNotes(state)} />}
      </div>
    </div>
  )
}

function PlacedBlock({ block, state, index, active, onClick }: { block: Block; state: PipelineState; index: number; active: boolean; onClick: () => void }) {
  const unset = unsetOf(state, block.id, index)
  return (
    <button
      className={`pl-block${active ? ' picked' : ''}`}
      style={{ ['--lane' as string]: LANE_COLOR[block.lane] }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', block.id)}
      onClick={onClick}
      aria-expanded={active}
      title={unset ?? INFO[block.id]}
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
      {block.id === 'sql-silver' && <SqlStep blank={state.blank} setBlank={setBlank} hints={hints} moreHint={moreHint} result={journal.find((j) => j.block === 'sql-silver')} />}
      {first ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>This is the first step, so it always runs.</div>
      ) : (
        <Choice label="Runs when the previous step" value={s.when} onChange={(when) => set({ when })} options={[{ v: 'succeeded', text: 'Succeeded' }, { v: 'completed', text: 'Completed' }]} />
      )}
    </section>
  )
}

function SqlStep({ blank, setBlank, hints, moreHint, result }: { blank: string; setBlank: (b: string) => void; hints: number; moreHint: () => void; result?: StepResult }) {
  const { before, after } = useMemo(silverTemplate, [])
  const bad = blank.trim() ? checkBlank(blank) : null
  const ref = useRef<HTMLInputElement>(null)
  const exact = result?.verdict && result.verdict.extra === 0 && result.verdict.missing === 0
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
            <tr key={`${r.block}-${i}`} style={{ borderTop: '1px solid var(--line)' }}>
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

function Report({ report, notes }: { report: CheckReport; notes: string[] }) {
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
      {report.solved && <div className="font-semibold" style={{ color: '#16a34a' }}>All three proofs passed. The pipeline works.</div>}
      {notes.length > 0 && <Notes notes={notes} />}
    </section>
  )
}
