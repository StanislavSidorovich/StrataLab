// The answer key a phone shows after a question is closed (src/core/lessonPhone.ts), by the key the room uses: w1.., v1.. (INNER JOIN set), d1.., f1...
// Built from the same question files the projector uses, so a phone never disagrees with the slide. The phone loads this only after a question
// is closed (dynamic import of PhoneResult); it is not in the phone's first bundle.
import { VOTE_DEFAULT_SET, arrange, type WarmQuestion } from '../core/lesson'
import type { PhoneFill, PhoneItem, PhoneVote } from '../core/lessonPhone'
import { FILL_QUESTIONS } from './lessonFill'
import { FILL_ANSWERS, FILL_WHY } from './lessonFillAnswers'
import { SHOP_VOTES, VOTES, WARMUP } from './lessonVotes'

const fromWarm = (q: WarmQuestion): PhoneVote => ({ kind: 'vote', right: q.right, why: q.why, options: q.options.map((o) => ({ text: o.text, why: o.why, mssql: o.mssql ?? null })) })

/** The phone-side items by key. */
export function phoneItems(): Record<string, PhoneItem> {
  const out: Record<string, PhoneItem> = {}
  WARMUP.forEach((q, i) => (out[`w${i + 1}`] = fromWarm(q)))
  SHOP_VOTES.forEach((q, i) => (out[`d${i + 1}`] = fromWarm(q)))
  // the votes on code: four queries in an order fixed by the question's number
  ;(VOTES[VOTE_DEFAULT_SET] ?? []).forEach((q, i) => {
    const a = arrange(q, i)
    out[`v${i + 1}`] = { kind: 'vote', right: a.findIndex((o) => o.right), why: q.why, options: a.map((o) => ({ text: o.sql, why: null, mssql: null })) } satisfies PhoneVote
  })
  FILL_QUESTIONS.forEach((q) => {
    const accepted = FILL_ANSWERS[q.id]
    out[q.id] = { kind: 'fill', template: q.template, accepted, why: FILL_WHY[q.id] } satisfies PhoneFill
  })
  return out
}
