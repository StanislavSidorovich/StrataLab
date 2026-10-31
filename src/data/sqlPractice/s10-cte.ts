import type { PracticeSection } from '../practiceBook'

export const CTE: PracticeSection = {
  id: 'cte',
  n: 10,
  title: 'Subqueries and CTE',
  blocks: [
    {
      kind: 'note',
      text: 'A subquery is a SELECT in brackets that gives one value, or a list for IN, so a condition can use a result instead of a number you typed. It is the tool for questions such as “above the average”.',
      syntax: 'WHERE x > (SELECT AVG(x) FROM t)',
    },
    {
      kind: 'example',
      id: 'cte-large-shipment-lines',
      title: 'The five biggest shipment lines above the average',
      code: `SELECT TOP (5) order_date, distributor_id, product_id, units
FROM quaera.fact_sellin
WHERE units > (SELECT AVG(1.0 * units) FROM quaera.fact_sellin)
ORDER BY units DESC, order_date, distributor_id, product_id;`,
    },
    {
      kind: 'task',
      id: 'cte-products-below-average-price',
      title: 'Products cheaper than the average',
      question: 'Which products have a list_price below the average list_price of all products? Show product_name and list_price, the cheapest first, then by product_name.',
      ordered: true,
      skills: ['subquery'],
      hints: ['One table, dim_product, used twice: once for the rows, once for the average.', 'The average is a single value: put (SELECT AVG(list_price) FROM …) in the WHERE.', 'WHERE list_price < (SELECT AVG(list_price) FROM quaera.dim_product), then ORDER BY list_price, product_name.'],
      solution: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE list_price < (SELECT AVG(list_price) FROM quaera.dim_product)
ORDER BY list_price, product_name;`,
    },
    {
      kind: 'task',
      id: 'cte-pharmacies-in-top-tier',
      title: 'Pharmacies in tier 1 regions',
      question: "Which pharmacy outlets (channel = 'pharmacy') are in a region of tier 1? Show customer_name and city.",
      ordered: false,
      skills: ['subquery'],
      hints: ['The tier lives in dim_region, the channel in dim_customer.', 'First the list of tier 1 region_id values, as a subquery after IN.', "WHERE channel = 'pharmacy' AND region_id IN (SELECT region_id FROM quaera.dim_region WHERE tier = 1)."],
      solution: `SELECT customer_name, city
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND region_id IN (SELECT region_id FROM quaera.dim_region WHERE tier = 1);`,
    },
    {
      kind: 'note',
      text: 'A CTE names a query so the next one can read it like a table: first the totals, then the question about them. It is how you ask about a number that only exists after a GROUP BY.',
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
      id: 'cte-brands-by-product-count',
      title: 'Brands by size of range',
      question: 'How many brands have 1 product, how many have 2, and so on? Show products (the number of products a brand has) and brands (how many brands have that number), by products.',
      ordered: true,
      skills: ['cte', 'subquery'],
      hints: ['It is a count of counts: first the products of each brand.', 'A CTE with brand and COUNT(*) AS products, GROUP BY brand.', 'Then SELECT products, COUNT(*) AS brands FROM that CTE GROUP BY products ORDER BY products.'],
      solution: `WITH per_brand AS (
  SELECT brand, COUNT(*) AS products
  FROM quaera.dim_product
  GROUP BY brand
)
SELECT products, COUNT(*) AS brands
FROM per_brand
GROUP BY products
ORDER BY products;`,
    },
    {
      kind: 'task',
      id: 'cte-months-above-average',
      title: 'Months above the average',
      question: 'In which months was the net amount of shipments above the average month? Show month_start and net_amount, in calendar order.',
      ordered: true,
      skills: ['cte', 'subquery'],
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
      kind: 'task',
      id: 'cte-brands-above-average-2025',
      title: 'Brands above the average brand',
      question: 'Which brands had sell-out revenue in 2025 above the average brand? Show brand and revenue, the highest first.',
      ordered: true,
      skills: ['cte', 'subquery'],
      hints: ['Revenue is on fact_sellout, the brand on dim_product: join them, keep 2025, total per brand in a CTE.', 'The average brand is the average of the CTE’s revenue column.', 'WHERE revenue > (SELECT AVG(revenue) FROM by_brand), ORDER BY revenue DESC.'],
      solution: `WITH by_brand AS (
  SELECT p.brand, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY p.brand
)
SELECT brand, revenue
FROM by_brand
WHERE revenue > (SELECT AVG(revenue) FROM by_brand)
ORDER BY revenue DESC;`,
      pg: `WITH by_brand AS (
  SELECT p.brand, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE EXTRACT(YEAR FROM s.week_start) = 2025
  GROUP BY p.brand
)
SELECT brand, revenue
FROM by_brand
WHERE revenue > (SELECT AVG(revenue) FROM by_brand)
ORDER BY revenue DESC;`,
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
      id: 'cte-outlets-reps-by-region',
      title: 'Outlets and reps by region',
      question: "For each region that has both outlets (customers whose channel is not 'distributor') and reps (dim_rep rows with role = 'rep'), how many of each? Show region_name, outlets and reps, by region_name.",
      ordered: true,
      skills: ['two-ctes', 'cte', 'subquery'],
      hints: ['Two tables, dim_customer and dim_rep, each with a region_id: count each in its own CTE.', 'One CTE counts outlets per region_id, the other counts reps per region_id.', 'JOIN dim_region to both CTEs on region_id and ORDER BY region_name.'],
      solution: `WITH outlet_counts AS (
  SELECT region_id, COUNT(*) AS outlets
  FROM quaera.dim_customer
  WHERE channel <> 'distributor'
  GROUP BY region_id
),
rep_counts AS (
  SELECT region_id, COUNT(*) AS reps
  FROM quaera.dim_rep
  WHERE role = 'rep'
  GROUP BY region_id
)
SELECT r.region_name, o.outlets, p.reps
FROM quaera.dim_region AS r
JOIN outlet_counts AS o ON o.region_id = r.region_id
JOIN rep_counts AS p ON p.region_id = r.region_id
ORDER BY r.region_name;`,
    },
    {
      kind: 'task',
      id: 'cte-shipped-sold-by-category-2025',
      title: 'Shipped and sold by category in 2025',
      question: 'For each category in 2025: how many units did Kaiyo ship (by order_date), and how many did outlets sell (by week_start)? Show category, shipped and sold, by category name.',
      ordered: true,
      skills: ['two-ctes', 'cte', 'subquery'],
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
      pg: `WITH shipped AS (
  SELECT p.category, SUM(i.units) AS units
  FROM quaera.fact_sellin AS i
  JOIN quaera.dim_product AS p ON p.product_id = i.product_id
  WHERE EXTRACT(YEAR FROM i.order_date) = 2025
  GROUP BY p.category
),
sold AS (
  SELECT p.category, SUM(s.units) AS units
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE EXTRACT(YEAR FROM s.week_start) = 2025
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
      skills: ['two-ctes', 'cte', 'subquery'],
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
