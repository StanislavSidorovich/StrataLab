import type { PracticeSection } from './types'

export const DATES: PracticeSection = {
  id: 'dates',
  n: 6,
  title: 'Dates',
  blocks: [
    {
      kind: 'note',
      text: '`YEAR(d)` and `MONTH(d)` take a part out of a date. `DATETRUNC(month, d)` rounds a date down to the first day of its month, a clean key for monthly totals.',
      syntax: 'WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6',
      trap: '`MONTH(order_date) = 6` alone also returns June of 2024 and 2025: the month number knows nothing of the year.',
    },
    {
      kind: 'example',
      id: 'dates-shipments-by-month',
      title: 'Shipments by year and month',
      sql: `SELECT YEAR(order_date) AS year, MONTH(order_date) AS month, COUNT(*) AS shipments
FROM quaera.fact_sellin
GROUP BY YEAR(order_date), MONTH(order_date)
ORDER BY year, month;`,
    },
    {
      kind: 'task',
      id: 'dates-june-2026-orders',
      title: 'Orders of June 2026',
      question: 'How many sell-in shipments were ordered in June 2026, and what was their total net_amount? One row: shipments, net_amount.',
      ordered: false,
      hints: ['The date to test is order_date.', 'Both the year and the month must match.', 'WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6.'],
      solution: `SELECT COUNT(*) AS shipments, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6;`,
      traps: [
        {
          sql: `SELECT COUNT(*) AS shipments, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE MONTH(order_date) = 6;`,
          says: 'MONTH(order_date) = 6 takes every June in the data, three of them. Add the year.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'dates-monthly-revenue-2026',
      title: 'Sell-out revenue by month in 2026',
      question: 'What was the sell-out revenue in each month of 2026, using the weeks that start in 2026? Show month (the first day of the month) and revenue, the oldest month first.',
      ordered: true,
      hints: ['The sell-out is weekly: week_start is the date to cut by.', 'Round week_start down to its month and group by that.', "SELECT DATETRUNC(month, week_start) AS month … WHERE week_start >= '2026-01-01' GROUP BY DATETRUNC(month, week_start) ORDER BY month."],
      solution: `SELECT DATETRUNC(month, week_start) AS month, SUM(revenue) AS revenue
FROM quaera.fact_sellout
WHERE week_start >= '2026-01-01'
GROUP BY DATETRUNC(month, week_start)
ORDER BY month;`,
    },
    {
      kind: 'note',
      text: '`DATEDIFF(day, a, b)` counts the days from a to b, so the earlier date goes first, and `DATEADD(day, n, d)` moves a date by n days. `FORMAT(d, \'yyyy-MM\')` turns a date into text for a label.',
      syntax: 'DATEDIFF(day, order_date, ship_date)',
      trap: 'Swap the two dates in `DATEDIFF` and every answer turns negative.',
    },
    {
      kind: 'example',
      id: 'dates-promised-arrival',
      title: 'Order, shipment and a 7-day mark',
      sql: `SELECT TOP (5) sellin_id,
       FORMAT(order_date, 'yyyy-MM') AS order_month,
       DATEDIFF(day, order_date, ship_date) AS days_to_ship,
       DATEADD(day, 7, order_date) AS seventh_day
FROM quaera.fact_sellin
ORDER BY order_date, sellin_id;`,
    },
    {
      kind: 'task',
      id: 'dates-slow-shipments',
      title: 'Slow shipments by distributor',
      question: 'For sell-in shipments ordered in 2025, count per distributor the shipments sent more than 7 days after the order, and find the longest wait in days. Show distributor_id, slow_shipments and longest_wait, the most slow shipments first, then by distributor_id.',
      ordered: true,
      hints: ['A shipment is slow when ship_date is later than order_date plus 7 days.', 'DATEADD for the test in WHERE, DATEDIFF(day, order_date, ship_date) for the wait; the longest is a MAX.', "WHERE order_date in 2025 AND ship_date > DATEADD(day, 7, order_date), then MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait."],
      solution: `SELECT distributor_id,
       COUNT(*) AS slow_shipments,
       MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND ship_date > DATEADD(day, 7, order_date)
GROUP BY distributor_id
ORDER BY slow_shipments DESC, distributor_id;`,
      traps: [
        {
          sql: `SELECT distributor_id,
       COUNT(*) AS slow_shipments,
       MAX(DATEDIFF(day, ship_date, order_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND ship_date > DATEADD(day, 7, order_date)
GROUP BY distributor_id
ORDER BY slow_shipments DESC, distributor_id;`,
          says: 'The dates in DATEDIFF are the wrong way round, so the waits are negative. The earlier date, order_date, goes first.',
        },
      ],
    },
  ],
}
