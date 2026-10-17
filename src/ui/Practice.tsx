// Practice on the demo shop (stage 5): the dialog with worked examples and tasks, and the bar
// above the editor of a task's tab (the question, Check, hints one at a time, the solution).
import { Check, CheckCircle2, ChevronRight, Eye, GraduationCap, Lightbulb, Link2, Loader2, Play, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { checkTask, nextHint, openExample, openPractice, openTask, useLab } from './store'
import { activeSql, appendToActive } from './SqlEditor'
import { EXAMPLES, LEVELS, TASKS, taskById, type PracticeTask } from '../data/practice'
import { describeVerdict } from '../core/check'

export function PracticeDialog() {
  const open = useLab((s) => s.practiceOpen)
  const solved = useLab((s) => s.practice.solved)
  const [copied, setCopied] = useState<string | null>(null)
  if (!open) return null
  const levels = [1, 2, 3] as const

  const copyLink = (id: string) => {
    void navigator.clipboard.writeText(`${location.origin}${location.pathname}#task=${id}`)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && openPractice(false)}>
      <div role="dialog" aria-label="Practice" className="w-full max-w-3xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <GraduationCap size={18} style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Practice on the demo shop</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Business questions about a small coffee shop. Examples are solved and explained; tasks you solve yourself: <b>Check</b> compares your result with the answer, hints come one at a time.
            </div>
          </div>
          <span className="shrink-0" style={{ color: 'var(--muted)', fontSize: 12 }}>
            {solved.filter((id) => taskById(id)).length}/{TASKS.length} solved
          </span>
          <button className="btn btn-ghost" onClick={() => openPractice(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto min-h-0 p-3 space-y-4">
          <section>
            <h2 className="font-semibold mb-2 px-1">Worked examples</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((e) => (
                <li key={e.id}>
                  <button className="w-full text-left rounded-lg p-3 flex items-start gap-2 hover:bg-[var(--panel)]" style={{ border: '1px solid var(--line)', background: 'var(--panel-2)' }} onClick={() => void openExample(e)}>
                    <Play size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <span>
                      <span className="font-semibold">{e.title}</span>
                      <span className="block" style={{ color: 'var(--muted)' }}>
                        {e.question}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {levels.map((level) => (
            <section key={level}>
              <h2 className="font-semibold mb-2 px-1">
                Tasks · {LEVELS[level]}
              </h2>
              <ul className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                {TASKS.filter((t) => t.level === level).map((t, i) => (
                  <li key={t.id} className="group flex items-start gap-2 p-2.5 hover:bg-[var(--panel-2)]" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                    {solved.includes(t.id) ? (
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} aria-label="Solved" />
                    ) : (
                      <span className="shrink-0 mt-0.5 rounded-full" style={{ width: 16, height: 16, border: '1.5px solid var(--line)' }} />
                    )}
                    <button className="flex-1 min-w-0 text-left" onClick={() => void openTask(t)}>
                      <span className="font-semibold">
                        {TASKS.indexOf(t) + 1}. {t.title}
                      </span>
                      <span className="block" style={{ color: 'var(--muted)' }}>
                        {t.question}
                      </span>
                    </button>
                    <button className="btn btn-ghost shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => copyLink(t.id)} title="A link that opens Quaera Lab on this task (for a lesson or a friend)">
                      {copied === t.id ? <Check size={14} /> : <Link2 size={14} />}
                    </button>
                    <button className="btn shrink-0" onClick={() => void openTask(t)}>
                      {solved.includes(t.id) ? 'Again' : 'Solve'} <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Above the editor of a task's tab. */
export function TaskBar() {
  const tab = useLab((s) => s.tabs.find((t) => t.id === s.activeTab))
  const task = tab?.task ? taskById(tab.task) : undefined
  const hints = useLab((s) => (task ? (s.practice.hints[task.id] ?? 0) : 0))
  const check = useLab((s) => (tab ? s.checks[tab.id] : undefined))
  const solved = useLab((s) => (task ? s.practice.solved.includes(task.id) : false))
  if (!tab || !task) return null
  const n = TASKS.indexOf(task) + 1

  return (
    <div className="shrink-0 px-3 py-2 space-y-1.5 overflow-auto" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)', maxHeight: '40%' }}>
      <div className="flex items-start gap-2 flex-wrap">
        <GraduationCap size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-[12rem]">
          <span className="font-semibold">
            Task {n}: {task.title}
          </span>
          {solved && (
            <span className="ml-2 inline-flex items-center gap-1" style={{ color: 'var(--accent)', fontSize: 12 }}>
              <CheckCircle2 size={12} /> solved
            </span>
          )}
          <div style={{ color: 'var(--muted)' }}>{task.question}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button className="btn btn-primary" disabled={check?.status === 'running'} onClick={() => void checkTask(tab.id, activeSql())} title="Run your query and compare its result with the answer">
            {check?.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Check
          </button>
          <button className="btn" disabled={hints >= task.hints.length} onClick={() => nextHint(task)} title="One hint at a time">
            <Lightbulb size={14} /> Hint {hints < task.hints.length ? `${hints + 1}/${task.hints.length}` : ''}
          </button>
          <button className="btn btn-ghost" onClick={() => showSolution(task)} title="Add the answer's query at the end of this tab">
            <Eye size={14} /> Solution
          </button>
        </div>
      </div>
      {hints > 0 && (
        <ol className="space-y-0.5 pl-6" style={{ fontSize: 12 }}>
          {task.hints.slice(0, hints).map((h, i) => (
            <li key={i} className="flex gap-1.5">
              <Lightbulb size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--warn-text)' }} />
              <span className={i === 2 ? 'mono' : undefined}>{h}</span>
            </li>
          ))}
        </ol>
      )}
      {check && check.status !== 'running' && <CheckResult check={check} />}
    </div>
  )
}

function CheckResult({ check }: { check: Exclude<NonNullable<ReturnType<typeof useLab.getState>['checks'][string]>, { status: 'running' }> }) {
  if (check.status === 'error')
    return (
      <div role="status" className="rounded-md px-2.5 py-1.5 flex gap-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
        <XCircle size={15} className="shrink-0 mt-0.5" /> {check.message}
      </div>
    )
  const { title, detail } = describeVerdict(check.verdict)
  const ok = check.verdict.ok
  return (
    <div role="status" className="rounded-md px-2.5 py-1.5 flex gap-2" style={ok ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
      {ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
      <span>
        <b>{title}</b> {detail}
      </span>
    </div>
  )
}

function showSolution(task: PracticeTask) {
  if (!confirm('Show the solution? It is added at the end of this tab; your query stays.')) return
  appendToActive(`-- Solution:\n${task.solution}\n`)
}
