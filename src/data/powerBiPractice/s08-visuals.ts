// Section 8: visuals and a page for a manager's question.
import type { PbiSection } from '../../core/powerBiPractice'
import { SCRATCH_DATE, SCRATCH_LINKS, SCRATCH_LOAD, SCRATCH_MEASURES, SCRATCH_TIME } from './shared'

const BEV_YTD = "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Beverages' AND f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'"

export const S08: PbiSection = {
  id: 'visuals',
  n: 8,
  title: 'Visuals and a page for a manager',
  blocks: [
    {
      kind: 'note',
      topic: 'A page that answers one question',
      text: 'Start from the question, then pick the visual: a trend over time is a line, a comparison of a few groups is a bar, one number is a card, a choice for the whole page is a slicer. Each visual cross-filters the others when you click on it; Format, `Edit interactions` switches that off visual by visual. `Display units` on a number (Auto shows K or M) is a way of writing it, not a different number: set it to None when you need the exact one.',
      trap: 'A pie of seven slices and a table of two hundred rows answer no question quickly. Few groups: bar. Many months: line.',
    },
    {
      kind: 'pick',
      id: 've-visual',
      title: 'Which visual',
      question: 'A manager asks: how did monthly revenue move this year compared with last year? Which visual answers it best?',
      options: [
        { id: 'line', text: 'A line chart by month with Revenue and Revenue LY', why: '' },
        { id: 'pie', text: 'A pie chart of Revenue by month', why: 'Twelve slices of similar size cannot be compared by eye, and a pie has no sense of time or of a second year.' },
        { id: 'card', text: 'A card with Revenue', why: 'A card is one number. The question is about movement across months.' },
        { id: 'table', text: 'A table with every sale', why: 'Hundreds of lines hide the shape. A table is for looking up a number, not for seeing a trend.' },
      ],
      right: 'line',
      hints: ['The question is about change over time.', 'Two lines on one axis can be compared at every month.'],
      explain: 'A line chart puts the months in order on one axis and shows this year against last year as two lines. The question decides the visual.',
    },
    {
      kind: 'predict',
      id: 've-slicer',
      title: 'A card and a slicer',
      question: 'A page has a card with `Revenue` and a slicer on `dim_product[category]` with Dairy selected. Display units are None. What does the card show? Round to two decimals.',
      sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Dairy'",
      traps: [{ sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is all revenue: the slicer did not filter the card. A slicer filters every visual of the page, if the link to the fact is there.' }],
      hints: ['A slicer filters every visual of the page.', 'Only the Dairy products are added.'],
      explain: 'The slicer filters the products to Dairy and the link carries the filter to the sales, so the card adds up only Dairy.',
    },
    {
      kind: 'spot',
      id: 've-interact',
      title: 'The card moves when you click a bar',
      question: 'You click the bar of Kanto and the card of Revenue YTD changes to the Kanto number. The manager wants the card to stay at the total. What do you do?',
      snippet: 'Page: a card (Revenue YTD), a bar chart by region, a line chart by month.\nClick the bar Kanto: the card and the line change.',
      options: [
        { id: 'interactions', text: 'Select the bar chart, Format, Edit interactions, and press None on the card', why: '' },
        { id: 'measure', text: 'Rewrite Revenue YTD with ALL', why: 'That would change the measure for every visual. The question is only about what the bar chart does to this card.' },
        { id: 'delete', text: 'Delete the bar chart', why: 'It works, but you lose the visual the manager wants. Interactions can be switched off without deleting anything.' },
        { id: 'units', text: 'Set Display units to None', why: 'Display units change how the number is written, not which sales it adds up.' },
      ],
      right: 'interactions',
      hints: ['The bar chart filters the other visuals when you click it.', 'Edit interactions has a button for each other visual: filter, highlight, none.'],
      explain: 'Edit interactions switches the effect of the selected visual off, one target at a time. The card stays at its value; the line can keep cross-filtering.',
    },
    {
      kind: 'order',
      id: 've-order',
      title: 'Build the page',
      question: 'Put the steps of building the page for the manager in the order you do them.',
      steps: ['Write down the question in one line', 'Make the measures it needs (Revenue, Revenue LY, Revenue YTD)', 'Add the card, the line and the bar', 'Add the slicer', 'Edit interactions where a click should not move a visual', 'Set Display units and titles'],
      hints: ['What you build comes from the question.', 'Formatting is the last step.'],
      explain: 'The question first, then the measures, then the visuals; the slicer and the interactions refine the page, and the formatting comes last.',
    },
    {
      kind: 'drill',
      id: 've-drill',
      title: 'A page for a manager',
      question: 'Build one page that answers "Are we ahead of last year, and which regions carry it?": a card, a line, a bar and a slicer. Download the zip, follow the steps, type the three numbers.',
      zip: 'kaiyo-powerbi-8-visuals.zip',
      intro: 'One page with a card, a line, a bar and a slicer, then an interaction switched off.',
      continues: 'the star, the Date table and the measures Revenue, Revenue LY and Revenue YTD',
      scratch: [SCRATCH_LOAD, SCRATCH_LINKS, SCRATCH_MEASURES, SCRATCH_DATE, SCRATCH_TIME],
      steps: [
        {
          title: 'The line: this year against last year',
          html: `<p>Add a <b>Line chart</b>. X-axis <code>Date[Month]</code> (from the Date table), Y-axis <code>Revenue</code> and <code>Revenue LY</code>. If the axis is a date hierarchy, use the text column and set the X-axis type to <b>Categorical</b>.</p>`,
        },
        {
          title: 'The bar: which regions',
          html: `<p>Add a <b>Clustered bar chart</b>. Y-axis <code>dim_customer[macro_region]</code>, X-axis <code>Revenue</code>. Press the three dots, <b>Sort axis, Revenue</b>, <b>Sort descending</b>. In <b>Format, Data labels</b> turn labels on with <b>Display units: None</b>.</p>`,
        },
        {
          title: 'The card',
          html: `<p>Add a <b>Card</b> with <code>Revenue YTD</code>. In <b>Format visual, Visual, Callout values, Values</b> set <b>Display units: None</b> and <b>Value decimal places: 2</b>.</p>`,
        },
        {
          title: 'The slicer and the first two numbers',
          html: `<ol>
<li>Add a <b>Slicer</b> with <code>dim_product[category]</code>. Select <b>Beverages</b>.</li>
<li>Read the <b>card</b>.</li>
<li>Read the label of the <b>longest bar</b>.</li>
</ol>`,
        },
        {
          title: 'An interaction switched off',
          html: `<ol>
<li>Click the bar <b>Kanto</b>. The card changes: that is cross-filtering. Click the bar again to clear it.</li>
<li>Select the bar chart. <b>Format, Edit interactions</b>. On the card press <b>None</b> (the circle with a line). Leave the line chart as it is.</li>
<li>Click the bar <b>Kanto</b> again and read the card. Switch Edit interactions off.</li>
</ol>`,
        },
      ],
      checks: [
        {
          id: 'card',
          label: 'Revenue YTD on the card, Beverages selected',
          where: 'on the card (step 4)',
          sql: BEV_YTD,
          traps: [
            { sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Beverages'", says: 'That is all the Beverages revenue, not the year to date: the card shows Revenue, not Revenue YTD.' },
            { sql: "SELECT round(sum(revenue), 2) FROM fact_sales WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'", says: 'That is the year to date of every category: the slicer did not reach the card.' },
          ],
        },
        {
          id: 'bar',
          label: 'The longest bar, Beverages selected',
          where: 'on the label of the first bar (step 4)',
          sql: "SELECT round(max(rev), 2) FROM (SELECT sum(f.revenue) AS rev FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Beverages' GROUP BY c.macro_region)",
          traps: [{ sql: 'SELECT round(max(rev), 2) FROM (SELECT sum(f.revenue) AS rev FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id GROUP BY c.macro_region)', says: 'That is the longest bar of all categories: the slicer is not applied to the bar chart.' }],
        },
        {
          id: 'kept',
          label: 'Revenue YTD on the card after you click Kanto, interaction None',
          where: 'on the card (step 5)',
          sql: BEV_YTD,
          traps: [{ sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_product p ON p.product_id = f.product_id JOIN dim_customer c ON c.customer_id = f.customer_id WHERE p.category = 'Beverages' AND c.macro_region = 'Kanto' AND f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'", says: 'That is Kanto: the bar still filters the card. Select the bar chart, Format, Edit interactions, and press None on the card (step 5).' }],
        },
      ],
      ifWrong: [
        'it is the total of Beverages or of all categories: the card holds Revenue, or the slicer is on a column that does not filter it (steps 3 and 4).',
        'the longest bar is a different number: the slicer does not filter the bar chart: check the link between fact_sales and dim_product (steps 2 and 4).',
        'it shows Kanto: the interaction of the bar chart on the card is not None (step 5).',
      ],
      hints: ['Month comes from the Date table.', 'Sort the bar descending so the longest is the first.', 'Edit interactions: select the visual that sends the filter, then press None on the one that should ignore it.'],
    },
  ],
}
