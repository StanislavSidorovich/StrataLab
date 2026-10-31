// One long page of practice on Kaiyo Trading (src/ui/PracticeBook.tsx), in SQL or Python. Rules for
// writing each: RULES.md in src/data/sqlPractice and src/data/pyPractice.

export interface PracticeTrap {
  /** a wrong query or cell people really write; its result must differ from the answer's */
  code: string
  /** what is wrong, said when the learner's result is the same as this query's */
  says: string
}

export interface PracticeNote {
  kind: 'note'
  /** a sentence or two; `code` in backticks */
  text: string
  /** one line of syntax, shown as code */
  syntax?: string
  /** the mistake to watch for, in a line */
  trap?: string
}

export interface PracticeTable {
  name: string
  /** the variable that holds it on the Python page */
  alias?: string
  /** what one row is */
  row: string
  /** the columns to know; all must exist */
  columns: string[]
}

export interface PracticeTables {
  kind: 'tables'
  tables: PracticeTable[]
}

export interface PracticeExampleCell {
  kind: 'example'
  id: string
  title: string
  /** ready to run */
  code: string
}

export interface PracticeTaskCell {
  kind: 'task'
  id: string
  title: string
  /** the business question, naming the columns and the order wanted */
  question: string
  /** the answer's rows come in this order, and the question says so */
  ordered: boolean
  hints: string[]
  solution: string
  /** SQL page only: the solution written in PostgreSQL, only where the PostgreSQL form really differs; shown under the task after Solution */
  pg?: string
  traps?: PracticeTrap[]
}

export type PracticeBlock = PracticeNote | PracticeTables | PracticeExampleCell | PracticeTaskCell

export interface PracticeSection {
  /** in the address (`&at=joins`): keep stable */
  id: string
  /** its number on the page; a task is 7.2 by this and its place */
  n: number
  title: string
  /** a heading over this section and those after it, on the page and in its list */
  part?: string
  blocks: PracticeBlock[]
}

export const tasksOf = (s: PracticeSection) => s.blocks.filter((b): b is PracticeTaskCell => b.kind === 'task')
export const examplesOf = (s: PracticeSection) => s.blocks.filter((b): b is PracticeExampleCell => b.kind === 'example')

export const sectionTasks = (sections: PracticeSection[]) => sections.map((s) => ({ id: s.id, taskIds: tasksOf(s).map((t) => t.id) }))

/** A task's number on the page: 7.2 is the second task of section 7. */
export function taskNumber(s: PracticeSection, t: PracticeTaskCell): string {
  return `${s.n}.${tasksOf(s).indexOf(t) + 1}`
}
