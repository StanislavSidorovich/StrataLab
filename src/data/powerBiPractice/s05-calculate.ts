// Section 5: CALCULATE and filter context.
import { pre } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'
import { SCRATCH_LINKS, SCRATCH_LOAD, SCRATCH_MEASURES } from './shared'

const FORMULAS = ['Revenue Kanto = CALCULATE([Revenue], dim_customer[macro_region] = "Kanto")', 'Revenue Beverages = CALCULATE([Revenue], dim_product[category] = "Beverages")', 'Return units = CALCULATE(SUM(fact_sales[units]), fact_sales[units] < 0)']

export const S05: PbiSection = {
  id: 'calculate',
  n: 5,
  title: 'CALCULATE and filter context',
  blocks: [
    {
      kind: 'note',
      topic: 'Filter context and CALCULATE',
      text: 'Every number in a visual is calculated for a filter context: the row of the table, the slicers, the filters of the page. `CALCULATE(expression, filter, …)` calculates the expression in a changed context. A filter on a column that is already filtered replaces that filter; a filter on another column is added to it, so both must hold. A measure can use another measure: `Revenue Kanto = CALCULATE([Revenue], dim_customer[macro_region] = "Kanto")` reads Revenue and changes only the region.',
      trap: 'A true/false filter such as `fact_sales[units] < 0` is a shortcut for a filter on that one column. It cannot contain an aggregation like AVERAGE: put the average in a variable first, or use FILTER.',
    },
    {
      kind: 'predict',
      id: 'ca-returns',
      title: 'Units of the returns',
      question: 'A measure `Return units = CALCULATE(SUM(fact_sales[units]), fact_sales[units] < 0)`. With no filters, what does a card show? The returns are the lines with negative units.',
      sql: 'SELECT sum(units) FROM fact_sales WHERE units < 0',
      traps: [
        { sql: 'SELECT sum(units) FROM fact_sales', says: 'That is every line, returns included: SUM of the whole column. The CALCULATE filter keeps only the lines with units below 0.' },
        { sql: 'SELECT -sum(units) FROM fact_sales WHERE units < 0', says: 'Right lines, wrong sign: the units of a return are negative, so their sum is negative.' },
      ],
      hints: ['Which lines does the filter units < 0 keep?', 'Negative units add up to a negative number.'],
      explain: 'CALCULATE keeps only the lines with negative units, then SUM adds them. The card shows a negative number: the units that came back.',
    },
    {
      kind: 'predict',
      id: 'ca-kanto',
      title: 'Revenue of one region',
      question: 'A measure `Revenue Kanto = CALCULATE(SUM(fact_sales[revenue]), dim_customer[macro_region] = "Kanto")`, the star linked as usual. With no filters, what does a card show? Round to two decimals.',
      sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kanto'",
      traps: [{ sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is all revenue: no region filter. The filter on dim_customer[macro_region] reaches the sales through the link and keeps only Kanto.' }],
      hints: ['The filter is on dim_customer; the link carries it to fact_sales.', 'Only the sales of customers in Kanto are added.'],
      explain: 'The filter on the dimension travels along the link to the fact, so only the sales of Kanto customers are summed.',
    },
    {
      kind: 'pick',
      id: 'ca-same',
      title: 'A slicer against CALCULATE',
      question: 'A slicer on `dim_product[category]` has Snacks selected. A card shows `Revenue Beverages = CALCULATE([Revenue], dim_product[category] = "Beverages")`. What does it show?',
      options: [
        { id: 'bev', text: 'The revenue of Beverages: the filter of CALCULATE replaces the slicer on the same column', why: '' },
        { id: 'snacks', text: 'The revenue of Snacks: the slicer always wins', why: 'A filter inside CALCULATE on the same column replaces the slicer. The measure asks for Beverages, whatever the slicer says.' },
        { id: 'blank', text: 'Blank: no sale is both Snacks and Beverages', why: 'That would be the case if the two filters were added. On the same column the new one replaces the old one.' },
        { id: 'error', text: 'An error: two filters on one column', why: 'There is no error. A filter in CALCULATE on a column replaces the existing filter on that column.' },
      ],
      right: 'bev',
      hints: ['Is the slicer filter and the CALCULATE filter on the same column or on different ones?', 'On the same column the CALCULATE filter replaces the other one.'],
      explain: 'Same column: replaced. If the slicer was on dim_customer[macro_region] instead, both filters would hold and the card would show Beverages in that region.',
    },
    {
      kind: 'spot',
      id: 'ca-average',
      title: 'An aggregation in a filter',
      question: 'You want the number of sales with more units than the average sale. Power BI refuses the formula. What is the fix?',
      snippet: "Big sales = CALCULATE(COUNTROWS(fact_sales), fact_sales[units] > AVERAGE(fact_sales[units]))\n\nA function 'AVERAGE' has been used in a True/False expression that is used as a table filter expression. This is not allowed.",
      options: [
        { id: 'var', text: 'Calculate the average first in a variable (VAR avg = AVERAGE(fact_sales[units])) and compare the column with the variable', why: '' },
        { id: 'sum', text: 'Replace AVERAGE with SUM', why: 'SUM is an aggregation too, so the same rule stops it. And it would not mean the average any more.' },
        { id: 'divide', text: 'Wrap the formula in DIVIDE', why: 'DIVIDE guards a division by zero. The problem is the aggregation inside the filter.' },
        { id: 'column', text: 'Make Big sales a calculated column instead of a measure', why: 'A column cannot answer a question that changes with the slicers, and it would not fix the filter rule either.' },
      ],
      right: 'var',
      hints: ['A true/false filter is about one column, not about an aggregation over the table.', 'A variable is calculated once, before the filter is applied.'],
      explain: 'The variable holds a plain number, so the filter compares the column with that number. FILTER over the table is the other way out.',
    },
    {
      kind: 'drill',
      id: 'ca-drill',
      title: 'Same measure, different filters',
      question: 'Write three measures with CALCULATE, put a slicer on the region, and read how each card reacts. Download the zip, follow the steps, type the four numbers.',
      zip: 'kaiyo-powerbi-5-calculate.zip',
      intro: 'Three CALCULATE measures, a slicer on the region, and four cards that react to it in different ways.',
      continues: 'the star with its links and the measure Revenue',
      scratch: [SCRATCH_LOAD, SCRATCH_LINKS, SCRATCH_MEASURES],
      steps: [
        {
          title: 'Three measures',
          html: `<p>Press <code>fact_sales</code> in the <b>Data</b> pane. <b>Table tools, New measure</b>, paste, Enter, once for each:</p>
<ol>${FORMULAS.map((f) => `<li>${pre(f)}</li>`).join('')}</ol>
<p class="muted">They use <code>[Revenue]</code> from section 4. If it is missing: <code>Revenue = SUM(fact_sales[revenue])</code>.</p>`,
        },
        {
          title: 'Four cards',
          html: `<p>Add a <b>Card</b> for each of <code>Revenue</code>, <code>Revenue Kanto</code>, <code>Revenue Beverages</code> and <code>Return units</code>. In <b>Format visual, Visual, Callout values, Values</b> set <b>Display units: None</b> and <b>Decimal places: 2</b> (0 for Return units).</p>`,
        },
        {
          title: 'A slicer on the region',
          html: `<p>Add a <b>Slicer</b> with <code>dim_customer[macro_region]</code>. Select <b>Kansai</b> only. Read all four cards.</p>
<p class="muted">Revenue follows the slicer. Revenue Kanto replaces the slicer's filter on the same column. Revenue Beverages adds a filter on another column, so the region stays. Return units keeps the slicer too.</p>`,
        },
      ],
      checks: [
        {
          id: 'plain',
          label: 'Revenue, region Kansai selected',
          where: 'on its card',
          sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kansai'",
          traps: [{ sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is all revenue: the slicer does not reach the sales, so the link between fact_sales and dim_customer is missing or inactive (Model view).' }],
        },
        {
          id: 'kanto',
          label: 'Revenue Kanto, region Kansai selected',
          where: 'on its card',
          sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kanto'",
          traps: [{ sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kansai'", says: 'That is Kansai: the slicer. A filter in CALCULATE on the same column replaces the slicer, so the card shows Kanto whatever you select.' }],
        },
        {
          id: 'bev',
          label: 'Revenue Beverages, region Kansai selected',
          where: 'on its card',
          sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_product p ON p.product_id = f.product_id WHERE c.macro_region = 'Kansai' AND p.category = 'Beverages'",
          traps: [
            { sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Beverages'", says: 'That is Beverages in every region: the slicer was ignored. The filter on category is on another column, so the slicer on the region still holds.' },
            { sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kansai'", says: 'That is Kansai, all categories: the filter on category in the measure is missing or not applied.' },
          ],
        },
        {
          id: 'returns',
          label: 'Return units, region Kansai selected',
          where: 'on its card',
          sql: "SELECT sum(f.units) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kansai' AND f.units < 0",
          traps: [
            { sql: 'SELECT sum(units) FROM fact_sales WHERE units < 0', says: 'That is the returns of every region: the slicer did not reach this card, or no region is selected.' },
            { sql: "SELECT sum(f.units) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.macro_region = 'Kansai'", says: 'That is the net units of Kansai, returns and sales together: the filter units < 0 is missing.' },
          ],
        },
      ],
      ifWrong: [
        'it shows the total of all regions: the slicer does not filter the sales, check the link (Model view).',
        'it changes when you change the slicer: it is the plain SUM, the CALCULATE filter is missing (step 1).',
        'it shows Beverages for every region, or Kansai for every category: the filter of the measure or the slicer is on the wrong column (steps 1 and 3).',
        'it is positive or the net units: the filter fact_sales[units] < 0 is missing (step 1).',
      ],
      hints: ['New measure, with fact_sales selected in the Data pane.', 'A filter in CALCULATE on a column replaces the slicer on that same column.', 'Callout values has Display units; set it to None.'],
    },
  ],
}
