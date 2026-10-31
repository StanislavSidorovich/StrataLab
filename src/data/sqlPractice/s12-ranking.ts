import type { PracticeSection } from './types'

export const RANKING: PracticeSection = {
  id: 'ranking',
  n: 12,
  title: 'Ranking',
  blocks: [
    {
      kind: 'note',
      text: 'On a tie, `ROW_NUMBER` still gives different numbers, `RANK` gives the same and then skips (1, 1, 3), and `DENSE_RANK` gives the same without skipping (1, 1, 2).',
      syntax: 'DENSE_RANK() OVER (ORDER BY x DESC)',
    },
    {
      kind: 'example',
      id: 'rank-three-ways',
      title: 'Brands by number of products, three ways',
      sql: `SELECT brand,
       COUNT(*) AS products,
       ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, brand) AS row_no,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_no,
       DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS dense_no
FROM quaera.dim_product
GROUP BY brand
ORDER BY products DESC, brand;`,
    },
    {
      kind: 'task',
      id: 'rank-regions-by-outlets',
      title: 'Regions by number of customers',
      question: 'Rank the regions by their number of customers in dim_customer: regions with the same number share a place, and the next place follows with no gap. Show region_name, customers and place, from the first place, then by name.',
      ordered: true,
      hints: ['dim_region joined to dim_customer, GROUP BY the region’s name.', 'Same place, no gap: which of the three functions is it?', 'DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS place.'],
      solution: `SELECT r.region_name, COUNT(*) AS customers, DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS place
FROM quaera.dim_region AS r
JOIN quaera.dim_customer AS c ON c.region_id = r.region_id
GROUP BY r.region_name
ORDER BY place, r.region_name;`,
      traps: [
        {
          sql: `SELECT r.region_name, COUNT(*) AS customers, RANK() OVER (ORDER BY COUNT(*) DESC) AS place
FROM quaera.dim_region AS r
JOIN quaera.dim_customer AS c ON c.region_id = r.region_id
GROUP BY r.region_name
ORDER BY place, r.region_name;`,
          says: 'RANK leaves a gap after a tie (1, 1, 3). The question asks for no gap: DENSE_RANK.',
        },
        {
          sql: `SELECT r.region_name, COUNT(*) AS customers, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, r.region_name) AS place
FROM quaera.dim_region AS r
JOIN quaera.dim_customer AS c ON c.region_id = r.region_id
GROUP BY r.region_name
ORDER BY place, r.region_name;`,
          says: 'ROW_NUMBER gives regions with the same number different places. The question asks them to share one: DENSE_RANK.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'WHERE cannot read a window function, so the top N of each group takes two steps: number the rows in a CTE with `PARTITION BY`, then keep the small numbers outside it.',
      syntax: 'WITH r AS (SELECT …, ROW_NUMBER() OVER (PARTITION BY a ORDER BY x DESC) AS n …) SELECT … FROM r WHERE n <= 3',
    },
    {
      kind: 'example',
      id: 'rank-dearest-per-category',
      title: 'The dearest product of each category',
      sql: `WITH numbered AS (
  SELECT category, product_name, list_price,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY list_price DESC, product_name) AS n
  FROM quaera.dim_product
)
SELECT category, product_name, list_price
FROM numbered
WHERE n = 1
ORDER BY category;`,
    },
    {
      kind: 'task',
      id: 'rank-top-outlets-per-channel',
      title: 'Top 3 outlets of each channel',
      question: 'Which 3 outlets of each channel had the highest sell-out revenue in 2025? Show channel, customer_name and revenue, by channel, the highest first within it.',
      ordered: true,
      hints: ['First the 2025 revenue of each outlet, with its channel.', 'Number them inside a channel: PARTITION BY channel ORDER BY the revenue DESC.', 'WHERE n <= 3 outside the CTE. Group by customer_id too: outlets can share a name.'],
      solution: `WITH numbered AS (
  SELECT c.channel, c.customer_name, SUM(s.revenue) AS revenue,
         ROW_NUMBER() OVER (PARTITION BY c.channel ORDER BY SUM(s.revenue) DESC) AS n
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY c.channel, c.customer_id, c.customer_name
)
SELECT channel, customer_name, revenue
FROM numbered
WHERE n <= 3
ORDER BY channel, revenue DESC;`,
      traps: [
        {
          sql: `WITH numbered AS (
  SELECT c.channel, c.customer_name, SUM(s.revenue) AS revenue,
         ROW_NUMBER() OVER (ORDER BY SUM(s.revenue) DESC) AS n
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY c.channel, c.customer_id, c.customer_name
)
SELECT channel, customer_name, revenue
FROM numbered
WHERE n <= 3
ORDER BY channel, revenue DESC;`,
          says: 'Without PARTITION BY these are the top 3 outlets overall, not of each channel.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`NTILE(4)` deals the rows into 4 groups of nearly equal size, in the order you give. Number them in a CTE, then total each group.',
    },
    {
      kind: 'task',
      id: 'rank-outlet-quartiles',
      title: 'Outlets in four equal groups',
      question: 'Split the outlets that sold something in 2025 into 4 equal groups by their 2025 sell-out revenue, group 1 the highest. For each group show quartile, outlets and revenue, from group 1 up.',
      ordered: true,
      hints: ['First one row per outlet with its 2025 revenue, in a CTE.', 'NTILE(4) OVER (ORDER BY revenue DESC) AS quartile, in a second step.', 'Then GROUP BY quartile with COUNT(*) and SUM(revenue).'],
      solution: `WITH outlets AS (
  SELECT customer_id, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE YEAR(week_start) = 2025
  GROUP BY customer_id
),
grouped AS (
  SELECT revenue, NTILE(4) OVER (ORDER BY revenue DESC) AS quartile
  FROM outlets
)
SELECT quartile, COUNT(*) AS outlets, SUM(revenue) AS revenue
FROM grouped
GROUP BY quartile
ORDER BY quartile;`,
    },
  ],
}
