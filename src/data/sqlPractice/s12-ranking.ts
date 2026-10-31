import type { PracticeSection } from '../practiceBook'

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
      code: `SELECT brand,
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
      id: 'rank-products-by-price',
      title: 'Products by price',
      question: 'Rank the products by list_price, the dearest first: products with the same price share a place, and the next place follows with no gap. Show product_name, list_price and price_place, by place, then by product_name.',
      ordered: true,
      skills: ['dense-rank'],
      hints: ['One table, dim_product; every product stays as a row.', 'Same place, no gap: which of the three functions is it?', 'DENSE_RANK() OVER (ORDER BY list_price DESC) AS price_place.'],
      solution: `SELECT product_name, list_price, DENSE_RANK() OVER (ORDER BY list_price DESC) AS price_place
FROM quaera.dim_product
ORDER BY price_place, product_name;`,
    },
    {
      kind: 'task',
      id: 'rank-regions-by-outlets',
      title: 'Regions by number of customers',
      question: 'Rank the regions by their number of customers in dim_customer: regions with the same number share a place, and the next place follows with no gap. Show region_name, customers and place, from the first place, then by name.',
      ordered: true,
      skills: ['dense-rank'],
      hints: ['dim_region joined to dim_customer, GROUP BY the region’s name.', 'Same place, no gap: which of the three functions is it?', 'DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS place.'],
      solution: `SELECT r.region_name, COUNT(*) AS customers, DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS place
FROM quaera.dim_region AS r
JOIN quaera.dim_customer AS c ON c.region_id = r.region_id
GROUP BY r.region_name
ORDER BY place, r.region_name;`,
      traps: [
        {
          code: `SELECT r.region_name, COUNT(*) AS customers, RANK() OVER (ORDER BY COUNT(*) DESC) AS place
