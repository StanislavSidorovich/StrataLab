// The drawing of the linking screen (docs/build-linking-screen.md 5.1): boxes at fixed places, one row per column with a
// type mark, and right-angle lines with a boxed `1` at the one end and a boxed `*` at the many end, a small arrow along
// the line from the one side to the many side (the filter), and a pill with the main number. Plain SVG, no layout engine.
import type { KeyboardEvent } from 'react'
import { typeFamily, slotName, type Link, type Slot } from '../../core/buildLinks'
import { BOX_HEAD, BOX_ROW, LINK_LAYOUT, MEASURE_COLUMNS, PASS_TABLES, TABLE_INFO, type Pass } from '../../data/build/linkData'

export interface TableView {
  columns: { name: string; type: string }[]
  rows: number
}

/** The pair in the panel, drawn dashed: red when a check fails, grey while it runs, accent when it is ready to create. */
export interface PendingLine {
  many: Slot
  one: Slot
  state: 'run' | 'bad' | 'ok'
  label: string | null
}

interface Props {
  pass: Pass
  tables: Record<string, TableView | undefined>
  links: readonly Link[]
  /** the pill text per accepted link */
  labels: Partial<Record<string, string>>
  pending: PendingLine | null
  picked: { many: Slot | null; one: Slot | null }
  onPick?: (slot: Slot) => void
}

const OFFSET: Record<string, number> = { L1: -18, L2: 18 }
const MARK = 16

const familyMark = (type: string) => {
  const f = typeFamily(type)
  return f === 'text' ? 'ABC' : f === 'number' ? '123' : f === 'date' ? 'DATE' : '?'
}

function place(pass: Pass, tables: Props['tables'], slot: Slot) {
  const box = LINK_LAYOUT[pass].boxes[slot.table]
  const view = tables[slot.table]
  if (!box || !view) return null
  const i = view.columns.findIndex((c) => c.name === slot.column)
  if (i < 0) return null
  return { box, y: box.y + BOX_HEAD + i * BOX_ROW + BOX_ROW / 2 }
}

interface Route {
  d: string
  /** where the many end's mark and the one end's mark sit */
  manyMark: { x: number; y: number }
  oneMark: { x: number; y: number }
  arrow: { x: number; y: number; dir: 1 | -1 }
  pill: { x: number; y: number }
}

function route(pass: Pass, tables: Props['tables'], many: Slot, one: Slot, offset: number): Route | null {
  const m = place(pass, tables, many)
  const o = place(pass, tables, one)
  if (!m || !o || many.table === one.table) return null
  const manyLeft = m.box.x + m.box.w / 2 < o.box.x + o.box.w / 2
  const x1 = manyLeft ? m.box.x + m.box.w : m.box.x
  const x2 = manyLeft ? o.box.x : o.box.x + o.box.w
  const dir = manyLeft ? 1 : -1
  const mid = (x1 + x2) / 2 + offset
  return {
    d: `M ${x1} ${m.y} H ${mid} V ${o.y} H ${x2}`,
    manyMark: { x: x1 + dir * (MARK / 2 + 2), y: m.y },
    oneMark: { x: x2 - dir * (MARK / 2 + 2), y: o.y },
    arrow: { x: (mid + x1) / 2 + dir * 4, y: m.y, dir: (mid > x1 ? -1 : 1) as 1 | -1 },
    pill: { x: mid, y: (m.y + o.y) / 2 },
  }
}

