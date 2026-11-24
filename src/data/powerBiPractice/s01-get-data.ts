// Section 1: get data and types. Layer A in the browser, layer B the first drill. Rules: docs/powerbi-practice-design.md.
import { code } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'

export const S01: PbiSection = {
  id: 'get-data',
  n: 1,
  title: 'Get data and types',
  blocks: [
    {
      kind: 'note',
      topic: 'Loading a CSV',
      text: 'Home, Get data, `Text/CSV` opens a preview before anything is loaded. It shows what Power BI guessed: the file origin (encoding), the delimiter and the type of each column. Read it, then press `Load`. `Transform data` opens Power Query instead, when something needs fixing first.',
      trap: 'A wrong guess here shows up later as odd numbers: a date read as text, a decimal read as a thousand.',
    },
    {
      kind: 'predict',
      id: 'gd-rows',
      title: 'How many rows',
      question: 'You load `fact_sales.csv` with Get data, Text/CSV. How many rows does the table have in Power BI? Type the number.',
      sql: 'SELECT count(*) FROM fact_sales',
      traps: [
        { sql: 'SELECT count(revenue) FROM fact_sales', says: 'That is the sales that have a revenue. Some have none, but they are rows too, and Power BI counts them.' },
        { sql: 'SELECT count(*) + 1 FROM fact_sales', says: 'The first line of the file is not a row: Power BI turns it into the column names.' },
      ],
      hints: ['Power BI turns the first line of the file into column names.', 'Every sale is one row, also one with an empty revenue.'],
      explain: 'One row per sale line. The header line holds the column names, and an empty revenue is still a row.',
    },
    {
      kind: 'pick',
      id: 'gd-type',
      title: 'The type of revenue',
      question: 'Which data type should `revenue` get, so that it adds up and keeps its cents?',
      options: [
        { id: 'text', text: 'Text', why: 'A text column cannot be added up: Power BI would only count it.' },
        { id: 'whole', text: 'Whole number', why: 'A whole number drops the cents: 219.41 would become 219.' },
        { id: 'decimal', text: 'Decimal number', why: '' },
        { id: 'date', text: 'Date', why: 'A date is not an amount.' },
      ],
      right: 'decimal',
      hints: ['Look at a value: 219.41.', 'The Σ sign next to a column name means Power BI will add it up.'],
      explain: 'Decimal number (or Fixed decimal number) keeps the cents and Σ appears next to the column. Column tools, Data type shows and changes it.',
    },
    {
      kind: 'spot',
      id: 'gd-locale',
      title: 'Dates and decimals from another locale',
      question: "A colleague's CSV comes from a German computer: these two lines. In Power BI both columns come in as text. What is the safe fix?",
      snippet: 'sale_date;revenue\n19.02.2024;219,41',
      options: [
        { id: 'locale', text: 'In Transform data: Change type, Using locale…, pick German (Germany), once for the date and once for the decimal number', why: '' },
        { id: 'replace', text: 'Find and replace "," with "." in every column', why: 'It also changes the commas in text columns (names, cities) and breaks thousands separators.' },
        { id: 'plain', text: 'Change the type to Decimal number, nothing else', why: 'With an English locale the comma is read as a thousands separator, or the cell turns into an error.' },
        { id: 'hand', text: 'Edit all rows by hand in Notepad', why: "It works once. Next month's file has the same problem again." },
      ],
      right: 'locale',
      hints: ['The question is how the file writes dates and decimals, not what is in it.', 'Power Query has a way to say which locale a file was written in.'],
      explain: "Change type, Using locale tells Power BI how the file writes its dates and decimals, so 19.02.2024 is a date and 219,41 is 219.41. It stays in the Applied steps, so next month's file is read the same way.",
    },
    {
      kind: 'order',
      id: 'gd-order',
      title: 'Load a CSV',
      question: 'Put the steps of loading a CSV file in the order you do them.',
      steps: ['Home, Get data, Text/CSV', 'Pick the file in the dialog', 'Read the preview: file origin, delimiter, column types', 'Press Load', 'In Table view check the columns and their types'],
      hints: ['Nothing is loaded before the preview.', 'You check the result after the load.'],
      explain: 'Read the preview before Load: a wrong encoding, delimiter or type is cheapest to fix there. After the load, Table view shows what Power BI made of each column.',
    },
    {
      kind: 'drill',
      id: 'gd-drill',
      title: 'Load the Kaiyo files',
      question: 'Load the three Kaiyo files into Power BI Desktop, look at the empty revenue cells in Power Query, and count the rows in a card. Download the zip, follow the steps, type the two numbers.',
      zip: 'kaiyo-powerbi-1-get-data.zip',
      intro: 'Load the three tables of the Kaiyo star, check their types, and read two numbers off your own data.',
      continues: '',
      scratch: [],
      steps: [
        {
          title: 'Get the data',
          html: `<ol>
<li>Press <b>Home, Get data, Text/CSV</b>. Pick a file from the ${code('data')} folder.</li>
<li>Check the preview: File origin <b>65001: Unicode (UTF-8)</b>, Delimiter <b>Comma</b>. Press <b>Load</b>.</li>
<li>Repeat for every file:{{files}}</li>
</ol>`,
        },
        {
          title: 'Check the column types',
          html: `<p>Open <b>Table view</b>, press the column, read <b>Data type</b> under Column tools. The other columns are read right; check only these:</p>
{{types}}
<p class="muted">If a date or a number is wrong: press <b>Transform data</b>, then on the column <b>Change Type, Using Locale…</b> (right-click the column header) with English (United States).</p>`,
        },
        {
          title: 'Look at the empty revenue in Power Query',
          html: `<ol>
<li>Press <b>Home, Transform data</b>. Select <code>fact_sales</code> on the left.</li>
<li>On the <b>View</b> tab turn on <b>Column quality</b> and <b>Column profile</b>.</li>
<li>At the bottom left of the window press <b>Column profiling based on top 1000 rows</b> and choose <b>Column profiling based on entire data set</b>. The first choice looks at 1000 rows only.</li>
<li>Press the <code>revenue</code> column. The profile shows <b>Count</b>, <b>Error</b> and <b>Empty</b>: read Empty.</li>
<li>Press <b>Close &amp; Apply</b>.</li>
</ol>`,
        },
        {
          title: 'Count the rows in a card',
          html: `<ol>
<li>In Report view add a <b>Card</b> visual.</li>
<li>Drag <code>fact_sales[sale_date]</code> into the <b>Values</b> well. Press the arrow next to it and choose <b>Count</b> (not Count (Distinct), not Earliest).</li>
</ol>`,
        },
      ],
      checks: [
        { id: 'rows', label: 'Rows in fact_sales', where: 'on the card of step 4', sql: 'SELECT count(*) FROM fact_sales', traps: [{ sql: 'SELECT count(DISTINCT sale_date) FROM fact_sales', says: 'That is Count (Distinct): the different dates. Choose Count, which counts every row (step 4).' }] },
        {
          id: 'empty',
          label: 'Empty revenue cells in fact_sales',
          where: 'in the column profile of revenue (step 3)',
          sql: 'SELECT count(*) FROM fact_sales WHERE revenue IS NULL',
          traps: [
            { sql: 'SELECT count(revenue) FROM fact_sales', says: 'That is the cells that have a value. The question is the Empty ones.' },
            { sql: 'SELECT count(*) FROM (SELECT * FROM fact_sales LIMIT 1000) WHERE revenue IS NULL', says: 'That is the top 1000 rows only. At the bottom left choose Column profiling based on entire data set (step 3).' },
          ],
        },
      ],
      ifWrong: ['it shows a date or a small number: the aggregation is not Count (step 4).', 'the number looks small: the profile counts only the top 1000 rows (step 3).'],
      hints: ['Everything starts at Home, Get data, Text/CSV.', 'The column profile is under the View tab of Power Query; the bottom-left switch decides how many rows it reads.', 'A card of a date shows the earliest date until you pick Count.'],
    },
  ],
}