FROM quaera.dim_region AS r
JOIN quaera.dim_customer AS c ON c.region_id = r.region_id
GROUP BY r.region_name
ORDER BY place, r.region_name;`,
          says: 'RANK leaves a gap after a tie (1, 1, 3). The question asks for no gap: DENSE_RANK.',
        },
        {
          code: `SELECT r.region_name, COUNT(*) AS customers, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, r.region_name) AS place
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
      code: `WITH numbered AS (
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
      id: 'rank-cheapest-two-per-category',
      title: 'The two cheapest of each category',
      question: 'Which 2 products are the cheapest in each category? Break equal prices by product_name. Show category, product_name and list_price, by category, then cheapest first, then by product_name.',
      ordered: true,
      skills: ['row-number'],
      hints: ['One table, dim_product, and a number inside each category.', 'ROW_NUMBER() OVER (PARTITION BY category ORDER BY list_price, product_name) AS n, in a CTE.', 'Outside the CTE: WHERE n <= 2, ORDER BY category, list_price, product_name.'],
      solution: `WITH numbered AS (
  SELECT category, product_name, list_price,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY list_price, product_name) AS n
  FROM quaera.dim_product
)
SELECT category, product_name, list_price
FROM numbered
WHERE n <= 2
ORDER BY category, list_price, product_name;`,
    },
    {
      kind: 'task',
      id: 'rank-top-outlets-per-channel',
      title: 'Top 3 outlets of each channel',
      question: 'Which 3 outlets of each channel had the highest sell-out revenue in 2025? Show channel, customer_name and revenue, by channel, the highest first within it.',
      ordered: true,
      skills: ['row-number', 'partition'],
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
      pg: `WITH numbered AS (
  SELECT c.channel, c.customer_name, SUM(s.revenue) AS revenue,
         ROW_NUMBER() OVER (PARTITION BY c.channel ORDER BY SUM(s.revenue) DESC) AS n
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
  WHERE EXTRACT(YEAR FROM s.week_start) = 2025
  GROUP BY c.channel, c.customer_id, c.customer_name
)
SELECT channel, customer_name, revenue
FROM numbered
WHERE n <= 3
ORDER BY channel, revenue DESC;`,
      traps: [
        {
          code: `WITH numbered AS (
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
      kind: 'task',
      id: 'rank-best-product-per-brand-2025',
      title: 'Each brand’s best product and its place overall',
      question: 'For each brand, which product had the highest sell-out revenue in 2025, and what place does it hold among all products? Equal revenue shares a place with no gap. Show brand, product_name, revenue and overall_place, by overall_place, then brand.',
      ordered: true,
      skills: ['row-number', 'dense-rank', 'partition', 'two-ctes'],
      hints: ['First the 2025 revenue of each product with its brand, in a CTE.', 'In a second CTE two windows: ROW_NUMBER() inside the brand, and DENSE_RANK() over all products.', 'Keep WHERE n = 1 outside, ORDER BY overall_place, brand.'],
      solution: `WITH by_product AS (
  SELECT p.brand, p.product_id, p.product_name, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY p.brand, p.product_id, p.product_name
),
placed AS (
  SELECT brand, product_name, revenue,
         ROW_NUMBER() OVER (PARTITION BY brand ORDER BY revenue DESC, product_name) AS n,
         DENSE_RANK() OVER (ORDER BY revenue DESC) AS overall_place
  FROM by_product
)
SELECT brand, product_name, revenue, overall_place
FROM placed
WHERE n = 1
ORDER BY overall_place, brand;`,
      pg: `WITH by_product AS (
  SELECT p.brand, p.product_id, p.product_name, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_product AS p ON p.product_id = s.product_id
  WHERE EXTRACT(YEAR FROM s.week_start) = 2025
  GROUP BY p.brand, p.product_id, p.product_name
),
placed AS (
  SELECT brand, product_name, revenue,
         ROW_NUMBER() OVER (PARTITION BY brand ORDER BY revenue DESC, product_name) AS n,
         DENSE_RANK() OVER (ORDER BY revenue DESC) AS overall_place
  FROM by_product
)
SELECT brand, product_name, revenue, overall_place
FROM placed
WHERE n = 1
ORDER BY overall_place, brand;`,
    },
    {
      kind: 'note',
      text: '`NTILE(4)` deals the rows into 4 groups of nearly equal size, in the order you give, so it is the tool for quartiles. Break ties in that order, or equal rows may land in different groups.',
      syntax: 'NTILE(4) OVER (ORDER BY x DESC)',
    },
    {
      kind: 'example',
      id: 'rank-regions-in-halves',
      title: 'Regions in two halves by population',
      code: `SELECT region_name, population, NTILE(2) OVER (ORDER BY population DESC, region_name) AS half
FROM quaera.dim_region
ORDER BY population DESC, region_name;`,
    },
    {
      kind: 'task',
      id: 'rank-products-in-price-groups',
      title: 'Products in four price groups',
      question: 'Deal the products into 4 groups of nearly equal size by list_price, group 1 the dearest; break equal prices by product_name. Show product_name, list_price and price_group, by group, then dearest first, then by product_name.',
      ordered: true,
      skills: ['ntile'],
      hints: ['One table, dim_product; every product stays as a row.', 'NTILE(4) over the order by price from the highest, with product_name as the tie-break.', 'NTILE(4) OVER (ORDER BY list_price DESC, product_name) AS price_group.'],
      solution: `SELECT product_name, list_price, NTILE(4) OVER (ORDER BY list_price DESC, product_name) AS price_group
FROM quaera.dim_product
ORDER BY price_group, list_price DESC, product_name;`,
    },
    {
      kind: 'task',
      id: 'rank-outlet-quartiles',
      title: 'Outlets in four equal groups',
      question: 'Split the outlets that sold something in 2025 into 4 equal groups by their 2025 sell-out revenue, group 1 the highest. For each group show quartile, outlets and revenue, from group 1 up.',
      ordered: true,
      skills: ['ntile', 'two-ctes', 'group-by'],
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
      pg: `WITH outlets AS (
  SELECT customer_id, SUM(revenue) AS revenue
  FROM quaera.fact_sellout
  WHERE EXTRACT(YEAR FROM week_start) = 2025
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
