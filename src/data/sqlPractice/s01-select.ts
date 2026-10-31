import type { PracticeSection } from '../practiceBook'

export const SELECT: PracticeSection = {
  id: 'select',
  n: 1,
  title: 'SELECT and TOP',
  blocks: [
    {
      kind: 'note',
      text: '`SELECT` lists the columns you want, in the order you want them, and `AS` renames one. `TOP (n)` keeps the first n rows, which means something only after `ORDER BY`.',
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
      id: 'select-largest-regions',
      title: 'Largest regions',
      question: 'Which 3 regions have the most people? Show region_name as region and population as residents, the most populous first.',
      ordered: true,
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
      kind: 'note',
      text: '`ORDER BY` takes several keys, and each later key breaks the ties of the ones before it. Add one whenever two rows could share a value, so the top n is the same on every run.',
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
      id: 'select-biggest-discounts',
      title: 'Biggest discounts given',
      question: 'Which 5 sell-in shipments carried the biggest discount? Show sellin_id, order_date, distributor_id, product_id and discount_amount as discount, the biggest discount first, then by sellin_id.',
      ordered: true,
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
