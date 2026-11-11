// Texts and reference numbers of the Refresh step (spec docs/build-kaiyo-sales-spec.md, 5.7). The numbers were computed with
// the generator of julyExport.ts on the real parquet files; tests/buildRefresh.test.ts re-checks every one of them.
import type { Judged } from '../../core/buildDashboard'
import { JULY_FILE } from './julyExport'

export { JULY_FILE }

/** Files in the sales folder: 30 monthly exports, then the one of July. */
export const FOLDER_FILES = 31
export const LISTED_FILES = 30

/** What the learner reads in the three moments. */
export const REFRESH_TEXT = {
  lead: `It is August. The distributor sent ${JULY_FILE}: one more file in the sales folder. Nothing in your steps changes; you run them again and see what the new month does.`,
  folder: `The sales folder now holds ${FOLDER_FILES} files.`,
  settingTitle: 'Connect setting for sales/',
  list: 'List of files',
  pattern: 'Every file in the folder',
  tradeoff: 'The list is safe: nothing new gets in unseen. The pattern takes new files as they arrive, and whatever is wrong inside them.',
  runHint: 'Run everything: bronze, clean, the star and the dashboard tiles, in that order. Every step writes a line in the journal.',
  notRead: `the new file was not read`,
  fixTitle: 'A date format your step has never seen',
  fixText: 'The date step turns one spelling of the July dates into [Error]. Look at the rows in error, then add that spelling to your date step: one more line in its CASE.',
  fixHint1: 'Look at the dates in error in the journal and in the sales preview: they are written year first, with slashes, like 2026/07/03.',
  fixHint2: 'The format with the year first: %Y/%m/%d. The step already has one branch for slash dates (day first); the new one has to come before it.',
  r1Title: 'Read July',
  r1Text: 'All green. The line on the dashboard has a new point: July 2026. The number tile still says January to June.',
  history: 'Last runs',
} as const

/** The check question after a green run. Numbers filled by the generator's truth (see tests). */
export const R1_VALUE = 64508.87
export const R1_QUESTION: Judged & { question: string; numberLabel: string } = {
  question: 'How much did we sell in July 2026?',
  numberLabel: 'Revenue',
  right: { value: R1_VALUE },
  where: 'the last point of the line',
  wrong: [
    { value: 68594.44, line: 'That July still has the lines sent twice. Is Removed sales sent twice still in your steps?' },
    { value: 52779.39, line: "That July is missing the sales whose date was [Error]: they are in the table, but with no date they are in no month. Is the journal green?" },
    { value: 68659.14, line: 'That is June, the point before the last one.' },
    { value: 314906.13, line: 'That is the number tile: January to June. July is the last point of the line.' },
  ],
}
