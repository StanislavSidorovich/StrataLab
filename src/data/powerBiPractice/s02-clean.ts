// Section 2: clean in Power Query. Layer A in the browser, layer B a drill on a messy copy of the products (dim_product_dirty.csv,
// made from dim_product by a fixed rule, see dirtyProductCsv in src/core/powerBiPractice.ts).
import { code } from '../../core/powerBi'
import type { PbiSection } from '../../core/powerBiPractice'
import { SCRATCH_LOAD } from './shared'

export const S02: PbiSection = {
  id: 'clean',
  n: 2,
  title: 'Clean in Power Query',
  blocks: [
    {
      kind: 'note',
      topic: 'Applied steps',
      text: "`Transform data` opens Power Query. Every press (Trim, Split Column, Replace Values, Merge Queries) adds a step to the `Applied steps` list on the right, named by Power Query: Trimmed Text, Split Column by Delimiter, Replaced Value, Merged Queries. It is the same idea as the steps of Lab's Clean: the file is never changed, the steps are replayed each time the data refreshes. `Trim` cuts the spaces at the edges, UPPERCASE (Transform, Text Column, Format) makes a text upper case, `Merge Queries` (Home, Combine) joins two tables on a column, `Unpivot Columns` turns columns into rows.",
      trap: "A join on text is exact: a space or a different case is a different value. Replace Values changes part of a cell unless you tick Match entire cell contents under Advanced options: replacing Beverage with Beverages inside the cell Beverages gives Beveragess.",
    },
    {
      kind: 'predict',
      id: 'cl-empty',
      title: 'Empty chain names',
      question: 'In Power Query you turn on Column quality for `dim_customer` and look at `chain_name`. The empty cells in the CSV come in as Empty (null). How many does it show? Type the number.',
      sql: 'SELECT count(*) FROM dim_customer WHERE chain_name IS NULL',
      traps: [
        { sql: 'SELECT count(chain_name) FROM dim_customer', says: 'That is the customers who have a chain. The question asks for the Empty ones.' },
        { sql: 'SELECT count(*) FROM dim_customer', says: 'That is every customer. Column quality counts the Empty cells of this one column.' },
      ],
      hints: ['An empty cell of a CSV is read as Empty (null), not as a text.', 'Only some customers belong to a chain: the others have no value in chain_name.'],
      explain: 'Customers with no chain (distributors, traditional shops, some pharmacies) have an empty chain_name. Column quality shows them as Empty; a table later shows them as (Blank).',
    },
    {
      kind: 'order',
      id: 'cl-order',
      title: 'Clean a column',
      question: 'Put these steps in the order you do them to clean a text column that is full of stray spaces and mixed case.',
      steps: ['Home, Transform data', 'Select the column', 'Transform, Text Column, Format, Trim', 'Transform, Text Column, Format, UPPERCASE', 'Check Column quality again', 'Home, Close & Apply'],
      hints: ['Nothing can be cleaned before Power Query is open.', 'You look at the result before you load it.'],
      explain: 'Open Power Query, select the column, apply Trim and UPPERCASE (each adds an Applied step), check Column quality, then Close & Apply loads the clean table into the report.',
    },
    {
      kind: 'pick',
      id: 'cl-unpivot',
      title: 'Months as columns',
      question: 'A planning file has one column per month. How do you get one row per product and month?',
      snippet: 'product      Jan   Feb   Mar\nAqualis 1.5  120   135   128\nKrosti 40 g   80    75    91',
      options: [
        { id: 'unpivot', text: 'Select the product column, then Transform, Unpivot Other Columns', why: '' },
        { id: 'pivot', text: 'Transform, Pivot Column on the month columns', why: 'Pivot goes the other way: it turns rows into columns.' },
        { id: 'transpose', text: 'Transform, Transpose', why: 'Transpose turns the whole table on its side, the headers become rows of data and the products become columns. It does not make one row per product and month.' },
        { id: 'split', text: 'Split each month column into rows by hand', why: 'It does not scale: next month brings a new column and the same work again.' },
      ],
      right: 'unpivot',
      hints: ['You want fewer columns and more rows.', 'Unpivot Other Columns keeps working when a new month column appears.'],
      explain: 'Unpivot Other Columns makes two columns, Attribute (the month) and Value (the number), and a row for each product and month. "Other" means a month added next year is unpivoted too.',
    },
    {
      kind: 'spot',
      id: 'cl-merge',
      title: 'Rows lost in a merge',
      question: 'You merge a list of products with their prices and expand the result. Some of the products are gone. What happened?',
      snippet: 'Merge: dim_product_dirty with dim_product on sku_code\nJoin Kind: Inner\nResult: fewer rows than products',
      options: [
        { id: 'inner', text: 'Join Kind Inner keeps only the products that match; the ones with a stray space or a lower-case SKU do not, so they drop out', why: '' },
        { id: 'type', text: 'sku_code has the wrong data type', why: 'Both columns are text. The rows are lost because the text differs, not its type.' },
        { id: 'expand', text: 'Expand removed the rows; use Aggregate instead', why: 'Expand only adds the columns of the other table. The rows were already gone after the join.' },
        { id: 'refresh', text: 'Power Query shows only the first 1000 rows', why: 'There are 47 products. The preview limit is not the cause.' },
      ],
      right: 'inner',
      hints: ['Which Join Kind keeps only the matching rows?', 'Compare ` AQUA001 ` with AQUA001: are they the same text?'],
      explain: 'Inner keeps only matches, and a text match is exact. Trim and UPPERCASE the key first, or use Left Outer to keep every product and see which ones found no match.',
    },
    {
      kind: 'drill',
      id: 'cl-drill',
      title: 'Clean a messy product list',
      question: 'Clean a messy copy of the product list in Power Query: merge to see what does not match, Trim and UPPERCASE the key, split a column, replace a typo. Download the zip, follow the steps, type the four numbers.',
      zip: 'kaiyo-powerbi-2-clean.zip',
      extra: ['dim_product_dirty'],
      intro: 'Take a messy product list through Trim, UPPERCASE, Merge, Split and Replace Values, and read four numbers off the Power Query profile.',
      continues: 'the three tables loaded',
      scratch: [SCRATCH_LOAD],
      steps: [
        {
          title: 'Open the messy file in Power Query',
          html: `<ol>
<li>Press <b>Home, Get data, Text/CSV</b> and pick ${code('data/dim_product_dirty.csv')}. Press <b>Transform data</b> (not Load).</li>
<li>Look at it: some SKUs have spaces at the edges, some are lower case, and <code>brand_category</code> holds two values with a slash.</li>
<li>On the <b>View</b> tab turn on <b>Column quality</b> and <b>Column profile</b>. At the bottom left choose <b>Column profiling based on entire data set</b>.</li>
</ol>`,
        },
        {
          title: 'Merge with the clean products and read what does not match',
          html: `<ol>
<li>With <code>dim_product_dirty</code> selected press <b>Home, Combine, Merge queries, Merge queries as new</b>.</li>
<li>Top table <code>dim_product_dirty</code>: press the <code>sku_code</code> column. Bottom table <code>dim_product</code>: press its <code>sku_code</code>. <b>Join Kind: Left Outer</b>. OK. A new query <code>Merge1</code> appears.</li>
<li>In <code>Merge1</code> press the expand icon on the <code>dim_product</code> column, keep only <code>product_id</code>, OK.</li>
<li>Press the new column. The column profile shows <b>Empty</b>: the products with no match. Read it.</li>
</ol>
<p class="muted">The new query follows the two source queries when they change. If you rename or remove <code>sku_code</code> in either of them, the Merge step fails with an error.</p>`,
        },
        {
          title: 'Trim and UPPERCASE the SKU',
          html: `<ol>
<li>Select <code>dim_product_dirty</code> again, press the <code>sku_code</code> column. <b>Transform, Text Column, Format, Trim</b>.</li>
<li>Open <code>Merge1</code>: it follows the query it is made from. Read <b>Empty</b> of the product_id column. If it is not 0 yet, one more step is missing.</li>
<li>Back in <code>dim_product_dirty</code>: <b>Transform, Text Column, Format, UPPERCASE</b> on <code>sku_code</code>. Read <b>Empty</b> in <code>Merge1</code> again.</li>
</ol>
<p class="muted">The Applied steps of <code>dim_product_dirty</code> now read Trimmed Text and Uppercased Text.</p>`,
        },
        {
          title: 'Split brand and category',
          html: `<ol>
<li>In <code>dim_product_dirty</code> press <code>brand_category</code>. <b>Home, Transform, Split Column, By Delimiter</b>.</li>
<li>Choose <b>Custom</b> and type a space, a slash and a space: <code> / </code>. <b>At each occurrence of the delimiter</b>. OK.</li>
<li>Double-click the two new headers and name them <code>brand</code> and <code>category</code>.</li>
<li>Press the <code>category</code> column and read <b>Distinct</b> in the column profile.</li>
</ol>`,
        },
        {
          title: 'Replace the typo',
          html: `<ol>
<li>With <code>category</code> selected press <b>Transform, Replace Values</b>.</li>
<li>Value to find <code>Beverage</code>, replace with <code>Beverages</code>.</li>
<li>Open <b>Advanced options</b> and tick <b>Match entire cell contents</b>. OK.</li>
<li>Read <b>Distinct</b> of <code>category</code> again. Then <b>Home, Close &amp; Apply</b>.</li>
</ol>
<p class="muted">Without Match entire cell contents the cell Beverages becomes Beveragess.</p>`,
        },
      ],
      checks: [
        {
          id: 'before',
          label: 'Products with no match before cleaning',
          where: 'as Empty in the product_id column of Merge1 (step 2)',
          sql: 'SELECT count(*) FROM dim_product_dirty d LEFT JOIN dim_product p ON p.sku_code = d.sku_code WHERE p.product_id IS NULL',
          traps: [{ sql: 'SELECT count(*) FROM dim_product_dirty', says: 'That is every product. Read Empty, the products with no match, not the count of rows.' }],
        },
        {
          id: 'after',
          label: 'Products with no match after Trim and UPPERCASE',
          where: 'as Empty in the product_id column of Merge1 (step 3)',
          sql: 'SELECT count(*) FROM dim_product_dirty d LEFT JOIN dim_product p ON p.sku_code = upper(trim(d.sku_code)) WHERE p.product_id IS NULL',
          traps: [
            { sql: 'SELECT count(*) FROM dim_product_dirty d LEFT JOIN dim_product p ON p.sku_code = d.sku_code WHERE p.product_id IS NULL', says: 'That is the number before cleaning: Merge1 did not change. Clean sku_code in dim_product_dirty, then look at Merge1 again.' },
            { sql: 'SELECT count(*) FROM dim_product_dirty d LEFT JOIN dim_product p ON p.sku_code = trim(d.sku_code) WHERE p.product_id IS NULL', says: 'Trim removed the spaces, but the lower-case SKUs are still different text. Add UPPERCASE.' },
          ],
        },
        {
          id: 'cats-before',
          label: 'Distinct categories before Replace Values',
          where: 'as Distinct in the profile of category (step 4)',
          sql: "SELECT count(DISTINCT split_part(brand_category, ' / ', 2)) FROM dim_product_dirty",
          traps: [{ sql: 'SELECT count(DISTINCT category) FROM dim_product', says: 'That is the count after the typo is fixed. Read it before Replace Values (step 4).' }],
        },
        {
          id: 'cats-after',
          label: 'Distinct categories after Replace Values',
          where: 'as Distinct in the profile of category (step 5)',
          sql: 'SELECT count(DISTINCT category) FROM dim_product',
          traps: [{ sql: "SELECT count(DISTINCT split_part(brand_category, ' / ', 2)) FROM dim_product_dirty", says: 'That is the count before the fix: Beverage is still there, or Replace ran without Match entire cell contents and turned Beverages into Beveragess (step 5).' }],
        },
      ],
      ifWrong: [
        'there is no Empty line: you merged the other way round, or expanded a column that is always filled (step 2).',
        'it is not 0: the SKUs of dim_product_dirty still differ in spaces or case; both Trim and UPPERCASE are needed (step 3).',
        'it is 1: the split did not happen, the whole text is one value (step 4).',
        'it did not drop by one: the typo is not replaced, or Match entire cell contents is not ticked (step 5).',
      ],
      hints: ['Merge queries as new leaves the clean query alone and follows it when it changes.', 'Trim and UPPERCASE are both under Transform, Text Column, Format.', 'Replace Values has Advanced options with Match entire cell contents.'],
    },
  ],
}
