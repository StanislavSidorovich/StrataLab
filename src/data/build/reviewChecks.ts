// Two checks on the Answer step after the three numbers: A4 (do the chains add up to the tile?) and A5 (which line do you send the
// Head of Sales?). Text only; the rules are src/core/buildReview.ts, the screen src/ui/build/ReviewChecks.tsx.

export type A4Pick = 'exact' | 'less' | 'more'
export type A5Pick = 'carries' | 'quarter' | 'full'

export const A4_QUESTION = 'Do the five bars of the chains tile add up to the revenue tile? Say what you expect, then see the sum.'
export const A4_OPTIONS: readonly { value: A4Pick; label: string }[] = [
  { value: 'exact', label: 'Yes, to the cent' },
  { value: 'less', label: 'No: the bars add up to less' },
  { value: 'more', label: 'No: the bars add up to more' },
]

export const A5_QUESTION = 'Which line would you send the Head of Sales?'
export const A5_LINES: readonly { value: A5Pick; text: string }[] = [
  { value: 'carries', text: 'Minori carries the half-year: 90,829.50 of 314,906.13, and nobody else matters, so we can drop the other four chains.' },
  { value: 'quarter', text: 'In the second quarter of 2026 we sold 314,906.13. Minori leads with 90,829.50, Nagisa is close behind with 87,647.48, and 1,063.00 sits with customers that have no chain.' },
  { value: 'full', text: 'From January to June 2026 we sold 314,906.13. Minori leads with 90,829.50, Nagisa is close behind with 87,647.48, and 1,063.00 sits with customers that have no chain.' },
]
export const A5_RIGHT: A5Pick = 'full'

/** What is said after a pick: the right line gets a confirmation, each wrong one the thing that is wrong in it. */
export const A5_REVIEW: Record<A5Pick, { ok: boolean; line: string }> = {
  carries: { ok: false, line: 'The conclusion does not follow. Minori is 29% of the half-year and Nagisa is only 3,182 behind; the other four chains are 71% of the money. A line that tells the Head of Sales to drop them is a decision the numbers do not support.' },
  quarter: { ok: false, line: 'The period is wrong. 314,906.13 is January to June, six months, not the second quarter. The Head of Sales would quote a number for the wrong time span.' },
  full: { ok: true, line: 'This one says the period, gives the number, compares the leader with the runner-up and keeps the 1,063.00 that the bars leave out. Everything in it can be checked on your dashboard.' },
}
