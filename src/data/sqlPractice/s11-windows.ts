import type { PracticeSection } from '../practiceBook'

export const WINDOWS: PracticeSection = {
  id: 'windows',
  n: 11,
  title: 'Window functions',
  blocks: [
    {
      kind: 'note',
      text: '`GROUP BY` folds rows into one; `OVER` keeps every row and adds a value computed over others. With an empty `OVER ()` that is all the rows, which gives each row its share of the total.',
      syntax: 'SUM(x) OVER (PARTITION BY a ORDER BY b)',
    },
    {
      kind: 'example',
      id: 'win-channel-share',
      title: 'Each channel’s share of sell-out revenue',
      code: `SELECT c.channel,
       SUM(s.revenue) AS revenue,
       ROUND(100.0 * SUM(s.revenue) / SUM(SUM(s.revenue)) OVER (), 1) AS share_pct
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY c.channel
ORDER BY revenue DESC;`,
    },
    {
      kind: 'task',
      id: 'win-brand-share-sellin',
      title: 'Each brand’s share of shipments',
      question: 'What share of the whole net amount of shipments did each brand take? Show brand, net_amount and share_pct rounded to 1 decimal, the highest first.',
      ordered: true,
      hints: ['fact_sellin joined to dim_product, GROUP BY brand.', 'The whole is the sum of the groups’ sums: SUM(SUM(i.net_amount)) OVER ().', 'ROUND(100.0 * SUM(i.net_amount) / SUM(SUM(i.net_amount)) OVER (), 1).'],
      solution: `SELECT p.brand,
       SUM(i.net_amount) AS net_amount,
       ROUND(100.0 * SUM(i.net_amount) / SUM(SUM(i.net_amount)) OVER (), 1) AS share_pct
FROM quaera.fact_sellin AS i
JOIN quaera.dim_product AS p ON p.product_id = i.product_id
GROUP BY p.brand
ORDER BY net_amount DESC;`,
      pg: `SELECT p.brand,
       SUM(i.net_amount) AS net_amount,
       ROUND(CAST(100.0 * SUM(i.net_amount) / SUM(SUM(i.net_amount)) OVER () AS numeric), 1) AS share_pct
FROM quaera.fact_sellin AS i
JOIN quaera.dim_product AS p ON p.product_id = i.product_id
GROUP BY p.brand
ORDER BY net_amount DESC;`,
    },
    {
      kind: 'note',
      text: '`ORDER BY` inside `OVER` turns a sum into a running total, and `PARTITION BY` restarts it for each group. Total the months in a CTE first, then run over them.',
    },
    {
      kind: 'example',
      id: 'win-running-by-year',
      title: 'Shipments by month, running within each year',
      code: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  GROUP BY month_start
)
SELECT month_start,
       net_amount,
       SUM(net_amount) OVER (PARTITION BY YEAR(month_start) ORDER BY month_start) AS year_to_date
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'task',
      id: 'win-sellout-running-2025',
      title: 'Sell-out running through 2025',
      question: 'Sell-out revenue of each month of 2025 (by the month of week_start), with a running total through the year. Show month_start, revenue and running_total, in calendar order.',
      ordered: true,
      hints: ['A CTE with DATETRUNC(month, week_start) in SELECT and in GROUP BY.', 'Keep 2025 with WHERE YEAR(week_start) = 2025.', 'SUM(revenue) OVER (ORDER BY month_start) AS running_total.'],
      solution: `WITH monthly AS (
  SELECT DATETRUNC(month, week_start) AS month_start, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE YEAR(week_start) = 2025
  GROUP BY DATETRUNC(month, week_start)
)
SELECT month_start, revenue, SUM(revenue) OVER (ORDER BY month_start) AS running_total
FROM monthly
ORDER BY month_start;`,
      pg: `WITH monthly AS (
  SELECT CAST(date_trunc('month', week_start) AS date) AS month_start, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE EXTRACT(YEAR FROM week_start) = 2025
  GROUP BY CAST(date_trunc('month', week_start) AS date)
)
SELECT month_start, revenue, SUM(revenue) OVER (ORDER BY month_start) AS running_total
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'note',
      text: '`LAG(x, n)` reads the value n rows back, and a frame like `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` limits a sum or an average to the last rows.',
      trap: 'A window sees only the rows left after WHERE: to compare with last year, filter outside the CTE that holds the LAG.',
    },
    {
      kind: 'example',
      id: 'win-lag-previous-month',
      title: 'Shipped units against the month before',
      code: `WITH monthly AS (
  SELECT month_start, SUM(units) AS units
  FROM quaera.fact_sellin
  GROUP BY month_start
)
SELECT month_start, units, LAG(units) OVER (ORDER BY month_start) AS previous_month
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'task',
      id: 'win-yoy-2026',
      title: 'Shipments against the same month last year',
      question: 'For each month of 2026: the net amount of shipments, and the same month a year before. Show month_start, net_amount and last_year, in calendar order.',
      ordered: true,
      hints: ['Monthly totals in a CTE, over all the years.', 'A year back is 12 rows back: LAG(net_amount, 12) OVER (ORDER BY month_start), in a second CTE.', 'Keep 2026 only in the final SELECT, or LAG finds nothing to read.'],
      solution: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  GROUP BY month_start
),
compared AS (
  SELECT month_start, net_amount, LAG(net_amount, 12) OVER (ORDER BY month_start) AS last_year
  FROM monthly
)
SELECT month_start, net_amount, last_year
FROM compared
WHERE YEAR(month_start) = 2026
ORDER BY month_start;`,
      pg: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  GROUP BY month_start
),
compared AS (
  SELECT month_start, net_amount, LAG(net_amount, 12) OVER (ORDER BY month_start) AS last_year
  FROM monthly
)
SELECT month_start, net_amount, last_year
FROM compared
WHERE EXTRACT(YEAR FROM month_start) = 2026
ORDER BY month_start;`,
      traps: [
        {
          code: `WITH monthly AS (
  SELECT month_start, SUM(net_amount) AS net_amount
  FROM quaera.fact_sellin
  WHERE YEAR(month_start) = 2026
  GROUP BY month_start
)
SELECT month_start, net_amount, LAG(net_amount, 12) OVER (ORDER BY month_start) AS last_year
FROM monthly
ORDER BY month_start;`,
          says: 'The filter to 2026 runs before the window, so LAG has no 2025 rows to read and last_year is NULL. Filter after the LAG, in the final SELECT.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'win-moving-average-division',
      title: 'Three-month average by division',
      question: 'For each division and month: the net amount of shipments and its average over that month and the two before it. Show division, month_start, net_amount and moving_avg, by division, then in calendar order.',
      ordered: true,
      hints: ['Totals per division and month in a CTE, through dim_product.', 'Each division needs its own series: PARTITION BY division.', 'AVG(net_amount) OVER (PARTITION BY division ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW).'],
      solution: `WITH monthly AS (
  SELECT p.division, i.month_start, SUM(i.net_amount) AS net_amount
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  GROUP BY p.division, i.month_start
)
SELECT division, month_start, net_amount,
       AVG(net_amount) OVER (PARTITION BY division ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg
FROM monthly
ORDER BY division, month_start;`,
      traps: [
        {
          code: `WITH monthly AS (
  SELECT p.division, i.month_start, SUM(i.net_amount) AS net_amount
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  GROUP BY p.division, i.month_start
)
SELECT division, month_start, net_amount,
       AVG(net_amount) OVER (ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg
FROM monthly
ORDER BY division, month_start;`,
          says: 'Without PARTITION BY the frame runs across both divisions, so FMCG and Pharma are averaged together. Add PARTITION BY division.',
        },
      ],
    },
  ],
}
