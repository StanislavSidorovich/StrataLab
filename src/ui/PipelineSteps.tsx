// The pieces of "Step by step" on the pipeline page: the strip of stages, the panel for the step in hand, and the first rows
// of what the step built. State lives in PipelinePage; the rules are in src/core/pipelineSteps.ts.
import { ArrowRight, Check, Lightbulb, Wand2 } from 'lucide-react'
import { LANES, LANE_COLOR, NEXT_TEXT, ROLE_NAME, blockById, type BlockId, type LaneId } from '../data/pipelines/kaiyoSellout'
import { STAGE_ORDER, STAGE_OF, STEPS, stagePassed, stepForStage, type Help, type Snapshot, type StageId } from '../core/pipelineSteps'

export type Kept = Snapshot & { phase: string }

const fmt = (n: number) => n.toLocaleString('en-US')

const STAGE: Record<StageId, { name: string; note: string; lane: LaneId | null }> = {
  source: { name: 'source', note: 'the distributor files', lane: null },
  bronze: { name: 'bronze', note: 'raw copy', lane: 'engineer' },
  silver: { name: 'silver', note: 'cleaned', lane: 'ae' },
  gold: { name: 'gold', note: 'ready to count', lane: 'ae' },
  report: { name: 'report', note: 'the answer', lane: 'analyst' },
}

/** source → bronze → silver → gold → report. A stage that is done can be clicked to see its table again; one not reached is faded. */
export function StageStrip({ snaps, fresh, viewed, active, onView }: { snaps: Partial<Record<string, Kept>>; fresh: Partial<Record<string, Kept>>; viewed: BlockId | null; active: BlockId | null; onView: (b: BlockId) => void }) {
  return (
    <nav aria-label="Stages: source, bronze, silver, gold, report" className="flex flex-wrap items-center gap-1" data-testid="pipeline-strip">
      {STAGE_ORDER.map((id, i) => {
        const st = STAGE[id]
        const passed = stagePassed(id, fresh)
        const showable = id !== 'source' ? stepForStage(id, snaps) : null
        const isNow = active !== null && STAGE_OF[active] === id
        const isViewed = viewed !== null && STAGE_OF[viewed] === id
        const color = st.lane ? LANE_COLOR[st.lane] : '#6b7280'
        return (
          <span key={id} className="inline-flex items-center gap-1">
            {i > 0 && <ArrowRight size={14} style={{ color: 'var(--muted)' }} />}
            <button
              className={`pl-stage pl-stage-btn${passed ? '' : ' off'}${isViewed ? ' view' : ''}${isNow ? ' now' : ''}`}
              style={{ ['--lane' as string]: color }}
              disabled={!showable}
              aria-current={isNow ? 'step' : undefined}
              aria-pressed={showable ? isViewed : undefined}
              data-stage={id}
              data-state={passed ? 'passed' : isNow ? 'now' : 'ahead'}
              title={showable ? `Show what ${st.name} looks like` : passed ? st.note : `Not reached yet: ${st.note}`}
              onClick={() => showable && onView(showable)}
            >
              {passed && id !== 'source' && <Check size={11} className="inline mr-1" />}
              <b>{st.name}</b> <span style={{ fontWeight: 400 }}>{st.note}</span>
            </button>
          </span>
        )
      })}
    </nav>
  )
}

