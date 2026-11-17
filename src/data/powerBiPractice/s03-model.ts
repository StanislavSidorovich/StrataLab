// Section 3: model and links.
import { code } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'

export const S03: PbiSection = {
  id: 'model',
  n: 3,
  title: 'Model and links',
  blocks: [
    {
      kind: 'note',
      topic: 'A star in Model view',
      text: "A star has one fact table in the middle (the sales: many rows) and dimension tables around it (customers, products: one row each). Every link goes many to one, from the fact's key to the dimension's key, and a filter travels from the dimension to the fact: pick a chain and only its sales stay.",
      trap: 'Cross filter direction Both looks handy and makes reports ambiguous. Keep Single until you know why you need Both.',
    },
    {
      kind: 'pick',
      id: 'md-card',
      title: 'Which relationship',
      question: 'How is `fact_sales[customer_id]` linked to `dim_customer[customer_id]`?',
      options: [
        { id: 'one-one', text: 'One to one (1:1)', why: 'A customer has many sales, so the fact side is not unique: it is not 1:1.' },
        { id: 'many-one', text: 'Many to one (*:1), the many side is fact_sales', why: '' },
        { id: 'many-many', text: 'Many to many (*:*)', why: 'Needed only when neither side is unique. Here customer_id is unique in dim_customer, so *:* would only make filters ambiguous.' },
        { id: 'none', text: 'No link: copy the customer name into fact_sales', why: 'A copy of the names in the fact repeats data and goes stale when a name changes. A dimension and a link do the same without a copy.' },
      ],
      right: 'many-one',
      hints: ['Many sales belong to one customer.', 'Which of the two tables has each customer_id only once?'],
      explain: 'Each customer_id appears once in dim_customer (one) and many times in fact_sales (many). The fact is always the many side of a star.',
    },
    {
      kind: 'pick',
      id: 'md-dir',
      title: 'Why single direction',
      question: 'Which cross filter direction do you set on that link, and why?',
      options: [
        { id: 'single-dim', text: 'Single, from dim_customer to fact_sales', why: '' },
        { id: 'both', text: 'Both, so that everything filters everything', why: 'Both lets a filter travel back from the fact to other dimensions. With several dimensions this makes ambiguous paths and slower reports. Use it only when you know why.' },
        { id: 'single-fact', text: 'Single, from fact_sales to dim_customer', why: 'Then a slicer on customers would not reach the sales: the filter must flow from the one side to the many side.' },
      ],
      right: 'single-dim',
      hints: ['Think of a slicer on chain_name: which table should it filter?', 'The filter flows from the one side to the many side.'],
      explain: 'A slicer on a dimension filters the facts, never the other way round. Single keeps the path of every filter obvious, so a number means one thing.',
    },
    {
      kind: 'predict',
      id: 'md-orphans',
      title: 'Customers with no sales',
      question: 'How many customers of `dim_customer` have no sale at all in `fact_sales`? In a table visual they show an empty revenue. Type the number.',
      sql: 'SELECT count(*) FROM dim_customer WHERE customer_id NOT IN (SELECT customer_id FROM fact_sales)',
      traps: [
        { sql: 'SELECT count(DISTINCT customer_id) FROM fact_sales', says: 'That is the customers who did buy. The question asks for those who did not.' },
        { sql: 'SELECT count(*) FROM dim_customer', says: 'That is all customers. Subtract the ones that appear in the sales.' },
      ],
      hints: ['A dimension lists everything, the fact only what was sold.', 'Count the customers of the dimension, take away those that appear in fact_sales.'],
      explain: 'A dimension lists every customer, the fact only the ones that bought. Customers without sales are normal; a visual shows them with a blank revenue.',
    },
    {
      kind: 'spot',
      id: 'md-same',
      title: 'The same number on every row',
      question: 'A table visual lists customers with Sum of revenue. Every row shows the same number. What is wrong?',
      snippet: 'customer_name          Sum of revenue\nSetouchi Trading Co.   {{TOTAL}}\nKanto Logistics Co.    {{TOTAL}}\nMinori #1013           {{TOTAL}}',
      options: [
        { id: 'no-link', text: 'fact_sales and dim_customer are not linked (or the link is inactive)', why: '' },
        { id: 'agg', text: 'The aggregation should be Average, not Sum', why: 'Average would still follow the customer on each row. The problem is that the customer does not reach the sales at all.' },
        { id: 'dups', text: 'dim_customer has duplicate customer_id values', why: 'Duplicates on the one side stop Power BI from making the link in the first place; they do not repeat a total.' },
        { id: 'format', text: 'The Display units are wrong', why: 'Display units change how a number is written, not which sales it adds up.' },
      ],
      right: 'no-link',
      hints: ['The number is the total of every sale in the file.', 'What carries the customer from the row to the sales?'],
      explain: 'The number is the total of all sales: the customer on the row is not filtering fact_sales, because no active link joins them. Model view shows the line; make it Many to one, Single.',
    },
    {
      kind: 'drill',
      id: 'md-drill',
      title: 'Link the star and read a table',
      question: 'Link fact_sales to its two dimensions in Model view, then read revenue by chain in a table. Download the zip, follow the steps, type the two numbers.',
      zip: 'kaiyo-powerbi-3-model.zip',
      intro: 'Make the two links of the star in Model view and prove they work with a table by chain.',
      continues: 'the three tables loaded',
      scratch: [`<li>Unzip the archive. In Power BI Desktop: <b>Home, Get data, Text/CSV</b> for each of the three files in ${code('data')} (UTF-8, comma), then <b>Load</b>.</li>`],
      steps: [
        {
          title: 'Link the tables in Model view',
          html: `<p>Open <b>Model view</b>. Power BI may link tables by itself: delete any line that is not in this picture, then make exactly these links. <b>*</b> is the many side (the fact), <b>1</b> is the one side (a dimension).</p>
{{star}}
{{links}}
<p class="muted">The fact is on the many side and the dimensions filter it.</p>`,
        },
        {
          title: 'Revenue by chain in a table',
          html: `<ol>
<li>Back in Report view add a <b>Table</b> visual.</li>
<li>Drag <code>dim_customer[chain_name]</code> into Columns, then <code>fact_sales[revenue]</code> (Power BI sums it: Sum of revenue).</li>
<li>If a number shows with K or M: <b>Format visual, Visual, Specific column, Values</b> (pick the revenue series), <b>Display units: None</b>.</li>
<li>Read the row <b>Minori</b> and the row <b>(Blank)</b>: the customers with no chain.</li>
</ol>
<p class="muted">Use <code>chain_name</code>, not <code>customer_name</code>: those are single stores like "Minori #1013".</p>`,
        },
      ],
      checks: [
        {
          id: 'minori',
          label: 'Revenue of the chain Minori',
          where: 'on the row Minori of the table',
          sql: "SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.chain_name = 'Minori'",
          traps: [{ sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is the total of all sales, the same on every row: the link between fact_sales and dim_customer is missing or inactive (step 1).' }],
        },
        {
          id: 'blank',
          label: 'Revenue of the (Blank) row',
          where: 'on the row (Blank) of the table',
          sql: 'SELECT round(sum(f.revenue), 2) FROM fact_sales f JOIN dim_customer c ON c.customer_id = f.customer_id WHERE c.chain_name IS NULL',
          traps: [{ sql: 'SELECT round(sum(revenue), 2) FROM fact_sales', says: 'That is the total of all sales, not the customers with no chain: check the link (step 1).' }],
        },
      ],
      ifWrong: ['every row shows the same total, or the table has one row: the link is missing or inactive (step 1).', 'there is no (Blank) row, or the rows do not add up to the total of all sales: the link is not Many to one, or a filter is on (step 1).'],
      hints: ['Model view is the third icon on the left; drag one column onto the other.', 'Set both links to Many to one, Single, active.', 'Put chain_name in the table, not customer_name.'],
    },
  ],
}
