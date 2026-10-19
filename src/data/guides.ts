// A guide for each sample dataset: what the data is about, worked examples that run in one
// click (the same question in SQL and in pandas, from a first look to windows and pivots), and a
// short pandas ↔ SQL cheat sheet on the dataset's own tables. Every example and every cheat sheet
// line is run against the real data by tests/guides.test.ts (SQL in DuckDB, Python in Pyodide
// through lab.table), so they must work without edits.

export type GuideLevel = 'look' | 'filter' | 'group' | 'join' | 'dates' | 'window' | 'pivot'

export const LEVEL_LABEL: Record<GuideLevel, string> = {
  look: 'first look',
  filter: 'filter',
  group: 'group',
  join: 'join',
  dates: 'dates',
  window: 'window',
  pivot: 'pivot',
}

export interface GuideExample {
  title: string
  /** the question, in a line */
  question: string
  level: GuideLevel
  sql: string
  python: string
}

export interface GuideTable {
  name: string
  about: string
}

/** A cheat sheet's tables and columns: the lines are made from these (cheatSheet below). */
export interface CheatSpec {
  /** the main table, `t` in Python */
  table: string
  /** a numeric column and a value to compare it with */
  num: string
  over: number
  /** a column to group by */
  cat: string
  /** a column with NULLs */
  nullable: string
  /** a second table, `u` in Python, and the column both have */
  join: { table: string; key: string }
}

export interface Guide {
  id: string
  /** two or three sentences: what the data is about */
  summary: string
  tables: GuideTable[]
  /** how the main tables connect, one link a line (`Track.AlbumId → Album`) */
  links: string[]
  facts: string[]
  examples: GuideExample[]
  cheat: CheatSpec
}

export interface CheatLine {
  task: string
  sql: string
  python: string
}

const q = (s: string) => JSON.stringify(s)
/** `chinook.Order Details` → `chinook."Order Details"`: a name with a space is quoted in SQL. */
const sqlName = (table: string) => table.replace(/\.(.*)$/, (_, n: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? `.${n}` : `.${q(n)}`))

/** The cheat sheet of a dataset: the same task in SQL and pandas, on its tables. */
export function cheatSheet(c: CheatSpec): CheatLine[] {
  const T = sqlName(c.table)
  const U = sqlName(c.join.table)
  const col = (name: string) => `t[${q(name)}]`
  return [
    { task: 'First rows', sql: `SELECT * FROM ${T} LIMIT 5;`, python: `t.head(5)` },
    { task: 'How many rows', sql: `SELECT count(*) FROM ${T};`, python: `len(t)` },
    { task: 'Columns and their types', sql: `DESCRIBE ${T};`, python: `t.dtypes` },
    { task: 'Some columns', sql: `SELECT ${c.cat}, ${c.num} FROM ${T};`, python: `t[[${q(c.cat)}, ${q(c.num)}]]` },
    { task: 'Filter rows', sql: `SELECT * FROM ${T} WHERE ${c.num} > ${c.over};`, python: `t[${col(c.num)} > ${c.over}]` },
    { task: 'Missing values (NULL)', sql: `SELECT * FROM ${T} WHERE ${c.nullable} IS NULL;`, python: `t[${col(c.nullable)}.isna()]` },
    {
      task: 'Two conditions (AND is &, OR is |, each in brackets)',
      sql: `SELECT * FROM ${T} WHERE ${c.num} > ${c.over} AND ${c.nullable} IS NOT NULL;`,
      python: `t[(${col(c.num)} > ${c.over}) & ${col(c.nullable)}.notna()]`,
    },
    { task: 'Sort, keep the top 10', sql: `SELECT * FROM ${T} ORDER BY ${c.num} DESC LIMIT 10;`, python: `t.sort_values(${q(c.num)}, ascending=False).head(10)` },
    { task: 'Distinct values', sql: `SELECT DISTINCT ${c.cat} FROM ${T};`, python: `t[${q(c.cat)}].drop_duplicates()` },
    { task: 'Rows per value', sql: `SELECT ${c.cat}, count(*) AS n FROM ${T} GROUP BY ${c.cat} ORDER BY n DESC;`, python: `t[${q(c.cat)}].value_counts()` },
    {
      task: 'Group with several totals',
      sql: `SELECT ${c.cat}, count(*) AS n, avg(${c.num}) AS avg_value, max(${c.num}) AS max_value\nFROM ${T}\nGROUP BY ${c.cat};`,
      python: `t.groupby(${q(c.cat)}).agg(n=(${q(c.num)}, "size"), avg_value=(${q(c.num)}, "mean"), max_value=(${q(c.num)}, "max"))`,
    },
    {
      task: 'A new column from a condition (CASE WHEN)',
      sql: `SELECT *, CASE WHEN ${c.num} > ${c.over} THEN 'high' ELSE 'low' END AS level FROM ${T};`,
      python: `t.assign(level=np.where(${col(c.num)} > ${c.over}, "high", "low"))`,
    },
    { task: 'Join two tables', sql: `SELECT * FROM ${T} JOIN ${U} USING (${c.join.key});`, python: `t.merge(u, on=${q(c.join.key)})` },
    { task: 'Keep rows without a match (LEFT JOIN)', sql: `SELECT * FROM ${T} LEFT JOIN ${U} USING (${c.join.key});`, python: `t.merge(u, on=${q(c.join.key)}, how="left")` },
    {
      task: 'Rank inside each group (window)',
      sql: `SELECT *, rank() OVER (PARTITION BY ${c.cat} ORDER BY ${c.num} DESC) AS rnk FROM ${T};`,
      python: `t.assign(rnk=t.groupby(${q(c.cat)})[${q(c.num)}].rank(method="min", ascending=False))`,
    },
  ]
}

/** The lines a cheat sheet's Python needs before its line: numpy, `t` and `u`. */
export function cheatSetup(c: CheatSpec, line: string): string {
  const out = ['import numpy as np', '', `t = lab.table(${q(c.table)})`]
  if (/\bu\b/.test(line)) out.push(`u = lab.table(${q(c.join.table)})`)
  return out.join('\n') + '\n\n' + line + '\n'
}

