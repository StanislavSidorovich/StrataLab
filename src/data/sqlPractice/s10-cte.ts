import type { PracticeSection } from '../practiceBook'

export const CTE: PracticeSection = {
  id: 'cte',
  n: 10,
  title: 'Subqueries and CTE',
  blocks: [
    {
      kind: 'note',
      text: 'A CTE names a query so the next one can read it like a table: first the totals, then the question about them. A subquery in brackets can stand in for a single value.',
      syntax: 'WITH monthly AS (SELECT …) SELECT … FROM monthly',
      trap: 'A CTE takes no ORDER BY without TOP in T-SQL: sort in the final SELECT.',
    },
    {
      kind: 'example',
      id: 'cte-best-sellin-month',
      title: 'The three biggest months of shipments',
      code: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  GROUP BY month_start
)
SELECT TOP (3) month_start, net_amount
FROM monthly
ORDER BY net_amount DESC;`,
    },
    {
      kind: 'task',
      id: 'cte-months-above-average',
      title: 'Months above the average',
      question: 'In which months was the net amount of shipments above the average month? Show month_start and net_amount, in calendar order.',
      ordered: true,
      hints: ['First the total of each month, in a CTE.', 'The average month is one value: a subquery on that CTE.', 'WHERE net_amount > (SELECT AVG(net_amount) FROM monthly).'],
      solution: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  GROUP BY month_start
)
SELECT month_start, net_amount
FROM monthly
WHERE net_amount > (SELECT AVG(net_amount) FROM monthly)
ORDER BY month_start;`,
    },
    {
      kind: 'note',
      text: 'Two fact tables never join directly: every row of one meets every matching row of the other, and both totals grow. Total each one in its own CTE, then join the totals, which have one row per key.',
    },
    {
      kind: 'example',
      id: 'cte-two-facts-by-division',
      title: 'Shipped and sold by division',
      code: `WITH shipped AS (
  SELECT p.division, SUM(i.units) AS units
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  GROUP BY p.division
),
sold AS (
  SELECT p.division, SUM(s.units) AS units
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  GROUP BY p.division
)
SELECT i.division, i.units AS shipped, s.units AS sold
FROM shipped AS i
JOIN sold AS s ON s.division = i.division
ORDER BY i.division;`,
    },
    {
      kind: 'task',
      id: 'cte-shipped-sold-by-category-2025',
      title: 'Shipped and sold by category in 2025',
      question: 'For each category in 2025: how many units did Kaiyo ship (by order_date), and how many did outlets sell (by week_start)? Show category, shipped and sold, by category name.',
      ordered: true,
      hints: ['Two CTEs, each with its own date filter and GROUP BY category.', "YEAR(i.order_date) = 2025 in one, YEAR(s.week_start) = 2025 in the other.", 'Join the two CTEs on category and ORDER BY it.'],
      solution: `WITH shipped AS (
  SELECT p.category, SUM(i.units) AS units
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  WHERE YEAR(i.order_date) = 2025
  GROUP BY p.category
),
sold AS (
  SELECT p.category, SUM(s.units) AS units
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY p.category
)
SELECT i.category, i.units AS shipped, s.units AS sold
FROM shipped AS i
JOIN sold AS s ON s.category = i.category
ORDER BY i.category;`,
      traps: [
        {
          code: `SELECT p.category, SUM(i.units) AS shipped, SUM(s.units) AS sold
FROM quaera.dim_product AS p
JOIN quaera.fact_sellin AS i ON i.product_id = p.product_id AND YEAR(i.order_date) = 2025
JOIN quaera.fact_sellout AS s ON s.product_id = p.product_id AND YEAR(s.week_start) = 2025
GROUP BY p.category
ORDER BY p.category;`,
          says: 'Both facts are joined in one query, so each shipment met every sale of that product and both totals grew many times over. Total each fact in its own CTE, then join the totals.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'cte-products-falling-h1',
      title: 'Products that fell in the first half',
      question: 'Which products had lower sell-out revenue from January to June 2026 than from January to June 2025? Show product_name, revenue_2025 and revenue_2026, the biggest fall in money first.',
      ordered: true,
      hints: ['One row per product and period: a CTE for each half, or one with SUM(CASE WHEN …).', "Keep dates with week_start >= '2025-01-01' AND week_start < '2025-07-01', and the same for 2026.", 'WHERE revenue_2026 < revenue_2025, ORDER BY revenue_2026 - revenue_2025.'],
      solution: `WITH h1_2025 AS (
  SELECT product_id, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE week_start >= '2025-01-01' AND week_start < '2025-07-01'
  GROUP BY product_id
),
h1_2026 AS (
  SELECT product_id, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE week_start >= '2026-01-01' AND week_start < '2026-07-01'
  GROUP BY product_id
)
SELECT p.product_name, a.revenue AS revenue_2025, b.revenue AS revenue_2026
FROM h1_2025 AS a
JOIN h1_2026 AS b ON b.product_id = a.product_id
JOIN quaera.dim_product AS p ON p.product_id = a.product_id
WHERE b.revenue < a.revenue
ORDER BY b.revenue - a.revenue;`,
    },
  ],
}
