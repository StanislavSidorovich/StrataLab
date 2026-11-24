// Warm-up questions for lesson mode (`#lesson=sql&set=warmup&q=N`): 30 short "which one do you use when…" questions on
// the Kaiyo Trading tables (schema quaera). Written from Gemini's draft (shots/gemini/2026-11-24/task2-sql-warmup-mcqs.md),
// every answer re-checked against T-SQL and run on the data.
//
// Each option may carry `sql`: clicking the option on the slide runs it, so the right idea shows rows and a wrong one shows
// the real error (DuckDB's text, plus `mssql`: what SQL Server says, only where the message is known for sure) or a result
// that is visibly different. An option that is not a query ("Faster execution") has none and shows only its `why`.
// tests/lessonWarmup.test.ts runs every option: the right one answers, each wrong one fails or answers differently.
import type { WarmQuestion } from '../../core/lesson'

const MSG_8121 = (col: string) => `Msg 8121, Level 16: Column '${col}' is invalid in the HAVING clause because it is not contained in either an aggregate function or the GROUP BY clause.`
const MSG_8120 = (col: string) => `Msg 8120, Level 16: Column '${col}' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.`
const MSG_147 = 'Msg 147, Level 15: An aggregate may not appear in the WHERE clause unless it is in a subquery contained in a HAVING clause or a select list, and the column being aggregated is an outer reference.'

/** Total revenue per outlet, with the clause under test in the middle. */
const perOutlet = (where: string, groupBy: string, having: string, orderBy = 'customer_id') =>
  `SELECT customer_id, SUM(revenue) AS revenue\nFROM quaera.fact_sellout${where ? `\nWHERE ${where}` : ''}\nGROUP BY ${groupBy}${having ? `\nHAVING ${having}` : ''}\nORDER BY ${orderBy};`

const beverages = (where: string, having: string) =>
  `SELECT p.product_name, ROUND(AVG(1.0 * s.units), 1) AS avg_units\nFROM quaera.fact_sellout AS s\nJOIN quaera.dim_product AS p ON p.product_id = s.product_id${where ? `\nWHERE ${where}` : ''}\nGROUP BY p.product_name${having ? `\nHAVING ${having}` : ''}\nORDER BY p.product_name;`

const pharmacyByRegion = (select: string, where: string, having: string) =>
  `SELECT c.region_id, ${select}SUM(s.revenue) AS revenue\nFROM quaera.fact_sellout AS s\nJOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id${where ? `\nWHERE ${where}` : ''}\nGROUP BY c.region_id${having ? `\nHAVING ${having}` : ''}\nORDER BY c.region_id;`

const linesPerCustomer = (join: string) =>
  `SELECT c.customer_name, COUNT(s.sellout_id) AS lines\nFROM quaera.dim_customer AS c\n${join} quaera.fact_sellout AS s ON s.customer_id = c.customer_id\nGROUP BY c.customer_id, c.customer_name\nORDER BY lines, c.customer_name;`

const repsWith = (join: string) =>
  `SELECT r.rep_name, COUNT(c.customer_id) AS customers\nFROM quaera.dim_rep AS r\n${join} quaera.dim_customer AS c${join === 'CROSS JOIN' ? '' : ' ON c.rep_id = r.rep_id'}\nGROUP BY r.rep_id, r.rep_name\nORDER BY r.rep_name;`

const promoReconcile = (join: string) =>
  `SELECT COUNT(*) AS result_rows,\n       COUNT(CASE WHEN s.sellout_id IS NULL THEN 1 END) AS promos_unsold,\n       COUNT(CASE WHEN p.promo_id IS NULL THEN 1 END) AS lines_without_promo\nFROM quaera.dim_promo AS p\n${join} (SELECT * FROM quaera.fact_sellout WHERE week_start >= '2026-01-01') AS s ON s.promo_id = p.promo_id;`

const channelSplit = (join: string, where: string) =>
  `SELECT c.channel, COUNT(DISTINCT c.customer_id) AS customers\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id\n${join} quaera.dim_product AS p ON p.product_id = s.product_id${where}\nGROUP BY c.channel\nORDER BY c.channel;`

const customersWhere = (where: string, on = 's.customer_id = c.customer_id') =>
  `SELECT COUNT(DISTINCT c.customer_id) AS customers\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON ${on}${where ? `\nWHERE ${where}` : ''};`

const promoLines = (tail: string) =>
  `SELECT COUNT(DISTINCT c.customer_id) AS customers, COUNT(s.sellout_id) AS promo_lines\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id${tail}`

const outletsWith = (where: string) => `SELECT c.customer_id, c.customer_name\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id\nWHERE ${where}\nORDER BY c.customer_id;`

const chainWhere = (cond: string) => `SELECT customer_id, customer_name, chain_name\nFROM quaera.dim_customer\nWHERE ${cond}\nORDER BY customer_id;`

const countOf = (expr: string, from = 'quaera.fact_sellout', where = '') => `SELECT ${expr} AS answer\nFROM ${from}${where ? `\nWHERE ${where}` : ''};`

const newestLine = (extra: string) => `SELECT TOP (1) customer_id, week_start\nFROM quaera.fact_sellout\nORDER BY week_start ${extra}, customer_id;`

const notInServed = (sub: string) => `SELECT customer_id, customer_name
FROM quaera.dim_customer
WHERE customer_id NOT IN (${sub})
ORDER BY customer_id;`

