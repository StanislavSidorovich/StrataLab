import type { PracticeSection } from './types'

export const CASE: PracticeSection = {
  id: 'case',
  n: 9,
  title: 'CASE',
  blocks: [
    {
      kind: 'note',
      text: '`CASE WHEN … THEN … ELSE … END` turns a condition into a value, one per row. The first `WHEN` that is true wins, and a row that matches none gets the `ELSE`, or NULL without one.',
      syntax: "CASE WHEN list_price < 100 THEN 'low' WHEN list_price < 300 THEN 'mid' ELSE 'high' END",
      trap: "Put `list_price < 300` before `list_price < 100` and the 'low' branch never runs.",
    },
    {
      kind: 'example',
      id: 'case-line-sizes',
      title: 'Sell-out lines by size',
      sql: `SELECT CASE WHEN units < 10 THEN 'small'
            WHEN units < 50 THEN 'medium'
            ELSE 'large' END AS line_size,
       COUNT(*) AS lines
FROM quaera.fact_sellout
GROUP BY CASE WHEN units < 10 THEN 'small'
              WHEN units < 50 THEN 'medium'
              ELSE 'large' END
ORDER BY lines DESC;`,
    },
    {
      kind: 'task',
      id: 'case-price-tiers',
      title: 'Price tiers',
      question: "Label every product with a price tier by list_price: 'low' below 100, 'mid' from 100 up to but not including 300, 'high' from 300. Show product_name and price_tier.",
      ordered: false,
      hints: ['One CASE column, three outcomes.', 'Test the smallest bound first: the first true WHEN decides.', "CASE WHEN list_price < 100 THEN 'low' WHEN list_price < 300 THEN 'mid' ELSE 'high' END AS price_tier."],
      solution: `SELECT product_name,
       CASE WHEN list_price < 100 THEN 'low'
            WHEN list_price < 300 THEN 'mid'
            ELSE 'high' END AS price_tier
FROM quaera.dim_product;`,
      traps: [
        {
          sql: `SELECT product_name,
       CASE WHEN list_price < 300 THEN 'mid'
            WHEN list_price < 100 THEN 'low'
            ELSE 'high' END AS price_tier
FROM quaera.dim_product;`,
          says: "A product under 100 is also under 300, and the first true WHEN wins, so nothing is ever 'low'. Put the narrowest condition first.",
        },
      ],
    },
    {
      kind: 'note',
      text: 'A `CASE` inside `SUM` makes a conditional total, so one pass gives several columns side by side. Inside `COUNT` it counts every result that is not NULL, so leave the `ELSE` out.',
      syntax: 'SUM(CASE WHEN promo_id IS NOT NULL THEN units ELSE 0 END)',
      trap: '`COUNT(CASE WHEN c THEN 1 ELSE 0 END)` counts every row, because 0 is not NULL.',
    },
    {
      kind: 'example',
      id: 'case-promo-units-by-division',
      title: 'Promoted and regular units by division',
      sql: `SELECT p.division,
       SUM(CASE WHEN s.promo_id IS NOT NULL THEN s.units ELSE 0 END) AS promo_units,
       SUM(CASE WHEN s.promo_id IS NULL THEN s.units ELSE 0 END) AS regular_units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
GROUP BY p.division
ORDER BY p.division;`,
    },
    {
      kind: 'task',
      id: 'case-channel-units-by-brand',
      title: 'Modern trade against the rest, by brand',
      question: "For sell-out in the weeks starting in 2025, how many units did each brand sell in modern trade, and how many in all other channels? Show brand, modern_units and other_units, ordered by brand. Modern trade is a customer with channel 'modern_trade'.",
      ordered: true,
      hints: ['You need the brand (dim_product) and the channel (dim_customer): join both to the sales.', 'Two conditional sums, one for modern_trade and one for everything else.', "SUM(CASE WHEN c.channel = 'modern_trade' THEN s.units ELSE 0 END) AS modern_units, and the same with <> for other_units."],
      solution: `SELECT p.brand,
       SUM(CASE WHEN c.channel = 'modern_trade' THEN s.units ELSE 0 END) AS modern_units,
       SUM(CASE WHEN c.channel <> 'modern_trade' THEN s.units ELSE 0 END) AS other_units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
WHERE s.week_start >= '2025-01-01' AND s.week_start < '2026-01-01'
GROUP BY p.brand
ORDER BY p.brand;`,
    },
    {
      kind: 'task',
      id: 'case-promo-line-share-by-brand',
      title: 'Promotion lines by brand',
      question: 'For sell-out in the weeks starting in 2025, how many lines did each brand have, how many of them carried a promo_id, and what share is that? Show brand, lines, promo_lines and promo_share (between 0 and 1, rounded to 3 decimals), the highest share first, then by brand.',
      ordered: true,
      hints: ['Join the products to get the brand; every sales row is a line.', 'promo_lines counts the lines where promo_id is not NULL: a CASE inside SUM or COUNT.', 'COUNT(CASE WHEN s.promo_id IS NOT NULL THEN 1 END) AS promo_lines, and ROUND(1.0 * … / COUNT(*), 3) for the share.'],
      solution: `SELECT p.brand,
       COUNT(*) AS lines,
       COUNT(CASE WHEN s.promo_id IS NOT NULL THEN 1 END) AS promo_lines,
       ROUND(1.0 * COUNT(CASE WHEN s.promo_id IS NOT NULL THEN 1 END) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE s.week_start >= '2025-01-01' AND s.week_start < '2026-01-01'
GROUP BY p.brand
ORDER BY promo_share DESC, p.brand;`,
      traps: [
        {
          sql: `SELECT p.brand,
       COUNT(*) AS lines,
       COUNT(CASE WHEN s.promo_id IS NOT NULL THEN 1 ELSE 0 END) AS promo_lines,
       ROUND(1.0 * COUNT(CASE WHEN s.promo_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE s.week_start >= '2025-01-01' AND s.week_start < '2026-01-01'
GROUP BY p.brand
ORDER BY promo_share DESC, p.brand;`,
          says: 'With ELSE 0 the CASE is never NULL, so COUNT counts every line and the share is 1. Leave the ELSE out, or use SUM with 1 and 0.',
        },
      ],
    },
  ],
}
