// What a phone shows after the teacher reveals a question: the student's own answer, whether it was right, and why. Pure.
// No results or tables on the phone (those stay on the projector). The answer key below is loaded by the phone only once a question
// is closed (src/ui/PhoneResult.tsx, dynamic import), so it is not in the phone's first bundle.

/** What a phone's vote or fill answer comes to once the question is closed. */
export type Outcome = 'right' | 'wrong' | 'none'

/** A vote: the letter the phone sent against the right letter's index (0 to 3). */
export const voteOutcome = (mine: string | null | undefined, right: number): Outcome => {
  const i = mine ? 'ABCD'.indexOf(mine) : -1
  return i < 0 ? 'none' : i === right ? 'right' : 'wrong'
}

/** The questions a phone can show a result for, by key (`w3`, `v2`, `d7`, `f1`). */
export interface PhoneVote {
  kind: 'vote'
  /** index of the right option (0 to 3) */
  right: number
  /** the options in letter order: what the slide shows, why it is wrong or right, and SQL Server's message when it fails there */
  options: { text: string; why: string | null; mssql: string | null }[]
  /** the question's own explanation (for an option that has none of its own, as in the votes on code) */
  why: string
}
export interface PhoneFill {
  kind: 'fill'
  template: string
  /** accepted spellings per gap; the first is shown */
  accepted: string[][]
  why: string
}
export type PhoneItem = PhoneVote | PhoneFill
