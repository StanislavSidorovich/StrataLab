// "Same task, four ways" (Compare dialects): common tasks written in DuckDB, T-SQL, PostgreSQL and
// pandas, on one small practice table. tests/compare.test.ts runs every cell: DuckDB and PostgreSQL
// as written (PGlite), T-SQL through the same translator Lab uses, pandas in Pyodide, and checks
// that all four give the same values. Opened from the "SQL · DuckDB ▾" menu (src/ui/Compare.tsx).

export type Column = 'duckdb' | 'tsql' | 'postgres' | 'pandas'

export const COLUMNS: { id: Column; label: string }[] = [
  { id: 'duckdb', label: 'DuckDB' },
  { id: 'tsql', label: 'T-SQL' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'pandas', label: 'pandas' },
]

export interface CompareRow {
  task: string
  duckdb: string
  tsql: string
  postgres: string
  pandas: string
  /** the part of a cell that is the difference, shown in bold */
  hl?: Partial<Record<Column, string[]>>
  /** what to watch for, in a line */
  note?: string
}

/** The practice table the cells are written for (named sales, so it never meets the demo shop's demo.orders). Runs as is in DuckDB and in PostgreSQL. */
export const PRACTICE_SQL = `CREATE TABLE sales (
  id INTEGER,
  "Full Name" VARCHAR,
  city VARCHAR,
  amount DECIMAL(10, 2),
  discount DECIMAL(10, 2),
  ordered DATE,
  shipped DATE
);
INSERT INTO sales VALUES
  (1, 'Ana Silva', 'Lisbon', 120.50, 5.00, DATE '2024-03-01', DATE '2024-03-04'),
  (2, 'Bo Chen', 'Porto', 80.00, NULL, DATE '2024-03-02', DATE '2024-03-02'),
  (3, 'Cy Dahl', 'Lisbon', 45.25, 2.50, DATE '2024-03-02', DATE '2024-03-06'),
  (4, 'Di Okafor', 'Porto', 210.00, NULL, DATE '2024-03-05', DATE '2024-03-09'),
  (5, 'Eli Moreau', 'Faro', 99.99, 0, DATE '2024-03-07', DATE '2024-03-08'),
  (6, 'Fay Ruiz', 'Faro', 150.00, 10.00, DATE '2024-03-07', DATE '2024-03-12');
`

export const PRACTICE_PANDAS = `sales = lab.table("sales")  # after running the SQL above`

