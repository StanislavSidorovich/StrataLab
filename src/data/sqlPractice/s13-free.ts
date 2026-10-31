import type { PracticeSection } from '../practiceBook'

export const FREE: PracticeSection = {
  id: 'free',
  n: 13,
  title: 'Free tasks',
  blocks: [
    {
      kind: 'note',
      text: 'No topic is named here: decide which tables and which technique each question takes. Look at the data first, the map is in section 0.',
    },
    {
      kind: 'task',
      id: 'free-months-widest-gap',
      title: 'Months that loaded the warehouses most',
      question: 'In which 3 months did Kaiyo ship the most units above what outlets sold? Use month_start for shipments and the month of week_start for sales. Show month_start, shipped, sold and gap, the widest gap first.',
      ordered: true,
      hints: ['Two facts: total each on its own, by month.', 'DATETRUNC(month, week_start) makes the sales’ month.', 'Join the two on the month; shipped minus sold is the gap, SELECT TOP (3), ORDER BY it DESC.'],
      solution: `WITH shipped AS (
  SELECT month_start, SUM(units) AS units
  FROM quaera.fact_sellin
  GROUP BY month_start
),
sold AS (
  SELECT DATETRUNC(month, week_start) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  GROUP BY DATETRUNC(month, week_start)
)
SELECT TOP (3) i.month_start, i.units AS shipped, s.units AS sold, i.units - s.units AS gap
FROM shipped AS i
JOIN sold AS s ON s.month_start = i.month_start
ORDER BY gap DESC, i.month_start;`,
      pg: `WITH shipped AS (
  SELECT month_start, SUM(units) AS units
  FROM quaera.fact_sellin
  GROUP BY month_start
),
sold AS (
  SELECT CAST(date_trunc('month', week_start) AS date) AS month_start, SUM(units) AS units
  FROM quaera.fact_sellout
  GROUP BY CAST(date_trunc('month', week_start) AS date)
)
SELECT i.month_start, i.units AS shipped, s.units AS sold, i.units - s.units AS gap
FROM shipped AS i
JOIN sold AS s ON s.month_start = i.month_start
ORDER BY gap DESC, i.month_start
LIMIT 3;`,
    },
    {
      kind: 'task',
      id: 'free-raw-extract-revenue',
      title: 'Revenue from the raw extract',
      question: 'staging_raw_sellout is an unclean export: SKU codes come in mixed case with stray spaces, and revenue is text, some of it with a decimal comma. What are the 5 SKU codes with the highest revenue? Show sku_code in capitals and revenue, the highest first.',
      ordered: true,
      hints: ['Clean the code with UPPER(TRIM(sku_code)), in SELECT and in GROUP BY.', "Turn the text into a number: TRY_CAST(REPLACE(revenue, ',', '.') AS DECIMAL(12, 2)).", 'SUM it, SELECT TOP (5), ORDER BY the sum DESC.'],
      solution: `SELECT TOP (5) UPPER(TRIM(sku_code)) AS sku_code,
       SUM(TRY_CAST(REPLACE(revenue, ',', '.') AS DECIMAL(12, 2))) AS revenue
FROM quaera.staging_raw_sellout
GROUP BY UPPER(TRIM(sku_code))
ORDER BY revenue DESC;`,
      pg: `SELECT UPPER(TRIM(sku_code)) AS sku_code,
       SUM(CASE WHEN REPLACE(revenue, ',', '.') ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN CAST(REPLACE(revenue, ',', '.') AS numeric(12, 2)) END) AS revenue
FROM quaera.staging_raw_sellout
GROUP BY UPPER(TRIM(sku_code))
ORDER BY revenue DESC
LIMIT 5;`,
    },
    {
      kind: 'task',
      id: 'free-outlets-per-manager',
      title: 'Outlets under each manager',
      question: 'A rep’s manager is also a row of dim_rep (manager_id). For each manager: how many of their reps have outlets, and how many outlets those reps hold? Show manager, reps and outlets, the most outlets first, then by name.',
      ordered: true,
      hints: ['dim_rep joined to itself, under two aliases: one for the rep, one for the manager.', 'dim_customer joined to the rep. A rep with many outlets repeats, so count reps with DISTINCT.', 'm.rep_name AS manager, COUNT(DISTINCT r.rep_id) AS reps, COUNT(*) AS outlets, GROUP BY m.rep_name.'],
      solution: `SELECT m.rep_name AS manager, COUNT(DISTINCT r.rep_id) AS reps, COUNT(*) AS outlets
FROM quaera.dim_customer AS c
JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
JOIN quaera.dim_rep AS m ON m.rep_id = r.manager_id
GROUP BY m.rep_name
ORDER BY outlets DESC, m.rep_name;`,
    },
    {
      kind: 'task',
      id: 'free-longest-gap-distributor',
      title: 'The longest wait between orders',
      question: 'For each distributor: the longest gap in days between two of its orders in a row, by order_date. Show customer_name and longest_gap, the longest first, then by name.',
      ordered: true,
      hints: ['Each order next to the one before it: LAG(order_date), per distributor.', 'DATEDIFF(day, previous_date, order_date) is the gap.', 'Then MAX of the gap per distributor, with the name from dim_customer.'],
      solution: `WITH orders AS (
  SELECT distributor_id, order_date,
         LAG(order_date) OVER (PARTITION BY distributor_id ORDER BY order_date) AS previous_date
  FROM quaera.fact_sellin
)
SELECT c.customer_name, MAX(DATEDIFF(day, o.previous_date, o.order_date)) AS longest_gap
FROM orders AS o
JOIN quaera.dim_customer AS c ON c.customer_id = o.distributor_id
GROUP BY c.customer_name
ORDER BY longest_gap DESC, c.customer_name;`,
      pg: `WITH orders AS (
  SELECT distributor_id, order_date,
         LAG(order_date) OVER (PARTITION BY distributor_id ORDER BY order_date) AS previous_date
  FROM quaera.fact_sellin
)
SELECT c.customer_name, MAX(o.order_date - o.previous_date) AS longest_gap
FROM orders AS o
JOIN quaera.dim_customer AS c ON c.customer_id = o.distributor_id
GROUP BY c.customer_name
ORDER BY longest_gap DESC, c.customer_name;`,
    },
    {
      kind: 'task',
      id: 'free-team-plan-2025',
      title: 'Teams against the plan',
      question: 'How did each sales team do against its revenue plan in 2025? An outlet’s sales count for its rep, and a rep’s for their team. Show team, revenue, target and done_pct rounded to 1 decimal, the highest done_pct first.',
      ordered: true,
      hints: ['Two facts again: sales per team through dim_customer and dim_rep, plans per team through dim_rep.', "fact_sellout → dim_customer on customer_id → dim_rep on rep_id; fact_target → dim_rep. Each with its own 2025 filter.", 'Join the totals on team; ROUND(100.0 * revenue / target, 1) AS done_pct.'],
      solution: `WITH sold AS (
  SELECT r.team, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
  JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
  WHERE YEAR(s.week_start) = 2025
  GROUP BY r.team
),
planned AS (
  SELECT r.team, SUM(t.target_revenue) AS target
  FROM quaera.fact_target AS t
  JOIN quaera.dim_rep AS r ON r.rep_id = t.rep_id
  WHERE YEAR(t.month_start) = 2025
  GROUP BY r.team
)
SELECT s.team, s.revenue, p.target, ROUND(100.0 * s.revenue / p.target, 1) AS done_pct
FROM sold AS s
JOIN planned AS p ON p.team = s.team
ORDER BY done_pct DESC, s.team;`,
      pg: `WITH sold AS (
  SELECT r.team, SUM(s.revenue) AS revenue
  FROM quaera.fact_sellout AS s
  JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
  JOIN quaera.dim_rep AS r ON r.rep_id = c.rep_id
  WHERE EXTRACT(YEAR FROM s.week_start) = 2025
  GROUP BY r.team
),
planned AS (
  SELECT r.team, SUM(t.target_revenue) AS target
  FROM quaera.fact_target AS t
  JOIN quaera.dim_rep AS r ON r.rep_id = t.rep_id
  WHERE EXTRACT(YEAR FROM t.month_start) = 2025
  GROUP BY r.team
)
SELECT s.team, s.revenue, p.target, ROUND(CAST(100.0 * s.revenue / p.target AS numeric), 1) AS done_pct
FROM sold AS s
JOIN planned AS p ON p.team = s.team
ORDER BY done_pct DESC, s.team;`,
      traps: [
        {
          code: `SELECT r.team, SUM(s.revenue) AS revenue, SUM(t.target_revenue) AS target, ROUND(100.0 * SUM(s.revenue) / SUM(t.target_revenue), 1) AS done_pct
FROM quaera.dim_rep AS r
JOIN quaera.fact_target AS t ON t.rep_id = r.rep_id AND YEAR(t.month_start) = 2025
JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id
JOIN quaera.fact_sellout AS s ON s.customer_id = c.customer_id AND YEAR(s.week_start) = 2025
GROUP BY r.team
ORDER BY done_pct DESC, r.team;`,
          says: 'Plans and sales are in one query, so every sale met all 12 months of the plan and both totals are far too big. Total sales and plans apart, then join the totals on team.',
        },
      ],
    },
  ],
}
