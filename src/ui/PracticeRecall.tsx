// Recall on the practice pages: the jump to where something was taught, hint links, and the "where was it" search.
import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { hintParts, sectionAnchor, type PracticeIndex, type TermIntro } from '../core/practiceIndex'
import './practiceRecall.css'

/** Scrolls to a note or example, or to its section when that part is not on the page (a folded or hidden section). */
export function jumpTo(intro: TermIntro) {
  const el = document.getElementById(intro.anchor) ?? document.getElementById(sectionAnchor(intro.sectionId))
  el?.scrollIntoView({ block: 'start' })
}

export const IndexContext = createContext<PracticeIndex | null>(null)
export const useIndex = () => useContext(IndexContext)!

const label = (i: TermIntro) => `${i.term}, taught in section ${i.n}, ${i.title}`

/** A hint, with the terms of earlier sections as links to where they were taught. Same-section terms stay plain. */
export function Hint({ text, sectionN }: { text: string; sectionN: number }) {
  const index = useIndex()
  const parts = useMemo(() => hintParts(index.kind, index, text, sectionN), [index, text, sectionN])
  return (
    <span>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <button key={i} type="button" className="recall-link" aria-label={label(p.intro)} title={`Taught in section ${p.intro.n}, ${p.intro.title}`} onClick={() => jumpTo(p.intro)}>
            {p.term}
            {p.bare ? ` (section ${p.intro.n})` : ''}
          </button>
        ),
      )}
    </span>
  )
}

/** "Where was it": type a function or keyword, get the sections that taught it. Arrow keys move through the list. */
/** `up`: the list opens above the box, for a box at the bottom of the section rail. */
export function RecallSearch({ id, up = false }: { id: string; up?: boolean }) {
  const index = useIndex()
  const [q, setQ] = useState('')
  const list = useRef<HTMLUListElement>(null)
  const hits = useMemo(() => index.search(q).slice(0, 30), [index, q])
  const go = (i: TermIntro) => {
    jumpTo(i)
    setQ('')
  }
  const focusItem = (at: number) => (list.current?.querySelectorAll('button')[at] as HTMLButtonElement | undefined)?.focus()
  return (
    <div className={up ? 'recall-search recall-up' : 'recall-search'}>
      <label htmlFor={`recall-${id}`}>Where was it?</label>
      <input
        id={`recall-${id}`}
        type="search"
        className="field"
        placeholder={index.kind === 'sql' ? 'e.g. max, group by' : 'e.g. merge, isna'}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && hits.length) (e.preventDefault(), focusItem(0))
          else if (e.key === 'Enter' && hits.length) go(hits[0])
          else if (e.key === 'Escape') setQ('')
        }}
      />
      {q.trim() &&
        (hits.length ? (
          <ul ref={list} className="recall-results" aria-label="Where it was taught">
            {hits.map((h, i) => (
              <li key={h.term}>
                <button
                  type="button"
                  onClick={() => go(h)}
                  onKeyDown={(e) => {
                    const items = list.current?.querySelectorAll('button')
                    if (e.key === 'ArrowDown') (e.preventDefault(), focusItem(Math.min(i + 1, hits.length - 1)))
                    else if (e.key === 'ArrowUp') (e.preventDefault(), i === 0 ? (items?.[0].closest('.recall-search')?.querySelector('input') as HTMLInputElement | null)?.focus() : focusItem(i - 1))
                    else if (e.key === 'Escape') setQ('')
                  }}
                >
                  <span className="mono">{h.term}</span>
                  <span className="where">
                    · {h.n} {h.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="recall-none" role="status">
            Nothing by that name.
          </p>
        ))}
    </div>
  )
}
