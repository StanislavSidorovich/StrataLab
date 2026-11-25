// The phone's side of a fill-the-gaps question (src/core/lessonFill.ts, fillPad.ts): the query with its gaps, and either a word bank
// (choose: tap a word, or drag it into any gap) or an input per gap (type). Loaded with the phone page, so it stays small: no engine,
// no answers (the phone bundle never imports src/data/lessonFillAnswers.ts). Drag uses Pointer Events: HTML5 drag-and-drop does not
// work on touch screens.
import { useRef, useState } from 'react'
import { FILL_MAX_LEN, answerValid, answersToSend, gapCount, splitTemplate, type FillQuestion } from '../core/lessonFill'
import { dragGap, dragOut, dropChip, emptySlots, isComplete, slotsFromWords, tapChip, tapGap, usedChips, wordsOf, type Slots } from '../core/fillPad'
import { PROBLEM_TEXT, type SendProblem } from '../core/voting'

/** Pixels the pointer must travel before a press is a drag and not a tap. */
const DRAG_START = 8

interface Props {
  q: FillQuestion
  /** what this phone sent last for this question (kept in the browser), or null */
  saved: string[] | null
  busy: boolean
  problem: SendProblem
  onSend: (answers: string[]) => void
}

type Press = { kind: 'chip' | 'gap'; id: number; x: number; y: number; moved: boolean }

export function FillPad({ q, saved, busy, problem, onSend }: Props) {
  const parts = splitTemplate(q.template)
  const gaps = gapCount(q.template)
  const bank = q.bank ?? []
  const choose = q.mode === 'choose' && bank.length > 0
  const [slots, setSlots] = useState<Slots>(() => (choose && saved ? slotsFromWords(saved, bank) : null) ?? emptySlots(gaps))
  const [texts, setTexts] = useState<string[]>(() => (!choose && saved && saved.length === gaps ? saved : Array.from({ length: gaps }, () => '')))
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const press = useRef<Press | null>(null)

  const words = choose ? wordsOf(slots, bank) : answersToSend(texts)
  const complete = choose ? isComplete(slots) : texts.every(answerValid)
  const same = !!words && !!saved && words.length === saved.length && words.every((w, i) => w === saved[i])
  const used = usedChips(slots)

  const gapAt = (e: { clientX: number; clientY: number }): number | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-gap]')
    return el ? Number(el.dataset.gap) : null
  }
  const textOf = (p: Press) => (p.kind === 'chip' ? bank[p.id] : bank[slots[p.id] as number])

  const down = (e: React.PointerEvent<HTMLElement>, kind: 'chip' | 'gap', id: number) => {
    if (e.button > 0 || press.current) return
    if (kind === 'chip' ? used.has(id) : slots[id] == null) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    press.current = { kind, id, x: e.clientX, y: e.clientY, moved: false }
  }
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const p = press.current
    if (!p) return
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_START) p.moved = true
    if (p.moved) {
      setGhost({ text: textOf(p), x: e.clientX, y: e.clientY })
      setOver(gapAt(e))
    }
  }
  const finish = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const p = press.current
    press.current = null
    setGhost(null)
    setOver(null)
    if (!p || cancelled) return
    if (!p.moved) {
      setSlots((s) => (p.kind === 'chip' ? tapChip(s, p.id) : tapGap(s, p.id)))
      return
    }
    const to = gapAt(e)
    setSlots((s) => {
      if (p.kind === 'chip') return to === null ? s : dropChip(s, p.id, to)
      return to === null ? dragOut(s, p.id) : dragGap(s, p.id, to)
    })
  }
  // a click from the keyboard (Enter or Space on a focused button has detail 0); a pointer's own click is already handled above
  const key = (e: React.MouseEvent, f: () => void) => {
    if (e.detail === 0) f()
  }

  const gapBox = (g: number) => {
    const chip = slots[g]
    return (
      <button
        key={`g${g}`}
        type="button"
        className={`fill-gap${chip != null ? ' filled' : ''}${over === g ? ' over' : ''}`}
        data-gap={g}
        data-testid={`fill-gap-${g + 1}`}
        aria-label={chip != null ? `Gap ${g + 1}: ${bank[chip]}. Tap to take it out` : `Gap ${g + 1}, empty`}
        onPointerDown={(e) => down(e, 'gap', g)}
        onPointerMove={move}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClick={(e) => key(e, () => setSlots((s) => tapGap(s, g)))}
      >
        {chip != null ? bank[chip] : ''}
      </button>
    )
  }

  const typeBox = (g: number) => (
    <input
      key={`t${g}`}
      className="fill-input"
      data-testid={`fill-input-${g + 1}`}
      aria-label={`Gap ${g + 1}`}
      value={texts[g]}
      maxLength={FILL_MAX_LEN}
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      size={Math.max(8, Math.min(FILL_MAX_LEN, texts[g].length + 2))}
      onChange={(e) => setTexts((t) => t.map((x, i) => (i === g ? e.target.value : x)))}
    />
  )

  return (
    <div className="fill-pad" data-testid="fill-pad" data-mode={choose ? 'choose' : 'type'}>
      <div className="fill-code mono" data-testid="fill-code">
        {parts.map((p, i) => (
          <span key={i}>
            <span className="fill-text">{p}</span>
            {i < gaps && (choose ? gapBox(i) : typeBox(i))}
          </span>
        ))}
      </div>
      {choose && (
        <div className="fill-bank" role="group" aria-label="Words" data-testid="fill-bank">
          {bank.map((w, i) => (
            <button
              key={i}
              type="button"
              className={`fill-chip${used.has(i) ? ' used' : ''}`}
              data-testid={`fill-chip-${i}`}
              disabled={used.has(i)}
              onPointerDown={(e) => down(e, 'chip', i)}
              onPointerMove={move}
              onPointerUp={(e) => finish(e, false)}
              onPointerCancel={(e) => finish(e, true)}
              onClick={(e) => key(e, () => setSlots((s) => tapChip(s, i)))}
            >
              {w}
            </button>
          ))}
        </div>
      )}
      <button className="vote-btn fill-send" type="button" disabled={!complete || busy} data-testid="fill-send" onClick={() => words && onSend(words)}>
        {busy ? '…' : saved ? 'Send again' : 'Send'}
      </button>
      {problem && (
        <p className="vote-problem" role="alert" data-testid="vote-problem">
          {PROBLEM_TEXT[problem]}
        </p>
      )}
      {!problem && saved && same && (
        <p className="vote-mine" data-testid="fill-received">
          Answer received: <b className="mono">{saved.join(' · ')}</b>. You can change it until the teacher reveals.
        </p>
      )}
      {!problem && saved && !same && complete && <p className="vote-msg">Changed: tap Send again.</p>}
      {!problem && !saved && <p className="vote-msg">{choose ? 'Fill every gap, then tap Send.' : 'Type every gap, then tap Send.'}</p>}
      {ghost && (
        <div className="fill-ghost mono" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghost.text}
        </div>
      )}
    </div>
  )
}
