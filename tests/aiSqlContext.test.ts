import { describe, expect, it } from 'vitest'
import { tableFromArrays, type Table } from 'apache-arrow'
import {
  MAX_AI_SQL_ROWS,
  NO_RESULT_SET,
  buildSqlAiContext,
  matchReferencedTables,
  referencedNames,
  replaceCurrentStatement,
  type SqlAiOptions,
} from '../src/core/aiSqlContext'
import { MAX_AI_CELL_CHARS, MAX_AI_CONTEXT_CHARS, type AiContextTable } from '../src/core/aiContext'
import { describeSees, normalizeFeed, normalizeHistory } from '../src/core/aiChat'
import { AI_QUICK_ACTIONS, SQL_QUICK_ACTIONS, buildTutorSystemPrompt, quickActionsFor } from '../src/core/aiProvider'
import { resultRows } from '../src/db/export'

const orders: AiContextTable = {
  name: 'demo.orders',
  rows: 649,
  columns: [
    { name: 'order_id', type: 'INTEGER' },
    { name: 'status', type: 'VARCHAR' },
  ],
}
const customers: AiContextTable = { name: 'demo.customers', rows: 10, columns: [{ name: 'customer_id', type: 'INTEGER' }] }
const other: AiContextTable = { name: 'demo.products', rows: 5, columns: [{ name: 'sku', type: 'VARCHAR' }] }

function build(over: Partial<SqlAiOptions> = {}) {
  const tabText = over.tabText ?? 'SELECT * FROM demo.orders;'
  return buildSqlAiContext({
    dialect: 'duckdb',
    tabTitle: 'Query 1',
    tabText,
    cursorPos: 3,
    tables: [orders, customers, other],
    ...over,
  })
}

describe('referencedNames', () => {
  it('reads FROM, JOIN, INTO, UPDATE and a comma list after FROM', () => {
    expect(referencedNames('SELECT 1 FROM a.x JOIN "B"."y" ON 1=1')).toEqual(['a.x', 'b.y'])
    expect(referencedNames('INSERT INTO t1 VALUES (1); ')).toEqual(['t1'])
    expect(referencedNames('UPDATE [dbo].[Orders] SET a = 1')).toEqual(['dbo.orders'])
    expect(referencedNames('SELECT * FROM a, b, c WHERE 1=1')).toEqual(['a', 'b', 'c'])
  })
  it('ignores names inside comments and strings', () => {
    expect(referencedNames("-- from ghost\nSELECT 'from phantom' FROM real_t /* join nope */")).toEqual(['real_t'])
  })
  it('skips subqueries after FROM', () => {
    expect(referencedNames('SELECT * FROM (SELECT 1) s JOIN t2 ON 1=1')).toEqual(['t2'])
  })
})

describe('matchReferencedTables', () => {
  it('matches schema.name exactly, then by the bare name; no match is none', () => {
    expect(matchReferencedTables(['demo.orders'], [orders, customers])).toEqual([orders])
    expect(matchReferencedTables(['orders'], [orders, customers])).toEqual([orders])
    expect(matchReferencedTables(['dbo.orders'], [orders])).toEqual([orders])
    expect(matchReferencedTables(['ghost'], [orders])).toEqual([])
  })
})

