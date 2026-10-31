import type { PracticeSection } from '../practiceBook'

export const DATES: PracticeSection = {
  id: 'dates',
  n: 6,
  title: 'Dates',
  blocks: [
    {
      kind: 'note',
      text: '`YEAR(d)` and `MONTH(d)` take a part out of a date, so you can filter or group by it.',
      syntax: 'WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6',
      trap: '`MONTH(order_date) = 6` alone also returns June of 2024 and 2025: the month number knows nothing of the year.',
    },
    {
      kind: 'example',
      id: 'dates-shipments-by-month',
      title: 'Shipments by year and month',
      code: `SELECT YEAR(order_date) AS year, MONTH(order_date) AS month, COUNT(*) AS shipments
FROM quaera.fact_sellin
GROUP BY YEAR(order_date), MONTH(order_date)
ORDER BY year, month;`,
    },
    {
      kind: 'task',
      id: 'dates-customers-opened-2022',
      title: 'Customers opened in 2022',
      question: 'How many customers were opened in 2022, by opened_date? One row: opened.',
      ordered: false,
      skills: ['date-part'],
      hints: ['The date to test is opened_date in dim_customer.', 'Take the year out of the date and compare it with 2022.', 'SELECT COUNT(*) AS opened FROM quaera.dim_customer WHERE YEAR(opened_date) = 2022;'],
      solution: `SELECT COUNT(*) AS opened
FROM quaera.dim_customer
WHERE YEAR(opened_date) = 2022;`,
      pg: `SELECT COUNT(*) AS opened
FROM quaera.dim_customer
WHERE EXTRACT(YEAR FROM opened_date) = 2022;`,
    },
    {
      kind: 'task',
      id: 'dates-june-2026-orders',
      title: 'Orders of June 2026',
      question: 'How many sell-in shipments were ordered in June 2026, and what was their total net_amount? One row: shipments, net_amount.',
      ordered: false,
      skills: ['date-part'],
      hints: ['The date to test is order_date.', 'Both the year and the month must match.', 'WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6.'],
      solution: `SELECT COUNT(*) AS shipments, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE YEAR(order_date) = 2026 AND MONTH(order_date) = 6;`,
      pg: `SELECT COUNT(*) AS shipments, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE EXTRACT(YEAR FROM order_date) = 2026 AND EXTRACT(MONTH FROM order_date) = 6;`,
      traps: [
        {
          code: `SELECT COUNT(*) AS shipments, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE MONTH(order_date) = 6;`,
          says: 'MONTH(order_date) = 6 takes every June in the data, three of them. Add the year.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`DATETRUNC(month, d)` rounds a date down to the first day of its month, a clean key for monthly totals. It is shorter than `YEAR` plus `MONTH`, and the result is a date that sorts correctly.',
      syntax: 'SELECT DATETRUNC(month, order_date), COUNT(*) FROM quaera.fact_sellin GROUP BY DATETRUNC(month, order_date)',
    },
    {
      kind: 'example',
      id: 'dates-net-by-month-2026',
      title: 'Net sales by month in 2026',
      code: `SELECT DATETRUNC(month, order_date) AS month, SUM(net_amount) AS net_amount
FROM quaera.fact_sellin
WHERE order_date >= '2026-01-01'
GROUP BY DATETRUNC(month, order_date)
ORDER BY month;`,
    },
    {
      kind: 'task',
      id: 'dates-shipments-per-month-2026',
      title: 'Shipments per month in 2026',
      question: 'How many sell-in shipments were ordered in each month of 2026, by order_date? Show month (the first day of the month) and shipments, the oldest month first.',
      ordered: true,
      skills: ['month-start'],
      hints: ['The month is a part of order_date; group by the first day of it.', 'DATETRUNC(month, order_date) is the group, and the year is a condition on order_date.', "SELECT DATETRUNC(month, order_date) AS month, COUNT(*) AS shipments … WHERE order_date >= '2026-01-01' GROUP BY DATETRUNC(month, order_date) ORDER BY month."],
      solution: `SELECT DATETRUNC(month, order_date) AS month, COUNT(*) AS shipments
FROM quaera.fact_sellin
WHERE order_date >= '2026-01-01'
GROUP BY DATETRUNC(month, order_date)
ORDER BY month;`,
      pg: `SELECT CAST(date_trunc('month', order_date) AS date) AS month, COUNT(*) AS shipments
FROM quaera.fact_sellin
WHERE order_date >= '2026-01-01'
GROUP BY CAST(date_trunc('month', order_date) AS date)
ORDER BY month;`,
    },
    {
      kind: 'task',
      id: 'dates-monthly-revenue-2026',
      title: 'Sell-out revenue by month in 2026',
      question: 'What was the sell-out revenue in each month of 2026, using the weeks that start in 2026? Show month (the first day of the month) and revenue, the oldest month first.',
      ordered: true,
      skills: ['month-start'],
      hints: ['The sell-out is weekly: week_start is the date to cut by.', 'Round week_start down to its month and group by that.', "SELECT DATETRUNC(month, week_start) AS month … WHERE week_start >= '2026-01-01' GROUP BY DATETRUNC(month, week_start) ORDER BY month."],
      solution: `SELECT DATETRUNC(month, week_start) AS month, SUM(revenue) AS revenue
FROM quaera.fact_sellout
WHERE week_start >= '2026-01-01'
GROUP BY DATETRUNC(month, week_start)
ORDER BY month;`,
      pg: `SELECT CAST(date_trunc('month', week_start) AS date) AS month, SUM(revenue) AS revenue
FROM quaera.fact_sellout
WHERE week_start >= '2026-01-01'
GROUP BY CAST(date_trunc('month', week_start) AS date)
ORDER BY month;`,
    },
    {
      kind: 'note',
      text: '`DATEDIFF(day, a, b)` counts the days from a to b, for a wait or an age. The earlier date goes first.',
      syntax: 'DATEDIFF(day, order_date, ship_date)',
      trap: 'Swap the two dates in `DATEDIFF` and every answer turns negative.',
    },
    {
      kind: 'example',
      id: 'dates-days-to-ship',
      title: 'Days from order to shipment',
      code: `SELECT TOP (5) sellin_id, order_date, ship_date,
       DATEDIFF(day, order_date, ship_date) AS days_to_ship
FROM quaera.fact_sellin
ORDER BY order_date, sellin_id;`,
    },
    {
      kind: 'task',
      id: 'dates-longest-wait-2025',
      title: 'The longest wait in 2025',
      question: 'For sell-in shipments ordered in 2025, what was the longest wait in days between order_date and ship_date? One row: longest_wait.',
      ordered: false,
      skills: ['date-gap'],
      hints: ['The wait is the days from order_date to ship_date.', 'DATEDIFF gives the wait of each shipment, and MAX takes the longest.', "SELECT MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait FROM quaera.fact_sellin WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';"],
      solution: `SELECT MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      pg: `SELECT MAX(ship_date - order_date) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
      traps: [
        {
          code: `SELECT MAX(DATEDIFF(day, ship_date, order_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01';`,
          says: 'With the dates the wrong way round every wait is negative, and MAX gives the shortest one as a minus number. The earlier date, order_date, goes first.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'dates-late-shipments-2025',
      title: 'Shipments sent after more than 9 days',
      question: 'How many sell-in shipments ordered in 2025 were shipped more than 9 days after order_date? One row: late_shipments.',
      ordered: false,
      skills: ['date-gap'],
      hints: ['The wait is a condition on each shipment, so it goes in WHERE.', 'DATEDIFF(day, order_date, ship_date) > 9, next to the filter on the year.', "SELECT COUNT(*) AS late_shipments … WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01' AND DATEDIFF(day, order_date, ship_date) > 9;"],
      solution: `SELECT COUNT(*) AS late_shipments
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND DATEDIFF(day, order_date, ship_date) > 9;`,
      pg: `SELECT COUNT(*) AS late_shipments
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND ship_date - order_date > 9;`,
    },
    {
      kind: 'note',
      text: '`DATEADD(day, n, d)` moves a date forward by n days, or back with a negative n, for a deadline or a window. `FORMAT(d, \'yyyy-MM\')` turns a date into text for a label.',
      syntax: 'DATEADD(day, 7, order_date)',
    },
    {
      kind: 'example',
      id: 'dates-promised-arrival',
      title: 'Order, shipment and a 7-day mark',
      code: `SELECT TOP (5) sellin_id,
       FORMAT(order_date, 'yyyy-MM') AS order_month,
       DATEDIFF(day, order_date, ship_date) AS days_to_ship,
       DATEADD(day, 7, order_date) AS seventh_day
FROM quaera.fact_sellin
ORDER BY order_date, sellin_id;`,
    },
    {
      kind: 'task',
      id: 'dates-first-due-dates',
      title: 'Payment due dates of the first orders',
      question: 'Payment is due 14 days after the order. For the 5 earliest sell-in orders, by order_date and then sellin_id, show sellin_id, order_date and due_date.',
      ordered: true,
      skills: ['date-add'],
      hints: ['due_date is order_date moved forward by 14 days.', 'DATEADD(day, 14, order_date); the 5 earliest are TOP (5) after an ORDER BY.', 'SELECT TOP (5) sellin_id, order_date, DATEADD(day, 14, order_date) AS due_date … ORDER BY order_date, sellin_id;'],
      solution: `SELECT TOP (5) sellin_id, order_date, DATEADD(day, 14, order_date) AS due_date
FROM quaera.fact_sellin
ORDER BY order_date, sellin_id;`,
      pg: `SELECT sellin_id, order_date, order_date + 14 AS due_date
FROM quaera.fact_sellin
ORDER BY order_date, sellin_id
LIMIT 5;`,
    },
    {
      kind: 'task',
      id: 'dates-waits-by-month-2025',
      title: 'Shipments and longest wait by month',
      question: 'For sell-in shipments ordered in 2025, show per month of order_date: month (the first day of the month), shipments (their count) and longest_wait (the longest days between order_date and ship_date). Oldest month first.',
      ordered: true,
      skills: ['month-start', 'date-gap', 'count', 'sum-avg'],
      hints: ['The group is the month of order_date; the wait is a gap between two dates.', 'DATETRUNC(month, order_date) for the group, MAX(DATEDIFF(day, order_date, ship_date)) for the wait.', "SELECT DATETRUNC(month, order_date) AS month, COUNT(*) AS shipments, MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait … GROUP BY DATETRUNC(month, order_date) ORDER BY month."],
      solution: `SELECT DATETRUNC(month, order_date) AS month,
       COUNT(*) AS shipments,
       MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
GROUP BY DATETRUNC(month, order_date)
ORDER BY month;`,
      pg: `SELECT CAST(date_trunc('month', order_date) AS date) AS month,
       COUNT(*) AS shipments,
       MAX(ship_date - order_date) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
GROUP BY CAST(date_trunc('month', order_date) AS date)
ORDER BY month;`,
    },
    {
      kind: 'task',
      id: 'dates-slow-shipments',
      title: 'Slow shipments by distributor',
      question: 'For sell-in shipments ordered in 2025, count per distributor the shipments sent more than 7 days after the order, and find the longest wait in days. Show distributor_id, slow_shipments and longest_wait, the most slow shipments first, then by distributor_id.',
      ordered: true,
      skills: ['date-gap', 'date-add', 'count', 'sum-avg', 'group-by'],
      hints: ['A shipment is slow when ship_date is later than order_date plus 7 days.', 'DATEADD for the test in WHERE, DATEDIFF(day, order_date, ship_date) for the wait; the longest is a MAX.', "WHERE order_date in 2025 AND ship_date > DATEADD(day, 7, order_date), then MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait."],
      solution: `SELECT distributor_id,
       COUNT(*) AS slow_shipments,
       MAX(DATEDIFF(day, order_date, ship_date)) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND ship_date > DATEADD(day, 7, order_date)
GROUP BY distributor_id
ORDER BY slow_shipments DESC, distributor_id;`,
      pg: `SELECT distributor_id,
       COUNT(*) AS slow_shipments,
       MAX(ship_date - order_date) AS longest_wait
FROM quaera.fact_sellin
WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'
  AND ship_date > order_date + 7
GROUP BY distributor_id
ORDER BY slow_shipments DESC, distributor_id;`,
      traps: [
        {
          code: `SELECT distributor_id,
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
