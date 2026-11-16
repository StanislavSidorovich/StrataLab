// The Power BI practice page's content: the eight sections (1, 3 and 4 from pass 1; 2 and 5 to 8 from pass 2).
import { progressIds, tasksA, type PbiSection } from '../../core/powerBiPractice'
import { S01 } from './s01-get-data'
import { S02 } from './s02-clean'
import { S03 } from './s03-model'
import { S04 } from './s04-measures'
import { S05 } from './s05-calculate'
import { S06 } from './s06-dates'
import { S07 } from './s07-share'
import { S08 } from './s08-visuals'

export const SECTIONS: PbiSection[] = [S01, S02, S03, S04, S05, S06, S07, S08]

/** For progress: the sections that have tasks (a section marked `soon` has none). */
export const SECTION_TASKS = SECTIONS.filter((s) => !s.soon).map((s) => ({ id: s.id, taskIds: progressIds(s) }))
export const ALL_TASKS = SECTIONS.flatMap(tasksA)
