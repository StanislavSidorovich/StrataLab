// The sections of the Python practice page, in page order. tests/pyPractice.test.ts runs every cell in them.
import { sectionTasks, type PracticeSection } from '../practiceBook'
import { DATA_MAP } from './s00-data'
import { FIRST_LOOK } from './s01-first-look'
import { FILTER } from './s02-filter'
import { SUMMARIES } from './s03-summaries'

export const SECTIONS: PracticeSection[] = [DATA_MAP, FIRST_LOOK, FILTER, SUMMARIES]

export { examplesOf, taskNumber, tasksOf } from '../practiceBook'

export const SECTION_TASKS = sectionTasks(SECTIONS)
