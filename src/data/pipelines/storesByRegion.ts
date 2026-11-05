// The warm-up pipeline (`#pipeline=kaiyo-sellout` shows it first to someone new to pipelines): four blocks, one per step,
// one small file, a different and simple question, no twist. It is watched once, then built by the learner, then the real
// pipeline follows. Pure text; the engine is src/db/tutorialRun.ts, the page src/ui/PipelineTutorial.tsx.
import type { LaneId } from './kaiyoSellout'

export const TUT_ID = 'stores-by-region'
export const TUT_SCHEMA = 'pipe_tutorial'
export const TUT_FILE = `${TUT_SCHEMA}/stores.csv`

export type TutBlockId = 'copy-stores' | 'clean-stores' | 'count-regions' | 'card-regions'

export interface TutLane {
  id: LaneId
  slots: number
}
export const TUT_LANES: TutLane[] = [
  { id: 'engineer', slots: 2 },
  { id: 'ae', slots: 3 },
  { id: 'analyst', slots: 2 },
]
export const tutSlot = (lane: LaneId, i: number) => `${lane}-${i}`

export interface TutBlock {
  id: TutBlockId
  lane: LaneId
  label: string
  /** what it does, for the tip line and the "Watch" caption */
  does: string
  fabric: string
  /** the table it builds */
  table: string
  /** what the next step is, after "Next:" */
  next: string
}

export const TUT_BLOCKS: TutBlock[] = [
  {
    id: 'copy-stores',
    lane: 'engineer',
    label: 'Copy the stores file',
    does: 'Copies the file as it came into the bronze table. Nothing is changed, everything is still text.',
    fabric: 'Copy data activity.',
    table: 'bronze_stores',
    next: 'the data engineer loads the file',
  },
  {
    id: 'clean-stores',
    lane: 'ae',
    label: 'Clean the stores',
    does: 'Turns the text into real numbers, trims the names and keeps only active stores (not distributors). The result is silver.',
    fabric: 'Notebook, Dataflow Gen2 or Stored procedure.',
    table: 'silver_stores',
    next: 'the analytics engineer cleans the rows',
  },
  {
    id: 'count-regions',
    lane: 'ae',
    label: 'Count stores per region',
    does: 'Joins the stores to the region names and counts them. The result is gold: a table that is ready to read.',
    fabric: 'Stored procedure or Dataflow Gen2 writing a gold table.',
    table: 'gold_stores_by_region',
    next: 'the analytics engineer counts stores per region',
  },
  {
    id: 'card-regions',
    lane: 'analyst',
    label: 'Card: stores per region',
    does: 'Shows the answer for the Head of Sales: the region with the most stores, and the others as bars.',
    fabric: 'A card and a bar visual in a Power BI report.',
    table: 'report_regions',
    next: 'the analyst puts the answer on a card',
  },
]

export const tutBlock = (id: string): TutBlock | undefined => TUT_BLOCKS.find((b) => b.id === id)

export const TUT_QUESTION = 'In which region do we have the most active stores, and how many?'

const T = (n: string) => `${TUT_SCHEMA}.${n}`

export const TUT_SQL: Record<TutBlockId, string> = {
  'copy-stores': `CREATE OR REPLACE TABLE ${T('bronze_stores')} AS
SELECT * FROM read_csv(['${TUT_FILE}'], delim = ';', header = true, all_varchar = true)`,
  'clean-stores': `CREATE OR REPLACE TABLE ${T('silver_stores')} AS
SELECT CAST(customer_id AS INTEGER) AS store_id, trim(customer_name) AS store_name, CAST(region_id AS INTEGER) AS region_id
FROM ${T('bronze_stores')}
WHERE is_active = '1' AND customer_type <> 'distributor'`,
  'count-regions': `CREATE OR REPLACE TABLE ${T('gold_stores_by_region')} AS
SELECT r.region_name, count(*) AS stores
FROM ${T('silver_stores')} s JOIN ${T('src_region')} r ON r.region_id = s.region_id
GROUP BY r.region_name`,
  'card-regions': `CREATE OR REPLACE TABLE ${T('report_regions')} AS
SELECT region_name, stores FROM ${T('gold_stores_by_region')} ORDER BY stores DESC, region_name`,
}

/** The tables the warm-up builds, in the order of the steps. */
export const TUT_TABLES = ['bronze_stores', 'silver_stores', 'gold_stores_by_region', 'report_regions'] as const

/** One line per step for the Watch part: why the block is there. */
export const WATCH_CAPTIONS: Record<TutBlockId, string> = {
  'copy-stores': 'First the data engineer brings the file in, exactly as it is. This is bronze: a raw copy you can always go back to.',
  'clean-stores': 'The analytics engineer cleans it: real numbers, trimmed names, only active stores. This is silver.',
  'count-regions': 'Next the same role counts stores per region. This is gold: it reads silver, so it comes after it.',
  'card-regions': 'Last the analyst shows the answer. The card reads gold, and nothing else.',
}

export const ARROW_CAPTION =
  'The arrow before this step is "Runs when the previous step: Succeeded". It means: start only if the step before worked. "Completed" would start even after a failure, which is rarely what you want.'

/** Rules of the warm-up page. */
export const TUT_STORAGE = 'stratalab.pipeline.tutorial'
