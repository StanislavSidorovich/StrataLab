// The Power BI practice page (`#practice=powerbi`): a ladder of short drills with two layers. Layer A is answered here in the
// browser (a number typed, one option picked, steps put in order; the truth of a number is computed with DuckDB over the same
// CSV files the learner gets). Layer B is a drill in Power BI Desktop: a zip of the CSV files and a page of steps, and the
// numbers read off the learner's report are typed back. Same look and the same progress shape as the SQL and Python practice
// (src/ui/PracticeBook.tsx); no code cells, so it is a page of its own. Spec: docs/powerbi-practice-design.md.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, GraduationCap, Lightbulb, Loader2, Package, TriangleAlert, X, XCircle } from 'lucide-react'
import { create } from 'zustand'
import './powerBiPractice.css'
import './practiceRecall.css'
import { drillFiles, drillStepsHtml, drillZip, fillTotal, isDrill, checkNumber, numberMessage, orderVerdict, progressIds, shuffledOrder, taskNumber, tasksA, TOTAL_SQL, type PbiBlock, type PbiCheck, type PbiDrill, type PbiSection, type PbiTask } from '../core/powerBiPractice'
import { hashWithPractice, nextTask, practiceCounts, practiceFromHash, readProgress, type PracticeProgress } from '../core/sqlPractice'
import { dayOf, pickWarmUp } from '../core/practiceRecall'
import { SECTIONS, SECTION_TASKS } from '../data/powerBiPractice'
import { download } from '../db/export'
import { starBytes, truth } from '../db/powerBiPracticeRun'
import { openPracticeBook, useLab } from './store'

const READABLE = 'max-w-[46rem]'
const KEY = 'stratalab.powerbi-practice.v1'

function progressStore() {
  const load = () => {
    try {
      return readProgress(localStorage.getItem(KEY))
    } catch {
      return readProgress(null)
    }
  }
  const store = create<PracticeProgress>(load)
  store.subscribe((p) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p))
    } catch {
      /* progress stays for this visit */
    }
  })
  return store
}
const useProgress = progressStore()

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** `code` in backticks becomes code. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/).map((part, i) =>
        i % 2 ? (
          <code key={i} className="mono px-1 rounded" style={{ background: 'var(--panel-2)', fontSize: '0.92em' }}>
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  )
}

interface Said {
  ok: boolean
  title: string
  detail: string
}

