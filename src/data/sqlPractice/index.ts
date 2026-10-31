// The sections of the SQL practice page, in page order. tests/sqlPractice.test.ts runs every query in them.
import type { SectionTasks } from '../../core/sqlPractice'
import { DATA_MAP } from './s00-data'
import { INNER_JOIN } from './s07-inner-join'
import { LEFT_JOIN } from './s08-left-join'
import type { PracticeExampleCell, PracticeSection, PracticeTaskCell } from './types'

export const SECTIONS: PracticeSection[] = [DATA_MAP, INNER_JOIN, LEFT_JOIN]

export const tasksOf = (s: PracticeSection) => s.blocks.filter((b): b is PracticeTaskCell => b.kind === 'task')
export const examplesOf = (s: PracticeSection) => s.blocks.filter((b): b is PracticeExampleCell => b.kind === 'example')

export const SECTION_TASKS: SectionTasks[] = SECTIONS.map((s) => ({ id: s.id, taskIds: tasksOf(s).map((t) => t.id) }))

/** A task's number on the page: 7.2 is the second task of section 7. */
export function taskNumber(s: PracticeSection, t: PracticeTaskCell): string {
  return `${s.n}.${tasksOf(s).indexOf(t) + 1}`
}
