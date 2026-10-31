// The sections of the SQL practice page, in page order. tests/sqlPractice.test.ts runs every query in them.
import { sectionTasks, type PracticeSection } from '../practiceBook'
import { DATA_MAP } from './s00-data'
import { SELECT } from './s01-select'
import { WHERE } from './s02-where'
import { NULL } from './s03-null'
import { TOTALS } from './s04-totals'
import { GROUP_BY } from './s05-group-by'
import { DATES } from './s06-dates'
import { INNER_JOIN } from './s07-inner-join'
import { LEFT_JOIN } from './s08-left-join'
import { CTE } from './s10-cte'
import { WINDOWS } from './s11-windows'
import { RANKING } from './s12-ranking'
import { FREE } from './s13-free'
import { CASE } from './s09-case'

export const SECTIONS: PracticeSection[] = [DATA_MAP, SELECT, WHERE, NULL, TOTALS, GROUP_BY, DATES, INNER_JOIN, LEFT_JOIN, CASE, CTE, WINDOWS, RANKING, FREE]

export { examplesOf, taskNumber, tasksOf } from '../practiceBook'

export const SECTION_TASKS = sectionTasks(SECTIONS)
