// The dataset catalog (stage 3): sample databases that load in one click, each into its own
// schema (chinook.Track, sakila.film…), so they never clash with each other or with the
// user's tables. The rows and CREATE TABLE statements come from scripts/build-datasets.py
// (datasets.json); this file says what each one is, where it comes from and how to start.
import built from './datasets.json'

export interface SelfRef {
  columns: string[]
  refColumns: string[]
  key: string[]
}

export interface DatasetTable {
  name: string
  file: string
  rows: number
  bytes: number
  /** a foreign key to the same table: rows are loaded parents first */
  selfRef?: SelfRef
}

export interface Dataset {
  id: string
  title: string
  /** one line: what the data is about */
  about: string
  /** what it is good for */
  practise: string
  licence: string
  source: { label: string; url: string }
  /** left out on the way, said plainly */
  notes?: string
  starter: string
  ddl: string[]
  tables: DatasetTable[]
}

type Built = Record<string, { ddl: string[]; tables: DatasetTable[] }>
const data = built as Built

const META: Omit<Dataset, 'ddl' | 'tables'>[] = [
  {
    id: 'chinook',
    title: 'Chinook',
    about: 'A digital music store: artists, albums, tracks, customers, invoices.',
    practise: 'JOINs across five tables, GROUP BY, an employee hierarchy (ReportsTo).',
    licence: 'MIT',
    source: { label: 'lerocha/chinook-database', url: 'https://github.com/lerocha/chinook-database' },
    starter: `-- Chinook: a digital music store. Its tables live in the schema chinook.
-- Top 10 artists by revenue:
SELECT ar.Name AS artist,
       sum(il.UnitPrice * il.Quantity) AS revenue
FROM chinook.InvoiceLine il
JOIN chinook.Track  t  ON t.TrackId   = il.TrackId
JOIN chinook.Album  al ON al.AlbumId  = t.AlbumId
JOIN chinook.Artist ar ON ar.ArtistId = al.ArtistId
GROUP BY ar.Name
ORDER BY revenue DESC
LIMIT 10;
`,
  },
  {
    id: 'northwind',
    title: 'Northwind',
    about: "Microsoft's classic trading company: customers, orders, products, suppliers, employees.",
    practise: 'The SQL Server textbook dataset: most T-SQL tutorials use it, so their queries carry over.',
    licence: 'MIT',
    source: { label: 'microsoft/sql-server-samples', url: 'https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/northwind-pubs' },
    notes: 'The pictures (Categories.Picture, Employees.Photo) are left out; datetime columns are DATE.',
    starter: `-- Northwind: Microsoft's sample trading company. Its tables live in the schema northwind.
-- A name with a space needs double quotes in DuckDB ([Order Details] in SQL Server).
-- Sales by category:
SELECT c.CategoryName,
       round(sum(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS sales
FROM northwind."Order Details" od
JOIN northwind.Products   p ON p.ProductID  = od.ProductID
JOIN northwind.Categories c ON c.CategoryID = p.CategoryID
GROUP BY c.CategoryName
ORDER BY sales DESC;
`,
  },
  {
    id: 'adventureworks',
    title: 'AdventureWorks LT',
    about: "Microsoft's bicycle maker, the light edition (SalesLT): customers, addresses, products, categories, orders.",
    practise: 'The other SQL Server textbook dataset: a category tree, a customer with several addresses, order headers and lines.',
    licence: 'MIT',
    source: { label: 'microsoft/sql-server-samples', url: 'https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/adventure-works' },
    notes:
      "Product.ThumbNailPhoto and the views are left out; LineTotal, SalesOrderNumber and TotalDue (computed in SQL Server) are stored values. The Arabic, Hebrew, Thai and Chinese descriptions are “???” in Microsoft's backup itself.",
    starter: `-- AdventureWorks LT: Microsoft's bicycle maker. Its tables live in the schema adventureworks
-- (SalesLT.Product in SQL Server is adventureworks.Product here).
-- Revenue by product category, with the category above it:
SELECT parent.Name AS parent_category,
       cat.Name    AS category,
       round(sum(d.LineTotal), 2) AS revenue
FROM adventureworks.SalesOrderDetail d
JOIN adventureworks.Product         p   ON p.ProductID = d.ProductID
JOIN adventureworks.ProductCategory cat ON cat.ProductCategoryID = p.ProductCategoryID
LEFT JOIN adventureworks.ProductCategory parent ON parent.ProductCategoryID = cat.ParentProductCategoryID
GROUP BY ALL
ORDER BY revenue DESC;
`,
  },
  {
    id: 'sakila',
    title: 'Sakila',
    about: 'A DVD rental chain: films, actors, inventory, rentals, payments.',
    practise: 'Many-to-many tables (film_actor), dates and durations, payments per customer.',
    licence: 'BSD-2-Clause',
    source: { label: 'jOOQ/sakila', url: 'https://github.com/jOOQ/sakila' },
    notes: 'staff.picture and film_text are left out; store.manager_staff_id has no foreign key (it would close a circle with staff.store_id).',
    starter: `-- Sakila: a DVD rental chain. Its tables live in the schema sakila.
-- Rentals by film category:
SELECT c.name AS category,
       count(*) AS rentals
FROM sakila.rental r
JOIN sakila.inventory     i  USING (inventory_id)
JOIN sakila.film_category fc USING (film_id)
JOIN sakila.category      c  USING (category_id)
GROUP BY c.name
ORDER BY rentals DESC;
`,
  },
  {
    id: 'quaera',
    title: 'Kaiyo Trading (Quaera)',
    about: "Quaera's own dataset: an FMCG and OTC-pharma distributor, a star schema over 2.5 years.",
    practise: 'Real analyst questions: sell-in vs sell-out, stock, seasonality, a brand that lost distribution.',
    licence: 'CC BY-NC-SA 4.0',
    source: { label: 'quaera.app', url: 'https://quaera.app' },
    notes: 'The same rows as on quaera.app, so its SQL tasks can be tried here.',
    starter: `-- Kaiyo Trading, the dataset of quaera.app. Its tables live in the schema quaera.
-- Sell-out revenue by category and year:
SELECT p.category,
       year(s.week_start)   AS year,
       round(sum(s.revenue)) AS revenue
FROM quaera.fact_sellout s
JOIN quaera.dim_product p USING (product_id)
GROUP BY ALL
ORDER BY p.category, year;
`,
  },
]

export const DATASETS: Dataset[] = META.map((m) => ({ ...m, ...data[m.id] }))

export function datasetById(id: string): Dataset | undefined {
  return DATASETS.find((d) => d.id === id)
}

export const datasetBytes = (d: Dataset) => d.tables.reduce((n, t) => n + t.bytes, 0)
export const datasetRows = (d: Dataset) => d.tables.reduce((n, t) => n + t.rows, 0)

/** `#ds=chinook` → "chinook" (or null). */
export function datasetFromHash(hash: string): string | null {
  const m = /(?:^#|&)ds=([a-z0-9_-]+)/i.exec(hash)
  return m ? m[1].toLowerCase() : null
}

export function hashWithoutDataset(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !/^ds=/i.test(p))
  return rest.length ? '#' + rest.join('&') : ''
}
