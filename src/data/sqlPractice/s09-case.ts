import type { PracticeSection } from '../practiceBook'

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
      id: 'case-promo-depth',
      title: 'Promotions by depth of discount',
      code: `SELECT promo_name, discount_pct,
       CASE WHEN discount_pct >= 20 THEN 'deep' ELSE 'shallow' END AS depth
FROM quaera.dim_promo;`,
    },
    {
      kind: 'task',
      id: 'case-premium-flag',
      title: 'Premium or standard',
      question: "Label every product 'premium' when its list_price is 500 or more, and 'standard' otherwise. Show product_name and segment.",
      ordered: false,
      skills: ['case'],
      hints: ['One condition and two outcomes: a CASE with a single WHEN.', 'The ELSE takes every product the WHEN did not.', "CASE WHEN list_price >= 500 THEN 'premium' ELSE 'standard' END AS segment."],
      solution: `SELECT product_name,
       CASE WHEN list_price >= 500 THEN 'premium' ELSE 'standard' END AS segment
FROM quaera.dim_product;`,
    },
    {
      kind: 'example',
      id: 'case-line-sizes',
      title: 'Sell-out lines by size',
      code: `SELECT CASE WHEN units < 10 THEN 'small'
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
      skills: ['case'],
      hints: ['One CASE column, three outcomes.', 'Test the smallest bound first: the first true WHEN decides.', "CASE WHEN list_price < 100 THEN 'low' WHEN list_price < 300 THEN 'mid' ELSE 'high' END AS price_tier."],
      solution: `SELECT product_name,
       CASE WHEN list_price < 100 THEN 'low'
            WHEN list_price < 300 THEN 'mid'
            ELSE 'high' END AS price_tier
FROM quaera.dim_product;`,
      traps: [
        {
          code: `SELECT product_name,
       CASE WHEN list_price < 300 THEN 'mid'
            WHEN list_price < 100 THEN 'low'
            ELSE 'high' END AS price_tier
FROM quaera.dim_product;`,
          says: "A product under 100 is also under 300, and the first true WHEN wins, so nothing is ever 'low'. Put the narrowest condition first.",
        },
      ],
    },
    {
      kind: 'task',
      id: 'case-online-customers',
      title: 'Online and in store',
      question: "How many customers are online (channel 'ecom') and how many are in store (every other channel except 'distributor')? Show customer_group, either 'online' or 'in store', and customers.",
      ordered: false,
      skills: ['case', 'where', 'group-by', 'count'],
      hints: ['The group is a new value made from channel, so the grouping key is a CASE.', 'Leave the distributors out in WHERE, then group by the same CASE you select.', "GROUP BY CASE WHEN channel = 'ecom' THEN 'online' ELSE 'in store' END, with COUNT(*) AS customers."],
      solution: `SELECT CASE WHEN channel = 'ecom' THEN 'online' ELSE 'in store' END AS customer_group,
       COUNT(*) AS customers
FROM quaera.dim_customer
WHERE channel <> 'distributor'
GROUP BY CASE WHEN channel = 'ecom' THEN 'online' ELSE 'in store' END;`,
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
      code: `SELECT p.division,
       SUM(CASE WHEN s.promo_id IS NOT NULL THEN s.units ELSE 0 END) AS promo_units,
       SUM(CASE WHEN s.promo_id IS NULL THEN s.units ELSE 0 END) AS regular_units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
GROUP BY p.division
ORDER BY p.division;`,
    },
    {
      kind: 'task',
      id: 'case-promo-units-2025',
      title: 'Promoted and regular units in 2025',
      question: 'For sell-out in 2025 only (week_start from 2025-01-01 to 2025-12-31), how many units were sold on a promotion and how many without one? Show promo_units and regular_units in one row.',
      ordered: false,
      skills: ['case', 'case-total', 'where'],
      hints: ['One row with two totals, so two conditional sums over the same rows.', 'A line is on a promotion when promo_id is not NULL; keep only the weeks of 2025 in WHERE.', "SUM(CASE WHEN promo_id IS NOT NULL THEN units ELSE 0 END) AS promo_units, and the same with IS NULL for regular_units."],
      solution: `SELECT SUM(CASE WHEN promo_id IS NOT NULL THEN units ELSE 0 END) AS promo_units,
       SUM(CASE WHEN promo_id IS NULL THEN units ELSE 0 END) AS regular_units
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
    },
    {
      kind: 'task',
      id: 'case-channel-units-by-brand',
      title: 'Modern trade against the rest, by brand',
      question: "For sell-out in the 2025 weeks only, how many units did each brand sell in modern trade, and how many in all other channels? Show brand, modern_units and other_units, ordered by brand. Modern trade is a customer with channel 'modern_trade'.",
      ordered: true,
      skills: ['case', 'case-total', 'join', 'join-chain', 'where', 'group-by', 'order-by'],
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
      id: 'case-promo-unit-share-by-division',
      title: 'Promoted share of units by division',
      question: 'For sell-out in the 2025 weeks only, what share of each division’s units was sold on a promotion? Show division and promo_share (between 0 and 1, rounded to 3 decimals), by division.',
      ordered: true,
      skills: ['case', 'case-total', 'join', 'where', 'ratio', 'group-by', 'order-by'],
      hints: ['The division is in dim_product; the promoted units are a conditional sum.', 'Divide the promoted units by all units, with 1.0 * in front so the division is not whole-number.', 'ROUND(1.0 * SUM(CASE WHEN s.promo_id IS NOT NULL THEN s.units ELSE 0 END) / SUM(s.units), 3) AS promo_share.'],
      solution: `SELECT p.division,
       ROUND(1.0 * SUM(CASE WHEN s.promo_id IS NOT NULL THEN s.units ELSE 0 END) / SUM(s.units), 3) AS promo_share
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE s.week_start >= '2025-01-01' AND s.week_start < '2026-01-01'
GROUP BY p.division
ORDER BY p.division;`,
    },
    {
      kind: 'task',
      id: 'case-promo-line-share-by-brand',
      title: 'Promotion lines by brand',
      question: 'For sell-out in the 2025 weeks only, how many lines did each brand have, how many of them carried a promo_id, and what share is that? Show brand, lines, promo_lines and promo_share (between 0 and 1, rounded to 3 decimals), the highest share first, then by brand.',
      ordered: true,
      skills: ['case', 'case-total', 'join', 'where', 'group-by', 'count', 'ratio', 'order-by'],
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
          code: `SELECT p.brand,
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
