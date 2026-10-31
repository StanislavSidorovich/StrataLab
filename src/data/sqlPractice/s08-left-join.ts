import type { PracticeSection } from '../practiceBook'

export const LEFT_JOIN: PracticeSection = {
  id: 'left-join',
  n: 8,
  title: 'LEFT JOIN and repeated rows',
  blocks: [
    {
      kind: 'note',
      text: '`LEFT JOIN` keeps every row of the table on its left; where the right table has no match, its columns are NULL. Use it when “none” is part of the answer. `COUNT(column)` skips NULLs, so nothing matched counts as 0.',
      syntax: 'FROM quaera.dim_rep AS r LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id',
      trap: 'A condition on the right table in WHERE throws away the NULL rows and turns LEFT into INNER. Put it in ON.',
    },
    {
      kind: 'example',
      id: 'left-outlets-per-rep',
      title: 'Outlets per person, managers with none included',
      code: `SELECT r.rep_name, r.role, COUNT(c.customer_id) AS outlets
FROM quaera.dim_rep AS r
LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id
GROUP BY r.rep_name, r.role
ORDER BY outlets, r.rep_name;`,
    },
    {
      kind: 'task',
      id: 'left-regions-reps',
      title: 'Every region with its reps',
      question: 'List every region with the people of dim_rep based there. Show region_name and rep_name; a region with nobody based there still gets a row.',
      ordered: false,
      skills: ['left-join'],
      hints: ['Every region must stay, so it is the table on the left.', 'LEFT JOIN dim_rep on region_id: a region with no rep gets NULL in rep_name.', 'FROM quaera.dim_region AS g LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id.'],
      solution: `SELECT g.region_name, r.rep_name
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id;`,
      traps: [
        {
          code: `SELECT g.region_name, r.rep_name
FROM quaera.dim_region AS g
JOIN quaera.dim_rep AS r ON r.region_id = g.region_id;`,
          says: 'A plain JOIN drops the regions that have no rep, and those are the rows this question is about. Use LEFT JOIN.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'left-reps-per-region',
      title: 'People per region, zeros included',
      question: 'How many people of dim_rep are based in each region? Show region_name and reps, with 0 for a region with nobody, the fewest first, then by region_name.',
      ordered: true,
      skills: ['left-join', 'count', 'group-by', 'order-by'],
      hints: ['Start from dim_region so that every region stays.', 'Count a column of dim_rep, not the rows: a region with no match has one row of NULLs.', 'COUNT(r.rep_id) AS reps, GROUP BY g.region_name, ORDER BY reps, g.region_name.'],
      solution: `SELECT g.region_name, COUNT(r.rep_id) AS reps
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
GROUP BY g.region_name
ORDER BY reps, g.region_name;`,
      traps: [
        {
          code: `SELECT g.region_name, COUNT(*) AS reps
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
GROUP BY g.region_name
ORDER BY reps, g.region_name;`,
          says: 'COUNT(*) counts rows, and a region with nobody still has one row, so it shows 1 instead of 0. Count a column of the right table.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'A condition on the right table goes in `ON`, next to the key, so the left rows survive. In `WHERE` it is applied after the join and removes them.',
      syntax: "LEFT JOIN quaera.dim_customer AS c ON c.region_id = g.region_id AND c.channel = 'ecom'",
    },
    {
      kind: 'example',
      id: 'left-ecom-per-region',
      title: 'Online outlets per region, regions with none included',
      code: `SELECT g.region_name, COUNT(c.customer_id) AS ecom_outlets
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_customer AS c
  ON c.region_id = g.region_id
  AND c.channel = 'ecom'
GROUP BY g.region_name
ORDER BY ecom_outlets DESC, g.region_name;`,
    },
    {
      kind: 'task',
      id: 'left-products-first-week',
      title: 'Every product in the first week',
      question: 'List all products with the units they sold in the week starting 2024-01-01, 0 if none. Show product_name and units, the most units first, then by product_name.',
      ordered: true,
      skills: ['left-join', 'left-on-condition', 'coalesce', 'sum-avg', 'group-by', 'order-by'],
      hints: ['Start from dim_product so that every product stays.', 'The week belongs in ON next to the product key: in WHERE it would remove the products with no sales that week.', "ISNULL(SUM(s.units), 0), and ON s.product_id = p.product_id then AND s.week_start = '2024-01-01' on the next line."],
      solution: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s
  ON s.product_id = p.product_id
  AND s.week_start = '2024-01-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
      pg: `SELECT p.product_name, COALESCE(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s
  ON s.product_id = p.product_id
  AND s.week_start = '2024-01-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
      traps: [
        {
          code: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s ON s.product_id = p.product_id
WHERE s.week_start = '2024-01-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
          says: 'With the week in WHERE, a product with no sales that week has NULL there and is removed, so the list is short. Move the condition into ON.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'left-promo-units-june',
      title: 'Every product under promotion in June',
      question: 'List all products with the units they sold under a promotion in the weeks starting in June 2026, 0 if none. Show product_name and units, the most units first, then by name.',
      ordered: true,
      skills: ['left-join', 'left-on-condition', 'coalesce', 'sum-avg', 'group-by', 'order-by'],
      hints: ['Start from dim_product so that every product stays.', 'The conditions on the sales go in ON, next to the key: in WHERE they would remove the products with no such sales.', "ISNULL(SUM(s.units), 0), and ON s.product_id = p.product_id AND s.promo_id IS NOT NULL AND s.week_start >= '2026-06-01'."],
      solution: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s
  ON s.product_id = p.product_id
  AND s.promo_id IS NOT NULL
  AND s.week_start >= '2026-06-01' AND s.week_start < '2026-07-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
      pg: `SELECT p.product_name, COALESCE(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s
  ON s.product_id = p.product_id
  AND s.promo_id IS NOT NULL
  AND s.week_start >= '2026-06-01' AND s.week_start < '2026-07-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
      traps: [
        {
          code: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s ON s.product_id = p.product_id
WHERE s.promo_id IS NOT NULL
  AND s.week_start >= '2026-06-01' AND s.week_start < '2026-07-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
          says: 'The conditions are in WHERE, so the products with no promotion sales are gone: on their rows promo_id and week_start are NULL. Move the conditions into ON.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'To find rows with no match at all, `LEFT JOIN` and keep the rows where a column of the right table is NULL. This is an anti-join.',
    },
    {
      kind: 'example',
      id: 'left-regions-no-rep',
      title: 'Regions with no rep based there',
      code: `SELECT g.region_name
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
WHERE r.rep_id IS NULL
ORDER BY g.region_name;`,
    },
    {
      kind: 'task',
      id: 'left-reps-no-outlets',
      title: 'People with no outlets',
      question: 'Who in dim_rep has no outlet assigned? Show rep_name, team and role.',
      ordered: false,
      skills: ['left-join', 'no-match'],
      hints: ['Start from dim_rep and LEFT JOIN dim_customer on rep_id.', 'No outlet means the right side is NULL.', 'WHERE c.customer_id IS NULL.'],
      solution: `SELECT r.rep_name, r.team, r.role
FROM quaera.dim_rep AS r
LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id
WHERE c.customer_id IS NULL;`,
    },
    {
      kind: 'task',
      id: 'left-customers-no-sellout',
      title: 'Customers that never sold',
      question: 'Which customers have no row in fact_sellout at all? Show customer_name and channel.',
      ordered: false,
      skills: ['left-join', 'no-match'],
      hints: ['Start from dim_customer and look for the ones with nothing on the right.', 'LEFT JOIN fact_sellout on customer_id, then keep the NULLs.', 'WHERE s.customer_id IS NULL.'],
      solution: `SELECT c.customer_name, c.channel
FROM quaera.dim_customer AS c
LEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id
WHERE s.customer_id IS NULL;`,
    },
    {
      kind: 'task',
      id: 'left-quiet-outlets-last-week',
      title: 'Outlets quiet in the last week',
      question: "Which outlets sold nothing in the week starting 2026-06-29? Show customer_name and channel. Leave out the distributors, whose channel is 'distributor'.",
      ordered: false,
      skills: ['left-join', 'left-on-condition', 'no-match'],
      hints: ['An outlet with no sales that week has no matching row for it.', 'The week goes in ON, so that outlets with other weeks still stay; then keep the rows with nothing on the right.', "ON s.customer_id = c.customer_id, AND s.week_start = '2026-06-29' on the next line, WHERE s.customer_id IS NULL AND c.channel <> 'distributor'."],
      solution: `SELECT c.customer_name, c.channel
FROM quaera.dim_customer AS c
LEFT JOIN quaera.fact_sellout AS s
  ON s.customer_id = c.customer_id
  AND s.week_start = '2026-06-29'
WHERE s.customer_id IS NULL
  AND c.channel <> 'distributor';`,
      traps: [
        {
          code: `SELECT c.customer_name, c.channel
FROM quaera.dim_customer AS c
LEFT JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id
WHERE s.week_start = '2026-06-29'
  AND s.customer_id IS NULL
  AND c.channel <> 'distributor';`,
          says: 'The week is in WHERE, so a row cannot be both in that week and without a match: nothing is returned. The week belongs in ON.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'A join repeats a row once per match. Sales joined to outlets give one row per sale, so an outlet appears thousands of times: sums of the sales stay right, but counting outlets needs `COUNT(DISTINCT …)`.',
      trap: 'If a total is suddenly too big, compare COUNT(*) before and after the join.',
    },
    {
      kind: 'task',
      id: 'left-channel-lines-customers',
      title: 'Lines and customers per channel',
      question: 'For each customer channel: how many sell-out lines are there, and how many different customers sold? Show channel, lines and customers, by channel.',
      ordered: true,
      skills: ['join', 'count', 'count-distinct', 'group-by', 'repeated-rows', 'order-by'],
      hints: ['Each customer appears once per sales row after the join.', 'COUNT(*) counts the lines; the customers need DISTINCT.', 'COUNT(*) AS lines, COUNT(DISTINCT s.customer_id) AS customers, GROUP BY c.channel.'],
      solution: `SELECT c.channel, COUNT(*) AS lines, COUNT(DISTINCT s.customer_id) AS customers
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY c.channel
ORDER BY c.channel;`,
    },
    {
      kind: 'task',
      id: 'left-region-customers-reps',
      title: 'Customers and reps per region',
      question: 'For each region: how many customers and how many people of dim_rep are based there? Show region_name, customers and reps, by region_name. A region with nobody still appears.',
      ordered: true,
      skills: ['left-join', 'count-distinct', 'group-by', 'repeated-rows', 'order-by'],
      hints: ['Two LEFT JOINs from dim_region, one to the customers and one to the reps, both on region_id.', 'Each customer now repeats once per rep of the region, and each rep once per customer.', 'COUNT(DISTINCT c.customer_id) AS customers and COUNT(DISTINCT r.rep_id) AS reps.'],
      solution: `SELECT g.region_name, COUNT(DISTINCT c.customer_id) AS customers, COUNT(DISTINCT r.rep_id) AS reps
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_customer AS c ON c.region_id = g.region_id
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
GROUP BY g.region_name
ORDER BY g.region_name;`,
      traps: [
        {
          code: `SELECT g.region_name, COUNT(c.customer_id) AS customers, COUNT(r.rep_id) AS reps
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_customer AS c ON c.region_id = g.region_id
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
GROUP BY g.region_name
ORDER BY g.region_name;`,
          says: 'The two joins multiply each other: every customer repeats once per rep of the region, so both counts are too big. Use COUNT(DISTINCT …).',
        },
      ],
    },
    {
      kind: 'task',
      id: 'left-outlets-revenue-by-macro',
      title: 'Outlets and revenue by macro-region',
      question: 'For each macro-region: how many different outlets sold something, and their revenue? Show macro_region, outlets and revenue, the highest revenue first.',
      ordered: true,
      skills: ['join', 'join-chain', 'count-distinct', 'sum-avg', 'group-by', 'repeated-rows', 'order-by'],
      hints: ['fact_sellout → dim_customer → dim_region. A plain JOIN will do here: only outlets that sold are asked for.', 'One outlet has many sales rows.', 'COUNT(DISTINCT s.customer_id) AS outlets.'],
      solution: `SELECT r.macro_region, COUNT(DISTINCT s.customer_id) AS outlets, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.macro_region
ORDER BY revenue DESC;`,
      traps: [
        {
          code: `SELECT r.macro_region, COUNT(s.customer_id) AS outlets, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.macro_region
ORDER BY revenue DESC;`,
          says: 'COUNT(customer_id) counted the sales rows, not the outlets: an outlet repeats once per sale. Use COUNT(DISTINCT customer_id).',
        },
      ],
    },
  ],
}
