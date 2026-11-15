// The Power BI practice page's content (pass 1: sections 1, 3 and 4; the rest are listed as coming next).
import { progressIds, tasksA, type PbiSection } from '../../core/powerBiPractice'
import { S01 } from './s01-get-data'
import { S03 } from './s03-model'
import { S04 } from './s04-measures'

const soon = (id: string, n: number, title: string, line: string): PbiSection => ({ id, n, title, soon: line, blocks: [] })

export const SECTIONS: PbiSection[] = [
  S01,
  soon('clean', 2, 'Clean in Power Query', "Trim, split, replace, unpivot and merge, with steps named like Lab's Clean."),
  S03,
  S04,
  soon('calculate', 5, 'CALCULATE and filter context', 'Change the filter a measure sees: CALCULATE, FILTER, a measure inside a measure.'),
  soon('dates', 6, 'Date table and last year', 'A date table, SAMEPERIODLASTYEAR and year to date.'),
  soon('share', 7, 'Share and top N', 'ALL and REMOVEFILTERS for a share, RANKX and TOPN.'),
  soon('visuals', 8, 'Visuals and a page for a manager', 'Card, line, bar, slicer, interactions and Display units on one page that answers a question.'),
]

/** For progress: the sections that have tasks. */
export const SECTION_TASKS = SECTIONS.filter((s) => !s.soon).map((s) => ({ id: s.id, taskIds: progressIds(s) }))
export const ALL_TASKS = SECTIONS.flatMap(tasksA)