export const COMPARE: CompareRow[] = [
  {
    task: 'First N rows',
    duckdb: 'SELECT * FROM sales ORDER BY id LIMIT 3',
    tsql: 'SELECT TOP 3 * FROM sales ORDER BY id',
    postgres: 'SELECT * FROM sales ORDER BY id LIMIT 3',
    pandas: 'sales.sort_values("id").head(3)',
    hl: { duckdb: ['LIMIT 3'], tsql: ['TOP 3'], postgres: ['LIMIT 3'], pandas: ['.head(3)'] },
    note: 'T-SQL has no LIMIT: TOP goes right after SELECT.',
  },
  {
    task: "Today's date",
    duckdb: 'SELECT CURRENT_DATE AS today',
    tsql: 'SELECT CAST(GETDATE() AS DATE) AS today',
    postgres: 'SELECT CURRENT_DATE AS today',
    pandas: 'pd.Timestamp.today().normalize()',
    hl: { tsql: ['GETDATE()'], pandas: ['pd.Timestamp.today()'] },
    note: 'GETDATE() has the time too, so T-SQL casts it to DATE. CURRENT_DATE works in DuckDB and PostgreSQL.',
  },
  {
    task: 'Replace NULL',
    duckdb: 'SELECT COALESCE(discount, 0) AS discount FROM sales ORDER BY id',
    tsql: 'SELECT ISNULL(discount, 0) AS discount FROM sales ORDER BY id',
    postgres: 'SELECT COALESCE(discount, 0) AS discount FROM sales ORDER BY id',
    pandas: 'sales["discount"].fillna(0)',
    hl: { duckdb: ['COALESCE'], tsql: ['ISNULL'], postgres: ['COALESCE'], pandas: ['.fillna(0)'] },
    note: 'COALESCE works everywhere (and takes any number of values). ISNULL(a, b) is T-SQL only.',
  },
  {
    task: 'Join text',
    duckdb: `SELECT "Full Name" || ' from ' || city AS label FROM sales ORDER BY id`,
    tsql: `SELECT [Full Name] + ' from ' + city AS label FROM sales ORDER BY id`,
    postgres: `SELECT "Full Name" || ' from ' || city AS label FROM sales ORDER BY id`,
    pandas: 'sales["Full Name"] + " from " + sales["city"]',
    hl: { duckdb: ['||'], tsql: ['+'], postgres: ['||'], pandas: ['+'] },
    note: 'T-SQL and pandas join text with +, DuckDB and PostgreSQL with ||. A NULL makes the whole result NULL; CONCAT(...) skips NULLs.',
  },
  {
    task: 'Part of a text',
    duckdb: `SELECT SUBSTRING("Full Name", 1, 3) AS code FROM sales ORDER BY id`,
    tsql: `SELECT SUBSTRING([Full Name], 1, 3) AS code FROM sales ORDER BY id`,
    postgres: `SELECT SUBSTRING("Full Name", 1, 3) AS code FROM sales ORDER BY id`,
    pandas: 'sales["Full Name"].str[:3]',
    hl: { duckdb: ['1, 3'], tsql: ['1, 3'], postgres: ['1, 3'], pandas: ['[:3]'] },
    note: 'SQL counts characters from 1 and takes a length; pandas counts from 0 and slices [from:to].',
  },
  {
    task: 'Days between dates',
    duckdb: `SELECT DATE_DIFF('day', ordered, shipped) AS days FROM sales ORDER BY id`,
    tsql: 'SELECT DATEDIFF(day, ordered, shipped) AS days FROM sales ORDER BY id',
    postgres: 'SELECT shipped - ordered AS days FROM sales ORDER BY id',
    pandas: '(sales["shipped"] - sales["ordered"]).dt.days',
    hl: { duckdb: ['DATE_DIFF'], tsql: ['DATEDIFF'], postgres: ['shipped - ordered'], pandas: ['.dt.days'] },
    note: 'DATEDIFF and DATE_DIFF take the earlier date first. In PostgreSQL, one date minus another is already a number of days.',
  },
  {
    task: 'Add days to a date',
    duckdb: 'SELECT ordered + INTERVAL 7 DAY AS due FROM sales ORDER BY id',
    tsql: 'SELECT DATEADD(day, 7, ordered) AS due FROM sales ORDER BY id',
    postgres: `SELECT ordered + INTERVAL '7 days' AS due FROM sales ORDER BY id`,
    pandas: 'sales["ordered"] + pd.Timedelta(days=7)',
    hl: { duckdb: ['INTERVAL 7 DAY'], tsql: ['DATEADD(day, 7,'], postgres: [`INTERVAL '7 days'`], pandas: ['pd.Timedelta(days=7)'] },
    note: 'Only T-SQL has a DATEADD function. DuckDB and PostgreSQL add an INTERVAL, written a little differently.',
  },
  {
    task: 'If this, then that',
    duckdb: `SELECT CASE WHEN amount >= 100 THEN 'big' ELSE 'small' END AS size FROM sales ORDER BY id`,
    tsql: `SELECT IIF(amount >= 100, 'big', 'small') AS size FROM sales ORDER BY id`,
    postgres: `SELECT CASE WHEN amount >= 100 THEN 'big' ELSE 'small' END AS size FROM sales ORDER BY id`,
    pandas: 'np.where(sales["amount"] >= 100, "big", "small")',
    hl: { duckdb: ['CASE WHEN'], tsql: ['IIF'], postgres: ['CASE WHEN'], pandas: ['np.where'] },
    note: 'CASE works everywhere and takes many branches. IIF is a T-SQL shortcut for one condition.',
  },
  {
    task: 'Round',
    duckdb: 'SELECT ROUND(amount / 7.0, 1) AS part FROM sales ORDER BY id',
    tsql: 'SELECT ROUND(amount / 7.0, 1) AS part FROM sales ORDER BY id',
    postgres: 'SELECT ROUND(amount / 7.0, 1) AS part FROM sales ORDER BY id',
    pandas: '(sales["amount"] / 7).round(1)',
    hl: { duckdb: ['7.0'], tsql: ['7.0'], postgres: ['7.0'], pandas: ['/ 7'] },
    note: `Whole number by whole number: 7 / 2 is 3 in PostgreSQL and SQL Server, 3.5 in DuckDB and pandas (and in Lab's T-SQL mode, which runs on DuckDB). Write 7.0 to get decimals everywhere. On exact halves SQL rounds up, pandas to the even digit.`,
  },
  {
    task: 'Top 1 in each group',
    duckdb: `SELECT id, city, amount FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY city ORDER BY amount DESC) = 1
ORDER BY id`,
    tsql: `SELECT id, city, amount FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY city ORDER BY amount DESC) AS rn
  FROM sales
) t
WHERE rn = 1
ORDER BY id`,
    postgres: `SELECT id, city, amount FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY city ORDER BY amount DESC) AS rn
  FROM sales
) t
WHERE rn = 1
ORDER BY id`,
    pandas: `(sales.sort_values("amount", ascending=False)
  .groupby("city").head(1)
  .sort_values("id")[["id", "city", "amount"]])`,
    hl: { duckdb: ['QUALIFY'], tsql: ['WHERE rn = 1'], postgres: ['WHERE rn = 1'], pandas: ['.groupby("city").head(1)'] },
    note: 'DuckDB can filter on a window with QUALIFY. T-SQL and PostgreSQL number the rows in a subquery, then keep rn = 1.',
  },
  {
    task: 'Number the rows',
    duckdb: 'SELECT ROW_NUMBER() OVER (ORDER BY ordered, id) AS n FROM sales ORDER BY id',
    tsql: 'SELECT ROW_NUMBER() OVER (ORDER BY ordered, id) AS n FROM sales ORDER BY id',
    postgres: 'SELECT ROW_NUMBER() OVER (ORDER BY ordered, id) AS n FROM sales ORDER BY id',
    pandas: 'sales["ordered"].rank(method="first").astype(int)',
    hl: { duckdb: ['ROW_NUMBER()'], tsql: ['ROW_NUMBER()'], postgres: ['ROW_NUMBER()'], pandas: ['.rank(method="first")'] },
    note: 'The same in all three SQLs. In pandas, rank(method="first") breaks ties by position, as ROW_NUMBER does.',
  },
  {
    task: 'Name with a space',
    duckdb: 'SELECT "Full Name" FROM sales ORDER BY id',
    tsql: 'SELECT [Full Name] FROM sales ORDER BY id',
    postgres: 'SELECT "Full Name" FROM sales ORDER BY id',
    pandas: 'sales["Full Name"]',
    hl: { duckdb: ['"Full Name"'], tsql: ['[Full Name]'], postgres: ['"Full Name"'], pandas: ['["Full Name"]'] },
    note: "Double quotes are for names, single quotes for text. T-SQL's own way is square brackets.",
  },
  {
    task: 'Change the type',
    duckdb: 'SELECT CAST(id AS VARCHAR) AS id_text FROM sales ORDER BY id',
    tsql: 'SELECT CAST(id AS VARCHAR(10)) AS id_text FROM sales ORDER BY id',
    postgres: 'SELECT CAST(id AS TEXT) AS id_text FROM sales ORDER BY id',
    pandas: 'sales["id"].astype(str)',
    hl: { duckdb: ['VARCHAR'], tsql: ['VARCHAR(10)'], postgres: ['TEXT'], pandas: ['.astype(str)'] },
    note: 'CAST(x AS type) is standard SQL. DuckDB and PostgreSQL also accept the shortcut id::VARCHAR. T-SQL text types ask for a length.',
  },
]
