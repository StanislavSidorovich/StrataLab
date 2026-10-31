import type { PracticeSection } from '../practiceBook'

export const SELECT: PracticeSection = {
  id: 'select',
  n: 1,
  title: 'SELECT and TOP',
  blocks: [
    {
      kind: 'note',
      text: '`SELECT` lists the columns you want and `FROM` names the table they come from; every table here is in the schema `quaera`. The columns come out in the order you list them.',
      syntax: 'SELECT region_name, tier FROM quaera.dim_region',
    },
    {
      kind: 'example',
      id: 'select-product-catalogue',
      title: 'The product catalogue',
      code: `SELECT sku_code, product_name, category
FROM quaera.dim_product;`,
    },
    {
      kind: 'task',
      id: 'select-region-overview',
      title: 'The regions at a glance',
      question: 'For a regional overview, list every region with its region_name, macro_region and tier.',
      ordered: false,
      skills: ['select'],
      hints: ['One row per region sits in dim_region.', 'Name the three columns after SELECT, separated by commas.', 'SELECT region_name, macro_region, tier FROM quaera.dim_region.'],
      solution: `SELECT region_name, macro_region, tier
FROM quaera.dim_region;`,
    },
    {
      kind: 'note',
      text: '`ORDER BY` sorts the rows, from the smallest by default and from the biggest with `DESC` after the column. It takes several keys, and each later key breaks the ties of the ones before it, so add one whenever two rows could share a value.',
      syntax: 'ORDER BY brand, list_price DESC, product_id',
      trap: 'Each key has its own direction: DESC after one key does not reverse the others.',
    },
    {
      kind: 'example',
      id: 'select-products-by-brand',
      title: 'Products by brand, the dearest first',
      code: `SELECT brand, product_name, list_price
FROM quaera.dim_product
ORDER BY brand, list_price DESC, product_id;`,
    },
    {
      kind: 'task',
      id: 'select-reps-by-team',
      title: 'The sales team by team',
      question: 'List everyone on the sales team with rep_name, team and role, sorted by team, then by rep_name, then by rep_id.',
      ordered: true,
      skills: ['select', 'order-by'],
      hints: ['dim_rep holds the sales team: reps and managers.', 'Three sort keys in a row, all ascending, so no DESC is needed.', 'SELECT rep_name, team, role … ORDER BY team, rep_name, rep_id.'],
      solution: `SELECT rep_name, team, role
FROM quaera.dim_rep
ORDER BY team, rep_name, rep_id;`,
    },
    {
      kind: 'task',
      id: 'select-promos-by-discount',
      title: 'Promotions, the deepest discount first',
      question: 'List all promotions with promo_name, mechanic and discount_pct, the deepest discount first, then by promo_id.',
      ordered: true,
      skills: ['select', 'order-by'],
      hints: ['dim_promo holds one row per promotion.', 'Sort by discount_pct from the biggest, and add promo_id as the second key.', 'ORDER BY discount_pct DESC, promo_id.'],
      solution: `SELECT promo_name, mechanic, discount_pct
FROM quaera.dim_promo
ORDER BY discount_pct DESC, promo_id;`,
      traps: [
        {
          code: `SELECT promo_name, mechanic, discount_pct
FROM quaera.dim_promo
ORDER BY discount_pct, promo_id DESC;`,
          says: 'DESC belongs to the key it follows: here discount_pct still runs from the smallest and only promo_id is reversed.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`AS` renames a column in the result, so the header reads the way the person asking would say it. The rows do not change, only the name above them.',
      syntax: 'SELECT population AS residents FROM quaera.dim_region',
    },
    {
      kind: 'example',
      id: 'select-promo-calendar',
      title: 'The promotion calendar',
      code: `SELECT promo_name AS promotion, start_date AS starts, end_date AS ends
FROM quaera.dim_promo
ORDER BY start_date, promo_id;`,
    },
    {
      kind: 'task',
      id: 'select-promo-headers',
      title: 'Promotions with readable headers',
      question: 'List all promotions with promo_name as promotion, mechanic and discount_pct as discount.',
      ordered: false,
      skills: ['select', 'alias'],
      hints: ['Every promotion is a row of dim_promo.', 'Put AS and the new name right after the column to rename.', 'SELECT promo_name AS promotion, mechanic, discount_pct AS discount.'],
      solution: `SELECT promo_name AS promotion, mechanic, discount_pct AS discount
FROM quaera.dim_promo;`,
    },
    {
      kind: 'note',
      text: '`TOP (n)` cuts the result to its first n rows, which is how you ask for the biggest or the latest few. It means something only after `ORDER BY`.',
      syntax: 'SELECT TOP (3) region_name AS region FROM quaera.dim_region ORDER BY population DESC',
      trap: 'TOP without ORDER BY returns whichever rows the engine reaches first, not the biggest ones.',
    },
    {
      kind: 'example',
      id: 'select-oldest-customers',
      title: 'Five longest-standing customers',
      code: `SELECT TOP (5) customer_name AS customer, city, opened_date
FROM quaera.dim_customer
ORDER BY opened_date, customer_id;`,
    },
    {
      kind: 'task',
      id: 'select-latest-promos',
      title: 'The latest promotions',
      question: 'Which 4 promotions started most recently? Show promo_name, start_date and end_date, the latest start first, then by promo_id.',
      ordered: true,
      skills: ['select', 'order-by', 'top'],
      hints: ['start_date is a column of dim_promo.', 'Sort by start_date from the latest, add promo_id, then keep 4 rows.', 'SELECT TOP (4) promo_name, start_date, end_date … ORDER BY start_date DESC, promo_id.'],
      solution: `SELECT TOP (4) promo_name, start_date, end_date
FROM quaera.dim_promo
ORDER BY start_date DESC, promo_id;`,
      pg: `SELECT promo_name, start_date, end_date
FROM quaera.dim_promo
ORDER BY start_date DESC, promo_id
LIMIT 4;`,
    },
    {
      kind: 'task',
      id: 'select-largest-regions',
      title: 'Largest regions',
      question: 'Which 3 regions have the most people? Show region_name as region and population as residents, the most populous first.',
      ordered: true,
      skills: ['select', 'alias', 'order-by', 'top'],
      hints: ['Everything is in dim_region.', 'Rename with AS, and ORDER BY population DESC.', 'SELECT TOP (3) region_name AS region, population AS residents.'],
      solution: `SELECT TOP (3) region_name AS region, population AS residents
FROM quaera.dim_region
ORDER BY population DESC;`,
      pg: `SELECT region_name AS region, population AS residents
FROM quaera.dim_region
ORDER BY population DESC
LIMIT 3;`,
    },
    {
      kind: 'task',
      id: 'select-longest-serving-reps',
      title: 'Longest-serving reps',
      question: 'Who are the 5 people on the sales team hired earliest? Show rep_name, team and hired_date, the earliest hire first, then by rep_id.',
      ordered: true,
      skills: ['select', 'order-by', 'top'],
      hints: ['dim_rep holds both reps and managers, and has hired_date.', 'Earliest first is the default ascending order; add rep_id as the second key.', 'SELECT TOP (5) rep_name, team, hired_date … ORDER BY hired_date, rep_id.'],
      solution: `SELECT TOP (5) rep_name, team, hired_date
FROM quaera.dim_rep
ORDER BY hired_date, rep_id;`,
      pg: `SELECT rep_name, team, hired_date
FROM quaera.dim_rep
ORDER BY hired_date, rep_id
LIMIT 5;`,
    },
    {
      kind: 'task',
      id: 'select-biggest-discounts',
      title: 'Biggest discounts given',
      question: 'Which 5 sell-in shipments carried the biggest discount? Show sellin_id, order_date, distributor_id, product_id and discount_amount as discount, the biggest discount first, then by sellin_id.',
      ordered: true,
      skills: ['select', 'alias', 'order-by', 'top'],
      hints: ['Shipments from Kaiyo to distributors are in fact_sellin.', 'Sort by discount_amount from the biggest, and add sellin_id as the second key.', 'SELECT TOP (5) …, discount_amount AS discount … ORDER BY discount_amount DESC, sellin_id.'],
      solution: `SELECT TOP (5) sellin_id, order_date, distributor_id, product_id, discount_amount AS discount
FROM quaera.fact_sellin
ORDER BY discount_amount DESC, sellin_id;`,
      pg: `SELECT sellin_id, order_date, distributor_id, product_id, discount_amount AS discount
FROM quaera.fact_sellin
ORDER BY discount_amount DESC, sellin_id
LIMIT 5;`,
      traps: [
        {
          code: `SELECT TOP (5) sellin_id, order_date, distributor_id, product_id, discount_amount AS discount
FROM quaera.fact_sellin;`,
          says: 'There is no ORDER BY, so TOP (5) took the first five rows the table gave, not the biggest discounts.',
        },
        {
          code: `SELECT TOP (5) sellin_id, order_date, distributor_id, product_id, discount_amount AS discount
FROM quaera.fact_sellin
ORDER BY discount_amount, sellin_id;`,
          says: 'ORDER BY sorts ascending unless told otherwise, so this is the five smallest discounts. Add DESC.',
        },
      ],
    },
  ],
}