/** The step in hand: where it is in the six, whose job, what to do, and as much help as this step gets. */
export function StepPanel({
  active,
  index,
  help,
  hintLevel,
  placed,
  caption,
  note,
  closing,
  onHint,
  onShow,
}: {
  active: BlockId | null
  index: number
  help: Help | null
  hintLevel: number
  placed: boolean
  caption: string | null
  note: string | null
  closing: string
  onHint: () => void
  onShow: () => void
}) {
  if (!active) {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }} data-testid="pipeline-step">
        <Check size={14} style={{ color: '#16a34a' }} />
        <span style={{ fontSize: 14 }}>
          <b>All six steps are done.</b> {closing}
        </span>
      </div>
    )
  }
  const block = blockById(active)!
  const lane = LANES.find((l) => l.id === block.lane)!
  return (
    <section aria-label="The step in hand" className="rounded-lg px-3 py-2 space-y-1" style={{ border: `1.5px solid ${LANE_COLOR[block.lane]}`, background: 'var(--panel)' }} data-testid="pipeline-step" data-help={help ?? undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pl-chip" style={{ ['--c' as string]: LANE_COLOR[block.lane] }}>
          Step {index + 1} of {STEPS.length}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {lane.label}: {lane.layer.split(',')[0]}
        </span>
        <span className="flex-1" />
        {!placed && hintLevel < 2 && help !== 'show' && (
          <button className="btn btn-ghost" onClick={onHint} data-testid="pipeline-step-hint">
            <Lightbulb size={14} /> {hintLevel === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
        {!placed && (
          <button className="btn btn-ghost" onClick={onShow} data-testid="pipeline-step-show" title="The block is placed for you, with a line on why">
            <Wand2 size={14} /> Show me this step
          </button>
        )}
      </div>
      <div style={{ fontSize: 14 }}>
        <b>Next:</b> {NEXT_TEXT[active]}.
        {!placed && help !== 'self' && <span style={{ color: 'var(--muted)' }}> Look at the highlighted slot in the {lane.label} lane.</span>}
      </div>
      {!placed && hintLevel > 0 && (
        <ul className="m-0 pl-5 space-y-1" style={{ fontSize: 13 }} data-testid="pipeline-hints">
          <li>
            Look in the <b>{lane.label}</b> lane, at the highlighted slot: {lane.layer}.
          </li>
          {hintLevel > 1 && (
            <li>
              Take <b>“{block.label}”</b> from the blocks below and put it there.
            </li>
          )}
        </ul>
      )}
      {caption && placed && (
        <div style={{ fontSize: 13 }} data-testid="pipeline-step-caption">
          <b>Placed for you:</b> {caption}
          {STEPS.indexOf(active) > 0 && <span style={{ color: 'var(--muted)' }}> Open the block, and choose when it runs: that part is yours.</span>}
        </div>
      )}
      {note && (
        <div style={{ fontSize: 13 }} data-testid="pipeline-step-note">
          {note}
        </div>
      )}
      {!placed && help === 'self' && hintLevel === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>This one is yours. A hint is there if you want it.</div>}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Whose job: the {ROLE_NAME[block.lane]}.
      </div>
    </section>
  )
}

/** The first rows of the table a step built, the cells that changed lit up, and one line on what changed. */
export function CameOut({ snap, stale }: { snap: Snapshot; stale: boolean }) {
  const block = blockById(snap.block)!
  return (
    <section aria-label={`What came out: ${snap.table}`} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: `1.5px solid ${LANE_COLOR[block.lane]}` }} data-testid="pipeline-came-out" data-block={snap.block}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b>What came out</b>
        <code style={{ fontSize: 12 }}>pipe_kaiyo.{snap.table}</code>
        <span style={{ fontSize: 12, color: 'var(--muted)' }} data-testid="pipeline-came-out-count">
          {fmt(snap.total)} {snap.total === 1 ? 'row' : 'rows'}, the first {snap.rows.length} below
        </span>
        {stale && <span className="pl-chip" style={{ ['--c' as string]: '#6b7280' }}>from the first pass</span>}
      </div>
      <div style={{ fontSize: 13 }} data-testid="pipeline-came-out-change">
        {snap.change}
      </div>
      <div className="overflow-x-auto rounded" style={{ border: '1px solid var(--line)' }}>
        <table style={{ fontSize: 12, borderCollapse: 'collapse' }} className="w-full" data-testid="pipeline-came-out-table">
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              {snap.header.map((c) => (
                <th key={c} className="px-2 py-1 font-medium" style={{ whiteSpace: 'nowrap' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snap.rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                {r.map((c, j) => (
                  <td key={j} className={`px-2 py-1${snap.marks[i]?.[j] ? ' pl-lit' : ''}`} style={{ whiteSpace: 'pre' }} data-lit={snap.marks[i]?.[j] ? 'true' : undefined}>
                    {c === null ? <span style={{ color: 'var(--muted)' }}>NULL</span> : String(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snap.legend && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{snap.legend}</div>}
    </section>
  )
}
