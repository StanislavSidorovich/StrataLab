// The T-SQL translator runs in real Pyodide + sqlglot here, as in the browser's worker.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'

let py: PyodideInterface

beforeAll(async () => {
  py = await loadPyodide()
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
}, 60_000)

function translate(script: string): TranslatedStatement[] {
  py.globals.set('_script', script)
  return JSON.parse(py.runPython('import json\njson.dumps(translate(_script))'))
}
const one = (sql: string) => translate(sql)[0].target

describe('T-SQL → DuckDB', () => {
  it('translates the SQL Server habits the hints know', () => {
    expect(one("SELECT TOP 5 [Full Name], ISNULL(city, 'n/a') FROM customers")).toBe(`SELECT "Full Name", COALESCE(city, 'n/a') FROM customers LIMIT 5`)
    expect(one('SELECT GETDATE()')).toBe('SELECT CURRENT_TIMESTAMP')
    expect(one("SELECT CHARINDEX('x', s), LEN(s) FROM t")).toBe("SELECT STRPOS(s, 'x'), LENGTH(CAST(s AS TEXT)) FROM t")
    expect(one('SELECT DATEADD(day, 7, d) FROM t')).toBe('SELECT d + INTERVAL 7 DAY FROM t')
    expect(one("SELECT IIF(x > 1, 'big', 'small') FROM t")).toBe("SELECT CASE WHEN x > 1 THEN 'big' ELSE 'small' END FROM t")
  })

  it('joins text with || where T-SQL uses +', () => {
    expect(one("SELECT first_name + ' ' + last_name FROM t")).toBe("SELECT first_name || ' ' || last_name FROM t")
    expect(one('SELECT a + b FROM t')).toBe('SELECT a + b FROM t')
  })

  it('keeps what SQL Server means: BIT is yes/no, VARCHAR(n) cuts, dbo is main', () => {
    expect(one('CREATE TABLE t (id INT PRIMARY KEY, ok BIT, name NVARCHAR(50))')).toBe('CREATE TABLE t (id INT PRIMARY KEY, ok BOOLEAN, name TEXT)')
    expect(one('SELECT CONVERT(varchar(10), d, 120) FROM t')).toBe("SELECT LEFT(TRY_CAST(STRFTIME(d, '%Y-%m-%d %H:%M:%S') AS TEXT(30)), 10) FROM t")
    expect(one('SELECT CAST(x AS NVARCHAR(MAX)) FROM dbo.orders')).toBe('SELECT CAST(x AS TEXT) FROM orders')
  })

  it('splits GO batches, semicolons and statements with neither', () => {
    const r = translate('SELECT 1\nGO\nSELECT 2; SELECT 3\nSELECT a FROM t\nUNION\nSELECT b FROM u')
    expect(r.map((s) => s.source)).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3', 'SELECT a FROM t\nUNION\nSELECT b FROM u'])
    expect(r.map((s) => s.at)).toEqual([0, 12, 22, 31])
    expect(duckdbScript(r)).toContain('UNION')
  })

  it('pretty-prints a statement written over several lines', () => {
    expect(one('SELECT TOP 3 name\nFROM t\nORDER BY name')).toBe('SELECT\n  name\nFROM t\nORDER BY\n  name NULLS FIRST\nLIMIT 3')
  })

  it('explains what cannot travel', () => {
    expect(translate('SELECT 1 OPTION (MAXRECURSION 0)')[0].notes).toEqual(["OPTION (…) query hints are SQL Server's own: left out."])
    expect(translate('DECLARE @x INT = 5')[0].notes[0]).toMatch(/^Variables/)
    expect(translate('EXEC dbo.my_proc 1')[0]).toMatchObject({ target: null, error: 'EXEC runs a stored procedure; DuckDB has none (a MACRO is the nearest thing).' })
    const bad = translate('SELECT FROM WHERE')[0]
    expect(bad.target).toBeNull()
    expect(bad.error).toBe('Expected table name but got WHERE (line 1, column 17)')
  })

  it('keeps comments out of the way', () => {
    const r = translate('-- just a note\n/* and another */')
    expect(r).toEqual([])
  })
})

