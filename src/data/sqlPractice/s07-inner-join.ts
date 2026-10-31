import type { PracticeSection } from '../practiceBook'

export const INNER_JOIN: PracticeSection = {
  id: 'inner-join',
  n: 7,
  title: 'INNER JOIN',
  blocks: [
    {
      kind: 'note',
      text: 'A fact table holds ids and numbers; the names are in the dimensions. `JOIN … ON` puts columns of two tables on one row wherever the keys match, and rows with no match are dropped.',
      syntax: 'FROM quaera.fact_sellout AS s JOIN quaera.dim_product AS p ON p.product_id = s.product_id',
      trap: 'Give every table an alias and write it before every column: a name that is in both tables stops the query.',
    },
    {
      kind: 'example',
      id: 'join-units-by-division',
      title: 'Units sold by division',
      code: `SELECT p.division, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
GROUP BY p.division
ORDER BY units DESC;`,
    },
    {
      kind: 'task',
      id: 'join-revenue-by-channel',
      title: 'Revenue by channel',
      question: 'What is the sell-out revenue of each customer channel? Show channel and revenue, the highest first.',
      ordered: true,
      hints: ['The channel is in dim_customer, the revenue in fact_sellout.', 'Join them on customer_id, then GROUP BY the channel.', 'ORDER BY revenue DESC at the end.'],
      solution: `SELECT c.channel, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY c.channel
ORDER BY revenue DESC;`,
    },
    {
      kind: 'note',
      text: 'Tables chain: each new `JOIN` can use any table already in the query. An outlet knows its region, so sales reach the region through the outlet.',
    },
    {
      kind: 'example',
      id: 'join-revenue-by-macro-region',
      title: 'Revenue by macro-region: three tables',
      code: `SELECT r.macro_region, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.macro_region
ORDER BY revenue DESC;`,
    },
    {
      kind: 'task',
      id: 'join-pharma-by-region-tier',
      title: 'Pharma by region tier',
      question: 'How many units of Pharma products were sold in each region tier? Show tier and units, by tier from 1 up.',
      ordered: true,
      hints: ['Four tables: sales, products for the division, outlets, regions for the tier.', "WHERE p.division = 'Pharma', and sales reach the region through dim_customer.", 'GROUP BY r.tier, ORDER BY r.tier.'],
      solution: `SELECT r.tier, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
WHERE p.division = 'Pharma'
GROUP BY r.tier
ORDER BY r.tier;`,
    },
    {
      kind: 'task',
      id: 'join-top-distributors',
      title: 'Top distributors',
      question: 'Which 5 distributors received the highest net amount of shipments? Show customer_name and net_amount, the highest first.',
      ordered: true,
      hints: ['Shipments are in fact_sellin; distributors are rows of dim_customer.', 'The key has a different name on each side: fact_sellin.distributor_id is dim_customer.customer_id.', 'SELECT TOP (5) with SUM(net_amount), GROUP BY the name, ORDER BY the sum DESC.'],
      solution: `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.customer_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount DESC;`,
      traps: [
        {
          code: `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.served_by_distributor_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount DESC;`,
          says: 'You joined on served_by_distributor_id: that column is on an outlet and names the distributor serving it, so this adds up the shipments once per outlet. A distributor’s own row has its id in customer_id.',
        },
      ],
    },
  ],
}
