// One line each on Clean and Refresh: what the step is in Power BI / Fabric. Text only, no copy of Fabric's screens.
export const FABRIC_CLEAN = 'In Power BI and Fabric: your list of steps is the Applied steps of a query in Power Query (a Dataflow Gen2). Each step reads the table the one before it made.'
export const FABRIC_REFRESH = 'In Fabric this Run is a pipeline run: Copy brings in the new file, the Dataflow replays all your steps on it in one go, the result lands as a table in the Lakehouse, and the model refreshes.'
// Top 5 of the data-engineering review (docs/build-de-review-2026-11-20.md section 3): vocabulary, grain, what Refresh is not.
export const VOCAB_CLEAN = 'clean_ tables are the silver layer of a lakehouse; in dbt they would be staging models. Checks that return 0 are what dbt calls tests: unique, not_null, relationships.'
export const GRAIN_NOTE = 'One row of the fact = one store, one SKU, one week, as the distributor reports it.'
export const REFRESH_HONESTY = 'Lab rebuilds everything from all files when you press Run. A real pipeline runs on a schedule, usually loads only the new month (incremental), and alerts someone when a step goes red.'
export const TEST_NOTE = 'The Test lines are what dbt calls relationships and unique. In a warehouse a sale whose store is unknown goes to an Unknown customer or to a quarantine table.'