export const GUIDES: Guide[] = [
  {
    id: 'chinook',
    summary:
      'A digital music store, like an early iTunes. Artists release albums, albums hold tracks, and customers buy tracks: every purchase is an invoice with one line per track. The store has a small staff, and each customer has a support rep.',
    tables: [
      { name: 'Track', about: 'one row per song: name, length, price, album, genre' },
      { name: 'Album, Artist', about: 'who made which album' },
      { name: 'Genre, MediaType', about: 'small lookup tables for tracks' },
      { name: 'Customer', about: 'buyers in 24 countries, each with a support rep' },
      { name: 'Invoice, InvoiceLine', about: 'purchases: the header (date, country, total) and its lines (track, price, quantity)' },
      { name: 'Employee', about: 'staff; ReportsTo points at the manager (a hierarchy)' },
      { name: 'Playlist, PlaylistTrack', about: 'playlists and their tracks (many to many)' },
    ],
    links: [
      'Track.AlbumId → Album, Album.ArtistId → Artist',
      'Track.GenreId → Genre',
      'InvoiceLine.InvoiceId → Invoice, InvoiceLine.TrackId → Track',
      'Invoice.CustomerId → Customer, Customer.SupportRepId → Employee',
      'Employee.ReportsTo → Employee (the manager)',
    ],
    facts: [
      '3,503 tracks, 347 albums, 275 artists; Rock is the largest genre (1,297 tracks).',
      '412 invoices from 59 customers, 2021 to 2025; the USA bought the most (523.06 of 2,328.60).',
      '1,519 tracks were never bought: a LEFT JOIN finds them.',
    ],
    examples: [
      {
        title: 'First look at the tracks',
        question: 'What columns does Track have, and what do the values look like?',
        level: 'look',
        sql: `-- The first 10 rows of a table: its columns and what the values look like.
SELECT *
FROM chinook.Track
LIMIT 10;
`,
        python: `# lab.table gives a whole table as a pandas DataFrame.
tracks = lab.table("chinook.Track")

# .head(10) shows the first 10 rows, like LIMIT 10 in SQL.
tracks.head(10)
`,
      },
      {
        title: 'Long tracks',
        question: 'Which tracks are longer than 20 minutes?',
        level: 'filter',
        sql: `-- Milliseconds / 60000 = minutes. WHERE keeps the rows that pass the test.
SELECT Name,
       Composer,
       round(Milliseconds / 60000, 1) AS minutes
FROM chinook.Track
WHERE Milliseconds > 20 * 60 * 1000
ORDER BY Milliseconds DESC;
`,
        python: `tracks = lab.table("chinook.Track")

# A new column: the length in minutes, rounded to 1 decimal.
tracks["minutes"] = (tracks["Milliseconds"] / 60000).round(1)

# tracks[condition] keeps the rows where the condition is True (WHERE in SQL).
long = tracks[tracks["Milliseconds"] > 20 * 60 * 1000]

# Sort longest first (ORDER BY ... DESC) and keep three columns.
long.sort_values("Milliseconds", ascending=False)[["Name", "Composer", "minutes"]]
`,
      },
      {
        title: 'Sales by country',
        question: 'How many invoices and how much revenue per country?',
        level: 'group',
        sql: `-- GROUP BY makes one row per country; count and sum work inside each group.
SELECT BillingCountry AS country,
       count(*)       AS invoices,
       sum(Total)     AS revenue
FROM chinook.Invoice
GROUP BY BillingCountry
ORDER BY revenue DESC;
`,
        python: `invoices = lab.table("chinook.Invoice")

# groupby + agg: one row per country. Each new column is (column, function).
by_country = invoices.groupby("BillingCountry").agg(
    invoices=("InvoiceId", "count"),
    revenue=("Total", "sum"),
)
by_country["revenue"] = by_country["revenue"].round(2)
by_country.sort_values("revenue", ascending=False)
`,
      },
      {
        title: 'Tracks per genre',
        question: 'How many tracks does each genre have, and how long are they on average?',
        level: 'join',
        sql: `-- JOIN puts each track next to its genre (same GenreId in both tables).
SELECT g.Name AS genre,
       count(*) AS tracks,
       round(avg(t.Milliseconds) / 60000, 1) AS avg_minutes
FROM chinook.Track t
JOIN chinook.Genre g ON g.GenreId = t.GenreId
GROUP BY g.Name
ORDER BY tracks DESC;
`,
        python: `tracks = lab.table("chinook.Track")
# Both tables have a column called Name: rename the genre's to keep them apart.
genres = lab.table("chinook.Genre").rename(columns={"Name": "genre"})

# merge is pandas' JOIN: rows with the same GenreId are put side by side.
both = tracks.merge(genres, on="GenreId")

result = both.groupby("genre").agg(
    tracks=("TrackId", "count"),
    avg_ms=("Milliseconds", "mean"),
)
result["avg_minutes"] = (result["avg_ms"] / 60000).round(1)
result.drop(columns="avg_ms").sort_values("tracks", ascending=False)
`,
      },
      {
        title: 'Best-selling albums',
        question: 'Which 10 albums earned the most, and by whom?',
        level: 'join',
        sql: `-- Four tables in a chain: invoice line → track → album → artist.
SELECT al.Title AS album,
       ar.Name  AS artist,
       sum(il.UnitPrice * il.Quantity) AS revenue
FROM chinook.InvoiceLine il
JOIN chinook.Track  t  ON t.TrackId   = il.TrackId
JOIN chinook.Album  al ON al.AlbumId  = t.AlbumId
JOIN chinook.Artist ar ON ar.ArtistId = al.ArtistId
GROUP BY al.Title, ar.Name
ORDER BY revenue DESC, album
LIMIT 10;
`,
        python: `lines = lab.table("chinook.InvoiceLine")
tracks = lab.table("chinook.Track")[["TrackId", "AlbumId"]]
albums = lab.table("chinook.Album").rename(columns={"Title": "album"})
artists = lab.table("chinook.Artist").rename(columns={"Name": "artist"})

# The same chain of joins, one merge at a time.
df = lines.merge(tracks, on="TrackId").merge(albums, on="AlbumId").merge(artists, on="ArtistId")
df["revenue"] = df["UnitPrice"] * df["Quantity"]

top = df.groupby(["album", "artist"], as_index=False)["revenue"].sum().round(2)
top.sort_values(["revenue", "album"], ascending=[False, True]).head(10)
`,
      },
      {
        title: 'Revenue by month, with a running total',
        question: 'How much came in each month, and how much so far?',
        level: 'dates',
        sql: `-- date_trunc cuts a date to the first day of its month.
-- sum(...) OVER (ORDER BY month) adds up every month up to this one: a running total.
SELECT date_trunc('month', InvoiceDate) AS month,
       sum(Total) AS revenue,
       sum(sum(Total)) OVER (ORDER BY date_trunc('month', InvoiceDate)) AS running_total
FROM chinook.Invoice
GROUP BY month
ORDER BY month;
`,
        python: `invoices = lab.table("chinook.Invoice")

# .dt works on dates: to_period("M") is the month, to_timestamp() its first day.
invoices["month"] = invoices["InvoiceDate"].dt.to_period("M").dt.to_timestamp()

monthly = invoices.groupby("month", as_index=False)["Total"].sum()
# cumsum() is the running total, the same as SUM(...) OVER (ORDER BY month).
monthly["running_total"] = monthly["Total"].cumsum().round(2)
monthly["Total"] = monthly["Total"].round(2)
monthly
`,
      },
      {
        title: 'Top 3 tracks in each genre',
        question: 'Which three tracks of every genre sold the most?',
        level: 'window',
        sql: `-- row_number() numbers the tracks inside each genre (PARTITION BY), best seller first.
-- QUALIFY filters on a window function, as WHERE does on a column.
SELECT g.Name AS genre,
       t.Name AS track,
       sum(il.Quantity) AS sold,
       row_number() OVER (PARTITION BY g.Name ORDER BY sum(il.Quantity) DESC, t.Name) AS place
FROM chinook.InvoiceLine il
JOIN chinook.Track t ON t.TrackId = il.TrackId
JOIN chinook.Genre g ON g.GenreId = t.GenreId
GROUP BY g.Name, t.Name
QUALIFY place <= 3
ORDER BY genre, place;
`,
        python: `lines = lab.table("chinook.InvoiceLine")
tracks = lab.table("chinook.Track").rename(columns={"Name": "track"})
genres = lab.table("chinook.Genre").rename(columns={"Name": "genre"})

df = lines.merge(tracks[["TrackId", "track", "GenreId"]], on="TrackId").merge(genres, on="GenreId")
sold = df.groupby(["genre", "track"], as_index=False)["Quantity"].sum().rename(columns={"Quantity": "sold"})

# Sort inside each genre, best seller first, then keep the first 3 rows of every genre.
sold = sold.sort_values(["genre", "sold", "track"], ascending=[True, False, True])
sold["place"] = sold.groupby("genre").cumcount() + 1
sold[sold["place"] <= 3]
`,
      },
      {
        title: 'Revenue by country and year',
        question: 'A table with a row per country and a column per year.',
        level: 'pivot',
        sql: `-- PIVOT turns the years into columns (DuckDB's syntax; SQL Server's PIVOT differs).
PIVOT (
    SELECT BillingCountry AS country, year(InvoiceDate) AS year, Total
    FROM chinook.Invoice
)
ON year
USING sum(Total)
ORDER BY country;
`,
        python: `invoices = lab.table("chinook.Invoice")
invoices["year"] = invoices["InvoiceDate"].dt.year

# pivot_table: rows from one column, columns from another, values summed.
invoices.pivot_table(index="BillingCountry", columns="year", values="Total", aggfunc="sum").round(2)
`,
      },
    ],
    cheat: { table: 'chinook.Invoice', num: 'Total', over: 10, cat: 'BillingCountry', nullable: 'BillingState', join: { table: 'chinook.Customer', key: 'CustomerId' } },
  },
  {
    id: 'northwind',
    summary:
      'Northwind Traders, a small food wholesaler from Microsoft\'s textbooks (1996 to 1998). Customers place orders, each order has lines with a product, a price, a quantity and a discount. Products come from suppliers and belong to categories; employees take the orders and shippers deliver them.',
    tables: [
      { name: 'Orders', about: 'one row per order: customer, employee, dates, freight, where it ships' },
      { name: 'Order Details', about: 'the order lines: product, unit price, quantity, discount (a name with a space)' },
      { name: 'Products', about: '77 products with price, stock and a Discontinued flag' },
      { name: 'Categories, Suppliers', about: 'what kind of product, and who makes it' },
      { name: 'Customers', about: '91 companies; CustomerID is text (ALFKI)' },
      { name: 'Employees', about: 'sales staff; ReportsTo points at the manager' },
      { name: 'Shippers, Region, Territories', about: 'delivery companies and sales territories' },
    ],
    links: [
      '"Order Details".OrderID → Orders, "Order Details".ProductID → Products',
      'Orders.CustomerID → Customers, Orders.EmployeeID → Employees, Orders.ShipVia → Shippers',
      'Products.CategoryID → Categories, Products.SupplierID → Suppliers',
      'Employees.ReportsTo → Employees (the manager)',
    ],
    facts: [
      '830 orders from 4 July 1996 to 6 May 1998; Germany and the USA have 122 each.',
      'Sales after discount add up to 1,265,793.04.',
      '21 orders were never shipped (ShippedDate is NULL); 18 products are below their reorder level.',
    ],
    examples: [
      {
        title: 'First look at the products',
        question: 'What does the Products table hold?',
        level: 'look',
        sql: `-- The first 10 rows of a table: its columns and what the values look like.
SELECT *
FROM northwind.Products
LIMIT 10;
`,
        python: `# lab.table gives a whole table as a pandas DataFrame.
products = lab.table("northwind.Products")

# .head(10) shows the first 10 rows, like LIMIT 10 in SQL.
products.head(10)
`,
      },
      {
        title: 'Products to reorder',
        question: 'Which products still on sale have less stock than their reorder level?',
        level: 'filter',
        sql: `-- Two conditions joined by AND; NOT turns a true/false column around.
SELECT ProductName, UnitsInStock, UnitsOnOrder, ReorderLevel
FROM northwind.Products
WHERE UnitsInStock < ReorderLevel
  AND NOT Discontinued
ORDER BY UnitsInStock;
`,
        python: `products = lab.table("northwind.Products")

# In pandas, AND is &, NOT is ~, and each condition goes in brackets.
low = products[(products["UnitsInStock"] < products["ReorderLevel"]) & ~products["Discontinued"]]

low.sort_values("UnitsInStock")[["ProductName", "UnitsInStock", "UnitsOnOrder", "ReorderLevel"]]
`,
      },
      {
        title: 'Orders by country',
        question: 'How many orders went to each country, and what did freight cost on average?',
        level: 'group',
        sql: `SELECT ShipCountry,
       count(*) AS orders,
       round(avg(Freight), 2) AS avg_freight
FROM northwind.Orders
GROUP BY ShipCountry
ORDER BY orders DESC, ShipCountry;
`,
        python: `orders = lab.table("northwind.Orders")

# groupby + agg: one row per country. Each new column is (column, function).
by_country = orders.groupby("ShipCountry", as_index=False).agg(
    orders=("OrderID", "count"),
    avg_freight=("Freight", "mean"),
)
by_country["avg_freight"] = by_country["avg_freight"].round(2)
by_country.sort_values(["orders", "ShipCountry"], ascending=[False, True])
`,
      },
      {
        title: 'Products with category and supplier',
        question: 'Every product with the name of its category and the country of its supplier.',
        level: 'join',
        sql: `-- Two JOINs: the product's category and its supplier.
SELECT p.ProductName,
       c.CategoryName,
       s.CompanyName AS supplier,
       s.Country     AS supplier_country,
       p.UnitPrice
FROM northwind.Products p
JOIN northwind.Categories c ON c.CategoryID = p.CategoryID
JOIN northwind.Suppliers  s ON s.SupplierID = p.SupplierID
ORDER BY c.CategoryName, p.ProductName;
`,
        python: `products = lab.table("northwind.Products")
categories = lab.table("northwind.Categories")[["CategoryID", "CategoryName"]]
suppliers = lab.table("northwind.Suppliers")[["SupplierID", "CompanyName", "Country"]]
suppliers = suppliers.rename(columns={"CompanyName": "supplier", "Country": "supplier_country"})

# merge is pandas' JOIN; one merge per joined table.
df = products.merge(categories, on="CategoryID").merge(suppliers, on="SupplierID")
df.sort_values(["CategoryName", "ProductName"])[["ProductName", "CategoryName", "supplier", "supplier_country", "UnitPrice"]]
`,
      },
      {
        title: 'Sales by employee',
        question: 'How much did each employee sell, after discounts?',
        level: 'join',
        sql: `-- A line's sale: price × quantity × (1 − discount). "Order Details" needs quotes: its name has a space.
SELECT e.FirstName || ' ' || e.LastName AS employee,
       count(DISTINCT o.OrderID) AS orders,
       round(sum(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS sales
FROM northwind.Orders o
JOIN northwind."Order Details" od ON od.OrderID = o.OrderID
JOIN northwind.Employees e ON e.EmployeeID = o.EmployeeID
GROUP BY employee
ORDER BY sales DESC;
`,
        python: `orders = lab.table("northwind.Orders")[["OrderID", "EmployeeID"]]
lines = lab.table("northwind.Order Details")
employees = lab.table("northwind.Employees")
employees["employee"] = employees["FirstName"] + " " + employees["LastName"]

df = lines.merge(orders, on="OrderID").merge(employees[["EmployeeID", "employee"]], on="EmployeeID")
df["sale"] = df["UnitPrice"] * df["Quantity"] * (1 - df["Discount"])

# nunique counts distinct values, like count(DISTINCT ...).
result = df.groupby("employee", as_index=False).agg(orders=("OrderID", "nunique"), sales=("sale", "sum"))
result["sales"] = result["sales"].round(2)
result.sort_values("sales", ascending=False)
`,
      },
      {
        title: 'Sales by month, with a running total',
        question: 'How much was sold each month, and how much so far?',
        level: 'dates',
        sql: `-- date_trunc cuts a date to the first day of its month.
-- sum(...) OVER (ORDER BY month) adds up every month up to this one.
SELECT date_trunc('month', o.OrderDate) AS month,
       round(sum(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS sales,
       round(sum(sum(od.UnitPrice * od.Quantity * (1 - od.Discount))) OVER (ORDER BY date_trunc('month', o.OrderDate)), 2) AS running_total
FROM northwind.Orders o
JOIN northwind."Order Details" od ON od.OrderID = o.OrderID
GROUP BY month
ORDER BY month;
`,
        python: `orders = lab.table("northwind.Orders")[["OrderID", "OrderDate"]]
lines = lab.table("northwind.Order Details")

df = lines.merge(orders, on="OrderID")
df["sale"] = df["UnitPrice"] * df["Quantity"] * (1 - df["Discount"])
# .dt works on dates: to_period("M") is the month, to_timestamp() its first day.
df["month"] = df["OrderDate"].dt.to_period("M").dt.to_timestamp()

monthly = df.groupby("month", as_index=False)["sale"].sum()
# cumsum() is the running total, the same as SUM(...) OVER (ORDER BY month).
monthly["running_total"] = monthly["sale"].cumsum().round(2)
monthly["sale"] = monthly["sale"].round(2)
monthly
`,
      },
      {
        title: 'Top 3 products in each category',
        question: 'Which three products of every category sold the most?',
        level: 'window',
        sql: `-- rank() numbers the products inside each category (PARTITION BY), best first.
-- QUALIFY filters on a window function, as WHERE does on a column.
SELECT c.CategoryName,
       p.ProductName,
       round(sum(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS sales,
       rank() OVER (PARTITION BY c.CategoryName ORDER BY sum(od.UnitPrice * od.Quantity * (1 - od.Discount)) DESC) AS place
FROM northwind."Order Details" od
JOIN northwind.Products   p ON p.ProductID  = od.ProductID
JOIN northwind.Categories c ON c.CategoryID = p.CategoryID
GROUP BY c.CategoryName, p.ProductName
QUALIFY place <= 3
ORDER BY c.CategoryName, place;
`,
        python: `lines = lab.table("northwind.Order Details")
products = lab.table("northwind.Products")[["ProductID", "ProductName", "CategoryID"]]
categories = lab.table("northwind.Categories")[["CategoryID", "CategoryName"]]

df = lines.merge(products, on="ProductID").merge(categories, on="CategoryID")
df["sale"] = df["UnitPrice"] * df["Quantity"] * (1 - df["Discount"])
sales = df.groupby(["CategoryName", "ProductName"], as_index=False)["sale"].sum()

# rank inside each category, the biggest sale first: rank() OVER (PARTITION BY ...).
sales["place"] = sales.groupby("CategoryName")["sale"].rank(method="min", ascending=False)
sales["sale"] = sales["sale"].round(2)
sales[sales["place"] <= 3].sort_values(["CategoryName", "place"])
`,
      },
      {
        title: 'Sales by category and year',
        question: 'A table with a row per category and a column per year.',
        level: 'pivot',
        sql: `-- PIVOT turns the years into columns (DuckDB's syntax; SQL Server's PIVOT differs).
PIVOT (
    SELECT c.CategoryName,
           year(o.OrderDate) AS year,
           od.UnitPrice * od.Quantity * (1 - od.Discount) AS sale
    FROM northwind."Order Details" od
    JOIN northwind.Orders     o ON o.OrderID    = od.OrderID
    JOIN northwind.Products   p ON p.ProductID  = od.ProductID
    JOIN northwind.Categories c ON c.CategoryID = p.CategoryID
)
ON year
USING round(sum(sale), 2)
ORDER BY CategoryName;
`,
        python: `lines = lab.table("northwind.Order Details")
orders = lab.table("northwind.Orders")[["OrderID", "OrderDate"]]
products = lab.table("northwind.Products")[["ProductID", "CategoryID"]]
categories = lab.table("northwind.Categories")[["CategoryID", "CategoryName"]]

df = lines.merge(orders, on="OrderID").merge(products, on="ProductID").merge(categories, on="CategoryID")
df["sale"] = df["UnitPrice"] * df["Quantity"] * (1 - df["Discount"])
df["year"] = df["OrderDate"].dt.year

# pivot_table: rows from one column, columns from another, values summed.
df.pivot_table(index="CategoryName", columns="year", values="sale", aggfunc="sum").round(2)
`,
      },
    ],
    cheat: { table: 'northwind.Orders', num: 'Freight', over: 100, cat: 'ShipCountry', nullable: 'ShipRegion', join: { table: 'northwind.Customers', key: 'CustomerID' } },
  },
  {
    id: 'adventureworks',
    summary:
      'Adventure Works, Microsoft\'s bicycle maker, in its light edition (SalesLT). Products sit in a two-level category tree (Bikes → Mountain Bikes), and a month of sales to 32 business customers is recorded as order headers and order lines.',
    tables: [
      { name: 'Product', about: '295 products: colour, size, cost, list price, category, model' },
      { name: 'ProductCategory', about: 'a tree: a category points at its parent (Bikes → Road Bikes)' },
      { name: 'ProductModel, ProductDescription', about: 'models and their descriptions in several languages' },
      { name: 'SalesOrderHeader', about: 'one row per order: customer, dates, subtotal, tax, freight, total' },
      { name: 'SalesOrderDetail', about: 'the order lines: product, quantity, price, discount, line total' },
      { name: 'Customer, Address, CustomerAddress', about: 'customers (shops) and their addresses; one customer can have several' },
    ],
    links: [
      'SalesOrderDetail.SalesOrderID → SalesOrderHeader, SalesOrderDetail.ProductID → Product',
      'SalesOrderHeader.CustomerID → Customer',
      'Product.ProductCategoryID → ProductCategory, ProductCategory.ParentProductCategoryID → ProductCategory',
      'CustomerAddress links Customer and Address (many to many)',
    ],
    facts: [
      '4 top categories (Bikes, Components, Clothing, Accessories) over 37 subcategories.',
      'All 32 orders are dated 1 June 2008; they range from 43.04 to 119,960.82.',
      'Size and Color have NULLs (84 and 50 products): good for practising IS NULL and pandas isna().',
    ],
    examples: [
      {
        title: 'First look at the products',
        question: 'What does the Product table hold?',
        level: 'look',
        sql: `-- The first 10 rows of a table. Empty cells are NULL: no value.
SELECT *
FROM adventureworks.Product
LIMIT 10;
`,
        python: `# lab.table gives a whole table as a pandas DataFrame.
products = lab.table("adventureworks.Product")

# .head(10) shows the first 10 rows. Missing values are NaN or None in pandas, NULL in SQL.
products.head(10)
`,
      },
      {
        title: 'Products without a size',
        question: 'Which products over 100 have no size?',
        level: 'filter',
        sql: `-- NULL is tested with IS NULL: "Size = NULL" is never true.
SELECT Name, Color, ListPrice
FROM adventureworks.Product
WHERE Size IS NULL
  AND ListPrice > 100
ORDER BY ListPrice DESC;
`,
        python: `products = lab.table("adventureworks.Product")

# isna() is True where the value is missing (IS NULL in SQL). AND is &, each test in brackets.
no_size = products[products["Size"].isna() & (products["ListPrice"] > 100)]

no_size.sort_values("ListPrice", ascending=False)[["Name", "Color", "ListPrice"]]
`,
      },
      {
        title: 'Products by colour',
        question: 'How many products of each colour, and their average list price?',
        level: 'group',
        sql: `-- Products without a colour form their own group (Color is NULL).
SELECT Color,
       count(*) AS products,
       round(avg(ListPrice), 2) AS avg_price
FROM adventureworks.Product
GROUP BY Color
ORDER BY products DESC, Color;
`,
        python: `products = lab.table("adventureworks.Product")

# dropna=False keeps the products without a colour as a group, as SQL does.
by_colour = products.groupby("Color", dropna=False, as_index=False).agg(
    products=("ProductID", "count"),
    avg_price=("ListPrice", "mean"),
)
by_colour["avg_price"] = by_colour["avg_price"].round(2)
by_colour.sort_values(["products", "Color"], ascending=[False, True])
`,
      },
      {
        title: 'The category tree',
        question: 'Every product with its category and the category above it.',
        level: 'join',
        sql: `-- ProductCategory joined to itself: the subcategory, then its parent.
-- LEFT JOIN keeps a row even when nothing matches (its columns are NULL).
SELECT p.Name   AS product,
       sub.Name AS category,
       top.Name AS parent_category
FROM adventureworks.Product p
JOIN adventureworks.ProductCategory sub ON sub.ProductCategoryID = p.ProductCategoryID
LEFT JOIN adventureworks.ProductCategory top ON top.ProductCategoryID = sub.ParentProductCategoryID
ORDER BY parent_category, category, product;
`,
        python: `products = lab.table("adventureworks.Product")[["Name", "ProductCategoryID"]]
cats = lab.table("adventureworks.ProductCategory")[["ProductCategoryID", "ParentProductCategoryID", "Name"]]

# The same table twice under other column names: once as the category, once as the parent.
sub = cats.rename(columns={"Name": "category"})
top = cats[["ProductCategoryID", "Name"]].rename(columns={"ProductCategoryID": "ParentProductCategoryID", "Name": "parent_category"})

df = products.rename(columns={"Name": "product"}).merge(sub, on="ProductCategoryID")
# how="left" is LEFT JOIN.
df = df.merge(top, on="ParentProductCategoryID", how="left")
df.sort_values(["parent_category", "category", "product"])[["product", "category", "parent_category"]]
`,
      },
      {
        title: 'Biggest customers',
        question: 'Which 10 customers ordered the most?',
        level: 'join',
        sql: `SELECT c.CompanyName,
       count(*) AS orders,
       sum(h.TotalDue) AS total_due
FROM adventureworks.SalesOrderHeader h
JOIN adventureworks.Customer c ON c.CustomerID = h.CustomerID
GROUP BY c.CompanyName
ORDER BY total_due DESC
LIMIT 10;
`,
        python: `orders = lab.table("adventureworks.SalesOrderHeader")
customers = lab.table("adventureworks.Customer")[["CustomerID", "CompanyName"]]

df = orders.merge(customers, on="CustomerID")
result = df.groupby("CompanyName", as_index=False).agg(orders=("SalesOrderID", "count"), total_due=("TotalDue", "sum"))
result["total_due"] = result["total_due"].round(2)

# nlargest(10, column) is ORDER BY column DESC LIMIT 10 in one step.
result.nlargest(10, "total_due")
`,
      },
      {
        title: 'Margin by product',
        question: 'Which 10 products made the most margin (revenue minus cost)?',
        level: 'join',
        sql: `-- A calculated column: what was paid minus what the units cost.
SELECT p.Name,
       sum(d.OrderQty) AS units,
       round(sum(d.LineTotal), 2) AS revenue,
       round(sum(d.LineTotal - d.OrderQty * p.StandardCost), 2) AS margin
FROM adventureworks.SalesOrderDetail d
JOIN adventureworks.Product p ON p.ProductID = d.ProductID
GROUP BY p.Name
ORDER BY margin DESC
LIMIT 10;
`,
        python: `lines = lab.table("adventureworks.SalesOrderDetail")
products = lab.table("adventureworks.Product")[["ProductID", "Name", "StandardCost"]]

df = lines.merge(products, on="ProductID")
df["margin"] = df["LineTotal"] - df["OrderQty"] * df["StandardCost"]

result = df.groupby("Name", as_index=False).agg(units=("OrderQty", "sum"), revenue=("LineTotal", "sum"), margin=("margin", "sum"))
result.nlargest(10, "margin").round(2)
`,
      },
      {
        title: 'Share of its category',
        question: 'What part of its category\'s revenue does each product bring?',
        level: 'window',
        sql: `-- sum(...) OVER (PARTITION BY category) is the category's total on every row of it.
SELECT c.Name AS category,
       p.Name AS product,
       round(sum(d.LineTotal), 2) AS revenue,
       round(100 * sum(d.LineTotal) / sum(sum(d.LineTotal)) OVER (PARTITION BY c.Name), 1) AS pct_of_category
FROM adventureworks.SalesOrderDetail d
JOIN adventureworks.Product         p ON p.ProductID = d.ProductID
JOIN adventureworks.ProductCategory c ON c.ProductCategoryID = p.ProductCategoryID
GROUP BY c.Name, p.Name
ORDER BY category, revenue DESC;
`,
        python: `lines = lab.table("adventureworks.SalesOrderDetail")
products = lab.table("adventureworks.Product")[["ProductID", "Name", "ProductCategoryID"]].rename(columns={"Name": "product"})
cats = lab.table("adventureworks.ProductCategory")[["ProductCategoryID", "Name"]].rename(columns={"Name": "category"})

df = lines.merge(products, on="ProductID").merge(cats, on="ProductCategoryID")
result = df.groupby(["category", "product"], as_index=False)["LineTotal"].sum().rename(columns={"LineTotal": "revenue"})

# transform("sum") puts the category's total on each of its rows: SUM(...) OVER (PARTITION BY ...).
result["pct_of_category"] = (100 * result["revenue"] / result.groupby("category")["revenue"].transform("sum")).round(1)
result["revenue"] = result["revenue"].round(2)
result.sort_values(["category", "revenue"], ascending=[True, False])
`,
      },
      {
        title: 'Units by category and colour',
        question: 'A table with a row per top category and a column per colour.',
        level: 'pivot',
        sql: `-- PIVOT turns the colours into columns (DuckDB's syntax; SQL Server's PIVOT differs).
PIVOT (
    SELECT top.Name AS parent_category,
           coalesce(p.Color, 'no colour') AS colour,
           d.OrderQty
    FROM adventureworks.SalesOrderDetail d
    JOIN adventureworks.Product         p   ON p.ProductID = d.ProductID
    JOIN adventureworks.ProductCategory sub ON sub.ProductCategoryID = p.ProductCategoryID
    JOIN adventureworks.ProductCategory top ON top.ProductCategoryID = sub.ParentProductCategoryID
)
ON colour
USING sum(OrderQty)
ORDER BY parent_category;
`,
        python: `lines = lab.table("adventureworks.SalesOrderDetail")
products = lab.table("adventureworks.Product")[["ProductID", "Color", "ProductCategoryID"]]
cats = lab.table("adventureworks.ProductCategory")[["ProductCategoryID", "ParentProductCategoryID"]]
tops = lab.table("adventureworks.ProductCategory")[["ProductCategoryID", "Name"]]
tops = tops.rename(columns={"ProductCategoryID": "ParentProductCategoryID", "Name": "parent_category"})

df = lines.merge(products, on="ProductID").merge(cats, on="ProductCategoryID").merge(tops, on="ParentProductCategoryID")
# fillna puts a value where one is missing, like coalesce in SQL.
df["colour"] = df["Color"].fillna("no colour")

df.pivot_table(index="parent_category", columns="colour", values="OrderQty", aggfunc="sum")
`,
      },
    ],
    cheat: { table: 'adventureworks.Product', num: 'ListPrice', over: 1000, cat: 'Color', nullable: 'Size', join: { table: 'adventureworks.ProductModel', key: 'ProductModelID' } },
  },
  {
    id: 'sakila',
    summary:
      'Sakila, a DVD rental chain with two stores (2005 to 2006). Films have actors and categories; each store holds copies of films (inventory); customers rent a copy and pay for it.',
    tables: [
      { name: 'film', about: '1,000 films: length, rating, rental rate, replacement cost' },
      { name: 'actor, film_actor', about: 'actors and which films they play in (many to many)' },
      { name: 'category, film_category', about: 'film genres: Action, Comedy…' },
      { name: 'inventory', about: 'the copies: which film, in which store' },
      { name: 'rental', about: '16,044 rentals: copy, customer, rented and returned' },
      { name: 'payment', about: 'what each customer paid for a rental' },
      { name: 'customer, staff, store, address, city, country', about: 'people and places' },
    ],
    links: [
      'rental.inventory_id → inventory, inventory.film_id → film',
      'payment.rental_id → rental, payment.customer_id → customer',
      'film_actor links film and actor; film_category links film and category',
      'customer.address_id → address → city → country',
    ],
    facts: [
      'Rentals run from 24 May 2005 to 14 February 2006; payments add up to 67,416.51.',
      '183 copies were never returned (return_date is NULL).',
      'Sports is the category with the most films (74); every film has exactly one category.',
    ],
    examples: [
      {
        title: 'First look at the films',
        question: 'What does the film table hold?',
        level: 'look',
        sql: `-- The first 10 rows of a table: its columns and what the values look like.
SELECT *
FROM sakila.film
LIMIT 10;
`,
        python: `# lab.table gives a whole table as a pandas DataFrame.
films = lab.table("sakila.film")

# .head(10) shows the first 10 rows, like LIMIT 10 in SQL.
films.head(10)
`,
      },
      {
        title: 'Long PG-13 films',
        question: 'Which PG-13 films are longer than 170 minutes?',
        level: 'filter',
        sql: `-- Text values go in single quotes.
SELECT title, length, rental_rate
FROM sakila.film
WHERE rating = 'PG-13'
  AND length > 170
ORDER BY length DESC, title;
`,
        python: `films = lab.table("sakila.film")

# == compares (= in SQL). AND is &, and each condition goes in brackets.
long = films[(films["rating"] == "PG-13") & (films["length"] > 170)]

long.sort_values(["length", "title"], ascending=[False, True])[["title", "length", "rental_rate"]]
`,
      },
      {
        title: 'Films by rating',
        question: 'How many films per rating, and how long and dear are they on average?',
        level: 'group',
        sql: `SELECT rating,
       count(*) AS films,
       round(avg(length)) AS avg_minutes,
       round(avg(rental_rate), 2) AS avg_rate
FROM sakila.film
GROUP BY rating
ORDER BY films DESC;
`,
        python: `films = lab.table("sakila.film")

# groupby + agg: one row per rating. Each new column is (column, function).
by_rating = films.groupby("rating", as_index=False).agg(
    films=("film_id", "count"),
    avg_minutes=("length", "mean"),
    avg_rate=("rental_rate", "mean"),
)
by_rating["avg_minutes"] = by_rating["avg_minutes"].round()
by_rating["avg_rate"] = by_rating["avg_rate"].round(2)
by_rating.sort_values("films", ascending=False)
`,
      },
      {
        title: 'Busiest actors',
        question: 'Which 10 actors play in the most films?',
        level: 'join',
        sql: `-- film_actor has one row per actor and film: counting its rows counts films.
SELECT a.first_name, a.last_name,
       count(*) AS films
FROM sakila.film_actor fa
JOIN sakila.actor a ON a.actor_id = fa.actor_id
GROUP BY a.actor_id, a.first_name, a.last_name
ORDER BY films DESC, a.last_name, a.first_name
LIMIT 10;
`,
        python: `film_actor = lab.table("sakila.film_actor")
actors = lab.table("sakila.actor")[["actor_id", "first_name", "last_name"]]

df = film_actor.merge(actors, on="actor_id")
# size() counts the rows in each group, like count(*).
films = df.groupby(["actor_id", "first_name", "last_name"], as_index=False).size().rename(columns={"size": "films"})

films.sort_values(["films", "last_name", "first_name"], ascending=[False, True, True]).head(10).drop(columns="actor_id")
`,
      },
      {
        title: 'Revenue by film category',
        question: 'Which categories bring in the most money?',
        level: 'join',
        sql: `-- A chain of five tables: payment → rental → copy → film's category → category.
SELECT c.name AS category,
       count(*) AS payments,
       sum(p.amount) AS revenue
FROM sakila.payment p
JOIN sakila.rental        r  ON r.rental_id    = p.rental_id
JOIN sakila.inventory     i  ON i.inventory_id = r.inventory_id
JOIN sakila.film_category fc ON fc.film_id     = i.film_id
JOIN sakila.category      c  ON c.category_id  = fc.category_id
GROUP BY c.name
ORDER BY revenue DESC;
`,
        python: `payments = lab.table("sakila.payment")[["rental_id", "amount"]]
rentals = lab.table("sakila.rental")[["rental_id", "inventory_id"]]
inventory = lab.table("sakila.inventory")[["inventory_id", "film_id"]]
film_category = lab.table("sakila.film_category")[["film_id", "category_id"]]
categories = lab.table("sakila.category")[["category_id", "name"]].rename(columns={"name": "category"})

df = payments.merge(rentals, on="rental_id").merge(inventory, on="inventory_id")
df = df.merge(film_category, on="film_id").merge(categories, on="category_id")

result = df.groupby("category", as_index=False).agg(payments=("amount", "count"), revenue=("amount", "sum"))
result["revenue"] = result["revenue"].round(2)
result.sort_values("revenue", ascending=False)
`,
      },
      {
        title: 'Rentals by month, as a share of all',
        question: 'How many rentals each month, and what part of the total is that?',
        level: 'dates',
        sql: `-- sum(count(*)) OVER () is the total over every month: each month divided by it.
SELECT date_trunc('month', rental_date) AS month,
       count(*) AS rentals,
       round(100 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_all
FROM sakila.rental
GROUP BY month
ORDER BY month;
`,
        python: `rentals = lab.table("sakila.rental")

# .dt works on dates: to_period("M") is the month, to_timestamp() its first day.
rentals["month"] = rentals["rental_date"].dt.to_period("M").dt.to_timestamp()

monthly = rentals.groupby("month", as_index=False).size().rename(columns={"size": "rentals"})
monthly["pct_of_all"] = (100 * monthly["rentals"] / monthly["rentals"].sum()).round(1)
monthly
`,
      },
      {
        title: 'Top 3 customers of each store',
        question: 'Who paid the most in each of the two stores?',
        level: 'window',
        sql: `-- row_number() numbers the customers inside each store (PARTITION BY), biggest payer first.
-- QUALIFY filters on a window function, as WHERE does on a column.
SELECT c.store_id,
       c.first_name || ' ' || c.last_name AS customer,
       sum(p.amount) AS paid,
       row_number() OVER (PARTITION BY c.store_id ORDER BY sum(p.amount) DESC, c.customer_id) AS place
FROM sakila.payment p
JOIN sakila.customer c ON c.customer_id = p.customer_id
GROUP BY c.store_id, c.customer_id, customer
QUALIFY place <= 3
ORDER BY c.store_id, place;
`,
        python: `payments = lab.table("sakila.payment")[["customer_id", "amount"]]
customers = lab.table("sakila.customer")
customers["customer"] = customers["first_name"] + " " + customers["last_name"]

df = payments.merge(customers[["customer_id", "store_id", "customer"]], on="customer_id")
paid = df.groupby(["store_id", "customer_id", "customer"], as_index=False)["amount"].sum().round(2).rename(columns={"amount": "paid"})

# Sort inside each store, biggest payer first, then number the rows of each store.
paid = paid.sort_values(["store_id", "paid", "customer_id"], ascending=[True, False, True])
paid["place"] = paid.groupby("store_id").cumcount() + 1
paid[paid["place"] <= 3].drop(columns="customer_id")
`,
      },
      {
        title: 'Payments by month and store',
        question: 'A table with a row per month and a column per store.',
        level: 'pivot',
        sql: `-- PIVOT turns the stores into columns (DuckDB's syntax; SQL Server's PIVOT differs).
PIVOT (
    SELECT date_trunc('month', p.payment_date) AS month,
           'store ' || s.store_id AS store,
           p.amount
    FROM sakila.payment p
    JOIN sakila.staff s ON s.staff_id = p.staff_id
)
ON store
USING sum(amount)
ORDER BY month;
`,
        python: `payments = lab.table("sakila.payment")
staff = lab.table("sakila.staff")[["staff_id", "store_id"]]

df = payments.merge(staff, on="staff_id")
df["month"] = df["payment_date"].dt.to_period("M").dt.to_timestamp()
# astype(str) turns the number into text, so "store " + "1" makes "store 1".
df["store"] = "store " + df["store_id"].astype(str)

df.pivot_table(index="month", columns="store", values="amount", aggfunc="sum").round(2)
`,
      },
    ],
    cheat: { table: 'sakila.payment', num: 'amount', over: 9, cat: 'staff_id', nullable: 'rental_id', join: { table: 'sakila.customer', key: 'customer_id' } },
  },
  {
    id: 'quaera',
    summary:
      'Kaiyo Trading, the company behind quaera.app\'s tasks: a Japanese distributor of food and drinks (FMCG) and over-the-counter medicines (Pharma), 2024 to mid 2026. A star schema: fact tables of numbers (weekly sell-out to shoppers, monthly sell-in to distributors, stock, targets) around dimension tables that describe them.',
    tables: [
      { name: 'fact_sellout', about: 'weekly sales from shops to shoppers: customer, product, units, revenue, promo (118,449 rows)' },
      { name: 'fact_sellin', about: 'orders from Kaiyo to its distributors: gross, discount, net' },
      { name: 'fact_stock, fact_target, fact_forecast_snapshot, fact_price', about: 'monthly stock, sales targets, forecasts and prices' },
      { name: 'dim_product', about: '47 products of 9 brands: category, division (FMCG or Pharma), list price' },
      { name: 'dim_customer', about: '144 shops, chains, pharmacies, online sellers and distributors' },
      { name: 'dim_region, dim_rep, dim_promo, dim_date', about: 'regions of Japan, sales reps, promotions, a calendar' },
      { name: 'staging_raw_sellout', about: 'raw rows as they came in, all text: for cleaning practice' },
    ],
    links: [
      'fact_sellout.product_id → dim_product, fact_sellout.customer_id → dim_customer',
      'fact_sellout.promo_id → dim_promo (NULL when there was no promo)',
      'dim_customer.region_id → dim_region, dim_customer.rep_id → dim_rep',
      'fact_sellin.distributor_id → dim_customer (a customer of type distributor)',
    ],
    facts: [
      'Sell-out weeks run from January 2024 to June 2026, about 127 million in revenue.',
      'Fruvia is the brand with the most sell-out revenue, ahead of Aqualis and Krosti.',
      'About one sell-out row in five (23,849) was sold on a promo.',
    ],
    examples: [
      {
        title: 'First look at the sell-out',
        question: 'What does a row of fact_sellout say?',
        level: 'look',
        sql: `-- The first 10 rows of the main fact table: a shop, a product, a week, its units and revenue.
SELECT *
FROM quaera.fact_sellout
LIMIT 10;
`,
        python: `# lab.table gives a whole table as a pandas DataFrame (this one has 118,449 rows).
sellout = lab.table("quaera.fact_sellout")

# .head(10) shows the first 10 rows, like LIMIT 10 in SQL.
sellout.head(10)
`,
      },
      {
        title: 'Active pharmacies',
        question: 'Which active customers are pharmacies, and where are they?',
        level: 'filter',
        sql: `SELECT customer_name, city, opened_date
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND is_active = 1
ORDER BY opened_date;
`,
        python: `customers = lab.table("quaera.dim_customer")

# == compares (= in SQL). AND is &, and each condition goes in brackets.
pharmacies = customers[(customers["channel"] == "pharmacy") & (customers["is_active"] == 1)]

pharmacies.sort_values("opened_date")[["customer_name", "city", "opened_date"]]
`,
      },
      {
        title: 'Customers by channel',
        question: 'How many customers per channel, and how many of them are active?',
        level: 'group',
        sql: `-- is_active is 1 or 0, so its sum counts the active ones.
SELECT channel,
       count(*) AS customers,
       sum(is_active) AS active
FROM quaera.dim_customer
GROUP BY channel
ORDER BY customers DESC;
`,
        python: `customers = lab.table("quaera.dim_customer")

# groupby + agg: one row per channel. Each new column is (column, function).
by_channel = customers.groupby("channel", as_index=False).agg(
    customers=("customer_id", "count"),
    active=("is_active", "sum"),
)
by_channel.sort_values("customers", ascending=False)
`,
      },
      {
        title: 'Revenue by category',
        question: 'How much did each product category sell, in units and revenue?',
        level: 'join',
        sql: `-- The fact table holds product_id; the category is in dim_product.
SELECT p.division,
       p.category,
       sum(s.units) AS units,
       round(sum(s.revenue)) AS revenue
FROM quaera.fact_sellout s
JOIN quaera.dim_product p ON p.product_id = s.product_id
GROUP BY p.division, p.category
ORDER BY revenue DESC;
`,
        python: `sellout = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")[["product_id", "division", "category"]]

# merge is pandas' JOIN: each sale gets its product's division and category.
df = sellout.merge(products, on="product_id")

result = df.groupby(["division", "category"], as_index=False).agg(units=("units", "sum"), revenue=("revenue", "sum"))
result["revenue"] = result["revenue"].round()
result.sort_values("revenue", ascending=False)
`,
      },
      {
        title: 'Revenue by region and channel',
        question: 'Which parts of Japan and which channels sell the most?',
        level: 'join',
        sql: `-- A star schema: the fact table in the middle, two dimensions around it.
SELECT r.macro_region,
       c.channel,
       round(sum(s.revenue)) AS revenue
FROM quaera.fact_sellout s
JOIN quaera.dim_customer c ON c.customer_id = s.customer_id
JOIN quaera.dim_region   r ON r.region_id   = c.region_id
GROUP BY r.macro_region, c.channel
ORDER BY revenue DESC;
`,
        python: `sellout = lab.table("quaera.fact_sellout")[["customer_id", "revenue"]]
customers = lab.table("quaera.dim_customer")[["customer_id", "channel", "region_id"]]
regions = lab.table("quaera.dim_region")[["region_id", "macro_region"]]

df = sellout.merge(customers, on="customer_id").merge(regions, on="region_id")

result = df.groupby(["macro_region", "channel"], as_index=False)["revenue"].sum()
result["revenue"] = result["revenue"].round()
result.sort_values("revenue", ascending=False)
`,
      },
      {
        title: 'Month over month',
        question: 'Revenue per month, and how it changed from the month before.',
        level: 'dates',
        sql: `-- lag(x) OVER (ORDER BY month) is the value of the previous row: last month's revenue.
SELECT date_trunc('month', week_start) AS month,
       round(sum(revenue)) AS revenue,
       round(sum(revenue) - lag(sum(revenue)) OVER (ORDER BY date_trunc('month', week_start))) AS change
FROM quaera.fact_sellout
GROUP BY month
ORDER BY month;
`,
        python: `sellout = lab.table("quaera.fact_sellout")[["week_start", "revenue"]]

# .dt works on dates: to_period("M") is the month, to_timestamp() its first day.
sellout["month"] = sellout["week_start"].dt.to_period("M").dt.to_timestamp()
monthly = sellout.groupby("month", as_index=False)["revenue"].sum()

# diff() is this row minus the one before, the same as x - LAG(x) OVER (ORDER BY month).
monthly["change"] = monthly["revenue"].diff().round()
monthly["revenue"] = monthly["revenue"].round()
monthly
`,
      },
      {
        title: 'Top brand in each category',
        question: 'Which brands lead each category in 2025?',
        level: 'window',
        sql: `-- rank() numbers the brands inside each category (PARTITION BY), biggest first.
SELECT p.category,
       p.brand,
       round(sum(s.revenue)) AS revenue,
       rank() OVER (PARTITION BY p.category ORDER BY sum(s.revenue) DESC) AS place
FROM quaera.fact_sellout s
JOIN quaera.dim_product p ON p.product_id = s.product_id
WHERE year(s.week_start) = 2025
GROUP BY p.category, p.brand
QUALIFY place <= 2
ORDER BY p.category, place;
`,
        python: `sellout = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")[["product_id", "category", "brand"]]

# Keep 2025 only: .dt.year is the year of each date.
df = sellout[sellout["week_start"].dt.year == 2025].merge(products, on="product_id")
brands = df.groupby(["category", "brand"], as_index=False)["revenue"].sum()

# rank inside each category, the biggest first: rank() OVER (PARTITION BY ...).
brands["place"] = brands.groupby("category")["revenue"].rank(method="min", ascending=False)
brands["revenue"] = brands["revenue"].round()
brands[brands["place"] <= 2].sort_values(["category", "place"])
`,
      },
      {
        title: 'Revenue by category and year',
        question: 'A table with a row per category and a column per year.',
        level: 'pivot',
        sql: `-- PIVOT turns the years into columns (DuckDB's syntax; SQL Server's PIVOT differs).
PIVOT (
    SELECT p.category, year(s.week_start) AS year, s.revenue
    FROM quaera.fact_sellout s
    JOIN quaera.dim_product p ON p.product_id = s.product_id
)
ON year
USING round(sum(revenue))
ORDER BY category;
`,
        python: `sellout = lab.table("quaera.fact_sellout")[["product_id", "week_start", "revenue"]]
products = lab.table("quaera.dim_product")[["product_id", "category"]]

df = sellout.merge(products, on="product_id")
df["year"] = df["week_start"].dt.year

# pivot_table: rows from one column, columns from another, values summed.
df.pivot_table(index="category", columns="year", values="revenue", aggfunc="sum").round()
`,
      },
    ],
    cheat: { table: 'quaera.fact_sellout', num: 'units', over: 100, cat: 'product_id', nullable: 'promo_id', join: { table: 'quaera.dim_product', key: 'product_id' } },
  },
]

export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id)
}

/** Every example of a guide in one Python tab, a markdown cell before each (the tab's cells run with Shift+Enter). */
export function guideNotebook(g: Guide, title: string, lang: 'sql' | 'python'): string {
  if (lang === 'sql')
    return g.examples.map((e, i) => `-- ${i + 1}. ${e.title}: ${e.question}\n${e.sql.trimEnd()}\n`).join('\n')
  const head = `# %% [markdown]\n# # ${title}: examples\n# Run a cell with Shift+Enter (it moves on to the next), or all of them with Ctrl+Enter.\n`
  const cells = g.examples.map((e, i) => `# %% [markdown]\n# ## ${i + 1}. ${e.title}\n# ${e.question}\n\n# %%\n${e.python.trimEnd()}\n`)
  return [head, ...cells].join('\n')
}
