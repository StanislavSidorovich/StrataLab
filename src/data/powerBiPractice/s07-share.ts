// Section 7: share of total, rank and top N.
import { pre } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'
import { SCRATCH_LINKS, SCRATCH_LOAD, SCRATCH_MEASURES } from './shared'

const FORMULAS = [
  'Revenue share = DIVIDE([Revenue], CALCULATE([Revenue], ALL(dim_customer[macro_region])))',
  'Region rank = RANKX(ALL(dim_customer[macro_region]), [Revenue])',
  'Top 3 revenue = SUMX(TOPN(3, ALL(dim_customer[macro_region]), [Revenue]), [Revenue])',
]

/** Revenue by region as a query; the tasks and the checks build on it. */
const BY_REGION = 'SELECT c.macro_region AS region, sum(f.revenue) AS rev FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id GROUP BY 1'

export const S07: PbiSection = {
  id: 'share',
  n: 7,
  title: 'Share and top N',
  blocks: [
    {
      kind: 'note',
      topic: 'Share, rank and top N',
      text: 'A share is a part divided by a total, and the total is the same measure with a filter taken away: `DIVIDE([Revenue], CALCULATE([Revenue], ALL(dim_customer[macro_region])))`. `ALL(column)` removes the filter on that column only (the slicers on other columns stay). `REMOVEFILTERS` does the same inside CALCULATE. `ALL(column)` is also a table of every value of the column, so it can be handed to `RANKX(table, measure)` for a rank and to `TOPN(n, table, measure)` for the first n values; `SUMX` adds up what TOPN returns.',
      trap: 'The table in RANKX must be the full list of values: `VALUES(column)` is cut to the row (and ranks every row first). Take away the filter on the column you group by, not on the whole table.',
    },
    {
      kind: 'predict',
      id: 'sh-share',
      title: 'Share of a chain',
      question: 'A table lists the chains of `dim_customer[chain_name]` with `Revenue share = DIVIDE([Revenue], CALCULATE([Revenue], ALL(dim_customer[chain_name])))`. What does the row Minori show, in percent? Round to two decimals.',
      sql: "SELECT round(100.0 * sum(f.revenue) FILTER (WHERE c.chain_name = 'Minori') / sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id",
      percent: true,
      traps: [{ sql: "SELECT round(100.0 * sum(f.revenue) FILTER (WHERE c.chain_name = 'Minori') / sum(f.revenue) FILTER (WHERE c.chain_name IS NOT NULL), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id", says: 'That leaves out the customers with no chain from the total. ALL(chain_name) brings back every value of the column, the (Blank) one too.' }],
      hints: ['The total is the revenue of all chains, with the filter on chain_name removed.', 'Customers with no chain are part of the total.'],
      explain: 'Minori revenue divided by the revenue of every customer: ALL removes the filter on chain_name, so the denominator is the same on every row, the blank chain included.',
    },
    {
      kind: 'pick',
      id: 'sh-all',
      title: 'The denominator',
      question: 'A table by `dim_customer[macro_region]` must show each region as a share of all revenue. Which measure does it?',
      options: [
        { id: 'all', text: 'DIVIDE([Revenue], CALCULATE([Revenue], ALL(dim_customer[macro_region])))', why: '' },
        { id: 'same', text: 'DIVIDE([Revenue], [Revenue])', why: 'The denominator has the same filter as the numerator, so every row is 100%.' },
        { id: 'sum', text: 'DIVIDE([Revenue], SUM(fact_sales[revenue]))', why: 'SUM inside a measure follows the filter of the row too, so the answer is 100% on every row.' },
        { id: 'product', text: 'DIVIDE([Revenue], CALCULATE([Revenue], ALL(dim_product)))', why: 'That removes the filter on the wrong table: the region of the row still filters the denominator, so every row is 100%.' },
      ],
      right: 'all',
      hints: ['The denominator must not be filtered by the row: which column is on the rows?', 'Remove the filter on that column, not on another table.'],
      explain: 'The rows are regions, so the filter to take away is the one on dim_customer[macro_region]. Anything else leaves the region in the denominator.',
    },
    {
      kind: 'spot',
      id: 'sh-rank',
      title: 'Rank 1 on every row',
      question: 'A table by region shows `Region rank` and every row has the rank 1. What is wrong?',
      snippet: 'Region rank = RANKX(VALUES(dim_customer[macro_region]), [Revenue])',
      options: [
        { id: 'values', text: 'VALUES is cut to the region of the row, so each row is ranked against itself; use ALL(dim_customer[macro_region])', why: '' },
        { id: 'order', text: 'RANKX needs the order argument, ASC', why: 'The order only turns the ranking round. Each row would still be ranked alone.' },
        { id: 'divide', text: 'RANKX needs DIVIDE', why: 'DIVIDE guards a division by zero; there is none here.' },
        { id: 'link', text: 'The link to dim_customer is missing', why: 'A missing link gives the same total on every row, not the rank 1 everywhere.' },
      ],
      right: 'values',
      hints: ['Which regions does the table argument contain on the row of Kanto?', 'RANKX needs all the regions to compare with, not only the one of the row.'],
      explain: 'On each row VALUES holds only that row\'s region, so there is nothing to compare with and the rank is 1. ALL(column) is the full list on every row.',
    },
    {
      kind: 'predict',
      id: 'sh-top',
      title: 'The three biggest regions',
      question: 'A card shows `Top 3 revenue = SUMX(TOPN(3, ALL(dim_customer[macro_region]), [Revenue]), [Revenue])`. What does it show? Round to two decimals.',
      sql: `SELECT round(sum(rev), 2) FROM (${BY_REGION} ORDER BY 2 DESC LIMIT 3)`,
      traps: [
        { sql: `SELECT round(sum(rev), 2) FROM (${BY_REGION} ORDER BY 2 DESC LIMIT 2)`, says: 'That is the top 2. TOPN(3, …) keeps three regions.' },
        { sql: `SELECT round(sum(rev), 2) FROM (${BY_REGION} ORDER BY 2 DESC LIMIT 4)`, says: 'That is the top 4. TOPN(3, …) keeps three regions.' },
      ],
      hints: ['TOPN returns the three regions with the most revenue; SUMX adds their revenue.', 'Rank the regions by revenue and add the first three.'],
      explain: 'TOPN picks the three regions with the highest Revenue and SUMX adds their Revenue up: the sum of the three biggest bars.',
    },
    {
      kind: 'drill',
      id: 'sh-drill',
      title: 'Share, rank and top 3',
      question: 'Write a share, a rank and a top 3 measure, show them by region, and see what a slicer does to the share. Download the zip, follow the steps, type the four numbers.',
      zip: 'kaiyo-powerbi-7-share.zip',
      intro: 'A share of total, a rank and a top 3 by region, then a slicer on the category to see how the share changes.',
      continues: 'the star with its links and the measure Revenue',
      scratch: [SCRATCH_LOAD, SCRATCH_LINKS, SCRATCH_MEASURES],
      steps: [
        {
          title: 'Three measures',
          html: `<p>Press <code>fact_sales</code> in the <b>Data</b> pane. <b>Table tools, New measure</b>, paste, Enter, once for each:</p>
<ol>${FORMULAS.map((f) => `<li>${pre(f)}</li>`).join('')}</ol>
<p>Select <code>Revenue share</code> in the Data pane. <b>Measure tools, Format: Percentage</b>, 2 decimal places.</p>
<p class="muted">They use <code>[Revenue]</code> from section 4. If it is missing: <code>Revenue = SUM(fact_sales[revenue])</code>.</p>`,
        },
        {
          title: 'A table by region',
          html: `<p>Add a <b>Table</b> with <code>dim_customer[macro_region]</code>, <code>Revenue</code>, <code>Revenue share</code> and <code>Region rank</code>. Set <b>Display units: None</b> for Revenue. Read the row <b>Kyushu</b> (its share) and the row <b>Kansai</b> (its rank).</p>`,
        },
        {
          title: 'A card with the top 3',
          html: `<p>Add a <b>Card</b> with <code>Top 3 revenue</code>. In <b>Format, Callout value</b> set <b>Display units: None</b> and <b>Decimal places: 2</b>.</p>`,
        },
        {
          title: 'A slicer on the category',
          html: `<p>Add a <b>Slicer</b> with <code>dim_product[category]</code> and select <b>Beverages</b>. Read the share of <b>Kansai</b> again: it is now a share of the Beverages sales.</p>
<p class="muted">The slicer is on another column, so ALL(dim_customer[macro_region]) keeps it. Clear the slicer (select all or press the eraser) before you move on.</p>`,
        },
      ],
      checks: [
        {
          id: 'share',
          label: 'Revenue share of Kyushu, no slicer',
          where: 'on the row Kyushu of the table, in percent',
          sql: `SELECT round(100.0 * (SELECT rev FROM (${BY_REGION}) WHERE region = 'Kyushu') / (SELECT sum(rev) FROM (${BY_REGION})), 2)`,
          percent: true,
          traps: [{ sql: 'SELECT 100.0', says: '100% on every row: the denominator has the same filter as the numerator. Remove the filter on the region column with ALL(dim_customer[macro_region]) (step 1).' }],
        },
        {
          id: 'rank',
          label: 'Region rank of Kansai',
          where: 'on the row Kansai of the table',
          sql: `SELECT rk FROM (SELECT region, rank() OVER (ORDER BY rev DESC) AS rk FROM (${BY_REGION})) WHERE region = 'Kansai'`,
          traps: [{ sql: 'SELECT 1', says: 'Rank 1 on every row: RANKX needs the full list of regions, ALL(dim_customer[macro_region]), not the value of the row (step 1).' }],
        },
        {
          id: 'top3',
          label: 'Top 3 revenue',
          where: 'on its card',
          sql: `SELECT round(sum(rev), 2) FROM (${BY_REGION} ORDER BY 2 DESC LIMIT 3)`,
          traps: [
            { sql: `SELECT round(sum(rev), 2) FROM (${BY_REGION} ORDER BY 2 DESC LIMIT 2)`, says: 'That is the top 2. TOPN(3, …) keeps three regions (step 1).' },
            { sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is all revenue, every region: TOPN is missing or the card was given Revenue (step 3).' },
          ],
        },
        {
          id: 'bev-share',
          label: 'Revenue share of Kansai, Beverages selected',
          where: 'on the row Kansai of the table, in percent (step 4)',
          sql: `SELECT round(100.0 * sum(f.revenue) FILTER (WHERE c.macro_region = 'Kansai') / sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_product p ON p.product_id = f.product_id WHERE p.category = 'Beverages'`,
          percent: true,
          traps: [{ sql: `SELECT round(100.0 * sum(f.revenue) FILTER (WHERE c.macro_region = 'Kansai' AND p.category = 'Beverages') / sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_product p ON p.product_id = f.product_id`, says: 'That divides by the revenue of every category: the denominator ignored the slicer. ALL(dim_customer[macro_region]) removes only the region filter, so the slicer on category should stay (step 4).' }],
        },
      ],
      ifWrong: [
        'it is 100%: the denominator is filtered like the numerator; use CALCULATE with ALL on the region column (step 1).',
        'it is 1: you used VALUES, or no ALL, in RANKX (step 1).',
        'it is a different total: TOPN keeps three regions; check the 3 and the column (step 1).',
        'the share is lower than you expect: ALL was used on the whole table, which removes the slicer too (steps 1 and 4).',
      ],
      hints: ['The denominator is the same measure with ALL on the column of the rows.', 'RANKX and TOPN take the full list: ALL(dim_customer[macro_region]).', 'The Percentage format is under Measure tools.'],
    },
  ],
}