// SQLite as the Quaera trainer runs it (quaera.app, sql.js): scripts/sqlite-coverage.py runs the
// trainer's own queries both ways; these pin the rules that make them agree.
const KAIYO = {
  fact_sellout: { week_start: 'DATE', units: 'INTEGER', revenue: 'DOUBLE' },
  dim_product: { brand: 'VARCHAR', product_name: 'VARCHAR', division: 'VARCHAR', list_price: 'DOUBLE' },
}

function fromSqlite(script: string): TranslatedStatement[] {
  py.globals.set('_script', script)
  py.globals.set('_schema', JSON.stringify(KAIYO))
  return JSON.parse(py.runPython('import json\njson.dumps(translate(_script, read="sqlite", schema=json.loads(_schema)))'))
}
const lite = (sql: string) => fromSqlite(sql)[0].target

describe('SQLite (Quaera) → DuckDB', () => {
  it('reads a date as the text SQLite keeps', () => {
    expect(lite('SELECT substr(week_start, 1, 7) AS ym, SUM(units) AS units FROM fact_sellout GROUP BY ym')).toBe(
      'SELECT SUBSTRING(CAST(week_start AS TEXT), 1, 7) AS ym, SUM(units) AS units FROM fact_sellout GROUP BY ym',
    )
    // a full date compares the same either way; '2025-06' is not a date to DuckDB
    expect(lite("SELECT COUNT(*) FROM fact_sellout WHERE week_start = '2025-06' OR week_start >= '2025-01-01'")).toBe(
      "SELECT COUNT(*) FROM fact_sellout WHERE CAST(week_start AS TEXT) = '2025-06' OR week_start >= '2025-01-01'",
    )
    // text columns are left alone
    expect(lite("SELECT * FROM dim_product WHERE brand = 'Nettora'")).toBe("SELECT * FROM dim_product WHERE brand = 'Nettora'")
  })

  it('lets LIKE ignore case, as SQLite does', () => {
    expect(lite("SELECT product_name FROM dim_product WHERE brand LIKE 'aqua%'")).toBe("SELECT product_name FROM dim_product WHERE brand ILIKE 'aqua%'")
  })

  it('divides whole numbers as SQLite does, and says how', () => {
    const [st] = fromSqlite('SELECT 7 / 2')
    expect(st.target).toBe('SELECT 7 / NULLIF(2, 0) AS "7 / 2"')
    expect(st.notes).toEqual(['Runs with SET integer_division = true, as in SQLite: a whole number divided by a whole number gives a whole number (7 / 2 = 3).'])
    // ROUND gives a REAL in SQLite
    expect(lite('SELECT ROUND(list_price) / 7 AS x FROM dim_product')).toBe('SELECT CAST(ROUND(list_price) AS DOUBLE) / NULLIF(7, 0) AS x FROM dim_product')
  })

  it('adds up REAL columns with compensation, as SQLite does', () => {
    expect(lite('SELECT ROUND(SUM(revenue)) AS r, SUM(units) AS u, AVG(revenue * 1.0) AS a FROM fact_sellout')).toBe(
      'SELECT ROUND(FSUM(revenue)) AS r, SUM(units) AS u, FAVG(revenue * 1.0) AS a FROM fact_sellout',
    )
  })

  it('takes a bare column from the row of the MAX, as SQLite does', () => {
    const [st] = fromSqlite('SELECT division, product_name, MAX(list_price) AS top FROM dim_product GROUP BY division')
    expect(st.target).toBe('SELECT division, ARG_MAX(product_name, list_price) AS product_name, MAX(list_price) AS top FROM dim_product GROUP BY division')
    expect(st.notes[0]).toMatch(/arg_max/)
    expect(lite('SELECT brand, COUNT(*) AS n FROM dim_product')).toBe('SELECT ANY_VALUE(brand) AS brand, COUNT(*) AS n FROM dim_product')
    // aliases in HAVING and ORDER BY are output columns, not bare ones
    expect(lite('SELECT brand, COUNT(*) AS n FROM dim_product GROUP BY brand HAVING n > 5 ORDER BY n')).toBe(
      'SELECT brand, COUNT(*) AS n FROM dim_product GROUP BY brand HAVING n > 5 ORDER BY n NULLS FIRST',
    )
  })

  it('shows true as 1, and casts and types as SQLite has them', () => {
    expect(lite('SELECT list_price > 500 AS premium FROM dim_product')).toBe('SELECT CAST(list_price > 500 AS INT) AS premium FROM dim_product')
    expect(lite('SELECT CAST(list_price AS INTEGER) AS a, CAST(units AS REAL) AS b FROM fact_sellout')).toBe(
      'SELECT CAST(TRUNC(CAST(list_price AS DOUBLE)) AS BIGINT) AS a, CAST(units AS DOUBLE) AS b FROM fact_sellout',
    )
    expect(lite('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT, score REAL)')).toBe('CREATE TABLE main.notes (id BIGINT PRIMARY KEY, body TEXT, score DOUBLE)')
    expect(lite('SELECT a IS b AS same, max(a, b) AS m, total(x) AS t FROM t')).toBe(
      'SELECT CAST(ANY_VALUE(a) IS NOT DISTINCT FROM ANY_VALUE(b) AS INT) AS same, CASE WHEN ANY_VALUE(a) IS NULL OR ANY_VALUE(b) IS NULL THEN NULL ELSE GREATEST(ANY_VALUE(a), ANY_VALUE(b)) END AS m, COALESCE(CAST(SUM(x) AS DOUBLE), 0.0) AS t FROM t',
    )
  })

  it('computes date(), strftime() and julianday() with their modifiers', () => {
    expect(lite("SELECT strftime('%Y-%m', week_start) AS ym FROM fact_sellout")).toBe("SELECT STRFTIME(TRY_CAST(week_start AS TIMESTAMP), '%Y-%m') AS ym FROM fact_sellout")
    expect(lite("SELECT date(week_start, '+6 days', 'start of month') AS d FROM fact_sellout")).toBe(
      "SELECT CAST(DATE_TRUNC('MONTH', TRY_CAST(week_start AS TIMESTAMP) + TO_DAYS(6)) AS DATE) AS d FROM fact_sellout",
    )
    // SQLite lets the day run over: 2025-03-31 '-1 month' is 2025-03-03
    expect(lite("SELECT date(d, '-1 month') AS d FROM t")).toBe(
      "SELECT CAST(DATE_TRUNC('MONTH', TRY_CAST(d AS TIMESTAMP)) + TO_MONTHS(-1) + (TRY_CAST(d AS TIMESTAMP) - DATE_TRUNC('MONTH', TRY_CAST(d AS TIMESTAMP))) AS DATE) AS d FROM t",
    )
    expect(lite("SELECT julianday('2026-06-30') - julianday(week_start) AS days FROM fact_sellout")).toBe(
      "SELECT (EPOCH(TRY_CAST('2026-06-30' AS TIMESTAMP)) / 86400 + 2440587.5) - (EPOCH(TRY_CAST(week_start AS TIMESTAMP)) / 86400 + 2440587.5) AS days FROM fact_sellout",
    )
    // 'now' is UTC in SQLite
    expect(lite("SELECT date('now') AS today")).toBe("SELECT CAST(CAST(NOW() AT TIME ZONE 'UTC' AS TIMESTAMP) AS DATE) AS today")
    expect(lite("SELECT strftime('%s', d) AS s FROM t")).toBe('SELECT CAST(CAST(FLOOR(EPOCH(TRY_CAST(d AS TIMESTAMP))) AS BIGINT) AS TEXT) AS s FROM t')
  })

  it('says which date modifiers it cannot translate', () => {
    expect(fromSqlite("SELECT date(d, '+' || n || ' days') FROM t")[0]).toMatchObject({ target: null, error: expect.stringMatching(/made at run time/) })
    expect(fromSqlite("SELECT date(d, 'localtime') FROM t")[0].error).toMatch(/'localtime' has no DuckDB counterpart/)
  })

  it('keeps the header SQLite shows when the expression changed', () => {
    expect(lite('SELECT brand, ROUND(SUM(revenue)) FROM fact_sellout JOIN dim_product USING (product_id) GROUP BY brand')).toBe(
      'SELECT brand, ROUND(FSUM(revenue)) AS "ROUND(SUM(revenue))" FROM fact_sellout JOIN dim_product USING (product_id) GROUP BY brand',
    )
  })

  it('splits statements at semicolons only (no GO, no guessing)', () => {
    expect(fromSqlite('SELECT 1; SELECT 2').map((s) => s.target)).toEqual(['SELECT 1', 'SELECT 2'])
    expect(fromSqlite('SELECT 1\nGO')[0].target).toBe('SELECT\n  1 AS GO') // GO is just a column alias in SQLite
  })
})