describe('buildSqlAiContext: what goes in', () => {
  it('starts with the dialect on every request, and names the current one', () => {
    for (const d of ['duckdb', 'tsql', 'postgres'] as const) {
      const text = build({ dialect: d }).text
      expect(text).toMatch(/^Dialect: /)
    }
    expect(build({ dialect: 'tsql' }).text).toMatch(/^Dialect: T-SQL/)
    expect(build({ dialect: 'postgres' }).text).toMatch(/^Dialect: PostgreSQL/)
  })

  it('sends the statement under the cursor, not the whole tab', () => {
    const tabText = 'SELECT 1 AS first_one;\n\nSELECT status FROM demo.orders;\n\nSELECT 3 AS third_one;'
    const at = tabText.indexOf('demo.orders')
    const c = build({ tabText, cursorPos: at })
    expect(c.text).toContain('=== Current Statement ===\nSELECT status FROM demo.orders;')
    // the statement below the cursor is never sent
    expect(c.text).not.toContain('third_one')
    // the one above is, in its own section
    expect(c.text).toContain('=== Statements above (no results) ===\nSELECT 1 AS first_one;')
    expect(c.scope).toBe('statement')
    expect(c.earlierStatements).toBe(1)
  })

  it('a PowerDesigner script of thousands of lines sends only the statement and its tables', () => {
    const lines: string[] = []
    for (let i = 0; i < 3000; i++) lines.push(`create table t_${i} (id int not null, name varchar(40) null);`, '')
    lines.push('select * from demo.customers;')
    const tabText = lines.join('\n')
    const c = build({ tabText, cursorPos: tabText.length - 3, tables: [orders, customers, other] })
    expect(c.text.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_CHARS)
    expect(c.text).toContain('=== Current Statement ===\nselect * from demo.customers;')
    expect(c.referencedTables).toEqual(['demo.customers'])
    expect(c.text).not.toContain('demo.orders')
    expect(c.text).not.toContain('t_2500')
    expect(c.earlierStatements).toBeLessThanOrEqual(5)
    expect(c.truncated).toBe(false)
  })

  it('a selection beats the statement, and a long statement is cut', () => {
    const tabText = 'SELECT 1;\nSELECT status FROM demo.orders WHERE status = 1;'
    const from = tabText.indexOf('status FROM')
    const c = build({ tabText, cursorPos: 0, selection: { from, to: from + 11 } })
    expect(c.scope).toBe('selection')
    expect(c.text).toContain('=== Selected SQL ===\nstatus FROM')
    const long = 'SELECT ' + 'x, '.repeat(5000) + '1 FROM demo.orders;'
    const l = build({ tabText: long, cursorPos: 5 })
    expect(l.text).toContain('[... statement truncated]')
    expect(l.text.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_CHARS)
    expect(l.text.indexOf('=== Current Statement ===')).toBeGreaterThan(0)
    const body = l.text.slice(l.text.indexOf('=== Current Statement ===')).split('\n=== ')[0]
    expect(body.length).toBeLessThan(MAX_AI_CELL_CHARS + 80)
  })

  it('only the tables the statement names get their columns; the rest are not listed', () => {
    const c = build({ tabText: 'SELECT * FROM demo.orders o JOIN demo.customers c ON 1=1' })
    expect(c.referencedTables).toEqual(['demo.orders', 'demo.customers'])
    expect(c.text).toContain('Table: demo.orders')
    expect(c.text).toContain('  - status: VARCHAR')
    expect(c.text).not.toContain('demo.products')
  })

  it('an empty tab says so and lists the tables', () => {
    const c = build({ tabText: '', cursorPos: 0 })
    expect(c.scope).toBe('empty')
    expect(c.text).toContain('=== Current Statement ===\n(empty tab)')
    expect(c.text).toContain('Available tables: demo.orders, demo.customers, demo.products')
    expect(c.text).toContain('(nothing has run in this tab yet)')
  })

  it('a statement that names no loaded table lists what is loaded', () => {
    const c = build({ tabText: 'SELECT * FROM ghost;' })
    expect(c.referencedTables).toEqual([])
    expect(c.text).toContain('The statement names no loaded table.')
    expect(c.text).toContain('Available tables:')
  })
})