const AUTHORED: WarmQuestion[] = [
  {
    id: 'w1',
    topic: 'WHERE vs HAVING',
    level: 'easy',
    question: 'You want revenue per outlet, counting only sell-out lines from 2026. Which clause filters the lines before they are grouped?',
    right: 0,
    why: 'WHERE works on single rows, before anything is grouped or summed.',
    options: [
      { text: 'WHERE', sql: perOutlet("week_start >= '2026-01-01'", 'customer_id', ''), why: 'Right. WHERE drops the lines from before 2026 first, then SUM adds up what is left.' },
      {
        text: 'HAVING',
        sql: perOutlet('', 'customer_id', "week_start >= '2026-01-01'"),
        mssql: MSG_8121('week_start'),
        why: 'Tempting because HAVING also filters. But it runs after grouping, on groups; a single line’s week no longer exists there.',
      },
      { text: 'GROUP BY', sql: perOutlet('', 'customer_id, week_start', '', 'customer_id, week_start'), why: 'GROUP BY builds groups (here one per outlet and week); it never removes a line.' },
      { text: 'ORDER BY', sql: perOutlet('', 'customer_id', ''), why: 'ORDER BY only sorts the output: the totals still include every week since 2024.' },
    ],
  },
  {
    id: 'w2',
    topic: 'WHERE vs HAVING',
    level: 'easy',
    question: 'You want only the outlets whose all-time revenue is above 5,000,000. Which clause filters on the total?',
    right: 1,
    why: 'HAVING filters groups, so it can use SUM, AVG or COUNT; WHERE cannot.',
    options: [
      { text: 'WHERE', sql: perOutlet('SUM(revenue) > 5000000', 'customer_id', ''), mssql: MSG_147, why: 'Tempting because WHERE is the filter everyone knows. But when WHERE runs the totals do not exist yet.' },
      { text: 'HAVING', sql: perOutlet('', 'customer_id', 'SUM(revenue) > 5000000'), why: 'Right. The groups are built, SUM is known, and HAVING keeps the groups that pass.' },
      {
        text: 'ON',
        sql: `SELECT c.customer_id, SUM(s.revenue) AS revenue\nFROM quaera.fact_sellout AS s\nJOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id AND s.revenue > 5000\nGROUP BY c.customer_id\nORDER BY c.customer_id;`,
        why: 'ON decides which rows of two tables match. A condition there still sees single lines (here: lines above 5,000), not the outlet’s total.',
      },
      { text: 'TOP (n)', sql: `SELECT TOP (3) customer_id, SUM(revenue) AS revenue\nFROM quaera.fact_sellout\nGROUP BY customer_id\nORDER BY SUM(revenue) DESC;`, why: 'TOP caps how many rows come back, not which values qualify: it would cut at 3 even if 8 outlets pass.' },
    ],
  },
  {
    id: 'w3',
    topic: 'WHERE vs HAVING',
    level: 'medium',
    question: 'You need Beverages products whose average units per sell-out line is above 9. Where does each condition go?',
    right: 2,
    why: 'The category is a fact about a single row, so it goes in WHERE and shrinks the data first; the average exists only per group, so it goes in HAVING.',
    options: [
      { text: 'Both in WHERE', sql: beverages("p.category = 'Beverages' AND AVG(1.0 * s.units) > 9", ''), mssql: MSG_147, why: 'WHERE cannot see an average: it runs before the groups exist.' },
      {
        text: 'Both in HAVING',
        sql: beverages('', "p.category = 'Beverages' AND AVG(1.0 * s.units) > 9"),
        mssql: MSG_8121('category'),
        why: 'Fails unless category is also in GROUP BY, and even then every category would be grouped first and thrown away after: wasted work.',
      },
      { text: 'Category in WHERE, average in HAVING', sql: beverages("p.category = 'Beverages'", 'AVG(1.0 * s.units) > 9'), why: 'Right. Each condition runs at the stage where its data exists.' },
      { text: 'Average in WHERE, category in HAVING', sql: beverages('AVG(1.0 * s.units) > 9', "p.category = 'Beverages'"), mssql: MSG_147, why: 'The two are swapped: the aggregate is still in WHERE.' },
    ],
  },
  {
    id: 'w4',
    topic: 'WHERE vs HAVING',
    level: 'medium',
    question: 'Pharmacy revenue per region: `GROUP BY c.region_id HAVING c.channel = \'pharmacy\'` fails. What is the right fix?',
    right: 3,
    why: 'A row-level condition belongs in WHERE. HAVING may only mention grouped columns and aggregates, and filtering before grouping is also cheaper.',
    options: [
      { text: 'Add channel to the SELECT list', sql: pharmacyByRegion('c.channel, ', '', "c.channel = 'pharmacy'"), mssql: MSG_8121('channel'), why: 'Tempting: the column is then “used”. But HAVING asks whether it is grouped or aggregated, and it is neither.' },
      { text: 'Wrap it: HAVING MAX(c.channel) = …', sql: pharmacyByRegion('', '', "MAX(c.channel) = 'pharmacy'"), why: 'It runs, and that is the danger: it keeps whole regions by their alphabetically last channel and still adds every channel’s revenue.' },
      { text: 'Add an ORDER BY', sql: pharmacyByRegion('', '', "c.channel = 'pharmacy'"), mssql: MSG_8121('channel'), why: 'Sorting happens after HAVING and cannot repair it.' },
      { text: 'Move the condition to WHERE', sql: pharmacyByRegion('', "c.channel = 'pharmacy'", ''), why: 'Right. Only pharmacy lines are grouped, so the totals are pharmacy revenue per region.' },
    ],
  },
  {
    id: 'w5',
    topic: 'INNER, LEFT and FULL JOIN',
    level: 'easy',
    question: 'You want every customer with how many sell-out lines it has, including customers with none. Which join, starting from dim_customer?',
    right: 0,
    why: 'LEFT JOIN keeps every row of the left table; where nothing matches, the right side is NULL.',
    options: [
      { text: 'LEFT JOIN', sql: linesPerCustomer('LEFT JOIN'), why: 'Right. The 12 distributors have no sell-out lines and still appear, with 0.' },
      { text: 'INNER JOIN', sql: linesPerCustomer('INNER JOIN'), why: 'INNER keeps only matched pairs: the 12 distributors disappear.' },
      { text: 'CROSS JOIN', sql: `SELECT c.customer_name, COUNT(s.sellout_id) AS lines\nFROM quaera.dim_customer AS c\nCROSS JOIN quaera.fact_sellout AS s\nGROUP BY c.customer_id, c.customer_name\nORDER BY lines, c.customer_name;`, why: 'CROSS pairs every customer with every line, so every customer “has” 118,449.' },
      { text: 'RIGHT JOIN', sql: linesPerCustomer('RIGHT JOIN'), why: 'It keeps all lines of the right table, not all customers. Every line has a customer, so nothing extra appears.' },
    ],
  },
  {
    id: 'w6',
    topic: 'INNER, LEFT and FULL JOIN',
    level: 'easy',
    question: 'You only want the sales reps who have at least one customer (dim_customer.rep_id). Which join between dim_rep and dim_customer?',
    right: 2,
    why: 'INNER JOIN returns only rows that have a partner on both sides.',
    options: [
      { text: 'LEFT JOIN', sql: repsWith('LEFT JOIN'), why: 'It keeps the reps without customers, with 0.' },
      { text: 'FULL OUTER JOIN', sql: repsWith('FULL OUTER JOIN'), why: 'It keeps unmatched rows from both sides: the reps with no customers, and a NULL group for the customers with no rep.' },
      { text: 'INNER JOIN', sql: repsWith('INNER JOIN'), why: 'Right. A rep with no customer has no partner and drops out.' },
      { text: 'CROSS JOIN', sql: repsWith('CROSS JOIN'), why: 'CROSS ignores the keys: every rep gets all 144 customers.' },
    ],
  },
  {
    id: 'w7',
    topic: 'INNER, LEFT and FULL JOIN',
    level: 'medium',
    question: 'Reconcile promotions with 2026 sell-out lines: you must see promotions nobody sold under AND sell-out lines with no promotion. Which join?',
    right: 3,
    why: 'Only FULL OUTER JOIN preserves the unmatched rows of both tables in one result.',
    options: [
      { text: 'INNER JOIN', sql: promoReconcile('INNER JOIN'), why: 'It drops every mismatch, on both sides.' },
      { text: 'LEFT JOIN (from dim_promo)', sql: promoReconcile('LEFT JOIN'), why: 'It keeps the unsold promotions but loses the lines that have no promotion.' },
      { text: 'RIGHT JOIN (from dim_promo)', sql: promoReconcile('RIGHT JOIN'), why: 'It keeps the lines without a promotion but loses the unsold promotions.' },
      { text: 'FULL OUTER JOIN', sql: promoReconcile('FULL OUTER JOIN'), why: 'Right. Both counts are above 0: promotions unsold in 2026, and lines outside any promotion.' },
    ],
  },
  {
    id: 'w8',
    topic: 'INNER, LEFT and FULL JOIN',
    level: 'medium',
    question: 'You LEFT JOIN dim_customer to fact_sellout, then INNER JOIN the result to dim_product. What happens to customers with no sell-out lines?',
    right: 1,
    why: 'The customers with no lines carry a NULL product_id, and an INNER JOIN on product_id never matches NULL. The later INNER JOIN quietly undoes the LEFT one.',
    options: [
      { text: 'Kept, with a NULL product', sql: channelSplit('LEFT JOIN', ''), why: 'That is what happens if the second join is also a LEFT JOIN, which is not what was written.' },
      { text: 'Dropped by the INNER JOIN', sql: channelSplit('INNER JOIN', ''), why: 'Right. Look: the distributor channel is gone from the result.' },
      { text: 'Duplicated', why: 'No extra matches are created; a row without a partner is kept once or dropped, never repeated.' },
      { text: 'A syntax error', why: 'The query is valid. It just does not do what the author hoped.' },
    ],
  },
  {
    id: 'w9',
    topic: 'ON vs WHERE in a LEFT JOIN',
    level: 'easy',
    question: '`dim_customer c LEFT JOIN fact_sellout s ON s.customer_id = c.customer_id WHERE s.promo_id IS NOT NULL`: which customers remain?',
    right: 1,
    why: 'The unmatched customers have NULL in every s column, so WHERE rejects them. The LEFT JOIN has become an INNER JOIN.',
    options: [
      { text: 'All customers', sql: customersWhere(''), why: 'Tempting because that is what LEFT JOIN promises. But WHERE runs after the join and removes rows.' },
      { text: 'Only customers with at least one promo line', sql: customersWhere('s.promo_id IS NOT NULL'), why: 'Right. Customers with no lines, or only lines outside promotions, are gone.' },
      { text: 'Only customers with no lines at all', sql: customersWhere('s.sellout_id IS NULL'), why: 'That is the opposite filter; NULL is not true for IS NOT NULL.' },
      { text: 'Only the lines without a promotion', sql: customersWhere('s.promo_id IS NULL'), why: 'The condition asks for promotions, not for their absence.' },
    ],
  },
  {
    id: 'w10',
    topic: 'ON vs WHERE in a LEFT JOIN',
    level: 'medium',
    question: 'You want all customers, plus their promo lines where they have any. Where should `s.promo_id IS NOT NULL` go?',
    right: 2,
    why: 'A condition in ON limits which lines may match; the customer stays even when none does. In WHERE it would remove the customer.',
    options: [
      { text: 'WHERE', sql: promoLines('\nWHERE s.promo_id IS NOT NULL;'), why: 'It drops every customer that has no promo line: the LEFT JOIN is undone.' },
      { text: 'HAVING', sql: promoLines('\nHAVING s.promo_id IS NOT NULL;'), mssql: MSG_8121('promo_id'), why: 'HAVING runs after grouping, and promo_id is neither grouped nor aggregated.' },
      { text: 'ON', sql: promoLines(' AND s.promo_id IS NOT NULL;'), why: 'Right. All 144 customers appear, with their promo lines counted.' },
      { text: 'GROUP BY', sql: promoLines('\nGROUP BY c.customer_id;'), why: 'GROUP BY does not filter anything: every line is still counted, and now one row per customer.' },
    ],
  },
  {
    id: 'w11',
    topic: 'ON vs WHERE in a LEFT JOIN',
    level: 'medium',
    question: 'You want only the customers with zero sell-out lines. After `dim_customer c LEFT JOIN fact_sellout s ON s.customer_id = c.customer_id`, what goes in WHERE?',
    right: 1,
    why: 'Unmatched rows have NULL in the s columns, and the only test that is true for NULL is IS NULL.',
    options: [
      { text: 's.sellout_id = NULL', sql: outletsWith('s.sellout_id = NULL'), why: 'Tempting because it reads naturally. But = NULL is never true (it is UNKNOWN), so no row passes.' },
      { text: 's.sellout_id IS NULL', sql: outletsWith('s.sellout_id IS NULL'), why: 'Right. The 12 distributors.' },
      { text: 's.customer_id <> c.customer_id', sql: outletsWith('s.customer_id <> c.customer_id'), why: 'On matched rows the two ids are equal; on unmatched rows the comparison with NULL is UNKNOWN. Nothing passes.' },
      { text: 'COUNT(s.sellout_id) = 0', sql: outletsWith('COUNT(s.sellout_id) = 0'), mssql: MSG_147, why: 'Aggregates are not allowed in WHERE; counting needs GROUP BY and HAVING.' },
    ],
  },
  {
    id: 'w12',
    topic: 'ON vs WHERE in a LEFT JOIN',
    level: 'tricky',
    question: '`dim_customer c LEFT JOIN fact_sellout s ON s.customer_id = c.customer_id AND c.channel = \'pharmacy\'`: what happens to customers of other channels?',
    right: 3,
    why: 'A condition on the left table inside ON does not remove left rows: it only stops them from matching. They stay with NULL on the right.',
    options: [
      {
        text: 'They are excluded',
        sql: `SELECT c.channel, COUNT(DISTINCT c.customer_id) AS customers, COUNT(s.sellout_id) AS lines\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id\nWHERE c.channel = 'pharmacy'\nGROUP BY c.channel\nORDER BY c.channel;`,
        why: 'That would happen with the condition in WHERE, as shown here, not in ON.',
      },
      { text: 'They have all their lines', sql: `SELECT c.channel, COUNT(DISTINCT c.customer_id) AS customers, COUNT(s.sellout_id) AS lines\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id\nGROUP BY c.channel\nORDER BY c.channel;`, why: 'The condition in ON blocks their matches. Without it, as here, they would.' },
      { text: 'An error', why: 'Naming the left table in ON is valid SQL. Run the right answer to see it work.' },
      {
        text: 'They stay, with no lines',
        sql: `SELECT c.channel, COUNT(DISTINCT c.customer_id) AS customers, COUNT(s.sellout_id) AS lines\nFROM quaera.dim_customer AS c\nLEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id AND c.channel = 'pharmacy'\nGROUP BY c.channel\nORDER BY c.channel;`,
        why: 'Right. Every channel is listed, but only pharmacy has lines.',
      },
    ],
  },
  {
    id: 'w13',
    topic: 'CROSS JOIN',
    level: 'easy',
    question: 'You need every combination of product and region, for a price grid. Which join?',
    right: 2,
    why: 'CROSS JOIN is the Cartesian product: every row of one table with every row of the other, no key needed.',
    options: [
      { text: 'INNER JOIN', sql: `SELECT COUNT(*) AS combinations\nFROM quaera.dim_product AS p\nINNER JOIN quaera.dim_region AS r ON p.product_id = r.region_id;`, why: 'It needs an ON condition and returns only the pairs that satisfy it.' },
      { text: 'LEFT JOIN', sql: `SELECT COUNT(*) AS combinations\nFROM quaera.dim_product AS p\nLEFT JOIN quaera.dim_region AS r ON p.product_id = r.region_id;`, why: 'It also needs ON; it keeps every product, but pairs it only with a matching region.' },
      { text: 'CROSS JOIN', sql: `SELECT COUNT(*) AS combinations\nFROM quaera.dim_product AS p\nCROSS JOIN quaera.dim_region AS r;`, why: 'Right. 47 products times 16 regions.' },
      { text: 'FULL JOIN', sql: `SELECT COUNT(*) AS combinations\nFROM quaera.dim_product AS p\nFULL JOIN quaera.dim_region AS r ON p.product_id = r.region_id;`, why: 'It still matches on a condition; it only adds the unmatched rows.' },
    ],
  },
  {
    id: 'w14',
    topic: 'CROSS JOIN',
    level: 'medium',
    question: 'dim_customer has 144 rows and dim_product has 47. You forget the join condition: `FROM quaera.dim_customer, quaera.dim_product`. How many rows?',
    right: 3,
    why: 'A comma join with no condition in WHERE is a CROSS JOIN: 144 x 47 rows.',
    options: [
      { text: '144', sql: countOf('COUNT(*)', 'quaera.dim_customer'), why: 'That is the size of one table, as with a LEFT JOIN that matched exactly once.' },
      { text: '47', sql: countOf('COUNT(*)', 'quaera.dim_product'), why: 'The other table’s size: the same slip.' },
      { text: '191', sql: `SELECT (SELECT COUNT(*) FROM quaera.dim_customer) + (SELECT COUNT(*) FROM quaera.dim_product) AS answer;`, why: 'Adding is what UNION ALL does. A join multiplies.' },
      { text: '6,768', sql: `SELECT COUNT(*) AS answer\nFROM quaera.dim_customer, quaera.dim_product;`, why: 'Right. Every customer meets every product.' },
    ],
  },
  {
    id: 'w15',
    topic: 'CROSS JOIN',
    level: 'tricky',
    question: 'You INNER JOIN dim_customer to dim_rep on region_id. The result has 291 rows, but only 127 different customers. Why?',
    right: 1,
    why: 'region_id is not unique in dim_rep: a region has several reps, so each customer is matched to all of them. This is the many-to-many fan-out.',
    options: [
      { text: 'INNER JOIN acted like a FULL JOIN', sql: `SELECT COUNT(*) AS joined_rows, COUNT(DISTINCT c.customer_id) AS customers\nFROM quaera.dim_customer AS c\nFULL JOIN quaera.dim_rep AS r ON r.region_id = c.region_id;`, why: 'FULL only adds unmatched rows; it never makes an inner match appear twice.' },
      { text: 'region_id is not unique in dim_rep', sql: `SELECT COUNT(*) AS joined_rows, COUNT(DISTINCT c.customer_id) AS customers\nFROM quaera.dim_customer AS c\nINNER JOIN quaera.dim_rep AS r ON r.region_id = c.region_id;`, why: 'Right. More joined rows than customers is the sign: the key repeats on one side.' },
      { text: 'SQL duplicated the NULLs', why: 'NULL keys never match in an INNER JOIN; they are dropped, not duplicated.' },
      { text: 'ORDER BY was missing', why: 'Sorting never changes how many rows a query returns.' },
    ],
  },
  {
    id: 'w16',
    topic: 'COUNT',
    level: 'easy',
    question: 'You want the total number of lines in fact_sellout, including the ones with a NULL promo_id. Which expression?',
    right: 1,
    why: 'COUNT(*) counts rows; COUNT(column) counts only the rows where that column is not NULL.',
    options: [
      { text: 'COUNT(promo_id)', sql: countOf('COUNT(promo_id)'), why: 'Skips every line with a NULL promo_id: only the lines under a promotion are counted.' },
      { text: 'COUNT(*)', sql: countOf('COUNT(*)'), why: 'Right. Every row, whatever its columns hold.' },
      { text: 'COUNT(DISTINCT promo_id)', sql: countOf('COUNT(DISTINCT promo_id)'), why: 'Counts different non-NULL values: the number of promotions used, not lines.' },
      { text: 'SUM(promo_id)', sql: countOf('SUM(promo_id)'), why: 'Adds the ids together; it does not count anything.' },
    ],
  },
  {
    id: 'w17',
    topic: 'COUNT',
    level: 'medium',
    question: 'How many different outlets have at least one line in fact_sellout? Which expression?',
    right: 2,
    why: 'COUNT(DISTINCT customer_id) counts each non-NULL customer once, however many lines it has.',
    options: [
      { text: 'COUNT(*)', sql: countOf('COUNT(*)'), why: 'Counts lines, so a busy outlet is counted thousands of times.' },
      { text: 'COUNT(customer_id)', sql: countOf('COUNT(customer_id)'), why: 'Counts the lines that have a customer: the same number, since none is NULL.' },
      { text: 'COUNT(DISTINCT customer_id)', sql: countOf('COUNT(DISTINCT customer_id)'), why: 'Right. 132 outlets.' },
      { text: 'SUM(customer_id)', sql: countOf('SUM(customer_id)'), why: 'Adds the ids as numbers.' },
    ],
  },
  {
    id: 'w18',
    topic: 'COUNT',
    level: 'medium',
    question: 'After `dim_customer c LEFT JOIN fact_sellout s`, grouped by customer, which expression counts the lines per customer and gives 0 for customers with none?',
    right: 2,
    why: 'The unmatched customer has one joined row with NULL in every s column. COUNT(s.column) skips NULLs and gives 0; the others count that row.',
    options: [
      { text: 'COUNT(*)', sql: linesPerCustomer('LEFT JOIN').replace('COUNT(s.sellout_id)', 'COUNT(*)'), why: 'Counts the NULL-padded row as 1: a distributor would show 1 line.' },
      { text: 'COUNT(c.customer_id)', sql: linesPerCustomer('LEFT JOIN').replace('COUNT(s.sellout_id)', 'COUNT(c.customer_id)'), why: 'The customer side is never NULL, so it also gives 1.' },
      { text: 'COUNT(s.sellout_id)', sql: linesPerCustomer('LEFT JOIN'), why: 'Right. The NULL from the missing line is not counted.' },
      { text: 'COUNT(DISTINCT c.customer_id)', sql: linesPerCustomer('LEFT JOIN').replace('COUNT(s.sellout_id)', 'COUNT(DISTINCT c.customer_id)'), why: 'Always 1 per customer: it counts the customer itself.' },
    ],
  },
  {
    id: 'w19',
    topic: 'COUNT',
    level: 'tricky',
    question: 'fact_sellout has 118,449 lines; 23,849 are under a promotion and the rest have NULL in promo_id. What does `COUNT(DISTINCT promo_id)` return?',
    right: 2,
    why: 'COUNT(DISTINCT x) ignores NULL and counts the different non-NULL values: here, the promotions that sold at least once.',
    options: [
      { text: '118,449', sql: countOf('COUNT(*)'), why: 'That is every line. DISTINCT then counts values, not lines.' },
      { text: '90', sql: countOf('COUNT(DISTINCT COALESCE(promo_id, 0))'), why: 'That counts NULL as one more value. COUNT(DISTINCT) does not.' },
      { text: '89', sql: countOf('COUNT(DISTINCT promo_id)'), why: 'Right. Each promotion once, NULL left out.' },
      { text: '23,849', sql: countOf('COUNT(promo_id)'), why: 'That is the lines that have a promotion, repeats included: COUNT without DISTINCT.' },
    ],
  },
  {
    id: 'w20',
    topic: 'DISTINCT vs GROUP BY',
    level: 'easy',
    question: 'You want the list of brands from dim_product, each once, with no counts or totals. Which query is simplest?',
    right: 3,
    why: 'SELECT DISTINCT removes duplicate rows; with no aggregate to compute, nothing more is needed.',
    options: [
      { text: 'SELECT brand … ORDER BY brand', sql: `SELECT brand\nFROM quaera.dim_product\nORDER BY brand;`, why: 'Sorts, but a brand with five products still appears five times.' },
      { text: 'SELECT DISTINCT brand, category', sql: `SELECT DISTINCT brand, category\nFROM quaera.dim_product\nORDER BY brand, category;`, why: 'DISTINCT applies to the whole row: a brand sold in two categories appears twice.' },
      { text: 'SELECT brand, COUNT(*) … GROUP BY brand', sql: `SELECT brand, COUNT(*) AS products\nFROM quaera.dim_product\nGROUP BY brand\nORDER BY brand;`, why: 'GROUP BY gives each brand once too, but it also returns a count nobody asked for. Use it when you need the aggregate.' },
      { text: 'SELECT DISTINCT brand', sql: `SELECT DISTINCT brand\nFROM quaera.dim_product\nORDER BY brand;`, why: 'Right. Nine brands.' },
    ],
  },
  {
    id: 'w21',
    topic: 'DISTINCT vs GROUP BY',
    level: 'medium',
    question: 'You want each product with the sum of units sold. Which construct do you need?',
    right: 1,
    why: 'An aggregate next to an ordinary column needs GROUP BY on that column. DISTINCT only removes duplicate rows and does not group.',
    options: [
      { text: 'SELECT DISTINCT product_id, SUM(units)', sql: `SELECT DISTINCT product_id, SUM(units) AS units\nFROM quaera.fact_sellout;`, mssql: MSG_8120('product_id'), why: 'Tempting: “each product once”. But SUM collapses the table to one row, and product_id has no single value there.' },
      { text: 'GROUP BY product_id', sql: `SELECT product_id, SUM(units) AS units\nFROM quaera.fact_sellout\nGROUP BY product_id\nORDER BY product_id;`, why: 'Right. One row per product, each with its own total.' },
      { text: 'ORDER BY product_id', sql: `SELECT product_id, SUM(units) AS units\nFROM quaera.fact_sellout\nORDER BY product_id;`, mssql: MSG_8120('product_id'), why: 'Sorting does not group.' },
      { text: 'WHERE DISTINCT product_id', why: 'Not SQL: DISTINCT is not a condition. It would be a syntax error.' },
    ],
  },
  {
    id: 'w22',
    topic: 'DISTINCT vs GROUP BY',
    level: 'medium',
    question: 'You write `SELECT DISTINCT customer_id, week_start FROM quaera.fact_sellout`. What is made unique?',
    right: 2,
    why: 'DISTINCT looks at the whole selected row, so it keeps each different (customer_id, week_start) pair once.',
    options: [
      { text: 'Only customer_id', sql: countOf('COUNT(DISTINCT customer_id)'), why: 'Tempting, because DISTINCT is written once, next to the first column. But it covers all of them.' },
      { text: 'Only week_start', sql: countOf('COUNT(DISTINCT week_start)'), why: 'The same mistake from the other side.' },
      { text: 'The pair (customer_id, week_start)', sql: `SELECT COUNT(*) AS answer\nFROM (SELECT DISTINCT customer_id, week_start FROM quaera.fact_sellout) AS t;`, why: 'Right. 17,035 pairs, out of 118,449 lines.' },
      { text: 'Nothing', sql: countOf('COUNT(*)'), why: 'DISTINCT always removes repeated rows: the count shrinks from 118,449.' },
    ],
  },
  {
    id: 'w23',
    topic: 'NULL in comparisons',
    level: 'easy',
    question: 'You want the customers with no chain_name (it is empty in the data). Which WHERE condition works?',
    right: 2,
    why: 'IS NULL is the only test that is true for NULL. Any comparison with NULL, including = and <>, is UNKNOWN.',
    options: [
      { text: 'chain_name = NULL', sql: chainWhere('chain_name = NULL'), why: 'Reads naturally, and returns nothing: = NULL is never true.' },
      { text: 'chain_name == NULL', sql: chainWhere('chain_name == NULL'), why: 'SQL Server has no == (Msg 102, incorrect syntax near =). Where it is accepted, as here, it behaves like = and is never true for NULL.' },
      { text: 'chain_name IS NULL', sql: chainWhere('chain_name IS NULL'), why: 'Right. 73 customers.' },
      { text: "chain_name = ''", sql: chainWhere("chain_name = ''"), why: 'An empty string is a value, not NULL. No customer has one here.' },
    ],
  },
  {
    id: 'w24',
    topic: 'NULL in comparisons',
    level: 'medium',
    question: 'fact_sellout has 118,449 lines; 23,849 have a promo_id and the rest have NULL. Promotion 5 has 870 lines. How many rows does `WHERE promo_id <> 5` return?',
    right: 3,
    why: 'Lines with NULL promo_id give UNKNOWN for <> 5 and are dropped: 23,849 - 870.',
    options: [
      { text: '117,579', sql: countOf('COUNT(*)', 'quaera.fact_sellout', 'promo_id <> 5 OR promo_id IS NULL'), why: 'That is “everything except promotion 5”, NULL included. It needs OR promo_id IS NULL.' },
      { text: '118,449', sql: countOf('COUNT(*)'), why: 'The filter would remove nothing at all.' },
      { text: '23,849', sql: countOf('COUNT(promo_id)'), why: 'All lines under a promotion, forgetting that promotion 5 is excluded.' },
      { text: '22,979', sql: countOf('COUNT(*)', 'quaera.fact_sellout', 'promo_id <> 5'), why: 'Right. NULLs fail the test, and so do the 870 lines of promotion 5.' },
    ],
  },
  {
    id: 'w25',
    topic: 'NULL in comparisons',
    level: 'tricky',
    question: '`SELECT … FROM dim_customer WHERE customer_id NOT IN (SELECT served_by_distributor_id FROM dim_customer)`: the 12 distributors have NULL in that column. What comes back?',
    right: 1,
    why: 'NOT IN means <> a AND <> b AND … <> NULL, and a comparison with NULL is UNKNOWN: no row can ever pass.',
    empty: true,
    options: [
      { text: 'The customers that serve nobody', sql: notInServed('SELECT served_by_distributor_id FROM quaera.dim_customer WHERE served_by_distributor_id IS NOT NULL'), why: 'That is what the author wanted and what you get once the NULLs are filtered out of the list.' },
      { text: '0 rows', sql: notInServed('SELECT served_by_distributor_id FROM quaera.dim_customer'), why: 'Right. One NULL in the list empties the whole result.' },
      { text: 'Only the 12 distributors', why: 'Their own NULL does not make them pass either: NULL <> NULL is UNKNOWN.' },
      { text: 'A syntax error', why: 'The query is valid, which is what makes the trap dangerous: no error, wrong answer.' },
    ],
  },
  {
    id: 'w26',
    topic: 'NULL in comparisons',
    level: 'tricky',
    question: 'Which pattern avoids the NOT IN trap when you want the customers that are not the distributor of any outlet?',
    right: 1,
    why: 'NOT EXISTS checks whether a matching row is there; a NULL in the subquery just never matches, so it cannot empty the result.',
    options: [
      { text: 'NOT IN with SELECT DISTINCT', sql: notInServed('SELECT DISTINCT served_by_distributor_id FROM quaera.dim_customer'), why: 'DISTINCT keeps the NULL; the result is still empty.' },
      { text: 'NOT EXISTS', sql: `SELECT customer_id, customer_name\nFROM quaera.dim_customer AS c\nWHERE NOT EXISTS (SELECT 1 FROM quaera.dim_customer AS o WHERE o.served_by_distributor_id = c.customer_id)
ORDER BY customer_id;`, why: 'Right. 132 customers.' },
      { text: '<> ANY (subquery)', sql: `SELECT customer_id, customer_name\nFROM quaera.dim_customer\nWHERE customer_id <> ANY (SELECT served_by_distributor_id FROM quaera.dim_customer)
ORDER BY customer_id;`, why: '“Different from at least one”, not “different from all”. Nearly everyone passes.' },
      { text: 'CROSS JOIN', why: 'It multiplies rows; it does not test for absence.' },
    ],
  },
  {
    id: 'w27',
    topic: 'TOP and ORDER BY',
    level: 'easy',
    question: 'You want the 5 most expensive products (list_price). Which combination?',
    right: 1,
    why: 'TOP takes the first rows of whatever order the query ends with, so the order must be set first: ORDER BY list_price DESC.',
    options: [
      { text: 'TOP (5) alone', sql: `SELECT TOP (5) product_name, list_price\nFROM quaera.dim_product;`, why: 'Five rows in no promised order: whichever the server finds first.' },
      { text: 'TOP (5) with ORDER BY list_price DESC', sql: `SELECT TOP (5) product_name, list_price\nFROM quaera.dim_product\nORDER BY list_price DESC;`, why: 'Right. Largest first, then cut at five.' },
      { text: 'TOP (5) with ORDER BY list_price', sql: `SELECT TOP (5) product_name, list_price\nFROM quaera.dim_product\nORDER BY list_price;`, why: 'Ascending is the default: these are the five cheapest.' },
      { text: 'TOP (5) with GROUP BY list_price', sql: `SELECT TOP (5) list_price, COUNT(*) AS products\nFROM quaera.dim_product\nGROUP BY list_price;`, why: 'Groups by price without sorting, so which five groups is arbitrary.' },
    ],
  },
  {
    id: 'w28',
    topic: 'TOP and ORDER BY',
    level: 'medium',
    question: 'You need the newest sell-out week for each customer. Why is `SELECT TOP (1) … ORDER BY week_start DESC` wrong?',
    right: 1,
    why: 'TOP (1) cuts the whole result to one row, not one row per customer. For one per customer use MAX(week_start) with GROUP BY customer_id.',
    options: [
      { text: 'TOP (1) does not work with dates', why: 'TOP works on any sort; the dates are ordered like numbers.' },
      { text: 'It returns one row for the whole table', sql: newestLine('DESC'), why: 'Right. One row in total, whatever the number of customers.' },
      { text: 'DESC puts the oldest first', sql: newestLine('ASC'), why: 'The other way round: DESC puts the newest first; ASC is the one that shows the oldest.' },
      { text: 'It needs HAVING', why: 'HAVING filters groups after grouping; it does not pick a top row per group.' },
    ],
  },
  {
    id: 'w29',
    topic: 'TOP and ORDER BY',
    level: 'medium',
    question: 'Many products share the earliest launch_date. What does `SELECT TOP (1) product_name FROM quaera.dim_product ORDER BY launch_date` return?',
    right: 1,
    why: 'TOP (1) returns one row. With ties in the sort key, which of the tied rows comes first is not defined; add a tie-breaker such as product_id.',
    options: [
      { text: 'All the tied products', sql: `SELECT product_name\nFROM quaera.dim_product\nWHERE launch_date = (SELECT MIN(launch_date) FROM quaera.dim_product)\nORDER BY product_name;`, why: 'Only TOP (1) WITH TIES, or a filter on the minimum date as shown, returns all of them.' },
      { text: 'One of the tied products', sql: `SELECT TOP (1) product_name, launch_date\nFROM quaera.dim_product\nORDER BY launch_date;`, why: 'Right. One row, and without a tie-breaker nothing says which.' },
      { text: 'A tie error', why: 'SQL does not complain about ties; it just picks.' },
      { text: 'Nothing: tied rows are skipped', why: 'Rows are never skipped for being equal.' },
    ],
  },
  {
    id: 'w30',
    topic: 'TOP and ORDER BY',
    level: 'medium',
    question: 'You page through sell-out lines, 10 per page, newest first: `ORDER BY week_start DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY`. Why add `sellout_id DESC` as a second sort key?',
    right: 1,
    why: 'Many lines share a week. Without a unique tie-breaker the order inside a week can differ between runs, so a line can appear on two pages or on none.',
    options: [
      { text: 'OFFSET is illegal with one sort key', why: 'One key is fine for the syntax; the problem is stability, not legality.' },
      { text: 'It keeps the pages stable when weeks tie', sql: `SELECT sellout_id, week_start, customer_id\nFROM quaera.fact_sellout\nORDER BY week_start DESC, sellout_id DESC\nOFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;`, why: 'Right. Page 3 is now always the same ten lines.' },
      { text: 'It removes lines with a NULL week', why: 'Sorting never filters.' },
      { text: 'The syntax requires it', why: 'Not required: it is needed for correct paging, not for the query to run.' },
    ],
  },
]

/**
 * Where the right option sits, so that A to D are right about equally often. A letter means nothing, so the right option is
 * moved there and the others keep their order. Questions whose options are an ordered list (numbers) stay as written.
 */
const RIGHT_AT: Record<string, number> = { w8: 0, w9: 0, w11: 0, w16: 0, w21: 0, w25: 0, w22: 1, w28: 2, w13: 3 }

export const WARMUP: WarmQuestion[] = AUTHORED.map((q) => {
  const to = RIGHT_AT[q.id]
  if (to === undefined || to === q.right) return q
  const options = [...q.options]
  const [r] = options.splice(q.right, 1)
  options.splice(to, 0, r)
  return { ...q, options, right: to }
})
