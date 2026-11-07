import type { PracticeSection } from '../practiceBook'

export const GROUP_BY: PracticeSection = {
  id: 'group-by',
  n: 5,
  title: 'GROUP BY and HAVING',
  blocks: [
    {
      kind: 'note',
      text: '`GROUP BY` splits the rows into groups and gives one row per group, so a total becomes a total for each brand, channel or month. List several columns for one row per combination. Every other column in SELECT must sit inside an aggregate such as `COUNT` or `SUM`.',
      syntax: 'SELECT brand, COUNT(*) FROM quaera.dim_product GROUP BY brand',
    },
    {
      kind: 'example',
      id: 'group-by-products-per-brand',
      title: 'Products per brand',
      code: `SELECT brand, COUNT(*) AS products
FROM quaera.dim_product
GROUP BY brand
ORDER BY brand;`,
    },
    {
      kind: 'task',
      id: 'group-by-channel-customers',
      title: 'Customers per channel',
      question: 'How many customers are in each channel? Show channel and customers, by channel.',
      ordered: true,
      skills: ['group-by'],
      hints: ['One row per channel, so channel is what you group by.', 'COUNT(*) counts the customers in each group.', 'SELECT channel, COUNT(*) AS customers FROM quaera.dim_customer GROUP BY channel ORDER BY channel;'],
      solution: `SELECT channel, COUNT(*) AS customers
FROM quaera.dim_customer
GROUP BY channel
ORDER BY channel;`,
    },
    {
      kind: 'task',
      id: 'group-by-distributor-net-2025',
      title: 'Net sales per distributor in 2025',
      question: 'For sell-in shipments ordered in 2025, what was the total net_amount of each distributor? Show distributor_id and net_amount, the largest first, then by distributor_id.',
      ordered: true,
      skills: ['group-by'],
      hints: ['One row per distributor_id; the year is a condition on order_date.', 'WHERE keeps the 2025 shipments, GROUP BY distributor_id sums them per distributor.', "SELECT distributor_id, SUM(net_amount) AS net_amount … WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01' GROUP BY distributor_id ORDER BY net_amount DESC, distributor_id."],
      solution: `SELECT distributor_id, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
GROUP BY distributor_id
ORDER BY net_amount DESC, distributor_id;`,
    },
    {
      kind: 'task',
      id: 'group-by-chain-outlets',
      title: 'Outlets per chain',
      question: 'How many outlets does each chain have in each channel? Skip customers with no chain. Show channel, chain_name and outlets, by channel, then chain_name.',
      ordered: true,
      skills: ['group-by'],
      hints: ['Chains are in dim_customer; customers with no chain have a NULL chain_name.', 'Group by two columns, channel and chain_name.', 'WHERE chain_name IS NOT NULL GROUP BY channel, chain_name ORDER BY channel, chain_name.'],
      solution: `SELECT channel, chain_name, COUNT(*) AS outlets
FROM quaera.dim_customer
WHERE chain_name IS NOT NULL
GROUP BY channel, chain_name
ORDER BY channel, chain_name;`,
    },
    {
      kind: 'note',
      text: 'You can group by an expression, not only a column, when the group is a part of a value or a label made from it. On Fabric `GROUP BY` repeats the whole expression; only `ORDER BY` may use a name from SELECT.',
      syntax: 'SELECT LEFT(sku_code, 4), COUNT(*) FROM quaera.dim_product GROUP BY LEFT(sku_code, 4)',
    },
    {
      kind: 'example',
      id: 'group-by-skus-per-code',
      title: 'Products per brand code',
      code: `SELECT LEFT(sku_code, 4) AS brand_code, COUNT(*) AS products
FROM quaera.dim_product
GROUP BY LEFT(sku_code, 4)
ORDER BY brand_code;`,
    },
    {
      kind: 'task',
      id: 'group-by-chain-or-independent',
      title: 'Chains and independents',
      question: "How many customers are in each chain, with all customers that have no chain counted together as 'Independent'? Show chain and customers, the most customers first, then by chain.",
      ordered: true,
      skills: ['group-by', 'group-expression'],
      hints: ['The label comes from chain_name, with a word in place of NULL.', "COALESCE(chain_name, 'Independent') is the label; group by that very expression.", "SELECT COALESCE(chain_name, 'Independent') AS chain, COUNT(*) AS customers … GROUP BY COALESCE(chain_name, 'Independent') ORDER BY customers DESC, chain."],
      solution: `SELECT COALESCE(chain_name, 'Independent') AS chain, COUNT(*) AS customers
FROM quaera.dim_customer
GROUP BY COALESCE(chain_name, 'Independent')
ORDER BY customers DESC, chain;`,
    },
    {
      kind: 'note',
      text: '`FLOOR(x)` rounds a number down, which turns it into bands.',
      syntax: 'FLOOR(list_price / 100) * 100',
    },
    {
      kind: 'task',
      id: 'group-by-price-bands',
      title: 'Price bands',
      question: 'Put the products into price bands of 100: 0 to 99, 100 to 199 and so on. Show price_band (the lower edge of the band) and products (how many are in it), the lowest band first.',
      ordered: true,
      skills: ['group-by', 'group-expression'],
      hints: ['A band is the price divided by 100, rounded down, times 100.', 'FLOOR(list_price / 100) * 100 is the band; group by that very expression.', 'SELECT FLOOR(list_price / 100) * 100 AS price_band, COUNT(*) … GROUP BY FLOOR(list_price / 100) * 100 ORDER BY price_band.'],
      solution: `SELECT FLOOR(list_price / 100) * 100 AS price_band, COUNT(*) AS products
FROM quaera.dim_product
GROUP BY FLOOR(list_price / 100) * 100
ORDER BY price_band;`,
    },
    {
      kind: 'note',
      text: '`WHERE` filters rows before they are grouped; `HAVING` filters the groups after, so a condition on `SUM`, `COUNT` or `AVG` belongs in `HAVING`.',
      syntax: 'SELECT brand, COUNT(*) FROM quaera.dim_product GROUP BY brand HAVING COUNT(*) >= 5',
      trap: '`WHERE units > 30000` tests every single row, not the total of an outlet.',
    },
    {
      kind: 'example',
      id: 'group-by-pharma-brands',
      title: 'Pharma brands with five or more products',
      code: `SELECT brand, COUNT(*) AS products
FROM quaera.dim_product
WHERE division = 'Pharma'
GROUP BY brand
HAVING COUNT(*) >= 5
ORDER BY brand;`,
    },
    {
      kind: 'task',
      id: 'group-by-busy-cities',
      title: 'Cities with many customers',
      question: 'Which cities have at least 7 customers? Show city and customers, the most customers first, then by city.',
      ordered: true,
      skills: ['group-by', 'having'],
      hints: ['"At least 7" is a condition on a count per city, not on one row.', 'GROUP BY city, then HAVING on the count.', 'SELECT city, COUNT(*) AS customers FROM quaera.dim_customer GROUP BY city HAVING COUNT(*) >= 7 ORDER BY customers DESC, city;'],
      solution: `SELECT city, COUNT(*) AS customers
FROM quaera.dim_customer
GROUP BY city
HAVING COUNT(*) >= 7
ORDER BY customers DESC, city;`,
    },
    {
      kind: 'task',
      id: 'group-by-big-outlets',
      title: 'Outlets above 30,000 units',
      question: 'Which outlets sold more than 30,000 units in 2025 only (week_start from 2025-01-01 to 2025-12-31)? Show customer_id and units (their total), the most first, then by customer_id.',
      ordered: true,
      skills: ['group-by', 'having'],
      hints: ['The period is a condition on rows; "more than 30,000" is a condition on a total.', 'WHERE for the year, HAVING for the total.', 'GROUP BY customer_id HAVING SUM(units) > 30000 ORDER BY units DESC, customer_id.'],
      solution: `SELECT customer_id, SUM(units) AS units
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01'
GROUP BY customer_id
HAVING SUM(units) > 30000
ORDER BY units DESC, customer_id;`,
      traps: [
        {
          code: `SELECT customer_id, SUM(units) AS units
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01'
  AND units > 30000
GROUP BY customer_id
ORDER BY units DESC, customer_id;`,
          says: 'units > 30000 in WHERE asks whether one weekly line is above 30,000. The total of an outlet can only be tested in HAVING.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'group-by-busy-products-2025',
      title: 'Products shipped in volume in 2025',
      question: 'Which products had more than 15,000 units shipped on orders placed in 2025? Show product_id, shipments (their count) and units (their total), the most units first, then by product_id.',
      ordered: true,
      skills: ['group-by', 'having', 'count', 'sum-avg'],
      hints: ['The year is a condition on rows; "more than 15,000" is a condition on a total per product.', 'WHERE for the year on order_date, GROUP BY product_id, HAVING on the sum of units.', 'HAVING SUM(units) > 15000 ORDER BY units DESC, product_id.'],
      solution: `SELECT product_id, COUNT(*) AS shipments, SUM(units) AS units
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
GROUP BY product_id
HAVING SUM(units) > 15000
ORDER BY units DESC, product_id;`,
    },
    {
      kind: 'task',
      id: 'group-by-deep-discount-months',
      title: 'Distributor months with deep discounts',
      question: 'In the months from 2026-01-01 to 2026-06-01 (month_start), which distributor and month had a discount above 9% of the gross amount? Show distributor_id, month_start, shipments (their count) and discount_pct (total discount_amount as a percentage of total gross_amount, rounded to 1 decimal). Order by discount_pct from the highest, then by distributor_id and month_start.',
      ordered: true,
      skills: ['group-by', 'having', 'count', 'sum-avg', 'ratio'],
      hints: ['One group is one distributor in one month: group by both columns.', 'The months are a WHERE; the 9% is a ratio of two totals, so it goes in HAVING.', 'HAVING SUM(discount_amount) > 0.09 * SUM(gross_amount), and ROUND(100.0 * SUM(discount_amount) / SUM(gross_amount), 1) AS discount_pct.'],
      solution: `SELECT distributor_id, month_start, COUNT(*) AS shipments,
       ROUND(100.0 * SUM(discount_amount) / SUM(gross_amount), 1) AS discount_pct
FROM quaera.fact_sellin
WHERE month_start >= '2026-01-01' AND month_start <= '2026-06-01'
GROUP BY distributor_id, month_start
HAVING SUM(discount_amount) > 0.09 * SUM(gross_amount)
ORDER BY discount_pct DESC, distributor_id, month_start;`,
      pg: `SELECT distributor_id, month_start, COUNT(*) AS shipments,
       ROUND(CAST(100.0 * SUM(discount_amount) / SUM(gross_amount) AS numeric), 1) AS discount_pct
FROM quaera.fact_sellin
WHERE month_start >= '2026-01-01' AND month_start <= '2026-06-01'
GROUP BY distributor_id, month_start
HAVING SUM(discount_amount) > 0.09 * SUM(gross_amount)
ORDER BY discount_pct DESC, distributor_id, month_start;`,
      traps: [
        {
          code: `SELECT distributor_id, month_start, COUNT(*) AS shipments,
       ROUND(100.0 * SUM(discount_amount) / SUM(gross_amount), 1) AS discount_pct
FROM quaera.fact_sellin
WHERE month_start >= '2026-01-01' AND month_start <= '2026-06-01'
GROUP BY distributor_id, month_start
HAVING AVG(discount_amount / gross_amount) > 0.09
ORDER BY discount_pct DESC, distributor_id, month_start;`,
          says: 'AVG(discount_amount / gross_amount) averages the discount of each shipment, so a small shipment counts as much as a big one. Compare the two totals instead.',
        },
      ],
    },
  ],
}
