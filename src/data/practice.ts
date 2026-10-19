// Practice on the demo shop (stage 5): worked examples to read and run, and tasks to solve with
// a Check against a reference query, hints one at a time, and the solution at the end. The
// reference runs on the same tables as the user's query, so the answers stay right even after
// the demo shop is reloaded or changed.

export interface PracticeExample {
  id: string
  title: string
  question: string
  /** the query, with comments that explain it */
  sql: string
}

export interface PracticeTask {
  id: string
  level: 1 | 2 | 3
  title: string
  /** the business question, as a manager would ask it */
  question: string
  /** the reference result has to come in this order */
  ordered: boolean
  hints: string[]
  solution: string
}

export const LEVELS: Record<PracticeTask['level'], string> = {
  1: 'Basics: one table',
  2: 'JOINs and totals',
  3: 'Analysis',
}

/** Revenue of an order line: what the shop earned on it. Repeated in the solutions on purpose. */
const LINES = `FROM demo.orders o
JOIN demo.order_items oi ON oi.order_id = o.order_id
JOIN demo.products    p  ON p.product_id = oi.product_id`

export const EXAMPLES: PracticeExample[] = [
  {
    id: 'revenue-by-category',
    title: 'Revenue by category',
    question: 'Which product categories bring in the most money?',
    sql: `-- Which product categories bring in the most money?
-- Revenue sits in no single table: an order line has the quantity, the product has the price.
-- So: orders → their lines → the product of each line, then add up quantity × price per category.
-- Only delivered orders count as revenue (cancelled and returned ones were not paid for).
SELECT
  p.category,
  count(DISTINCT o.order_id)  AS orders,    -- DISTINCT: an order with 3 lines is still 1 order
  sum(oi.quantity * p.price)  AS revenue
${LINES}
WHERE o.status = 'delivered'
GROUP BY p.category
ORDER BY revenue DESC;
`,
  },
  {
    id: 'orders-by-weekday',
    title: 'Busiest day of the week',
    question: 'On which day of the week do customers order most?',
    sql: `-- On which day of the week do customers order most?
-- dayname() turns a timestamp into Monday, Tuesday…; isodow() into 1 (Monday) … 7 (Sunday),
-- which sorts the days in calendar order instead of alphabetically.
SELECT
  dayname(ordered_at)  AS weekday,
  count(*)             AS orders
FROM demo.orders
GROUP BY weekday, isodow(ordered_at)
ORDER BY isodow(ordered_at);
`,
  },
  {
    id: 'customer-summary',
    title: 'One line per customer',
    question: 'For each customer: how many orders, when the first and the last, and how much they spent.',
    sql: `-- For each customer: how many orders, when the first and the last, and how much they spent.
-- LEFT JOIN keeps customers without orders (their counts are 0, their spend NULL → coalesce).
-- FILTER (WHERE …) adds up only some rows of the group: here, the delivered orders' lines.
SELECT
  c.customer_id,
  c.full_name,
  count(DISTINCT o.order_id)                                          AS orders,
  min(o.ordered_at)::DATE                                             AS first_order,
  max(o.ordered_at)::DATE                                             AS last_order,
  coalesce(sum(oi.quantity * p.price) FILTER (WHERE o.status = 'delivered'), 0) AS spent
FROM demo.customers c
LEFT JOIN demo.orders      o  ON o.customer_id = c.customer_id
LEFT JOIN demo.order_items oi ON oi.order_id   = o.order_id
LEFT JOIN demo.products    p  ON p.product_id  = oi.product_id
GROUP BY c.customer_id, c.full_name
ORDER BY spent DESC;
`,
  },
  {
    id: 'share-of-revenue',
    title: 'Share of the total',
    question: 'What share of the revenue does each category bring?',
    sql: `-- What share of the revenue does each category bring?
-- A window function sees all the groups at once: sum(revenue) OVER () is the grand total,
-- next to each category's own revenue, without a second query.
WITH by_category AS (
  SELECT p.category, sum(oi.quantity * p.price) AS revenue
  ${LINES.replace(/\n/g, '\n  ')}
  WHERE o.status = 'delivered'
  GROUP BY p.category
)
SELECT
  category,
  revenue,
  round(100 * revenue / sum(revenue) OVER (), 1) AS pct_of_total
FROM by_category
ORDER BY revenue DESC;
`,
  },
]

