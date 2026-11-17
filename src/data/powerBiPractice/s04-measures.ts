// Section 4: basic measures.
import { code, pre } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'

const FORMULAS = ['Revenue = SUM(fact_sales[revenue])', 'Sales = COUNTROWS(fact_sales)', 'Avg revenue per sale = DIVIDE([Revenue], [Sales])', 'Customers = DISTINCTCOUNT(fact_sales[customer_id])']

export const S04: PbiSection = {
  id: 'measures',
  n: 4,
  title: 'Basic measures',
  blocks: [
    {
      kind: 'note',
      topic: 'Measures and columns',
      text: 'A measure is a formula calculated when a visual asks for it, for the filters of that visual: `Revenue = SUM(fact_sales[revenue])`. A calculated column is calculated once per row when the data loads and then stays in the table: `Month = FORMAT(fact_sales[sale_date], "yyyy-mm")`. A number that must follow the slicers is a measure; a label on every row is a column.',
      trap: 'DIVIDE(a, b) gives a blank instead of an error when b is 0. COUNTROWS counts rows, also the ones with a blank value; AVERAGE skips them.',
    },
    {
      kind: 'predict',
      id: 'ms-avg',
      title: 'Average revenue per sale',
      question: 'A measure `Avg revenue per sale = DIVIDE(SUM(fact_sales[revenue]), COUNTROWS(fact_sales))`. With no filters, what does a card show? Round to two decimals.',
      sql: 'SELECT round(sum(revenue) / count(*), 2) FROM fact_sales',
      traps: [{ sql: 'SELECT round(avg(revenue), 2) FROM fact_sales', says: 'That is AVERAGE(revenue): it skips the sales with no revenue. This measure divides by all rows: COUNTROWS counts the ones with a blank revenue too.' }],
      hints: ['COUNTROWS counts every row of fact_sales.', 'Some sales have an empty revenue: SUM skips them, COUNTROWS does not.'],
      explain: 'Total revenue divided by the number of rows, blanks included. AVERAGE would divide by fewer rows and give a higher number.',
    },
    {
      kind: 'predict',
      id: 'ms-units',
      title: 'Units with returns',
      question: 'A measure `Units = SUM(fact_sales[units])`. Returns are lines with units below 0. What does a card show with no filters?',
      sql: 'SELECT sum(units) FROM fact_sales',
      traps: [{ sql: 'SELECT sum(units) FROM fact_sales WHERE units > 0', says: 'That leaves out the returns. SUM adds the negative units too, so they reduce the total.' }],
      hints: ['A return has a negative number of units.', 'SUM adds what is there; it does not skip negatives.'],
      explain: 'SUM adds every value, returns (negative units) included, so the card shows net units.',
    },
    {
      kind: 'pick',
      id: 'ms-kind',
      title: 'Measure or column',
      question: 'You want total revenue to change with the slicers on the page. What do you create?',
      options: [
        { id: 'column', text: 'New column: Revenue = SUM(fact_sales[revenue])', why: 'A column is calculated for each row when the data loads. SUM in a column gives the grand total in every row and does not follow a slicer.' },
        { id: 'measure', text: 'New measure: Revenue = SUM(fact_sales[revenue])', why: '' },
        { id: 'table', text: 'New table: Revenue = SUM(fact_sales[revenue])', why: 'A table is a new set of rows. It is not a number that follows filters.' },
      ],
      right: 'measure',
      hints: ['What must be recalculated every time a slicer changes?', 'A column is fixed when the data loads.'],
      explain: 'A measure is calculated for the filters of each visual, every time. That is why totals, ratios and counts are measures.',
    },
    {
      kind: 'spot',
      id: 'ms-error',
      title: 'The yellow error',
      question: 'You write the Month formula and Power BI shows this. What happened?',
      snippet: "A single value for column 'sale_date' in table 'fact_sales' cannot be determined. This can happen when a measure formula refers to a column that contains many values without specifying an aggregation such as min, max, count, or sum to get a single result.",
      options: [
        { id: 'measure', text: 'You made a measure where a column is needed: delete it and make it again with New column on fact_sales', why: '' },
        { id: 'type', text: 'sale_date has the wrong data type: change it to Text', why: 'The date is a date. The message is about a formula that has to return one value but is given many.' },
        { id: 'link', text: 'The link between fact_sales and dim_customer is missing', why: 'A missing link gives wrong totals, not this message.' },
        { id: 'divide', text: 'The formula needs DIVIDE', why: 'DIVIDE guards a division by zero. There is no division here.' },
      ],
      right: 'measure',
      hints: ['A measure returns one value for the whole visual.', 'Month has to hold one value for each row of fact_sales.'],
      explain: 'A measure must return a single value; a bare sale_date has thousands. A calculated column has one value per row: Table tools, New column (not New measure), with fact_sales selected in the Data pane.',
    },
    {
      kind: 'drill',
      id: 'ms-drill',
      title: 'Four measures and a column',
      question: 'Write four measures and one column, show them on cards and a table, and read four numbers. Download the zip, follow the steps, type the numbers.',
      zip: 'kaiyo-powerbi-4-measures.zip',
      intro: 'Four measures, one column, three cards and a table by month.',
      continues: 'the star with its two links',
      scratch: [
        `<li>Unzip the archive. In Power BI Desktop: <b>Home, Get data, Text/CSV</b> for each of the three files in ${code('data')} (UTF-8, comma), then <b>Load</b>.</li>`,
        `<li>Open <b>Model view</b>. Drag ${code('fact_sales[customer_id]')} onto ${code('dim_customer[customer_id]')}, and ${code('fact_sales[product_id]')} onto ${code('dim_product[product_id]')}. Check Many to one, Single, active.</li>`,
      ],
      steps: [
        {
          title: 'Four measures',
          html: `<p>Press <code>fact_sales</code> in the <b>Data</b> pane so it is selected. Press <b>Table tools, New measure</b>, paste the text, press Enter. Do this for each:</p>
<ol>${FORMULAS.map((f) => `<li>${pre(f)}</li>`).join('')}</ol>`,
        },
        {
          title: 'One column',
          html: `<p>Select <code>fact_sales</code> in the Data pane again. Press <b>Table tools, New column</b> (<b>not</b> New measure) and paste:</p>
${pre('Month = FORMAT(fact_sales[sale_date], "yyyy-mm")')}
<p>Check in the Data pane that <code>Month</code> sits under <code>fact_sales</code>. It is text, such as 2025-08, so Power BI makes no date hierarchy of it. The year comes first, so the months sort in date order by themselves. Month names such as Aug would sort alphabetically: for those add a <code>MonthNumber</code> column and press <b>Column tools, Sort by column, MonthNumber</b>.</p>
<p class="muted">Yellow error "A single value for column 'sale_date' in table 'fact_sales' cannot be determined"? You made a measure where a column is needed. Delete it and make it again with <b>New column</b>.</p>`,
        },
        {
          title: 'Three cards',
          html: `<p>Add a <b>Card</b> for each of <code>Revenue</code>, <code>Avg revenue per sale</code> and <code>Customers</code>. In <b>Format visual, Visual, Callout values, Values</b> set <b>Display units: None</b> and <b>Value decimal places: 2</b> (0 for Customers). <span class="muted">(On a classic Card the same setting is under Callout value, Display units.)</span></p>`,
        },
        {
          title: 'A table by month',
          html: `<p>Add a <b>Table</b> visual with <code>fact_sales[Month]</code> and <code>Revenue</code>. Find the row <b>2025-08</b>.</p>`,
        },
      ],
      checks: [
        {
          id: 'revenue',
          label: 'Revenue',
          where: 'on its card',
          sql: 'SELECT round(sum(revenue), 2) FROM fact_sales',
          traps: [{ sql: 'SELECT count(*) FROM fact_sales', says: 'That is the number of sales. Revenue adds the revenue column: SUM(fact_sales[revenue]).' }],
        },
        {
          id: 'avg',
          label: 'Avg revenue per sale',
          where: 'on its card',
          sql: 'SELECT round(sum(revenue) / count(*), 2) FROM fact_sales',
          traps: [{ sql: 'SELECT round(avg(revenue), 2) FROM fact_sales', says: 'That is AVERAGE(revenue): it skips the sales with no revenue. The measure divides by Sales, which counts every row: DIVIDE([Revenue], [Sales]).' }],
        },
        {
          id: 'customers',
          label: 'Customers',
          where: 'on its card',
          sql: 'SELECT count(DISTINCT customer_id) FROM fact_sales',
          traps: [
            { sql: 'SELECT count(*) FROM dim_customer', says: 'That is every customer of dim_customer. The measure counts the ones that appear in fact_sales: DISTINCTCOUNT(fact_sales[customer_id]).' },
            { sql: 'SELECT count(*) FROM fact_sales', says: 'That counts sales, not different customers: use DISTINCTCOUNT, not COUNT.' },
          ],
        },
        {
          id: 'month',
          label: 'Revenue in 2025-08',
          where: 'on the row 2025-08 of the table',
          sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2025-08'",
          traps: [{ sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE strftime(sale_date, '%Y-%m') = '2026-01'", says: 'That is 2026-01. The question is the row 2025-08.' }],
        },
      ],
      ifWrong: [
        'it shows a K or M, or a count of sales: Display units are on Auto (set None), or the measure is a COUNT (steps 1 and 3).',
        'it is higher than you expect: AVERAGE skips blank revenues, DIVIDE([Revenue], [Sales]) does not (step 1).',
        'it is the number of sales or of all customers: use DISTINCTCOUNT on fact_sales[customer_id] (step 1).',
        'the table has one row, or Month is not under fact_sales: it is a measure or sits in another table, remake it as a column on the fact (step 2).',
      ],
      hints: ['Select fact_sales in the Data pane before New measure.', 'Month is a column: Table tools, New column.', 'On a card, Callout values has Display units; set it to None.'],
    },
  ],
}