describe('buildSqlAiContext: the last result', () => {
  it('a DDL with no result set says so', () => {
    const c = build({ tabText: 'CREATE TABLE t (a int);', result: { status: 'done', columns: [], numRows: 0 } })
    expect(c.text).toContain(NO_RESULT_SET)
  })

  it('the Count table DuckDB returns for DDL and DML is not a result set, a real count(*) is', () => {
    const count = { status: 'done' as const, columns: [{ name: 'Count', type: 'Int64' }], numRows: 1 }
    expect(build({ tabText: 'CREATE TABLE t AS SELECT 1;', result: count }).text).toContain(NO_RESULT_SET)
    expect(build({ tabText: 'INSERT INTO demo.orders VALUES (1);', result: count }).text).toContain(NO_RESULT_SET)
    expect(build({ tabText: 'SELECT count(*) AS "Count" FROM demo.orders;', result: count }).text).toContain('Last result: 1 row')
  })

  it('an error goes in whole with the hints (DuckDB name hint, T-SQL hints)', () => {
    const c = build({
      tabText: 'SELECT TOP 5 * FROM demo.orders',
      result: {
        status: 'error',
        error: 'Binder Error: Referenced table "ordrs" not found!\nDid you mean "orders"?',
        hints: [{ found: 'TOP 5', use: 'LIMIT 5' }],
      },
    })
    expect(c.lastError).toContain('Did you mean "orders"?')
    expect(c.text).toContain('Last error:\nBinder Error')
    expect(c.text).toContain('TOP 5 -> LIMIT 5')
  })

  it('a stopped run is not an error', () => {
    const c = build({ result: { status: 'error', error: 'Stopped: the query was cancelled before it finished.', stopped: true } })
    expect(c.lastError).toBeNull()
    expect(c.text).not.toContain('Last error:')
    expect(c.text).toContain('stopped by the learner')
  })

  it('T-SQL adds the translation of this statement, or the translation error', () => {
    const tabText = 'SELECT TOP 5 * FROM demo.orders;\n\nSELECT 2;'
    const ok = build({
      dialect: 'tsql',
      tabText,
      cursorPos: 3,
      translation: { statements: [{ source: 'SELECT TOP 5 * FROM demo.orders;', target: 'SELECT * FROM demo.orders LIMIT 5;', error: null, notes: [] }] },
    })
    expect(ok.text).toContain('The statement as translated to DuckDB:\nSELECT * FROM demo.orders LIMIT 5;')
    const bad = build({ dialect: 'tsql', tabText, translation: { error: 'sqlglot could not parse' } })
    expect(bad.text).toContain('Translation error:\nsqlglot could not parse')
  })

  it('rows go in only when the learner ticked the box, at most 20, cells shortened', () => {
    const rows = Array.from({ length: 50 }, (_, i) => [String(i), 'x'.repeat(300)])
    const result = { status: 'done' as const, columns: [{ name: 'id', type: 'Int32' }, { name: 'note', type: 'Utf8' }], numRows: 50, rows: rows.slice(0, MAX_AI_SQL_ROWS) }
    const off = build({ result })
    expect(off.text).toContain('Last result: 50 rows')
    expect(off.text).not.toContain('First 20 Rows')
    const on = build({ result, includeRows: true })
    expect(on.text).toContain('=== First 20 Rows of the last result')
    expect(on.text.split('\n').filter((l) => /^\d+ \| x+…?$/.test(l)).length).toBe(20)
    expect(on.text).not.toContain('x'.repeat(100))
  })
})

describe('reading the first rows of a big result', () => {
  it('resultRows with a limit reads only that many rows, not the whole table', () => {
    const n = 100_000
    let reads = 0
    const real = tableFromArrays({ a: Int32Array.from({ length: n }, (_, i) => i) })
    const col = real.getChildAt(0)!
    // the same table, counting every cell read
    const big = {
      schema: real.schema,
      numRows: n,
      getChildAt: () => ({
        get: (i: number) => {
          reads++
          return col.get(i)
        },
      }),
    } as unknown as Table
    const { rows } = resultRows(big, MAX_AI_SQL_ROWS)
    expect(rows.length).toBe(20)
    expect(reads).toBe(20)
  })
})

