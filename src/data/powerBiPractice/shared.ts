// Pieces the later drills repeat: how to start from scratch in two minutes (load, link, measures, date table).
import { code, pre } from '../../core/powerBi'

/** Load the three star files. */
export const SCRATCH_LOAD = `<li>Unzip the archive. In Power BI Desktop: <b>Home, Get data, Text/CSV</b> for each of the three files <code>fact_sales.csv</code>, <code>dim_customer.csv</code>, <code>dim_product.csv</code> in ${code('data')} (UTF-8, comma), then <b>Load</b>.</li>`

/** The two links of the star. */
export const SCRATCH_LINKS = `<li>Open <b>Model view</b>. Drag ${code('fact_sales[customer_id]')} onto ${code('dim_customer[customer_id]')}, and ${code('fact_sales[product_id]')} onto ${code('dim_product[product_id]')}. Check Many to one, Single, active.</li>`

/** The measures of section 4 the later drills build on. */
export const SCRATCH_MEASURES = `<li>Select <code>fact_sales</code> in the Data pane. <b>Table tools, New measure</b>, paste, Enter, once for each:${pre('Revenue = SUM(fact_sales[revenue])\nSales = COUNTROWS(fact_sales)')}</li>`

/** The date table of section 6 (a date column to filter by, and its link). */
export const DATE_TABLE = 'Date = CALENDAR(DATE(2024, 1, 1), DATE(2026, 6, 30))'
export const DATE_COLUMNS = ['Month = FORMAT(\'Date\'[Date], "yyyy-mm")', 'Year = YEAR(\'Date\'[Date])']

export const SCRATCH_DATE = `<li><b>Modeling, New table</b>, paste, Enter:${pre(DATE_TABLE)}Select the new <code>Date</code> table in the Data pane. <b>Table tools, Mark as date table</b>, pick <code>Date[Date]</code>. Then <b>New column</b> twice (not New measure):${pre(DATE_COLUMNS.join('\n'))}</li>
<li>In <b>Model view</b> drag ${code('Date[Date]')} onto ${code('fact_sales[sale_date]')}. Check Many to one, Single, active.</li>`

/** The measures of section 6 (last year, year to date). */
export const TIME_MEASURES = ['Revenue LY = CALCULATE([Revenue], SAMEPERIODLASTYEAR(\'Date\'[Date]))', "Revenue YTD = TOTALYTD([Revenue], 'Date'[Date])"]
export const SCRATCH_TIME = `<li>Select <code>fact_sales</code>. <b>New measure</b>, once for each:${pre(TIME_MEASURES.join('\n'))}</li>`
