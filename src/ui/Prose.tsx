// Running text with `code` in backticks. Code is calm (`.prose-code`); in a "New: <topic>" note it is the new
// term the note introduces (`.prose-code-new`, accent), unless it starts with `~` (src/core/terms.ts). Colours: practiceCode.css.
import { proseParts } from '../core/terms'
import './practiceCode.css'

export function Prose({ text, newTerms = false }: { text: string; newTerms?: boolean }) {
  return (
    <>
      {proseParts(text, newTerms).map((p, i) =>
        p.kind === 'text' ? (
          p.text
        ) : (
          <code key={i} className={`mono ${p.kind === 'new' ? 'prose-code prose-code-new' : 'prose-code'}`}>
            {p.text}
          </code>
        ),
      )}
    </>
  )
}

/** The new terms of a note as small chips after its topic, so the eye finds them before reading. */
export function TermChips({ terms }: { terms: { label: string }[] }) {
  if (!terms.length) return null
  return (
    <span className="prose-chips" aria-label="New terms">
      {terms.map((t) => (
        <code key={t.label} className="mono prose-code prose-code-new prose-chip">
          {t.label}
        </code>
      ))}
    </span>
  )
}