describe('dialect, prompts and buttons', () => {
  it('the SQL prompt has the dialect rules and none of the Python ones; Python is as before', () => {
    const duck = buildTutorSystemPrompt('duckdb')
    const tsql = buildTutorSystemPrompt('tsql')
    const pg = buildTutorSystemPrompt('postgres')
    expect(tsql).toContain('TOP')
    expect(tsql).toContain('translates it to DuckDB')
    expect(pg).toContain('PGlite')
    expect(duck).toContain('QUALIFY')
    for (const p of [duck, tsql, pg]) {
      expect(p).not.toContain('lab.table')
      expect(p).not.toContain('Pyodide')
      expect(p).not.toContain('Insert as new cell')
      expect(p).toContain('light Markdown')
      expect(p).toContain('Decision:')
      expect(p).toContain('Replace current statement')
    }
    expect(buildTutorSystemPrompt()).toBe(buildTutorSystemPrompt('python'))
    expect(buildTutorSystemPrompt()).toContain('lab.table')
  })

  it('SQL tabs get their own three buttons; Python keeps its four', () => {
    expect(quickActionsFor('python')).toBe(AI_QUICK_ACTIONS)
    expect(quickActionsFor('postgres')).toBe(SQL_QUICK_ACTIONS)
    expect(SQL_QUICK_ACTIONS.map((a) => a.label)).toEqual(['Why did this fail?', 'Explain this query', 'What to check next in this data?'])
    expect(SQL_QUICK_ACTIONS.map((a) => a.instruction).join(' ')).not.toMatch(/pandas|data-mining|stage/i)
  })

  it('"Sees" names the dialect, the scope, the tables and the outcome', () => {
    const line = describeSees({
      hasSchema: true,
      sendNotebook: true,
      notebookCodeCells: 0,
      messages: 2,
      hasDecisions: false,
      sql: { dialect: 'T-SQL', scope: 'statement', earlier: 3, tables: ['demo.orders'], outcome: 'error' },
    })
    expect(line).toBe('Sees: T-SQL, the current statement, 3 statements above, table demo.orders, the last error, 2 messages')
  })
})

describe('a dialect change in the feed', () => {
  const chat = [
    { role: 'user' as const, text: 'q1' },
    { role: 'assistant' as const, text: 'a1' },
  ]
  it('a note is kept in the feed and never goes into a request', () => {
    const feed = normalizeFeed([...chat, { role: 'note', text: 'Dialect changed to PostgreSQL' }])
    expect(feed.map((m) => m.role)).toEqual(['user', 'assistant', 'note'])
    expect(normalizeHistory(feed).map((m) => m.role)).toEqual(['user', 'assistant'])
    // the next exchange still alternates
    const next = normalizeFeed([...feed, { role: 'user', text: 'q2' }, { role: 'assistant', text: 'a2' }])
    expect(next.map((m) => m.role)).toEqual(['user', 'assistant', 'note', 'user', 'assistant'])
  })
  it('a note with no conversation before it is dropped; the oldest exchange goes with its notes', () => {
    expect(normalizeFeed([{ role: 'note', text: 'x' }])).toEqual([])
    const long = 'z'.repeat(8000)
    let feed = normalizeFeed(chat)
    for (let i = 0; i < 9; i++)
      feed = normalizeFeed([...feed, { role: 'note', text: `n${i}` }, { role: 'user', text: `q${i}` }, { role: 'assistant', text: long }])
    expect(feed[0].role).toBe('user')
    expect(feed.reduce((n, m) => n + m.text.length, 0)).toBeLessThanOrEqual(60000)
  })
})

describe('replace current statement', () => {
  it('swaps the statement under the cursor and leaves the rest', () => {
    const text = 'SELECT 1;\n\nSELECT bad FROM t;\n\nSELECT 3;'
    const r = replaceCurrentStatement(text, text.indexOf('bad'), 'SELECT good FROM t;')
    expect(r.text).toBe('SELECT 1;\n\nSELECT good FROM t;\n\nSELECT 3;')
  })
  it('replaces a selection when there is one; an empty tab just gets the code', () => {
    const text = 'SELECT a, b FROM t;'
    const r = replaceCurrentStatement(text, 0, 'c', { from: 7, to: 11 })
    expect(r.text).toBe('SELECT c FROM t;')
    expect(replaceCurrentStatement('', 0, 'SELECT 1;').text).toBe('SELECT 1;')
  })
})
