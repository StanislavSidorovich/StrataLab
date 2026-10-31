// The sections of the Python practice page, in page order. tests/pyPractice.test.ts runs every cell in them.
import { sectionTasks, type PracticeSection } from '../practiceBook'
import { DATA_MAP } from './s00-data'
import { FIRST_LOOK } from './s01-first-look'
import { FILTER } from './s02-filter'
import { SUMMARIES } from './s03-summaries'
import { NEW_COLUMNS } from './s04-new-columns'
import { MISSING } from './s05-missing'
import { DATES } from './s06-dates'
import { CLEAN_EXPORT } from './s07-clean-export'
import { GROUPBY } from './s08-groupby'
import { MERGE } from './s09-merge'
import { RESHAPE } from './s10-reshape'
import { ACROSS_ROWS } from './s11-across-rows'
import { CHARTS } from './s12-charts'
import { BUSINESS } from './s13-business'
import { FREE } from './s14-free'

export const SECTIONS: PracticeSection[] = [DATA_MAP, FIRST_LOOK, FILTER, SUMMARIES, NEW_COLUMNS, MISSING, DATES, CLEAN_EXPORT, GROUPBY, MERGE, RESHAPE, ACROSS_ROWS, CHARTS, BUSINESS, FREE]

export { examplesOf, taskNumber, tasksOf } from '../practiceBook'

export const SECTION_TASKS = sectionTasks(SECTIONS)
