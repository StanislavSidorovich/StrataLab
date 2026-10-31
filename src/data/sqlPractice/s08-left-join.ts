import type { PracticeSection } from './types'

export const LEFT_JOIN: PracticeSection = {
  id: 'left-join',
  n: 8,
  title: 'LEFT JOIN and repeated rows',
  blocks: [
    {
      kind: 'note',
      text: '`LEFT JOIN` keeps every row of the table on its left; where the right table has no match, its columns are NULL. Use it when “none” is part of the answer. `COUNT(column)` skips NULLs, so nothing matched counts as 0.',
      syntax: 'FROM quaera.dim_rep AS r LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id',
      trap: 'A condition on the right table in WHERE throws away the NULL rows and turns LEFT into INNER. Put it in ON.',
    },
    {
      kind: 'example',
      id: 'left-outlets-per-rep',
      title: 'Outlets per person, managers with none included',
      sql: `SELECT r.rep_name, r.role, COUNT(c.customer_id) AS outlets
FROM quaera.dim_rep AS r
LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id
GROUP BY r.rep_name, r.role
ORDER BY outlets, r.rep_name;`,
    },
    {
      kind: 'task',
      id: 'left-promo-units-june',
      title: 'Every product under promotion in June',
      question: 'List all products with the units they sold under a promotion in the weeks starting in June 2026, 0 if none. Show product_name and units, the most units first, then by name.',
      ordered: true,
      hints: ['Start from dim_product so that every product stays.', 'The conditions on the sales go in ON, next to the key: in WHERE they would remove the products with no such sales.', "ISNULL(SUM(s.units), 0), and ON s.product_id = p.product_id AND s.promo_id IS NOT NULL AND s.week_start >= '2026-06-01'."],
      solution: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s
  ON s.product_id = p.product_id
  AND s.promo_id IS NOT NULL
  AND s.week_start >= '2026-06-01' AND s.week_start < '2026-07-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
      traps: [
        {
          sql: `SELECT p.product_name, ISNULL(SUM(s.units), 0) AS units
FROM quaera.dim_product AS p
LEFT JOIN quaera.fact_sellout AS s ON s.product_id = p.product_id
WHERE s.promo_id IS NOT NULL
  AND s.week_start >= '2026-06-01' AND s.week_start < '2026-07-01'
GROUP BY p.product_name
ORDER BY units DESC, p.product_name;`,
          says: 'The conditions are in WHERE, so the products with no promotion sales are gone: on their rows promo_id and week_start are NULL. Move the conditions into ON.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'To find rows with no match at all, `LEFT JOIN` and keep the rows where a column of the right table is NULL. This is an anti-join.',
    },
    {
      kind: 'example',
      id: 'left-regions-no-rep',
      title: 'Regions with no rep based there',
      sql: `SELECT g.region_name
FROM quaera.dim_region AS g
LEFT JOIN quaera.dim_rep AS r ON r.region_id = g.region_id
WHERE r.rep_id IS NULL
ORDER BY g.region_name;`,
    },
    {
      kind: 'task',
      id: 'left-reps-no-outlets',
      title: 'People with no outlets',
      question: 'Who in dim_rep has no outlet assigned? Show rep_name, team and role.',
      ordered: false,
      hints: ['Start from dim_rep and LEFT JOIN dim_customer on rep_id.', 'No outlet means the right side is NULL.', 'WHERE c.customer_id IS NULL.'],
      solution: `SELECT r.rep_name, r.team, r.role
FROM quaera.dim_rep AS r
LEFT JOIN quaera.dim_customer AS c ON c.rep_id = r.rep_id
WHERE c.customer_id IS NULL;`,
    },
    {
      kind: 'note',
      text: 'A join repeats a row once per match. Sales joined to outlets give one row per sale, so an outlet appears thousands of times: sums of the sales stay right, but counting outlets needs `COUNT(DISTINCT …)`.',
      trap: 'If a total is suddenly too big, compare COUNT(*) before and after the join.',
    },
    {
      kind: 'task',
      id: 'left-outlets-revenue-by-macro',
      title: 'Outlets and revenue by macro-region',
      question: 'For each macro-region: how many different outlets sold something, and their revenue? Show macro_region, outlets and revenue, the highest revenue first.',
      ordered: true,
      hints: ['fact_sellout → dim_customer → dim_region. A plain JOIN will do here: only outlets that sold are asked for.', 'One outlet has many sales rows.', 'COUNT(DISTINCT s.customer_id) AS outlets.'],
      solution: `SELECT r.macro_region, COUNT(DISTINCT s.customer_id) AS outlets, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.macro_region
ORDER BY revenue DESC;`,
      traps: [
        {
          sql: `SELECT r.macro_region, COUNT(s.customer_id) AS outlets, SUM(s.revenue) AS revenue
FROM quaera.fact_sellout AS s
JOIN quaera.dim_customer AS c ON c.customer_id = s.customer_id
JOIN quaera.dim_region AS r ON r.region_id = c.region_id
GROUP BY r.macro_region
ORDER BY revenue DESC;`,
          says: 'COUNT(customer_id) counted the sales rows, not the outlets: an outlet repeats once per sale. Use COUNT(DISTINCT customer_id).',
        },
      ],
    },
  ],
}
