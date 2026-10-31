import type { PracticeSection } from '../practiceBook'

export const TOTALS: PracticeSection = {
  id: 'totals',
  n: 4,
  title: 'Totals',
  blocks: [
    {
      kind: 'note',
      text: '`COUNT` answers "how many". `COUNT(*)` counts rows, and `COUNT(col)` counts the rows where col is not NULL. With no `GROUP BY` the whole table gives one row.',
      syntax: 'SELECT COUNT(*), COUNT(manager_id) FROM quaera.dim_rep',
    },
    {
      kind: 'example',
      id: 'totals-people-and-managers',
      title: 'People, and how many have a manager',
      code: `SELECT COUNT(*) AS people,
       COUNT(manager_id) AS with_manager
FROM quaera.dim_rep;`,
    },
    {
      kind: 'task',
      id: 'totals-all-shipments',
      title: 'All shipments',
      question: 'How many sell-in shipments are on record in total? One row: shipments.',
      ordered: false,
      skills: ['count'],
      hints: ['Every row of fact_sellin is one shipment.', 'Count the rows of the table.', 'SELECT COUNT(*) AS shipments FROM quaera.fact_sellin;'],
      solution: `SELECT COUNT(*) AS shipments
FROM quaera.fact_sellin;`,
    },
    {
      kind: 'task',
      id: 'totals-customers-in-chains',
      title: 'Customers that belong to a chain',
      question: 'How many customers have a chain_name? One row: in_chain.',
      ordered: false,
      skills: ['count'],
      hints: ['A customer without a chain has NULL in chain_name.', 'COUNT of one column skips the NULLs.', 'SELECT COUNT(chain_name) AS in_chain FROM quaera.dim_customer;'],
      solution: `SELECT COUNT(chain_name) AS in_chain
FROM quaera.dim_customer;`,
      traps: [
        {
          code: `SELECT COUNT(*) AS in_chain
FROM quaera.dim_customer;`,
          says: 'COUNT(*) counts every customer, with a chain or without. Count the column, chain_name, to skip the NULLs.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`COUNT(DISTINCT col)` counts the different values of col, each once. Use it for "how many different products", not "how many rows".',
      syntax: 'SELECT COUNT(DISTINCT promo_id) FROM quaera.fact_sellout',
      trap: '`COUNT(product_id)` counts shipments, not products: add `DISTINCT` to count each product once.',
    },
    {
      kind: 'example',
      id: 'totals-three-counts',
      title: 'Three counts on sell-out',
      code: `SELECT COUNT(*) AS lines,
       COUNT(promo_id) AS promo_lines,
       COUNT(DISTINCT promo_id) AS promotions
FROM quaera.fact_sellout;`,
    },
    {
      kind: 'task',
      id: 'totals-customer-cities',
      title: 'Cities with customers',
      question: 'In how many different cities do Kaiyo’s customers sit? One row: cities.',
      ordered: false,
      skills: ['count', 'count-distinct'],
      hints: ['The city is a column of dim_customer, repeated for every customer in it.', 'Count the different values, not the rows.', 'SELECT COUNT(DISTINCT city) AS cities FROM quaera.dim_customer;'],
      solution: `SELECT COUNT(DISTINCT city) AS cities
FROM quaera.dim_customer;`,
      traps: [
        {
          code: `SELECT COUNT(city) AS cities
FROM quaera.dim_customer;`,
          says: 'COUNT(city) counts the customers that have a city, so a city with nine customers is counted nine times. Add DISTINCT.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'totals-shipments-2025',
      title: 'Reach of the 2025 shipments',
      question: 'For sell-in shipments ordered in 2025, how many shipments were there, to how many different distributors, and of how many different products? One row: shipments, distributors, products.',
      ordered: false,
      skills: ['count', 'count-distinct'],
      hints: ['Filter the year on order_date: from 2025-01-01 up to, not including, 2026-01-01.', 'Shipments are rows; distributors and products are distinct values.', 'COUNT(*) AS shipments, COUNT(DISTINCT distributor_id) AS distributors, COUNT(DISTINCT product_id) AS products.'],
      solution: `SELECT COUNT(*) AS shipments,
       COUNT(DISTINCT distributor_id) AS distributors,
       COUNT(DISTINCT product_id) AS products
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      traps: [
        {
          code: `SELECT COUNT(*) AS shipments,
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
      text: '`SUM` adds a column up, `AVG` averages it, `MIN` and `MAX` give the smallest and the largest. All four skip NULLs, and `ROUND(x, 1)` rounds a result to 1 decimal.',
      syntax: 'SELECT SUM(units), MIN(week_start), MAX(week_start) FROM quaera.fact_sellout',
    },
    {
      kind: 'example',
      id: 'totals-sellout-span',
      title: 'Units and the span of the data',
      code: `SELECT SUM(units) AS units,
       MIN(week_start) AS first_week,
       MAX(week_start) AS last_week
FROM quaera.fact_sellout;`,
    },
    {
      kind: 'task',
      id: 'totals-gross-and-discount-2025',
      title: 'Gross and discount in 2025',
      question: 'For sell-in shipments ordered in 2025, what were the total gross_amount and the total discount_amount? One row: gross_amount, discount_amount.',
      ordered: false,
      skills: ['sum-avg'],
      hints: ['Two columns of fact_sellin, both added up over the year.', 'The year is a condition on order_date: from 2025-01-01 up to, not including, 2026-01-01.', 'SELECT SUM(gross_amount) AS gross_amount, SUM(discount_amount) AS discount_amount … WHERE order_date >= … AND order_date < ….'],
      solution: `SELECT SUM(gross_amount) AS gross_amount,
       SUM(discount_amount) AS discount_amount
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
    },
    {
      kind: 'task',
      id: 'totals-shipment-size-2025',
      title: 'Small, large and average shipment',
      question: 'For sell-in shipments ordered in 2025, what were the smallest, the largest and the average net_amount of one shipment? One row: smallest, largest, average.',
      ordered: false,
      skills: ['sum-avg'],
      hints: ['One column, net_amount, summarised three ways.', 'MIN, MAX and AVG, each over net_amount, with the 2025 filter on order_date.', 'SELECT MIN(net_amount) AS smallest, MAX(net_amount) AS largest, AVG(net_amount) AS average …'],
      solution: `SELECT MIN(net_amount) AS smallest,
       MAX(net_amount) AS largest,
       AVG(net_amount) AS average
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
    },
    {
      kind: 'task',
      id: 'totals-sellout-2025-summary',
      title: 'The 2025 sell-out in four numbers',
      question: 'For sell-out in the weeks starting in 2025, how many lines are there, how many different outlets (customer_id) and products sold, and how many units in total? One row: lines, outlets, products, units.',
      ordered: false,
      skills: ['count', 'count-distinct', 'sum-avg'],
      hints: ['Lines are rows; outlets and products are distinct values; units are a total.', 'COUNT(*), two COUNT(DISTINCT …), and a SUM, with the 2025 filter on week_start.', 'SELECT COUNT(*) AS lines, COUNT(DISTINCT customer_id) AS outlets, COUNT(DISTINCT product_id) AS products, SUM(units) AS units …'],
      solution: `SELECT COUNT(*) AS lines,
       COUNT(DISTINCT customer_id) AS outlets,
       COUNT(DISTINCT product_id) AS products,
       SUM(units) AS units
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
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
      code: `SELECT COUNT(*) AS shipments,
       AVG(1.0 * units) AS avg_units,
       SUM(net_amount) AS net_amount
FROM quaera.fact_sellin;`,
    },
    {
      kind: 'task',
      id: 'totals-units-per-line-2026',
      title: 'Units on a typical line in 2026',
      question: 'For sell-out in the weeks starting in 2026, what is the average units per line? One row: avg_units.',
      ordered: false,
      skills: ['sum-avg', 'ratio'],
      hints: ['An average of the whole-number column units.', 'On Fabric a plain AVG of whole numbers is whole, so multiply by 1.0 first.', "SELECT AVG(1.0 * units) AS avg_units FROM quaera.fact_sellout WHERE week_start >= '2026-01-01';"],
      solution: `SELECT AVG(1.0 * units) AS avg_units
FROM quaera.fact_sellout
WHERE week_start >= '2026-01-01';`,
    },
    {
      kind: 'task',
      id: 'totals-net-price-per-unit',
      title: 'Net price per unit shipped',
      question: 'For sell-in shipments ordered in 2025, what was the average shipment size and the net price per unit? One row: avg_units (the average of units per shipment) and net_per_unit (total net_amount divided by total units).',
      ordered: false,
      skills: ['sum-avg', 'ratio'],
      hints: ['Price per unit is a ratio of two totals, not an average of ratios.', 'avg_units is AVG over units; net_per_unit divides one SUM by another.', 'AVG(1.0 * units) AS avg_units, SUM(net_amount) / SUM(units) AS net_per_unit.'],
      solution: `SELECT AVG(1.0 * units) AS avg_units,
       SUM(net_amount) / SUM(units) AS net_per_unit
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      traps: [
        {
          code: `SELECT AVG(1.0 * units) AS avg_units,
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
      skills: ['count', 'ratio'],
      hints: ['COUNT(promo_id) counts the lines with a promotion; COUNT(*) counts all lines.', 'Divide the first by the second, and make the division decimal: 1.0 * … on Fabric.', 'ROUND(1.0 * COUNT(promo_id) / COUNT(*), 3) AS promo_share.'],
      solution: `SELECT ROUND(1.0 * COUNT(promo_id) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
      traps: [
        {
          code: `SELECT ROUND(1.0 * COUNT(DISTINCT promo_id) / COUNT(*), 3) AS promo_share
FROM quaera.fact_sellout
WHERE week_start >= '2025-01-01' AND week_start < '2026-01-01';`,
          says: 'COUNT(DISTINCT promo_id) counts the different promotions, not the lines that had one. Count promo_id without DISTINCT.',
        },
      ],
    },
  ],
}
