// Collapsible 4-stage Data analysis cycle cheat sheet shown above the editor in Python tabs.
import { useState } from 'react'
import { BookOpen, Check, Copy, Play, X } from 'lucide-react'
import { DM_CYCLE_STAGE_KEY, parseDmCycleStage } from '../core/dmCycle'
import { DM_STAGES, type DmStageId } from '../data/dmCycle'
import { runDmCycleExample, tabDialect, toggleDmCycle, useLab } from './store'

function loadStage(): DmStageId {
  try {
    return parseDmCycleStage(localStorage.getItem(DM_CYCLE_STAGE_KEY))
  } catch {
    return 'exploration'
  }
}

function saveStage(stage: DmStageId) {
  try {
    localStorage.setItem(DM_CYCLE_STAGE_KEY, stage)
  } catch {
    /* storage unavailable */
  }
}

function CopyCodeButton({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'unavailable'>('idle')
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
        setStatus('copied')
        setTimeout(() => setStatus('idle'), 1200)
        return
      }
    } catch {
      /* fallback notice below */
    }
    setStatus('unavailable')
    useLab.setState({ notice: 'Clipboard is unavailable in this browser. Select the code block and copy it manually.' })
    setTimeout(() => setStatus('idle'), 2400)
  }
  return (
    <button
      className="btn btn-ghost shrink-0"
      style={{ padding: '3px 7px', fontSize: 12 }}
      onClick={() => void onCopy()}
      title="Copy code"
      aria-label="Copy code"
    >
      {status === 'copied' ? <Check size={13} /> : <Copy size={13} />}
      <span>{status === 'copied' ? 'Copied' : status === 'unavailable' ? 'Copy manually' : 'Copy'}</span>
    </button>
  )
}

export function DmCyclePanel() {
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  const open = useLab((s) => s.dmCycleOpen)
  const ready = useLab((s) => s.engine.status === 'ready')
  const running = useLab((s) => s.results[s.activeTab]?.status === 'running')
  const [stageId, setStageId] = useState<DmStageId>(loadStage)

  if (!open || tabDialect(tab) !== 'python') return null

  const stage = DM_STAGES.find((s) => s.id === stageId) ?? DM_STAGES[0]
  const pickStage = (id: DmStageId) => {
    setStageId(id)
    saveStage(id)
  }

  return (
    <section
      aria-label="Data analysis cycle cheat sheet"
      className="shrink-0 flex flex-col"
      style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)', maxHeight: '42vh' }}
    >
      <div
        className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 sm:px-3 py-1.5"
        style={{ background: 'var(--panel-2)', borderBottom: '1px solid var(--line)', fontSize: 12 }}
      >
        <span className="flex items-center gap-1.5 font-semibold mr-1 shrink-0" style={{ color: 'var(--text)' }}>
          <BookOpen size={13} style={{ color: 'var(--accent)' }} />
          <span>Data cycle</span>
        </span>
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Data analysis cycle stages">
          {DM_STAGES.map((s) => {
            const active = s.id === stage.id
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={active}
                className="px-2 py-1 rounded whitespace-nowrap"
                style={
                  active
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600 }
                    : { color: 'var(--muted)' }
                }
                onClick={() => pickStage(s.id)}
              >
                {s.number}. {s.title}
              </button>
            )
          })}
        </div>
        <button
          className="btn btn-ghost ml-auto shrink-0"
          style={{ padding: '2px 6px', fontSize: 12 }}
          onClick={() => toggleDmCycle(false)}
          aria-label="Collapse data analysis cycle"
          title="Collapse data analysis cycle"
        >
          <X size={13} />
          <span className="hidden sm:inline">Collapse</span>
        </button>
      </div>

      <div className="overflow-y-auto min-h-0 p-2.5 sm:p-3 space-y-2.5">
        <p style={{ color: 'var(--text)', fontSize: 12.5, lineHeight: 1.5 }}>{stage.summary}</p>

        {stage.methods && stage.methods.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {stage.methods.map((m) => (
              <div
                key={m.name}
                className="rounded-md p-2 min-w-0"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', fontSize: 12 }}
              >
                <div className="font-semibold" style={{ color: 'var(--text)' }}>
                  {m.name}
                </div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>When to use: </span>
                  {m.whenToUse}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-2 lg:grid-cols-2">
          {stage.examples.map((ex) => (
            <div
              key={ex.id}
              className="rounded-lg p-2.5 flex flex-col gap-1.5 min-w-0"
              style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }}
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[10rem]">
                  <div className="font-semibold" style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    {ex.title}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 }}>{ex.why}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CopyCodeButton code={ex.code} />
                  <button
                    className="btn btn-primary shrink-0"
                    style={{ padding: '3px 8px', fontSize: 12 }}
                    disabled={!ready || running}
                    onClick={() => void runDmCycleExample(stage.title, ex.title, ex.code)}
                    title="Insert this example as a new cell and run it on Kaiyo Trading (quaera)"
                  >
                    <Play size={12} /> Run in a new cell
                  </button>
                </div>
              </div>
              <pre
                className="mono p-2 rounded overflow-x-auto whitespace-pre"
                style={{
                  background: 'var(--code-bg)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontSize: 11.5,
                  maxHeight: 170,
                }}
              >
                {ex.code.trimEnd()}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