function Verdict({ said, children }: { said: Said; children?: ReactNode }) {
  return (
    <div role="status" className="pbi-msg" data-ok={said.ok}>
      {said.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
      <span className="flex-1 min-w-0">
        <b>{said.title}</b> {said.detail}
      </span>
      {children}
    </div>
  )
}

/** A snippet; `{{TOTAL}}` in it is the total revenue, computed. */
function Snippet({ text }: { text: string }) {
  const [shown, setShown] = useState(text.includes('{{TOTAL}}') ? text.split('{{TOTAL}}').join('…') : text)
  useEffect(() => {
    if (!text.includes('{{TOTAL}}')) return
    let live = true
    truth(TOTAL_SQL)
      .then((v) => live && setShown(fillTotal(text, v)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [text])
  return <pre className="mono pbi-snippet">{shown}</pre>
}

function markSolved(id: string, ok: boolean) {
  useProgress.setState((p) => {
    if (!ok) return { failedAt: { ...p.failedAt, [id]: Date.now() } }
    const { [id]: _gone, ...stillFailed } = p.failedAt
    return { solved: p.solved.includes(id) ? p.solved : [...p.solved, id], solvedAt: { ...p.solvedAt, [id]: Date.now() }, failedAt: stillFailed }
  })
}

function HintList({ hints, shown }: { hints: string[]; shown: number }) {
  if (shown <= 0) return null
  return (
    <ol className="m-0 p-0 list-none space-y-0.5">
      {hints.slice(0, shown).map((h, i) => (
        <li key={i} className="flex gap-1.5">
          <Lightbulb size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--warn-text)' }} />
          <span>{h}</span>
        </li>
      ))}
    </ol>
  )
}

/** One layer A task: predict, pick, spot or order. */
function TaskCard({ section, task, warm = false, onNext }: { section: PbiSection; task: PbiTask; warm?: boolean; onNext: (id: string) => void }) {
  const solved = useProgress((p) => p.solved.includes(task.id))
  const hints = useProgress((p) => p.hints[task.id] ?? 0)
  const saved = useProgress.getState().drafts[task.id] ?? ''
  const ready = useLab((s) => s.engine.status === 'ready')
  const [answer, setAnswer] = useState(saved)
  const [order, setOrder] = useState<number[]>(() => {
    if (task.kind !== 'order') return []
    try {
      const d = JSON.parse(saved)
      if (Array.isArray(d) && d.length === task.steps.length && [...d].sort().join() === task.steps.map((_, i) => i).join()) return d
    } catch {
      /* no draft */
    }
    return shuffledOrder(task.steps.length, task.id)
  })
  const [said, setSaid] = useState<Said | null>(null)
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const needsEngine = task.kind === 'predict'
  const next = said?.ok ? nextTask(SECTION_TASKS, useProgress.getState()) : null

  const keep = (v: string) => useProgress.setState((p) => ({ drafts: { ...p.drafts, [task.id]: v } }))
  const set = (v: string) => {
    setAnswer(v)
    setSaid(null)
    keep(v)
  }
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= order.length) return
    const o = [...order]
    ;[o[i], o[j]] = [o[j], o[i]]
    setOrder(o)
    setSaid(null)
    keep(JSON.stringify(o))
  }

  const check = async () => {
    setBusy(true)
    try {
      let result: Said
      if (task.kind === 'predict') {
        const expected = await truth(task.sql)
        const traps = await Promise.all((task.traps ?? []).map(async (t) => ({ value: await truth(t.sql), says: t.says })))
        const v = checkNumber(answer, expected, { percent: task.percent, traps })
        const m = numberMessage(v, 'the question')
        result = v.kind === 'empty' || v.kind === 'unreadable' ? m : m.ok ? { ...m, detail: `${m.detail} ${task.explain}`.trim() } : m
        if (v.kind === 'empty') {
          setSaid(result)
          return
        }
        markSolved(task.id, m.ok)
      } else if (task.kind === 'order') {
        const v = orderVerdict(order)
        result = v.ok
          ? { ok: true, title: 'Right.', detail: task.explain }
          : { ok: false, title: `${v.inPlace} of ${order.length} steps are in the right place.`, detail: v.firstWrong !== null ? `Look at position ${v.firstWrong + 1}: what comes there?` : '' }
        markSolved(task.id, v.ok)
      } else {
        if (!answer) {
          setSaid({ ok: false, title: 'Pick an answer first.', detail: '' })
          return
        }
        const o = task.options.find((x) => x.id === answer)!
        const ok = answer === task.right
        result = ok ? { ok: true, title: 'Right.', detail: task.explain } : { ok: false, title: 'Not that one.', detail: o.why }
        markSolved(task.id, ok)
      }
      setSaid(result)
    } catch (e) {
      setSaid({ ok: false, title: 'The answer could not be computed.', detail: String(e instanceof Error ? e.message : e).split('\n')[0] })
    } finally {
      setBusy(false)
    }
  }

  const showAnswer = async () => {
    if (!confirm('Show the answer? This task will not count as solved without help.')) return
    useProgress.setState((p) => (p.peeked.includes(task.id) ? p : { peeked: [...p.peeked, task.id] }))
    if (task.kind === 'predict') {
      try {
        const v = await truth(task.sql)
        setRevealed(`${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}. ${task.explain}`)
      } catch (e) {
        setRevealed(String(e instanceof Error ? e.message : e))
      }
    } else if (task.kind === 'order') {
      setOrder(task.steps.map((_, i) => i))
      setRevealed(task.explain)
    } else {
      setAnswer(task.right)
      setRevealed(task.explain)
    }
  }

  const number = taskNumber(section, task.id)
  const label = { predict: 'Predict', pick: 'Pick', spot: 'Spot', order: 'Order' }[task.kind]
  return (
    <div id={`${warm ? 'warm-' : ''}task-${task.id}`} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: `1px solid ${solved ? 'var(--accent)' : 'var(--line)'}`, scrollMarginTop: 72 }}>
      <div className="font-semibold flex items-center gap-2">
        {solved ? <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} aria-label="Solved" /> : <GraduationCap size={16} style={{ color: 'var(--muted)' }} />}
        Task {number} · {task.title}
        <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>{label}</span>
      </div>
      <p className={`m-0 ${READABLE}`} style={{ fontSize: 15, lineHeight: 1.5 }}>
        <Prose text={task.question} />
      </p>
      {task.kind !== 'predict' && task.kind !== 'order' && task.snippet && <Snippet text={task.snippet} />}
      {task.kind === 'predict' && (
        <input
          className="field pbi-number"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type the number"
          aria-label={`Task ${number}: your number`}
          value={answer}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && (!needsEngine || ready) && void check()}
        />
      )}
      {(task.kind === 'pick' || task.kind === 'spot') && (
        <ul className="pbi-options" role="radiogroup" aria-label={`Task ${number}: answers`}>
          {task.options.map((o) => (
            <li key={o.id}>
              <label className={`pbi-option ${revealed && o.id === task.right ? 'pbi-right' : ''}`}>
                <input type="radio" name={`${warm ? 'warm-' : ''}${task.id}`} checked={answer === o.id} onChange={() => set(o.id)} />
                <span>{o.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {task.kind === 'order' && (
        <ol className="pbi-order" aria-label={`Task ${number}: steps`}>
          {order.map((v, i) => (
            <li key={v} data-ok={said ? v === i : undefined}>
              <span className="pbi-n">{i + 1}</span>
              <span className="pbi-text">{task.steps[v]}</span>
              <button className="btn btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move “${task.steps[v]}” up`}>
                <ArrowUp size={14} />
              </button>
              <button className="btn btn-ghost" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move “${task.steps[v]}” down`}>
                <ArrowDown size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button className="btn btn-primary" disabled={busy || (needsEngine && !ready)} onClick={() => void check()} title={needsEngine && !ready ? 'The engine is still loading' : 'Check your answer'}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Check
        </button>
        <button className="btn" disabled={hints >= task.hints.length} onClick={() => useProgress.setState((p) => ({ hints: { ...p.hints, [task.id]: hints + 1 } }))}>
          <Lightbulb size={14} /> Hint {hints < task.hints.length ? `${hints + 1}/${task.hints.length}` : ''}
        </button>
        <button className="btn btn-ghost" onClick={() => void showAnswer()}>
          <Eye size={14} /> Answer
        </button>
      </div>
      <HintList hints={task.hints} shown={hints} />
      {said && (
        <Verdict said={said}>
          {next && (
            <button className="btn shrink-0" onClick={() => onNext(next)}>
              Next task <ArrowDown size={14} />
            </button>
          )}
        </Verdict>
      )}
      {revealed && (
        <p className={`m-0 ${READABLE}`} style={{ color: 'var(--muted)' }}>
          <b>Answer: </b>
          {revealed}
        </p>
      )}
    </div>
  )
}

/** One layer B drill: the zip, hints, the steps in a frame, the numbers to type back. */
function DrillCard({ section, drill, onNext }: { section: PbiSection; drill: PbiDrill; onNext: (id: string) => void }) {
  const solved = useProgress((p) => p.solved.includes(drill.id))
  const hints = useProgress((p) => p.hints[drill.id] ?? 0)
  const ready = useLab((s) => s.engine.status === 'ready')
  const number = String(section.n)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const d = useProgress.getState().drafts
    return Object.fromEntries(drill.checks.map((c) => [c.id, d[`${drill.id}:${c.id}`] ?? '']))
  })
  const [said, setSaid] = useState<Record<string, Said>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [steps, setSteps] = useState<string | null>(null)
  const done = drill.checks.every((c) => said[c.id]?.ok)
  const next = done ? nextTask(SECTION_TASKS, useProgress.getState()) : null

  // a second click while the first zip is being made (or just after) does not make a second file
  const zipping = useRef(false)
  const zip = async () => {
    if (zipping.current) return
    zipping.current = true
    try {
      const bytes = await starBytes()
      const files = drillFiles(drill, bytes, number)
      download(drillZip(drill, bytes, number) as BlobPart, drill.zip, 'application/zip')
      setNote({ ok: true, text: `${drill.zip}: ${Object.keys(files).length} files. Open steps.html first.` })
    } catch (e) {
      setNote({ ok: false, text: String(e instanceof Error ? e.message : e) })
    } finally {
      setTimeout(() => (zipping.current = false), 1500)
    }
  }
  const toggleSteps = async () => {
    if (steps !== null) return setSteps(null)
    try {
      setSteps(drillStepsHtml(drill, await starBytes(), number))
    } catch (e) {
      setNote({ ok: false, text: String(e instanceof Error ? e.message : e) })
    }
  }
  const set = (c: PbiCheck, v: string) => {
    setValues((x) => ({ ...x, [c.id]: v }))
    setSaid((s) => {
      const { [c.id]: _gone, ...rest } = s
      return rest
    })
    useProgress.setState((p) => ({ drafts: { ...p.drafts, [`${drill.id}:${c.id}`]: v } }))
  }
  const check = async () => {
    setBusy(true)
    try {
      const out: Record<string, Said> = {}
      for (const c of drill.checks) {
        const expected = await truth(c.sql)
        const traps = await Promise.all((c.traps ?? []).map(async (t) => ({ value: await truth(t.sql), says: t.says })))
        out[c.id] = numberMessage(checkNumber(values[c.id] ?? '', expected, { percent: c.percent, traps }), c.where)
      }
      setSaid(out)
      if (drill.checks.some((c) => (values[c.id] ?? '').trim())) markSolved(drill.id, drill.checks.every((c) => out[c.id].ok))
    } catch (e) {
      setNote({ ok: false, text: `The numbers could not be computed: ${String(e instanceof Error ? e.message : e).split('\n')[0]}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id={`task-${drill.id}`} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--panel)', border: `1px solid ${solved ? 'var(--accent)' : 'var(--accent-soft)'}`, scrollMarginTop: 72 }}>
      <div className="font-semibold flex items-center gap-2">
        {solved ? <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} aria-label="Solved" /> : <Package size={16} style={{ color: 'var(--accent)' }} />}
        Drill {number} · {drill.title}
        <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>in Power BI Desktop, 10 to 15 minutes</span>
      </div>
      <p className={`m-0 ${READABLE}`} style={{ fontSize: 15, lineHeight: 1.5 }}>
        <Prose text={drill.question} />
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button className="btn btn-primary" onClick={() => void zip()}>
          <Download size={14} /> Download {drill.zip}
        </button>
        <button className="btn" disabled={hints >= drill.hints.length} onClick={() => useProgress.setState((p) => ({ hints: { ...p.hints, [drill.id]: hints + 1 } }))}>
          <Lightbulb size={14} /> Hint {hints < drill.hints.length ? `${hints + 1}/${drill.hints.length}` : ''}
        </button>
        <button className="btn btn-ghost" aria-expanded={steps !== null} onClick={() => void toggleSteps()}>
          <Eye size={14} /> {steps !== null ? 'Hide steps' : 'Show steps'}
        </button>
      </div>
      {note && (
        <div role="status" className="pbi-msg" data-ok={note.ok}>
          {note.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <TriangleAlert size={15} className="shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}
      <HintList hints={drill.hints} shown={hints} />
      {steps !== null && <iframe className="pbi-steps" title={`Steps of drill ${number}`} sandbox="" srcDoc={steps} />}
      <div className="font-semibold pt-1">Type the numbers from your report</div>
      <ul className="pbi-checks">
        {drill.checks.map((c) => (
          <li key={c.id} className="space-y-1">
            <div className="pbi-row">
              <label htmlFor={`${drill.id}-${c.id}`}>
                {c.label}
                <div className="pbi-where">{c.where}</div>
              </label>
              <input
                id={`${drill.id}-${c.id}`}
                className="field pbi-number"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={values[c.id] ?? ''}
                onChange={(e) => set(c, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && ready && void check()}
              />
            </div>
            {said[c.id] && <Verdict said={said[c.id]} />}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button className="btn btn-primary" disabled={busy || !ready} onClick={() => void check()} title={ready ? 'Check the numbers' : 'The engine is still loading'}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Check
        </button>
        {next && done && (
          <button className="btn" onClick={() => onNext(next)}>
            Next task <ArrowDown size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function BlockView({ section, block, onNext }: { section: PbiSection; block: PbiBlock; onNext: (id: string) => void }) {
  if (block.kind === 'note') {
    return (
      <div className="space-y-2">
        <div className="font-semibold" style={block.topic ? { color: 'var(--accent)' } : { color: 'var(--muted)', fontWeight: 500 }}>
          {block.topic ? `New: ${block.topic}` : 'Reminder'}
        </div>
        <p className={`m-0 ${READABLE}`} style={{ fontSize: 15, lineHeight: 1.55 }}>
          <Prose text={block.text} />
        </p>
        {block.trap && (
          <p className={`m-0 flex gap-2 ${READABLE}`} style={{ color: 'var(--warn-text)' }}>
            <TriangleAlert size={15} className="shrink-0 mt-0.5" />
            <span>
              <Prose text={block.trap} />
            </span>
          </p>
        )}
      </div>
    )
  }
  if (isDrill(block)) return <DrillCard section={section} drill={block} onNext={onNext} />
  return <TaskCard section={section} task={block} onNext={onNext} />
}

/** From section 3 on: two layer A tasks of earlier sections first. */
const WARM_FROM = 3

function WarmUp({ section, onNext }: { section: PbiSection; onNext: (id: string) => void }) {
  const folded = useProgress((p) => p.warmFolded.includes(section.id))
  const day = dayOf(new Date())
  const [ids] = useState(() => {
    const p = useProgress.getState()
    const kept = p.warm[section.id]
    const sections = SECTIONS.filter((s) => !s.soon).map((s) => ({ id: s.id, n: s.n, taskIds: tasksA(s).map((t) => t.id) }))
    return kept && kept.day === day ? kept.ids : pickWarmUp(sections, section.id, p, day)
  })
  useEffect(() => {
    const kept = useProgress.getState().warm[section.id]
    if (!kept || kept.day !== day) useProgress.setState((p) => ({ warm: { ...p.warm, [section.id]: { day, ids } } }))
    // once, with the picks of this visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const cells = ids.flatMap((id) => {
    const home = SECTIONS.find((s) => tasksA(s).some((t) => t.id === id))
    const task = home && tasksA(home).find((t) => t.id === id)
    return home && task ? [{ home, task }] : []
  })
  if (!cells.length) return null
  return (
    <div className="warmup" data-testid="warm-up">
      <button className="warmup-head" aria-expanded={!folded} onClick={() => useProgress.setState((p) => ({ warmFolded: toggled(p.warmFolded, section.id) }))}>
        {folded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        Warm-up: {cells.length} task{cells.length === 1 ? '' : 's'} from earlier sections
        <small>{folded ? 'folded' : 'before the new section'}</small>
      </button>
      {!folded && cells.map(({ home, task }) => <TaskCard key={task.id} section={home} task={task} onNext={onNext} warm />)}
    </div>
  )
}

function SectionView({ section, onNext }: { section: PbiSection; onNext: (id: string) => void }) {
  const known = useProgress((p) => p.known.includes(section.id))
  const [opened, setOpened] = useState(false)
  if (section.soon) {
    return (
      <section id={`section-${section.id}`} data-section={section.id} className="pbi-soon" style={{ scrollMarginTop: 64 }}>
        <strong>
          {section.n} {section.title}
        </strong>{' '}
        · coming next
        <div>{section.soon}</div>
      </section>
    )
  }
  const open = !known || opened
  return (
    <section id={`section-${section.id}`} data-section={section.id} className="space-y-4" style={{ scrollMarginTop: 64 }}>
      <div className="flex items-center gap-2 flex-wrap pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <h2 className="m-0 flex-1 min-w-[12rem] text-lg font-semibold">
          {known && (
            <button className="mr-1 align-middle" onClick={() => setOpened(!opened)} aria-expanded={open} aria-label={open ? 'Fold this section' : 'Show this section'}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          <span style={{ color: 'var(--muted)' }}>{section.n}</span> {section.title}
        </h2>
        <button
          className="btn btn-ghost"
          aria-pressed={known}
          onClick={() => {
            useProgress.setState((p) => ({ known: toggled(p.known, section.id) }))
            setOpened(false)
          }}
          title={known ? 'Back to not known' : 'Fold this section: you remember it. It is not counted as solved.'}
        >
          {known ? <CheckCircle2 size={14} /> : <Check size={14} />} {known ? 'Known' : 'I know this'}
        </button>
      </div>
      {open && section.n >= WARM_FROM && <WarmUp section={section} onNext={onNext} />}
      {open && section.blocks.map((b, i) => <BlockView key={i} section={section} block={b} onNext={onNext} />)}
    </section>
  )
}

export function PowerBiPracticePage() {
  const progress = useProgress()
  const counts = practiceCounts(SECTION_TASKS, progress)
  const next = nextTask(SECTION_TASKS, progress)
  const main = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => practiceFromHash(location.hash)?.at ?? SECTIONS[0].id)

  const toSection = (id: string) => document.getElementById(`section-${id}`)?.scrollIntoView()
  const toTask = (id: string) => document.getElementById(`task-${id}`)?.scrollIntoView()

  // Opened on a section's address: go there once, before the list starts following the scroll.
  const settled = useRef(false)
  useEffect(() => {
    const at = practiceFromHash(location.hash)?.at
    if (at) toSection(at)
    const done = setTimeout(() => (settled.current = true), 300)
    return () => clearTimeout(done)
  }, [])

  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)?.target.getAttribute('data-section')
        if (!hit || !settled.current) return
        setActive(hit)
        history.replaceState(null, '', location.pathname + location.search + hashWithPractice(location.hash, hit, 'powerbi'))
      },
      { root: main.current, rootMargin: '-15% 0px -80% 0px' },
    )
    main.current?.querySelectorAll('[data-section]').forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [])

  const statusOf = useMemo(
    () => (s: PbiSection) => {
      const ids = progressIds(s)
      return { known: progress.known.includes(s.id), done: ids.filter((t) => progress.solved.includes(t)).length, total: ids.length }
    },
    [progress.known, progress.solved],
  )

  return (
    <div className="absolute inset-0 z-30 flex min-w-0" style={{ background: 'var(--bg)', zoom: 'var(--practice-zoom, 1)' }} data-testid="sql-practice">
      <nav aria-label="Sections" className="hidden md:flex flex-col w-56 shrink-0 overflow-y-auto p-2" style={{ background: 'var(--panel)', borderRight: '1px solid var(--line)' }}>
        <ul className="m-0 p-0 list-none flex-1">
          {SECTIONS.map((s) => {
            const st = statusOf(s)
            return (
              <li key={s.id}>
                <button
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md"
                  style={s.id === active ? { background: 'var(--accent-soft)', fontWeight: 600 } : { color: st.known || s.soon ? 'var(--muted)' : undefined }}
                  aria-current={s.id === active ? 'true' : undefined}
                  onClick={() => toSection(s.id)}
                >
                  <span className="w-5 shrink-0 tabular-nums" style={{ color: 'var(--muted)' }}>
                    {s.n}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {s.soon ? 'soon' : st.done === st.total ? <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} aria-label="All solved" /> : st.known ? 'known' : `${st.done}/${st.total}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div ref={main} className="flex-1 min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-20 px-4 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
          <div className="flex-1 min-w-[10rem]">
            <div className="font-semibold">Power BI practice · Kaiyo Trading</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {counts.solved} solved · {counts.known} known · {counts.left} left
            </div>
          </div>
          {next && (
            <button className="btn btn-primary" onClick={() => toTask(next)}>
              Continue <ArrowRight size={14} />
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => openPracticeBook(null)} aria-label="Close the practice" title="Back to the workbench">
            <X size={16} />
          </button>
        </header>
        <div className="md:hidden px-4 pt-3">
          <select className="field w-full" aria-label="Go to section" value={active} onChange={(e) => toSection(e.target.value)}>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.n} {s.title}
                {s.soon ? ' (soon)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-8">
          <div className={`space-y-2 ${READABLE}`} style={{ color: 'var(--muted)' }}>
            <p className="m-0">
              Short drills for the free Power BI Desktop (Windows), in two layers. <b>Tasks</b> you answer here in two or three minutes: a number, one pick, steps in order. A <b>drill</b> takes 10 to 15 minutes in Power BI Desktop: download a zip with the Kaiyo CSV files and a page of steps, build it, and type the numbers from your report back. Lab checks them against the same files.
            </p>
            <p className="m-0">A day: a warm-up from an earlier section, one or two tasks, one drill. A missed day does not block: every zip says how to start from scratch in two minutes.</p>
            <p className="m-0">Not covered: row-level security, publishing to the Service, gateways, performance tuning.</p>
          </div>
          {SECTIONS.map((s) => (
            <SectionView key={s.id} section={s} onNext={toTask} />
          ))}
          <div className="flex justify-end">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => {
                if (confirm('Forget what you solved, marked and typed on this page?')) useProgress.setState(readProgress(null))
              }}
            >
              Reset progress
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
