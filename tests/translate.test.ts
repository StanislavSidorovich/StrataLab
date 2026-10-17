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
