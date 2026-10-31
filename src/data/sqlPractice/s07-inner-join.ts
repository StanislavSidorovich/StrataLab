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
      id: 'join-reps-region',
      title: 'Each rep with the region they are based in',
      code: `SELECT rp.rep_name, g.region_name
FROM quaera.dim_rep AS rp
JOIN quaera.dim_region AS g ON g.region_id = rp.region_id;`,
    },
    {
      kind: 'task',
      id: 'join-outlet-regions',
      title: 'Customers with their region',
      question: 'Show every customer with the name of its region. Columns: customer_name and region_name.',
      ordered: false,
      skills: ['join'],
      hints: ['The name of the region is in dim_region, the customer is in dim_customer.', 'Both have region_id: join on it and pick one column from each side.', 'FROM quaera.dim_customer AS c JOIN quaera.dim_region AS r ON r.region_id = c.region_id, then SELECT c.customer_name, r.region_name.'],
      solution: `SELECT c.customer_name, r.region_name
FROM quaera.dim_customer AS c
JOIN quaera.dim_region AS r ON r.region_id = c.region_id;`,
    },
    {
      kind: 'task',
      id: 'join-brand-week-lines',
      title: 'One brand, one week',
      question: 'Which sell-out lines of the brand Aqualis are in the week starting 2026-06-22? Show product_name, customer_id and units.',
      ordered: false,
      skills: ['join', 'where'],
      hints: ['The brand is in dim_product, the week in fact_sellout.', 'Join the two on product_id, then keep the rows with both conditions.', "WHERE p.brand = 'Aqualis' AND s.week_start = '2026-06-22'."],
      solution: `SELECT p.product_name, s.customer_id, s.units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE p.brand = 'Aqualis'
  AND s.week_start = '2026-06-22';`,
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
      skills: ['join', 'group-by', 'sum-avg', 'order-by'],
      hints: ['The channel is in dim_customer, the revenue in fact_sellout.', 'Join them on customer_id, then GROUP BY the channel.', 'ORDER BY revenue DESC at the end.'],
      solution: `SELECT c.channel, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY c.channel
ORDER BY revenue DESC;`,
    },
    {
      kind: 'task',
      id: 'join-team-outlets',
      title: 'Outlets per team',
      question: 'How many customers does each sales team look after? Show team and customers, the most customers first.',
      ordered: true,
      skills: ['join', 'count', 'group-by', 'order-by'],
      hints: ['The team is in dim_rep, the link to a customer is its rep_id.', 'Join dim_customer to dim_rep on rep_id and count the customers in each team.', 'COUNT(*) AS customers, GROUP BY r.team, ORDER BY customers DESC.'],
      solution: `SELECT r.team, COUNT(*) AS customers
FROM quaera.dim_customer AS c
JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
GROUP BY r.team
ORDER BY customers DESC;`,
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
      id: 'join-units-division-channel',
      title: 'Division by channel',
      question: 'How many units were sold in each division through each customer channel? Show division, channel and units, by division then channel.',
      ordered: true,
      skills: ['join', 'join-chain', 'group-by', 'sum-avg', 'order-by'],
      hints: ['The division is in dim_product, the channel in dim_customer, the units in fact_sellout.', 'Join both dimensions to the sales and group by two columns.', 'GROUP BY p.division, c.channel and ORDER BY p.division, c.channel.'],
      solution: `SELECT p.division, c.channel, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY p.division, c.channel
ORDER BY p.division, c.channel;`,
    },
    {
      kind: 'task',
      id: 'join-pharma-by-region-tier',
      title: 'Pharma by region tier',
      question: 'How many units of Pharma products were sold in each region tier? Show tier and units, by tier from 1 up.',
      ordered: true,
      skills: ['join', 'join-chain', 'where', 'group-by', 'sum-avg', 'order-by'],
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
      skills: ['join', 'group-by', 'sum-avg', 'top', 'order-by'],
      hints: ['Shipments are in fact_sellin; distributors are rows of dim_customer.', 'The key has a different name on each side: fact_sellin.distributor_id is dim_customer.customer_id.', 'SELECT TOP (5) with SUM(net_amount), GROUP BY the name, ORDER BY the sum DESC.'],
      solution: `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.customer_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount DESC;`,
      pg: `SELECT c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.customer_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount DESC
LIMIT 5;`,
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
