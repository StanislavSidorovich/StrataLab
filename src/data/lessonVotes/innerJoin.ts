// Vote questions for the INNER JOIN section (`#lesson=sql&set=inner-join&mode=vote&q=N`): one per task of
// src/data/sqlPractice/s07-inner-join.ts, in its order. The right query is the task's own solution (a test holds it to
// that); the wrong ones are mistakes people really make: a missing GROUP BY, a join on the wrong key that still runs,
// the wrong grain or filter. A test runs every one on the data: a wrong query fails or answers differently.
import { INNER_JOIN } from '../sqlPractice/s07-inner-join'
import { tasksOf } from '../practiceBook'
import type { VoteQuestion } from '../../core/lesson'

const task = (id: string) => tasksOf(INNER_JOIN).find((t) => t.id === id)!
const right = (id: string) => task(id).solution
const question = (id: string) => task(id).question

export const INNER_JOIN_VOTES: VoteQuestion[] = [
  {
    taskId: 'join-outlet-regions',
    question: question('join-outlet-regions'),
    right: right('join-outlet-regions'),
    wrong: [
      `SELECT c.customer_name, r.region_name
FROM quaera.dim_customer AS c
JOIN quaera.dim_region AS r ON r.region_id = c.customer_id;`,
      `SELECT c.customer_name, r.region_name
FROM quaera.dim_customer AS c, quaera.dim_region AS r;`,
      `SELECT c.customer_name, r.region_name
FROM quaera.dim_customer AS c
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
WHERE r.tier = 1;`,
    ],
    why: 'Each customer holds the id of its region, so the join matches region_id to region_id. Joining on the wrong pair of ids, or on nothing, pairs rows that have no business together.',
  },
  {
    taskId: 'join-brand-week-lines',
    question: question('join-brand-week-lines'),
    right: right('join-brand-week-lines'),
    wrong: [
      `SELECT p.product_name, s.customer_id, s.units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE p.brand = 'Aqualis';`,
      `SELECT p.product_name, s.customer_id, s.units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
WHERE p.brand = 'Aqualis'
   OR s.week_start = '2026-06-22';`,
      `SELECT p.product_name, s.customer_id, s.units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.customer_id
WHERE p.brand = 'Aqualis'
  AND s.week_start = '2026-06-22';`,
    ],
    why: 'Both conditions must hold, so they are joined with AND: the brand lives in dim_product, the week in fact_sellout, and the join is on product_id. OR keeps every line that meets either one.',
  },
  {
    taskId: 'join-revenue-by-channel',
    question: question('join-revenue-by-channel'),
    right: right('join-revenue-by-channel'),
    wrong: [
      `SELECT c.channel, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
ORDER BY revenue DESC;`,
      `SELECT c.channel, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.product_id
GROUP BY c.channel
ORDER BY revenue DESC;`,
      `SELECT s.customer_id, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY s.customer_id
ORDER BY revenue DESC;`,
    ],
    why: 'The join brings the channel next to each sale, and GROUP BY channel turns the sales into one total per channel. Without GROUP BY the total has no group; with the wrong key the query runs and lies.',
  },
  {
    taskId: 'join-team-outlets',
    question: question('join-team-outlets'),
    right: right('join-team-outlets'),
    wrong: [
      `SELECT r.team, COUNT(*) AS customers
FROM quaera.dim_customer AS c
JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
ORDER BY customers DESC;`,
      `SELECT r.team, COUNT(*) AS customers
FROM quaera.dim_customer AS c
JOIN quaera.dim_rep AS r ON r.rep_id = c.customer_id
GROUP BY r.team
ORDER BY customers DESC;`,
      `SELECT r.team, COUNT(DISTINCT r.rep_id) AS customers
FROM quaera.dim_customer AS c
JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
GROUP BY r.team
ORDER BY customers DESC;`,
    ],
    why: 'One row of the join is one customer with its rep, so COUNT(*) per team counts customers. Counting distinct reps answers another question: how many reps have customers.',
  },
  {
    taskId: 'join-units-division-channel',
    question: question('join-units-division-channel'),
    right: right('join-units-division-channel'),
    wrong: [
      `SELECT p.division, c.channel, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY p.division
ORDER BY p.division, c.channel;`,
      `SELECT p.division, c.channel, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.product_id
GROUP BY p.division, c.channel
ORDER BY p.division, c.channel;`,
      `SELECT p.division, c.channel, COUNT(*) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
GROUP BY p.division, c.channel
ORDER BY p.division, c.channel;`,
    ],
    why: 'Two dimensions, two joins, and every column that is not summed goes into GROUP BY. COUNT(*) counts sales lines, not the units sold on them.',
  },
  {
    taskId: 'join-pharma-by-region-tier',
    question: question('join-pharma-by-region-tier'),
    right: right('join-pharma-by-region-tier'),
    wrong: [
      `SELECT r.tier, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
WHERE p.division = 'Pharma'
ORDER BY r.tier;`,
      `SELECT r.tier, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.tier
ORDER BY r.tier;`,
      `SELECT r.tier, SUM(s.units) AS units
FROM quaera.fact_sellout AS s
JOIN quaera.dim_product AS p ON p.product_id = s.product_id
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = s.customer_id
WHERE p.division = 'Pharma'
GROUP BY r.tier
ORDER BY r.tier;`,
    ],
    why: 'Sales reach the region through the customer, and the Pharma filter belongs in WHERE before the grouping. Without the filter the query answers for all divisions.',
  },
  {
    taskId: 'join-top-distributors',
    question: question('join-top-distributors'),
    right: right('join-top-distributors'),
    wrong: [
      `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.customer_id = i.distributor_id
ORDER BY net_amount DESC;`,
      `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.served_by_distributor_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount DESC;`,
      `SELECT TOP (5) c.customer_name, SUM(i.net_amount) AS net_amount
FROM quaera.fact_sellin AS i
JOIN quaera.dim_customer AS c ON c.customer_id = i.distributor_id
GROUP BY c.customer_name
ORDER BY net_amount ASC;`,
    ],
    why: 'fact_sellin.distributor_id is a dim_customer.customer_id: the key has a different name on each side. The other column, served_by_distributor_id, sits on outlets and repeats each distributor once per outlet.',
  },
]
