import type { PracticeSection } from './types'

export const TOTALS: PracticeSection = {
  id: 'totals',
  n: 4,
  title: 'Totals',
  blocks: [
    {
      kind: 'note',
      text: '`COUNT(*)` counts rows, `COUNT(col)` counts the rows where col is not NULL, and `COUNT(DISTINCT col)` counts the different values. `SUM` and `AVG` skip NULLs, and with no `GROUP BY` the whole table gives one row.',
      syntax: 'SELECT COUNT(*), COUNT(promo_id), COUNT(DISTINCT promo_id) FROM quaera.fact_sellout',
      trap: '`COUNT(product_id)` counts shipments, not products: add `DISTINCT` to count each product once.',
    },
    {
      kind: 'example',
      id: 'totals-three-counts',
      title: 'Three counts on sell-out',
      sql: `SELECT COUNT(*) AS lines,
       COUNT(promo_id) AS promo_lines,
       COUNT(DISTINCT promo_id) AS promotions
FROM quaera.fact_sellout;`,
    },
    {
      kind: 'task',
      id: 'totals-shipments-2025',
      title: 'Reach of the 2025 shipments',
      question: 'For sell-in shipments ordered in 2025, how many shipments were there, to how many different distributors, and of how many different products? One row: shipments, distributors, products.',
      ordered: false,
      hints: ['Filter the year on order_date: from 2025-01-01 up to, not including, 2026-01-01.', 'Shipments are rows; distributors and products are distinct values.', 'COUNT(*) AS shipments, COUNT(DISTINCT distributor_id) AS distributors, COUNT(DISTINCT product_id) AS products.'],
      solution: `SELECT COUNT(*) AS shipments,
       COUNT(DISTINCT distributor_id) AS distributors,
       COUNT(DISTINCT product_id) AS products
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      traps: [
        {
          sql: `SELECT COUNT(*) AS shipments,
       COUNT(distributor_id) AS distributors,
       COUNT(product_id) AS products
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
          says: 'COUNT(distributor_id) counts every shipment that has a distributor, so all three numbers are the same. Use COUNT(DISTINCT ...).',
        },
      ],
    },
    {
      kind: 'note',
      text: 'On Fabric whole numbers divide whole (`7 / 2` is 3) and `AVG` of a whole-number column is whole. Write `1.0 *` in front: `AVG(1.0 * units)`, `1.0 * a / b`.',
      syntax: 'SELECT AVG(1.0 * units), 1.0 * COUNT(promo_id) / COUNT(*) FROM quaera.fact_sellout',
      trap: '`AVG(net_amount / units)` is the average of row prices: a shipment of 1 unit weighs as much as one of 500. For a price per unit, divide the totals.',
    },
    {
      kind: 'example',
      id: 'totals-average-shipment',
      title: 'An average shipment',
      sql: `SELECT COUNT(*) AS shipments,
       AVG(1.0 * units) AS avg_units,
       SUM(net_amount) AS net_amount
FROM quaera.fact_sellin;`,
    },
    {
      kind: 'task',
      id: 'totals-net-price-per-unit',
      title: 'Net price per unit shipped',
      question: 'For sell-in shipments ordered in 2025, what was the average shipment size and the net price per unit? One row: avg_units (the average of units per shipment) and net_per_unit (total net_amount divided by total units).',
      ordered: false,
      hints: ['Price per unit is a ratio of two totals, not an average of ratios.', 'avg_units is AVG over units; net_per_unit divides one SUM by another.', 'AVG(1.0 * units) AS avg_units, SUM(net_amount) / SUM(units) AS net_per_unit.'],
      solution: `SELECT AVG(1.0 * units) AS avg_units,
       SUM(net_amount) / SUM(units) AS net_per_unit
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      traps: [
        {
          sql: `SELECT AVG(1.0 * units) AS avg_units,
       AVG(net_amount / units) AS net_per_unit
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
          says: 'AVG(net_amount / units) averages the price of each shipment, small ones as much as big ones. Divide SUM(net_amount) by SUM(units).',
        },
      ],
    },
    {
      kind: 'task',
      id: 'totals-promo-line-share',
      title: 'Share of promotion lines',
      question: 'In sell-out for the weeks starting in 2025, what share of the lines have a promo_id? One row: promo_share, a number between 0 and 1 rounded to 3 decimals.',
      ordered: false,
      hints: ['COUNT(promo_id) counts the lines with a promotion; COUNT(*) counts all lines.', 'Divide the first by the second, and make the division decimal: 1.0 * … on Fabric.', 'ROUND(1.0 * COUNT(promo_id) / COUNT(*), 3) AS promo_share.'],
      solution: `SELECT ROUND(1.0 * COUNT(promo_id) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
      traps: [
        {
          sql: `SELECT ROUND(1.0 * COUNT(DISTINCT promo_id) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
          says: 'COUNT(DISTINCT promo_id) counts the different promotions, not the lines that had one. Count promo_id without DISTINCT.',
        },
      ],
    },
  ],
}
