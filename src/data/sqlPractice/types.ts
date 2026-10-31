// One long page of SQL practice on Kaiyo Trading (src/ui/SqlPractice.tsx). Rules for writing it: RULES.md.

export interface PracticeTrap {
  /** a wrong query people really write; its result must differ from the answer's */
  sql: string
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
  /** T-SQL, ready to run */
  sql: string
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
  /** T-SQL */
  solution: string
  traps?: PracticeTrap[]
}

export type PracticeBlock = PracticeNote | PracticeTables | PracticeExampleCell | PracticeTaskCell

export interface PracticeSection {
  /** in the address (`&at=joins`): keep stable */
  id: string
  /** its number on the page; a task is 7.2 by this and its place */
  n: number
  title: string
  blocks: PracticeBlock[]
}
