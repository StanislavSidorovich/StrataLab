import type { PracticeSection } from '../practiceBook'

export const WINDOWS: PracticeSection = {
  id: 'windows',
  n: 11,
  title: 'Window functions',
  blocks: [
    {
      kind: 'note',
      text: '`GROUP BY` folds rows into one; `OVER` keeps every row and adds a value computed over others. With an empty `OVER ()` those others are all the rows, so each row can sit next to the overall average or total.',
      syntax: 'AVG(x) OVER ()',
    },
    {
      kind: 'example',
      id: 'win-highest-price-beside',
      title: 'Each product beside the highest price',
      code: `SELECT product_name, list_price, MAX(list_price) OVER () AS highest_price
FROM quaera.dim_product
ORDER BY product_name;`,
    },
    {
      kind: 'task',
      id: 'win-product-price-gap',
      title: 'How far each product is from the average',
      question: 'How far is each product from the average price? Show product_name, list_price and gap, the list_price minus the average list_price of all products, rounded to 1 decimal, by product_name.',
      ordered: true,
      skills: ['window'],
      hints: ['One table, dim_product, and every product stays as a row.', 'The average of all products as a window: AVG(list_price) OVER ().', 'ROUND(list_price - AVG(list_price) OVER (), 1) AS gap.'],
      solution: `SELECT product_name, list_price, ROUND(list_price - AVG(list_price) OVER (), 1) AS gap
FROM quaera.dim_product
ORDER BY product_name;`,
      pg: `SELECT product_name, list_price, ROUND(CAST(list_price - AVG(list_price) OVER () AS numeric), 1) AS gap
FROM quaera.dim_product
ORDER BY product_name;`,
    },
    {
      kind: 'note',
      text: 'After `GROUP BY` the window reads the groups, not the original rows: `SUM(SUM(x)) OVER ()` is the total of all groups. That gives each group its share of the whole.',
      syntax: 'SUM(x) / SUM(SUM(x)) OVER ()',
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
      skills: ['window'],
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
      text: '`PARTITION BY` splits the rows into groups for the window only, so each row is compared with its own group and none is folded. It answers “against the average of its own category”.',
      syntax: 'MAX(x) OVER (PARTITION BY a)',
    },
    {
      kind: 'example',
      id: 'win-brand-top-price',
      title: 'Each product beside its brand’s highest price',
      code: `SELECT product_name, brand, list_price, MAX(list_price) OVER (PARTITION BY brand) AS brand_top_price
FROM quaera.dim_product
ORDER BY brand, product_name;`,
    },
    {
      kind: 'task',
      id: 'win-category-average-price',
      title: 'Each product against its category',
      question: 'For each product show product_name, category, list_price and category_avg, the average list_price of its category rounded to 1 decimal. Order by category, then product_name.',
      ordered: true,
      skills: ['window', 'partition'],
      hints: ['Again dim_product alone, and every product stays as a row.', 'The average of its own category: AVG(list_price) OVER (PARTITION BY category).', 'Wrap it in ROUND(…, 1) AS category_avg and ORDER BY category, product_name.'],
      solution: `SELECT product_name, category, list_price, ROUND(AVG(list_price) OVER (PARTITION BY category), 1) AS category_avg
FROM quaera.dim_product
ORDER BY category, product_name;`,
      pg: `SELECT product_name, category, list_price, ROUND(CAST(AVG(list_price) OVER (PARTITION BY category) AS numeric), 1) AS category_avg
FROM quaera.dim_product
ORDER BY category, product_name;`,
    },
    {
      kind: 'note',
      text: '`ORDER BY` inside `OVER` turns a sum into a running total: each row sees itself and the rows before it. Break ties in that ORDER BY, or equal rows get the same total.',
      syntax: 'SUM(x) OVER (ORDER BY b)',
    },
    {
      kind: 'example',
      id: 'win-products-so-far',
      title: 'Products counted from the cheapest',
      code: `SELECT product_name, list_price, COUNT(*) OVER (ORDER BY list_price, product_name) AS products_so_far
FROM quaera.dim_product
ORDER BY list_price, product_name;`,
    },
    {
      kind: 'task',
      id: 'win-regions-running-population',
      title: 'Regions and a running population',
      question: 'List the regions from the most to the least populated, with a running total of population. Show region_name, population and running_population, the most populated first.',
      ordered: true,
      skills: ['window', 'running'],
      hints: ['dim_region has the population; no join needed.', 'A running total is SUM(…) OVER (ORDER BY …), in the order the list is shown.', 'SUM(population) OVER (ORDER BY population DESC, region_name) AS running_population.'],
      solution: `SELECT region_name, population, SUM(population) OVER (ORDER BY population DESC, region_name) AS running_population
FROM quaera.dim_region
ORDER BY population DESC, region_name;`,
    },
    {
      kind: 'note',
      text: 'Total the months in a CTE first, then run over them. With `PARTITION BY` the running total restarts for each group.',
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
      skills: ['window', 'running'],
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
      kind: 'task',
      id: 'win-sellout-units-by-year',
      title: 'Sell-out units, restarting each year',
      question: 'Sell-out units of each month of 2025 and 2026 (by the month of week_start), with a running total that starts again in January. Show month_start, units and year_to_date, in calendar order.',
      ordered: true,
      skills: ['window', 'partition', 'running'],
      hints: ['Monthly totals in a CTE, as in the 2025 task, but for both years.', 'The total restarts in January: add YEAR(week_start) AS year_no to the CTE, in SELECT and in GROUP BY, and PARTITION BY it.', 'SUM(units) OVER (PARTITION BY year_no ORDER BY month_start) AS year_to_date, with WHERE YEAR(week_start) >= 2025 in the CTE.'],
      solution: `WITH monthly AS (
  SELECT YEAR(week_start) AS year_no, DATETRUNC(month, week_start) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  WHERE YEAR(week_start) >= 2025
  GROUP BY YEAR(week_start), DATETRUNC(month, week_start)
)
SELECT month_start, units, SUM(units) OVER (PARTITION BY year_no ORDER BY month_start) AS year_to_date
FROM monthly
ORDER BY month_start;`,
      pg: `WITH monthly AS (
  SELECT EXTRACT(YEAR FROM week_start) AS year_no, CAST(date_trunc('month', week_start) AS date) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  WHERE EXTRACT(YEAR FROM week_start) >= 2025
  GROUP BY EXTRACT(YEAR FROM week_start), CAST(date_trunc('month', week_start) AS date)
)
SELECT month_start, units, SUM(units) OVER (PARTITION BY year_no ORDER BY month_start) AS year_to_date
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'note',
      text: '`LAG(x, n)` reads the value n rows back in the window order (one row back if n is left out), and gives NULL where there is no such row. It is how a row is compared with the one before it.',
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
      id: 'win-price-against-last-month',
      title: 'A product’s price month by month',
      question: 'How did the list price of product 7 move month by month? Show month_start, list_price and previous_price, the price a month before, in calendar order. Take the prices from fact_price.',
      ordered: true,
      skills: ['window', 'running', 'lag'],
      hints: ['fact_price has one row per product and month; keep product_id = 7.', 'The previous row in month order: LAG(list_price) OVER (ORDER BY month_start).', 'SELECT month_start, list_price, LAG(list_price) OVER (ORDER BY month_start) AS previous_price … WHERE product_id = 7.'],
      solution: `SELECT month_start, list_price, LAG(list_price) OVER (ORDER BY month_start) AS previous_price
FROM quaera.fact_price
WHERE product_id = 7
ORDER BY month_start;`,
    },
    {
      kind: 'task',
      id: 'win-division-month-change',
      title: 'Shipments against the month before, by division',
      question: 'For each division and each month of 2026: the net amount of shipments and the net amount of the month before. Show division, month_start, net_amount and previous_month, by division, then in calendar order.',
      ordered: true,
      skills: ['window', 'partition', 'running', 'lag'],
      hints: ['Totals per division and month in a CTE, through dim_product.', 'Each division needs its own series: LAG(net_amount) OVER (PARTITION BY division ORDER BY month_start), in a second CTE.', 'Keep 2026 only in the final SELECT, or January finds no month before it.'],
      solution: `WITH monthly AS (
  SELECT p.division, i.month_start, SUM(i.net_amount) AS net_amount
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  GROUP BY p.division, i.month_start
),
compared AS (
  SELECT division, month_start, net_amount,
         LAG(net_amount) OVER (PARTITION BY division ORDER BY month_start) AS previous_month
  FROM monthly
)
SELECT division, month_start, net_amount, previous_month
FROM compared
WHERE YEAR(month_start) = 2026
ORDER BY division, month_start;`,
      pg: `WITH monthly AS (
  SELECT p.division, i.month_start, SUM(i.net_amount) AS net_amount
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  GROUP BY p.division, i.month_start
),
compared AS (
  SELECT division, month_start, net_amount,
         LAG(net_amount) OVER (PARTITION BY division ORDER BY month_start) AS previous_month
  FROM monthly
)
SELECT division, month_start, net_amount, previous_month
FROM compared
WHERE EXTRACT(YEAR FROM month_start) = 2026
ORDER BY division, month_start;`,
    },
    {
      kind: 'task',
      id: 'win-yoy-2026',
      title: 'Shipments against the same month last year',
      question: 'For each month of 2026: the net amount of shipments, and the same month a year before. Show month_start, net_amount and last_year, in calendar order.',
      ordered: true,
      skills: ['window', 'running', 'lag'],
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
      kind: 'note',
      text: 'A frame limits the window to nearby rows: `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` is the row and the two before it. Used with AVG it gives a moving average that smooths out single odd months.',
      syntax: 'AVG(x) OVER (ORDER BY b ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)',
    },
    {
      kind: 'example',
      id: 'win-moving-average-shipped',
      title: 'Shipped units, three-month average',
      code: `WITH monthly AS (
  SELECT month_start, SUM(units) AS units
  FROM quaera.fact_sellin
  GROUP BY month_start
)
SELECT month_start, units,
       AVG(1.0 * units) OVER (ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'task',
      id: 'win-sellout-moving-average',
      title: 'Three-month average of sell-out',
      question: 'Sell-out units of each month (by the month of week_start) and their average over that month and the two before it. Show month_start, units and moving_avg, in calendar order.',
      ordered: true,
      skills: ['window', 'running', 'frame'],
      hints: ['Monthly totals of units in a CTE, with DATETRUNC(month, week_start).', 'The frame is the row and the two rows before it.', 'AVG(1.0 * units) OVER (ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg.'],
      solution: `WITH monthly AS (
  SELECT DATETRUNC(month, week_start) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  GROUP BY DATETRUNC(month, week_start)
)
SELECT month_start, units,
       AVG(1.0 * units) OVER (ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg
FROM monthly
ORDER BY month_start;`,
      pg: `WITH monthly AS (
  SELECT CAST(date_trunc('month', week_start) AS date) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  GROUP BY CAST(date_trunc('month', week_start) AS date)
)
SELECT month_start, units,
       AVG(1.0 * units) OVER (ORDER BY month_start ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg
FROM monthly
ORDER BY month_start;`,
    },
    {
      kind: 'task',
      id: 'win-moving-average-division',
      title: 'Three-month average by division',
      question: 'For each division and month: the net amount of shipments and its average over that month and the two before it. Show division, month_start, net_amount and moving_avg, by division, then in calendar order.',
      ordered: true,
      skills: ['window', 'partition', 'running', 'frame'],
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
