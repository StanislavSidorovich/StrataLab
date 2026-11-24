// Section 6: date table and last year.
import { code, pre } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'
import { DATE_COLUMNS, DATE_TABLE, SCRATCH_LINKS, SCRATCH_LOAD, SCRATCH_MEASURES, TIME_MEASURES } from './shared'

export const S06: PbiSection = {
  id: 'dates',
  n: 6,
  title: 'Date table and last year',
  blocks: [
    {
      kind: 'note',
      topic: 'A date table',
      text: "Time functions (`SAMEPERIODLASTYEAR`, `TOTALYTD`) need a table with one row for every day, no gaps, and they must be given its date column. The sales have a date only on the days something was sold (here once a week), so a table of its own is made: `~Date = CALENDAR(DATE(2024, 1, 1), DATE(2026, 6, 30))`. Mark it as a date table (Table tools), link `~Date[Date]` to `~fact_sales[sale_date]` (many to one, single), and put the Month and Year columns on the Date table, never on the fact. `SAMEPERIODLASTYEAR` shifts the dates in the filter back a year; `TOTALYTD` adds up from 1 January to the last date in the filter.",
      trap: 'A visual that takes its Month from fact_sales never touches the Date table, so the time measures see no dates. Axis and rows come from the Date table.',
    },
    {
      kind: 'pick',
      id: 'dt-why',
      title: 'Why a date table',
      question: 'The sales already have `sale_date`. Why do you add a Date table for last year and year to date?',
      options: [
        { id: 'gaps', text: 'Time functions need a column with every day and no gaps; sale_date has only the days with sales', why: '' },
        { id: 'faster', text: 'It makes the report load faster', why: 'Speed is not the reason. A date table is small, but what matters is that it has every day.' },
        { id: 'csv', text: 'Power BI cannot read dates from a CSV file', why: 'It reads them fine; a date column was already loaded and typed in section 1.' },
        { id: 'names', text: 'To rename the months', why: 'Month names are only a side effect. The date table exists to give time functions a complete calendar.' },
      ],
      right: 'gaps',
      hints: ['The sales are weekly: some days have no row at all.', 'SAMEPERIODLASTYEAR moves a set of days back one year: it needs all the days to exist.'],
      explain: 'A date table has one row for every day of the period, so shifting a year back always lands on real days. It also gives one place for Month, Year and weekday.',
    },
    {
      kind: 'predict',
      id: 'dt-ly',
      title: 'Last year, a partial year',
      question: 'The Date table runs from 1 January 2024 to 30 June 2026. A slicer on `Date[Year]` has 2026 selected and a card shows `Revenue LY = CALCULATE([Revenue], SAMEPERIODLASTYEAR(\'Date\'[Date]))`. What does it show? Round to two decimals.',
      sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2025-01-01' AND sale_date < DATE '2025-07-01'",
      traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2025-01-01' AND sale_date < DATE '2026-01-01'", says: 'That is all of 2025. The days of 2026 in the filter are January to June, so the same period last year is January to June 2025.' }],
      hints: ['Which days of 2026 exist in the Date table?', 'SAMEPERIODLASTYEAR shifts exactly those days back one year.'],
      explain: 'The filter holds the days 1 January to 30 June 2026. Shifted back a year they are 1 January to 30 June 2025: a like-for-like half year.',
    },
    {
      kind: 'predict',
      id: 'dt-ytd',
      title: 'Year to date in August',
      question: 'A table lists `Date[Month]` with `Revenue YTD = TOTALYTD([Revenue], \'Date\'[Date])`. What does the row 2025-08 show? Round to two decimals.',
      sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2025-01-01' AND sale_date < DATE '2025-09-01'",
      traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-08'", says: 'That is August alone. TOTALYTD adds up from 1 January to the end of the month of the row.' }],
      hints: ['Year to date starts on 1 January of the same year.', 'The row is a month: the last date in its filter is the last day of August.'],
      explain: 'TOTALYTD adds everything from 1 January to the last date in the filter: for the row 2025-08, January to August 2025.',
    },
    {
      kind: 'spot',
      id: 'dt-same',
      title: 'Last year equals this year',
      question: 'A table by `Date[Month]` shows Revenue and Revenue LY. The two columns show the same total on every row, and the rows are all the same. What is missing?',
      snippet: 'Month      Revenue       Revenue LY\n2025-08    {{TOTAL}}     {{TOTAL}}\n2025-09    {{TOTAL}}     {{TOTAL}}\n2025-10    {{TOTAL}}     {{TOTAL}}',
      options: [
        { id: 'link', text: 'No link between Date[Date] and fact_sales[sale_date]: the months never filter the sales', why: '' },
        { id: 'mark', text: 'The Date table is not marked as a date table', why: 'Marking helps time functions, but without a link the numbers would still be the same on every row. The rows do not reach the sales.' },
        { id: 'year', text: 'You need TOTALYTD instead of SAMEPERIODLASTYEAR', why: 'The two columns would still be the total of all sales: the problem is before the formulas.' },
        { id: 'units', text: 'Display units are on Auto', why: 'Display units change how a number is written, not which sales it adds up.' },
      ],
      right: 'link',
      hints: ['The same number on every row: what is not filtering?', 'Model view shows whether the Date table has a line to fact_sales.'],
      explain: 'Without a link the Date table filters nothing, so every row shows the total of all sales. Drag Date[Date] onto fact_sales[sale_date] in Model view: Many to one, Single.',
    },
    {
      kind: 'order',
      id: 'dt-order',
      title: 'Build the Date table',
      question: 'Put the steps of making a Date table and last year in the order you do them.',
      steps: ['Modeling, New table: Date = CALENDAR(…)', 'Table tools, Mark as date table', 'New column on Date: Month and Year', 'Model view: link Date[Date] to fact_sales[sale_date]', 'New measure: Revenue LY = CALCULATE([Revenue], SAMEPERIODLASTYEAR(…))', 'A table by Date[Month] to see it'],
      hints: ['The table exists before it can be marked or linked.', 'You look at the result last.'],
      explain: 'Make the table, mark it, add the columns, link it to the fact, write the time measures, look at them in a table by Date[Month].',
    },
    {
      kind: 'drill',
      id: 'dt-drill',
      title: 'A date table, last year and year to date',
      question: 'Make a Date table, link and mark it, write two time measures and read three numbers off a table by month. Download the zip, follow the steps, type the four numbers.',
      zip: 'kaiyo-powerbi-6-dates.zip',
      intro: 'A Date table with a month column, two time measures, and a table by month to read them.',
      continues: 'the star with its links and the measure Revenue',
      scratch: [SCRATCH_LOAD, SCRATCH_LINKS, SCRATCH_MEASURES],
      steps: [
        {
          title: 'The Date table',
          html: `<p><b>Modeling, New table</b>, paste, Enter:</p>
${pre(DATE_TABLE)}
<p>Select the new <code>Date</code> table in the <b>Data</b> pane. <b>Table tools, Mark as date table</b>, pick <code>Date[Date]</code>, OK.</p>
<p class="muted">Why 30 June 2026: the sales stop on 29 June. A longer table would show later months with a year to date and nothing else.</p>`,
        },
        {
          title: 'Month and Year on the Date table',
          html: `<p>With <code>Date</code> selected in the Data pane press <b>Table tools, New column</b> (<b>not</b> New measure), once for each:</p>
${pre(DATE_COLUMNS.join('\n'))}
<p>They are text and a number, such as 2025-08 and 2025: no date hierarchy appears, and the months sort in date order because the year comes first. (With month names such as Aug, add <code>MonthNumber</code> and press <b>Column tools, Sort by column, MonthNumber</b>.) Check that both sit under <code>Date</code>, not under <code>fact_sales</code>.</p>`,
        },
        {
          title: 'Link the Date table',
          html: `<p>Open <b>Model view</b>. Drag ${code('Date[Date]')} onto ${code('fact_sales[sale_date]')}. Check: Cardinality <b>Many to one (*:1)</b> (the many side is fact_sales), Cross filter direction <b>Single</b>, <b>Make this relationship active</b> ticked. Power BI may create the line at once (change it in Properties, then Apply changes) or open a dialog (then OK or Save).</p>`,
        },
        {
          title: 'Last year and year to date',
          html: `<p>Select <code>fact_sales</code> in the Data pane. <b>New measure</b>, once for each:</p>
${pre(TIME_MEASURES.join('\n'))}
<p class="muted">They use <code>[Revenue]</code> from section 4.</p>`,
        },
        {
          title: 'A table by month and a count of days',
          html: `<ol>
<li>Add a <b>Table</b> with <code>Date[Month]</code> (from the <b>Date</b> table, not fact_sales), <code>Revenue</code>, <code>Revenue LY</code> and <code>Revenue YTD</code>. Set <b>Display units: None</b> for the values.</li>
<li>Read the rows <b>2026-03</b>, <b>2026-06</b> and <b>2025-12</b>.</li>
<li>Add a <b>Card</b> with <code>Date[Date]</code> and choose <b>Count</b> (not Count (Distinct)): the rows of the Date table.</li>
</ol>`,
        },
      ],
      checks: [
        {
          id: 'ly',
          label: 'Revenue LY on the row 2026-03',
          where: 'in the table of step 5',
          sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-03'",
          traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2026-03'", says: 'That is March 2026, the Revenue column. Revenue LY is the same month a year earlier: March 2025.' }],
        },
        {
          id: 'ytd-jun',
          label: 'Revenue YTD on the row 2026-06',
          where: 'in the table of step 5',
          sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'",
          traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2026-06'", says: 'That is June alone. Year to date adds up from 1 January: if it equals the Revenue column, the measure is not TOTALYTD or the Month comes from fact_sales.' }],
        },
        {
          id: 'ytd-dec',
          label: 'Revenue YTD on the row 2025-12',
          where: 'in the table of step 5',
          sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2025-01-01' AND sale_date < DATE '2026-01-01'",
          traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-12'", says: 'That is December alone. The year to date of the last month of a year is the whole year.' }],
        },
        {
          id: 'days',
          label: 'Rows in the Date table',
          where: 'on the card with the Count of Date[Date] (step 5)',
          sql: "SELECT date_diff('day', DATE '2024-01-01', DATE '2026-06-30') + 1",
          traps: [{ sql: 'SELECT count(DISTINCT sale_date) FROM fact_sales', says: 'That is the days with a sale (Count of fact_sales[sale_date]). The Date table has one row for every day: pick Date[Date] from the Date table.' }],
        },
      ],
      ifWrong: [
        'it is blank or the same as the Revenue column: the Date table is not linked to fact_sales, or Month comes from fact_sales (steps 2, 3 and 5).',
        'it equals the month alone: the measure is not TOTALYTD over Date[Date], or Month comes from fact_sales (steps 4 and 5).',
        'it equals December alone: same cause as the line above (steps 4 and 5).',
        'it is a small number: you counted the dates of fact_sales; use Date[Date] of the Date table with Count (step 5).',
      ],
      hints: ['Mark the Date table and link Date[Date] to fact_sales[sale_date].', 'Month and the rows of the table come from the Date table.', 'TOTALYTD and SAMEPERIODLASTYEAR take Date[Date].'],
    },
  ],
}