export const TASKS: PracticeTask[] = [
  {
    id: 'customers-by-city',
    level: 1,
    title: 'Customers by city',
    question: 'How many customers live in each city? Show the city and the number of customers.',
    ordered: false,
    hints: ['Everything is in the customers table.', 'One row per city: GROUP BY city.', 'SELECT city, count(*) AS customers FROM demo.customers GROUP BY …'],
    solution: `SELECT city, count(*) AS customers
FROM demo.customers
GROUP BY city;`,
  },
  {
    id: 'expensive-products',
    level: 1,
    title: 'Expensive products',
    question: 'Which products cost more than 20? Show the name and the price, the most expensive first.',
    ordered: true,
    hints: ['The products table has the name and the price.', 'Keep only some rows with WHERE price > 20.', 'Sort with ORDER BY price DESC (DESC = largest first).'],
    solution: `SELECT product_name, price
FROM demo.products
WHERE price > 20
ORDER BY price DESC;`,
  },
  {
    id: 'orders-by-status',
    level: 1,
    title: 'Orders by status',
    question: 'How many orders are there in each status (delivered, shipped, cancelled, returned)?',
    ordered: false,
    hints: ['Only the orders table is needed.', 'GROUP BY status, and count the rows of each group.', 'SELECT status, count(*) AS orders FROM demo.orders GROUP BY …'],
    solution: `SELECT status, count(*) AS orders
FROM demo.orders
GROUP BY status;`,
  },
  {
    id: 'signups-2024',
    level: 1,
    title: 'New customers in 2024',
    question: 'How many customers signed up in 2024? One number.',
    ordered: false,
    hints: ['customers.signup_date is a DATE.', 'Keep the dates from 2024-01-01 up to (not including) 2025-01-01, or use year(signup_date) = 2024.', 'SELECT count(*) FROM demo.customers WHERE year(signup_date) = 2024;'],
    solution: `SELECT count(*) AS customers
FROM demo.customers
WHERE signup_date >= DATE '2024-01-01' AND signup_date < DATE '2025-01-01';`,
  },
  {
    id: 'monthly-revenue',
    level: 2,
    title: 'Revenue by month',
    question: 'What was the revenue (quantity × price) of delivered orders in each month? Show the month as a date (its first day) and the revenue, in calendar order.',
    ordered: true,
    hints: [
      'You need three tables: orders (date, status), order_items (quantity), products (price).',
      "date_trunc('month', ordered_at) gives the first moment of the month; ::DATE makes it a date.",
      `SELECT date_trunc('month', o.ordered_at)::DATE AS month, sum(oi.quantity * p.price) AS revenue ${LINES.replace(/\n/g, ' ')} WHERE … GROUP BY month ORDER BY month;`,
    ],
    solution: `SELECT date_trunc('month', o.ordered_at)::DATE AS month,
       sum(oi.quantity * p.price)           AS revenue
${LINES}
WHERE o.status = 'delivered'
GROUP BY month
ORDER BY month;`,
  },
  {
    id: 'top-customers',
    level: 2,
    title: 'Top 5 customers',
    question: 'Who are the 5 customers with the highest revenue from delivered orders? Show customer_id, full_name and revenue, the highest first.',
    ordered: true,
    hints: [
      'Start from customers and join orders, order_items and products.',
      'Group by the customer (customer_id and full_name: several customers share a name).',
      'Sort by revenue DESC and keep 5 rows with LIMIT 5.',
    ],
    solution: `SELECT c.customer_id, c.full_name, sum(oi.quantity * p.price) AS revenue
FROM demo.customers c
JOIN demo.orders      o  ON o.customer_id = c.customer_id
JOIN demo.order_items oi ON oi.order_id   = o.order_id
JOIN demo.products    p  ON p.product_id  = oi.product_id
WHERE o.status = 'delivered'
GROUP BY c.customer_id, c.full_name
ORDER BY revenue DESC
LIMIT 5;`,
  },
  {
    id: 'average-order',
    level: 2,
    title: 'Average order value',
    question: 'What is the average value of a delivered order, rounded to 2 decimals? One number.',
    ordered: false,
    hints: [
      'First the value of each order: a subquery (or WITH) that groups the lines by order_id.',
      'Then the average of those values: avg() over the subquery.',
      'SELECT round(avg(order_total), 2) FROM (SELECT o.order_id, sum(oi.quantity * p.price) AS order_total FROM … GROUP BY o.order_id);',
    ],
    solution: `SELECT round(avg(order_total), 2) AS avg_order_value
FROM (
  SELECT o.order_id, sum(oi.quantity * p.price) AS order_total
  ${LINES.replace(/\n/g, '\n  ')}
  WHERE o.status = 'delivered'
  GROUP BY o.order_id
);`,
  },
  {
    id: 'best-sellers',
    level: 2,
    title: 'Best sellers',
    question: 'Which 5 products sold the most units, counting every order that was not cancelled? Show the product name and the units, the most first.',
    ordered: true,
    hints: ['Units are order_items.quantity; the status is on orders.', "Not cancelled: WHERE o.status <> 'cancelled'.", 'GROUP BY the product name, ORDER BY units DESC, LIMIT 5.'],
    solution: `SELECT p.product_name, sum(oi.quantity) AS units
FROM demo.order_items oi
JOIN demo.orders   o ON o.order_id   = oi.order_id
JOIN demo.products p ON p.product_id = oi.product_id
WHERE o.status <> 'cancelled'
GROUP BY p.product_name
ORDER BY units DESC
LIMIT 5;`,
  },
  {
    id: 'never-delivered',
    level: 2,
    title: 'Never received anything',
    question: 'Which customers have never had an order delivered? Show customer_id and full_name.',
    ordered: false,
    hints: [
      'A plain JOIN to delivered orders finds those who did. You want the others.',
      'NOT EXISTS (a subquery on orders for this customer with status delivered), or LEFT JOIN … WHERE o.order_id IS NULL.',
      "SELECT customer_id, full_name FROM demo.customers c WHERE NOT EXISTS (SELECT 1 FROM demo.orders o WHERE o.customer_id = c.customer_id AND o.status = 'delivered');",
    ],
    solution: `SELECT c.customer_id, c.full_name
FROM demo.customers c
WHERE NOT EXISTS (
  SELECT 1 FROM demo.orders o
  WHERE o.customer_id = c.customer_id AND o.status = 'delivered'
);`,
  },
  {
    id: 'channels',
    level: 3,
    title: 'Which channel brings better customers',
    question: 'For each signup channel: how many customers have at least one delivered order, and their average revenue per customer (rounded to 2 decimals)?',
    ordered: false,
    hints: [
      'Join customers to their delivered orders, the lines and the products, then GROUP BY channel.',
      'Customers: count(DISTINCT c.customer_id), since a customer has many lines.',
      'Revenue per customer = sum(quantity * price) / count(DISTINCT customer_id), inside round(…, 2).',
    ],
    solution: `SELECT c.channel,
       count(DISTINCT c.customer_id) AS customers,
       round(sum(oi.quantity * p.price) / count(DISTINCT c.customer_id), 2) AS revenue_per_customer
FROM demo.customers c
JOIN demo.orders      o  ON o.customer_id = c.customer_id AND o.status = 'delivered'
JOIN demo.order_items oi ON oi.order_id   = o.order_id
JOIN demo.products    p  ON p.product_id  = oi.product_id
GROUP BY c.channel;`,
  },
  {
    id: 'running-total',
    level: 3,
    title: 'Running total',
    question: 'Revenue of delivered orders by month, with a running total since January. Show month (as a date), revenue and running_total, in calendar order.',
    ordered: true,
    hints: [
      'Start from the monthly revenue (the “Revenue by month” task) in a subquery or WITH.',
      'A window function adds up the months so far: sum(revenue) OVER (ORDER BY month).',
      'SELECT month, revenue, sum(revenue) OVER (ORDER BY month) AS running_total FROM (…) ORDER BY month;',
    ],
    solution: `WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::DATE AS month,
         sum(oi.quantity * p.price)           AS revenue
  ${LINES.replace(/\n/g, '\n  ')}
  WHERE o.status = 'delivered'
  GROUP BY month
)
SELECT month, revenue, sum(revenue) OVER (ORDER BY month) AS running_total
FROM monthly
ORDER BY month;`,
  },
  {
    id: 'return-rate',
    level: 3,
    title: 'Return rate by category',
    question: 'What percentage of order lines in each category belong to returned orders? Rounded to 1 decimal, the highest first.',
    ordered: true,
    hints: [
      'Count all lines per category, and the lines whose order has status returned.',
      "count(*) FILTER (WHERE o.status = 'returned') counts only some rows of the group.",
      "round(100.0 * count(*) FILTER (WHERE o.status = 'returned') / count(*), 1) AS returned_pct, GROUP BY p.category, ORDER BY returned_pct DESC.",
    ],
    solution: `SELECT p.category,
       round(100.0 * count(*) FILTER (WHERE o.status = 'returned') / count(*), 1) AS returned_pct
FROM demo.order_items oi
JOIN demo.orders   o ON o.order_id   = oi.order_id
JOIN demo.products p ON p.product_id = oi.product_id
GROUP BY p.category
ORDER BY returned_pct DESC;`,
  },
  {
    id: 'new-customers-by-month',
    level: 3,
    title: 'When customers first ordered',
    question: "In which month did each customer place their first order (any status)? Count the customers per month: show the month as text like '2024-01' and new_customers, in calendar order.",
    ordered: true,
    hints: [
      'First each customer’s first order: min(ordered_at) grouped by customer_id.',
      "Then group those first orders by month: strftime(first_order, '%Y-%m').",
      "SELECT strftime(first_order, '%Y-%m') AS month, count(*) AS new_customers FROM (SELECT customer_id, min(ordered_at) AS first_order FROM demo.orders GROUP BY customer_id) GROUP BY month ORDER BY month;",
    ],
    solution: `SELECT strftime(first_order, '%Y-%m') AS month, count(*) AS new_customers
FROM (
  SELECT customer_id, min(ordered_at) AS first_order
  FROM demo.orders
  GROUP BY customer_id
)
GROUP BY month
ORDER BY month;`,
  },
]

export const taskById = (id: string) => TASKS.find((t) => t.id === id)

/** `#task=top-customers` opens that task (links from quaera.app lessons). */
export function taskFromHash(hash: string): string | null {
  const m = /(?:^#|&)task=([a-z0-9-]+)/i.exec(hash)
  return m ? m[1].toLowerCase() : null
}

export function hashWithoutTask(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^task=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}

/** What a task's tab starts with: the question as a comment, then room to write. */
export function taskStarter(t: PracticeTask): string {
  const n = TASKS.indexOf(t) + 1
  const lines = wrap(t.question, 88)
  return `-- Task ${n} · ${LEVELS[t.level]}\n${lines.map((l) => `-- ${l}`).join('\n')}\n-- Write your query below, run it, then press Check.\n\n`
}

function wrap(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}