function EndMark({ at, text, title }: { at: { x: number; y: number }; text: string; title: string }) {
  return (
    <g className="lk-end">
      <title>{title}</title>
      <rect x={at.x - MARK / 2} y={at.y - MARK / 2} width={MARK} height={MARK} rx={3} />
      <text x={at.x} y={at.y + 4} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

function Arrow({ at }: { at: Route['arrow'] }) {
  // points toward the many end: the filter runs from the one side to the many side
  const s = at.dir
  return <polygon className="lk-arrow" points={`${at.x + s * 5},${at.y} ${at.x - s * 4},${at.y - 5} ${at.x - s * 4},${at.y + 5}`} />
}

function Pill({ at, text, kind }: { at: { x: number; y: number }; text: string; kind: string }) {
  const w = text.length * 6.1 + 14
  return (
    <g className={`lk-pill ${kind}`}>
      <rect x={at.x - w / 2} y={at.y - 10} width={w} height={20} rx={10} />
      <text x={at.x} y={at.y + 4} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

export function LinkCanvas({ pass, tables, links, labels, pending, picked, onPick }: Props) {
  const layout = LINK_LAYOUT[pass]
  const shown = links.filter((l) => PASS_TABLES[pass].includes(l.many.table))
  const pend = pending ? route(pass, tables, pending.many, pending.one, 0) : null
  const isPicked = (t: string, c: string) => (picked.many?.table === t && picked.many.column === c ? 'N' : picked.one?.table === t && picked.one.column === c ? '1' : null)
  const keyDown = (e: KeyboardEvent, slot: Slot) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick?.(slot)
    }
  }
  return (
    <svg className="lk-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="The tables and the links between them" data-testid="link-canvas">
      {PASS_TABLES[pass].map((t) => {
        const box = layout.boxes[t]
        const view = tables[t]
        if (!box || !view) return null
        const h = BOX_HEAD + view.columns.length * BOX_ROW + 6
        return (
          <g key={t} className="lk-box" data-testid={`link-box-${t}`}>
            <title>{t}</title>
            <rect className="lk-box-bg" x={box.x} y={box.y} width={box.w} height={h} rx={8} />
            <text className="lk-box-head" x={box.x + 10} y={box.y + 19}>
              {TABLE_INFO[t]?.short ?? t} · {view.rows.toLocaleString('en-US')} rows
            </text>
            <line className="lk-box-rule" x1={box.x} x2={box.x + box.w} y1={box.y + BOX_HEAD - 2} y2={box.y + BOX_HEAD - 2} />
            {view.columns.map((c, i) => {
              const y = box.y + BOX_HEAD + i * BOX_ROW
              const mark = isPicked(t, c.name)
              const measure = pass === 2 && t === 'gold_fact_sales' && MEASURE_COLUMNS.includes(c.name)
              const slot = { table: t, column: c.name }
              const label = `${TABLE_INFO[t]?.short ?? t}, ${c.name}, ${typeFamily(c.type)}`
              return (
                <g
                  key={c.name}
                  className={`lk-row${mark ? ' is-picked' : ''}${onPick ? ' is-live' : ''}`}
                  role={onPick ? 'button' : undefined}
                  tabIndex={onPick ? 0 : undefined}
                  aria-label={onPick ? label : undefined}
                  aria-pressed={onPick ? !!mark : undefined}
                  onClick={onPick ? () => onPick(slot) : undefined}
                  onKeyDown={onPick ? (e) => keyDown(e, slot) : undefined}
                  data-testid={`link-col-${t}-${c.name}`}
                >
                  <rect className="lk-row-bg" x={box.x + 2} y={y} width={box.w - 4} height={BOX_ROW} rx={4} />
                  {mark && (
                    <text className="lk-slot-letter" x={box.x + 7} y={y + 15}>
                      {mark}
                    </text>
                  )}
                  <text className="lk-type" x={box.x + 22} y={y + 15}>
                    <title>{measure ? 'a sum goes here' : typeFamily(c.type)}</title>
                    {measure ? 'Σ' : familyMark(c.type)}
                  </text>
                  <text className="lk-col" x={box.x + 58} y={y + 15}>
                    {c.name}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
      {shown.map((l) => {
        const r = route(pass, tables, l.many, l.one, OFFSET[l.id] ?? 0)
        if (!r) return null
        return (
          <g key={l.id} className="lk-line is-made" data-testid={`link-line-${l.id}`}>
            <title>{`${slotName(l.many)} → ${slotName(l.one)}`}</title>
            <path d={r.d} />
            <Arrow at={r.arrow} />
            <EndMark at={r.manyMark} text="*" title="many (N)" />
            <EndMark at={r.oneMark} text="1" title="one (1)" />
            <Pill at={r.pill} text={labels[l.id] ?? l.id} kind="is-made" />
          </g>
        )
      })}
      {pending && pend && (
        <g className={`lk-line is-${pending.state}`} data-testid="link-line-pending">
          <path d={pend.d} />
          <EndMark at={pend.manyMark} text="*" title="many (N)" />
          <EndMark at={pend.oneMark} text="1" title="one (1)" />
          {pending.label && <Pill at={pend.pill} text={pending.label} kind={`is-${pending.state}`} />}
        </g>
      )}
    </svg>
  )
}
