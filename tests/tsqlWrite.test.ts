// T-SQL write probe (2026-11-27): which course-style data-changing constructs a T-SQL tab runs.
//
// Each construct goes through the path runSql takes in a T-SQL tab: sqlglot translates the script (translate.py), the
// statements come out in runOrder, DuckDB runs them one at a time on one connection, the first error stops the script
// (the ones before it stay done), and the IDENTITY sequences are synced after a script that got to the end.
// The tables are small ones made here (customers 1:n orders, PK and FK, IDENTITY keys, the shape of the demo shop).
//
// The tests state what Lab does today, not what SQL Server does: a test that goes red here means the behaviour
// moved, and docs/dbms-lessons-9-11-digest.md section 6 (the table of results) needs a look. Where the result
// differs from SQL Server a comment says how ("SQL Server:").
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import type { ResultData } from '../src/core/check'
import { identitySyncSql } from '../src/core/identitySync'
import { foldKeys, runOrder } from '../src/core/pdScript'
import { resultRows } from '../src/db/export'
import { SQLGLOT_VERSION, type TranslatedStatement } from '../src/dialects/tsql'

const require = createRequire(import.meta.url)

interface Outcome {
  /** sqlglot could not read a statement: nothing ran */
  translateError?: string
  /** DuckDB's error for the statement that stopped the script */
  error?: string
  /** statements that ran / statements in the script */
  done: number
  of: number
  /** the last result that had columns (a SELECT, or the "Count" of an INSERT / UPDATE / DELETE) */
  last: ResultData | null
  /** what DuckDB was given */
  sql: string[]
}

let duck: { query: (sql: string) => Parameters<typeof resultRows>[0] }
let py: PyodideInterface

/** A script as a T-SQL tab runs it. */
function run(script: string): Outcome {
  py.globals.set('_script', script)
  const translated = foldKeys(JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')) as TranslatedStatement[])
  const bad = translated.find((s) => s.error)
  if (bad) return { translateError: bad.error!, done: 0, of: 0, last: null, sql: [] }
  const sql = runOrder(translated)
  let done = 0
  let last: ResultData | null = null
  try {
    for (const s of sql) {
      const r = resultRows(duck.query(s))
      if (r.header.length > 0) last = r
      done++
    }
    for (const s of identitySyncSql(translated)) {
      try {
        duck.query(s)
      } catch {
        /* as runSql: a sequence that is not where it was expected stays as it is */
      }
    }
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e).split('\n')[0], done, of: sql.length, last, sql }
  }
  return { done, of: sql.length, last, sql }
}

/** Rows of a query, or the error text (a query after a failed statement in a transaction fails too). */
function rows(sql: string): unknown[][] | string {
  try {
    return resultRows(duck.query(sql)).rows
  } catch (e) {
    return String(e instanceof Error ? e.message : e).split('\n')[0]
  }
}

/** The cell of a one-row, one-column result: the rows an INSERT / UPDATE / DELETE touched (its "Count"). */
const count = (o: Outcome) => o.last?.rows[0][0]

/** Customers 1:n orders. `fk` is what follows REFERENCES in orders (` ` makes the FK column nullable). */
const SETUP = (fk = '') => `
CREATE TABLE shop_customers (customer_id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(50) NOT NULL, city NVARCHAR(30) DEFAULT 'Lisbon', credit INT NOT NULL DEFAULT 0);
CREATE TABLE shop_orders (order_id INT IDENTITY(1,1) PRIMARY KEY, customer_id INT ${fk ? 'NULL' : 'NOT NULL'} REFERENCES shop_customers(customer_id) ${fk}, status NVARCHAR(20) NOT NULL DEFAULT 'new', amount DECIMAL(10,2) NOT NULL, placed DATE NOT NULL);
INSERT INTO shop_customers (name, city, credit) VALUES ('Ana', 'Porto', 10), ('Bruno', 'Lisbon', 0), ('Carla', 'Faro', 5);
INSERT INTO shop_orders (customer_id, status, amount, placed) VALUES (1, 'new', 20.5, '2026-01-10'), (1, 'paid', 30, '2026-01-12'), (2, 'new', 15, '2026-02-01');`

/** Drops what a test made, then makes the tables afresh (orders first: it points at customers). */
function fresh(fk = ''): Outcome {
  try {
    duck.query('ROLLBACK') // a test may leave a transaction open
  } catch {
    /* none open */
  }
  for (const t of ['shop_orders', 'shop_customers', 'shop_copy']) duck.query(`DROP TABLE IF EXISTS ${t}`)
  for (const s of ['shop_orders_order_id_seq', 'shop_customers_customer_id_seq']) duck.query(`DROP SEQUENCE IF EXISTS ${s}`)
  return run(SETUP(fk))
}

const CUSTOMERS = 'SELECT customer_id, name, city, credit FROM shop_customers ORDER BY 1'
const ORDERS = 'SELECT order_id, customer_id, status, placed FROM shop_orders ORDER BY 1'
const SEED_CUSTOMERS = [
  [1, 'Ana', 'Porto', 10],
  [2, 'Bruno', 'Lisbon', 0],
  [3, 'Carla', 'Faro', 5],
]
const SEED_ORDERS = [
  [1, 1, 'new', '2026-01-10'],
  [2, 1, 'paid', '2026-01-12'],
  [3, 2, 'new', '2026-02-01'],
]

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  duck = db.connect()
  py = await loadPyodide()
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
}, 180_000)

beforeEach(() => {
  const o = fresh()
  expect(o.error ?? o.translateError).toBeUndefined()
  expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
  expect(rows(ORDERS)).toEqual(SEED_ORDERS)
})

describe('INSERT', () => {
  it('explicit columns: runs; the columns left out take their DEFAULT and the IDENTITY', () => {
    const o = run(`INSERT INTO shop_customers (name, city) VALUES ('Dina', 'Braga')`)
    expect(o.error).toBeUndefined()
    expect(count(o)).toBe(1)
    expect(rows('SELECT customer_id, name, city, credit FROM shop_customers WHERE name = \'Dina\'')).toEqual([[4, 'Dina', 'Braga', 0]])
  })
  it('several rows in one VALUES: runs', () => {
    const o = run(`INSERT INTO shop_customers (name) VALUES ('E'), ('F'), ('G')`)
    expect(count(o)).toBe(3)
    expect(rows('SELECT count(*) FROM shop_customers')).toEqual([[6]])
  })
  it('INSERT ... SELECT: runs', () => {
    const o = run(`INSERT INTO shop_orders (customer_id, amount, placed) SELECT customer_id, 1, '2026-03-01' FROM shop_customers WHERE city = 'Faro'`)
    expect(count(o)).toBe(1)
    expect(rows('SELECT customer_id, status FROM shop_orders WHERE order_id = 4')).toEqual([[3, 'new']])
  })
  it('the DEFAULT keyword in VALUES: runs', () => {
    const o = run(`INSERT INTO shop_customers (name, city, credit) VALUES ('H', DEFAULT, DEFAULT)`)
    expect(count(o)).toBe(1)
    expect(rows(`SELECT city, credit FROM shop_customers WHERE name = 'H'`)).toEqual([['Lisbon', 0]])
  })
  it('a text longer than its NVARCHAR(50): runs and keeps all of it (SQL Server: "String or binary data would be truncated")', () => {
    const o = run(`INSERT INTO shop_customers (name) VALUES ('${'x'.repeat(60)}')`)
    expect(o.error).toBeUndefined()
    expect(rows(`SELECT length(name) FROM shop_customers WHERE customer_id = 4`)).toEqual([[60]])
  })
  it('OUTPUT inserted.col: does not run (translated to RETURNING inserted.col)', () => {
    const o = run(`INSERT INTO shop_customers (name) OUTPUT inserted.customer_id VALUES ('Z')`)
    expect(o.error).toMatch(/Referenced table "inserted" not found/)
    expect(o.sql[0]).toContain('RETURNING inserted.customer_id')
    expect(rows('SELECT count(*) FROM shop_customers')).toEqual([[3]])
  })
})

describe('IDENTITY', () => {
  it('ids come from a sequence: 1, 2, 3 in the seed, then 4', () => {
    run(`INSERT INTO shop_customers (name) VALUES ('Dina')`)
    expect(rows(`SELECT customer_id FROM shop_customers WHERE name = 'Dina'`)).toEqual([[4]])
  })
  it('an explicit id in an IDENTITY column: accepted (SQL Server: error unless SET IDENTITY_INSERT is ON), and the sequence does not follow it', () => {
    const o = run(`INSERT INTO shop_customers (customer_id, name) VALUES (50, 'Big'); INSERT INTO shop_customers (name) VALUES ('Next')`)
    expect(o.error).toBeUndefined()
    // the sequence has not moved: 'Next' takes 4, and so does the next INSERT in another Run
    // (identitySyncSql only follows the CREATE TABLEs of the same script, so an INSERT into an existing table is not synced;
    // the ids walk up to 50 and then collide with the row 'Big')
    expect(rows(`SELECT customer_id FROM shop_customers WHERE name = 'Next'`)).toEqual([[4]])
    run(`INSERT INTO shop_customers (name) VALUES ('After')`)
    expect(rows(`SELECT customer_id FROM shop_customers WHERE name = 'After'`)).toEqual([[5]])
  })
  it('SCOPE_IDENTITY(): does not run, and the INSERT before it stays done', () => {
    const o = run(`INSERT INTO shop_customers (name) VALUES ('Zed'); SELECT SCOPE_IDENTITY() AS id`)
    expect(o.error).toMatch(/scope_identity does not exist/)
    expect(o.done).toBe(1)
    expect(rows(`SELECT count(*) FROM shop_customers WHERE name = 'Zed'`)).toEqual([[1]])
  })
  it('SCOPE_IDENTITY() into a variable: does not run at all (DECLARE @x is not DuckDB)', () => {
    const o = run(`DECLARE @id INT; INSERT INTO shop_customers (name) VALUES ('Zed'); SET @id = SCOPE_IDENTITY(); INSERT INTO shop_orders (customer_id, amount, placed) VALUES (@id, 5, '2026-03-03')`)
    expect(o.error).toMatch(/syntax error at or near "DECLARE"/)
    expect(o.done).toBe(0)
    expect(rows('SELECT count(*) FROM shop_customers')).toEqual([[3]])
  })
  it('@@IDENTITY and IDENT_CURRENT(): do not run (@@IDENTITY reaches DuckDB as $$IDENTITY)', () => {
    const a = run(`SELECT @@IDENTITY AS id`)
    expect(a.error).toMatch(/Parser Error/)
    expect(a.sql[0]).toContain('$$IDENTITY')
    expect(run(`SELECT IDENT_CURRENT('shop_customers') AS id`).error).toMatch(/ident_current does not exist/)
  })
  it('the way round it: currval of the table\'s sequence (named <table>_<column>_seq) after the INSERT, same connection', () => {
    const o = run(`INSERT INTO shop_customers (name) VALUES ('Z'); SELECT currval('shop_customers_customer_id_seq') AS id`)
    expect(o.error).toBeUndefined()
    expect(o.last?.rows).toEqual([[4]])
  })
})

describe('SELECT INTO', () => {
  it('a new table: runs (CREATE TABLE AS); it has no key and no IDENTITY, as in SQL Server', () => {
    const o = run(`SELECT customer_id, name INTO shop_copy FROM shop_customers WHERE credit > 0`)
    expect(o.error).toBeUndefined()
    expect(o.sql[0]).toMatch(/^CREATE TABLE shop_copy AS SELECT/)
    expect(rows('SELECT * FROM shop_copy ORDER BY 1')).toEqual([[1, 'Ana'], [3, 'Carla']])
  })
  it('a #temp table: runs as a TEMPORARY table', () => {
    const o = run(`SELECT name INTO #t FROM shop_customers; SELECT * FROM #t`)
    expect(o.error).toBeUndefined()
    expect(o.sql[0]).toMatch(/^CREATE TEMPORARY TABLE t AS/)
    expect(o.last?.rows).toHaveLength(3)
  })
  it('into a table that exists: error, like SQL Server', () => {
    const o = run(`SELECT name INTO shop_customers FROM shop_customers`)
    expect(o.error).toMatch(/already exists/)
  })
})

describe('UPDATE', () => {
  it('with CASE: runs', () => {
    const o = run(`UPDATE shop_orders SET status = CASE WHEN amount >= 20 THEN 'big' ELSE 'small' END`)
    expect(count(o)).toBe(3)
    expect(rows('SELECT status FROM shop_orders ORDER BY order_id')).toEqual([['big'], ['big'], ['small']])
  })
  it('with a subquery in SET (correlated): runs', () => {
    run(`UPDATE shop_customers SET credit = (SELECT COUNT(*) FROM shop_orders o WHERE o.customer_id = shop_customers.customer_id)`)
    expect(rows('SELECT credit FROM shop_customers ORDER BY customer_id')).toEqual([[2], [1], [0]])
  })
  it('with a subquery in WHERE: runs', () => {
    const o = run(`UPDATE shop_orders SET status = 'vip' WHERE customer_id IN (SELECT customer_id FROM shop_customers WHERE city = 'Porto')`)
    expect(count(o)).toBe(2)
  })
  it('several columns: runs', () => {
    run(`UPDATE shop_customers SET city = 'Braga', credit = credit * 2 WHERE name = 'Ana'`)
    expect(rows(`SELECT city, credit FROM shop_customers WHERE name = 'Ana'`)).toEqual([['Braga', 20]])
  })
  it('DATEADD (day, month): runs, as + INTERVAL', () => {
    const o = run(`UPDATE shop_orders SET placed = DATEADD(day, 7, placed)`)
    expect(o.sql[0]).toContain('INTERVAL 7 DAY')
    expect(rows('SELECT placed FROM shop_orders ORDER BY order_id')).toEqual([['2026-01-17'], ['2026-01-19'], ['2026-02-08']])
    run(`UPDATE shop_orders SET placed = DATEADD(month, 1, placed) WHERE order_id = 1`)
    expect(rows('SELECT placed FROM shop_orders WHERE order_id = 1')).toEqual([['2026-02-17']])
  })
  it('UPDATE c SET c.col = ... FROM t c JOIN u ON ...: does not run (DuckDB: qualified column in SET)', () => {
    const o = run(`UPDATE c SET c.credit = c.credit + o.amount FROM shop_customers c JOIN shop_orders o ON o.customer_id = c.customer_id WHERE o.status = 'paid'`)
    expect(o.error).toMatch(/Qualified column names in UPDATE \.\. SET not supported/)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
  })
  it('UPDATE t SET col = ... FROM t JOIN u ON ... (the table repeated): does not run (the column is ambiguous)', () => {
    const o = run(`UPDATE shop_customers SET credit = credit + 1 FROM shop_customers JOIN shop_orders ON shop_orders.customer_id = shop_customers.customer_id`)
    expect(o.error).toMatch(/Ambiguous reference to column name "credit"/)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
  })
  it('the way round it: DuckDB\'s own form, UPDATE t SET col = ... FROM u WHERE u.k = t.k (no repeat of t, no alias on SET)', () => {
    const o = run(`UPDATE shop_customers SET credit = credit + o.amount FROM shop_orders o WHERE o.customer_id = shop_customers.customer_id AND o.status = 'paid'`)
    expect(o.error).toBeUndefined()
    expect(count(o)).toBe(1)
    expect(rows(`SELECT credit FROM shop_customers WHERE name = 'Ana'`)).toEqual([[40]])
  })
  it('the key of a row an order points at: blocked by the FK; a key nobody points at: changes', () => {
    expect(run(`UPDATE shop_customers SET customer_id = 10 WHERE customer_id = 1`).error).toMatch(/Violates foreign key constraint because key "customer_id: 1" is still referenced/)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
    expect(count(run(`UPDATE shop_customers SET customer_id = 10 WHERE customer_id = 3`))).toBe(1)
    expect(rows(CUSTOMERS)).toEqual([SEED_CUSTOMERS[0], SEED_CUSTOMERS[1], [10, 'Carla', 'Faro', 5]])
  })
  it('moving the orders first, then the key: runs (two statements, in this order)', () => {
    const o = run(`UPDATE shop_orders SET customer_id = 3 WHERE customer_id = 1; UPDATE shop_customers SET customer_id = 11 WHERE customer_id = 1`)
    expect(o.error).toBeUndefined()
    expect(rows(CUSTOMERS)).toEqual([SEED_CUSTOMERS[1], SEED_CUSTOMERS[2], [11, 'Ana', 'Porto', 10]])
  })
})

describe('DELETE and TRUNCATE', () => {
  it('with a subquery (IN, EXISTS): runs', () => {
    expect(count(run(`DELETE FROM shop_orders WHERE customer_id IN (SELECT customer_id FROM shop_customers WHERE city = 'Porto')`))).toBe(2)
    fresh()
    const o = run(`DELETE FROM shop_orders WHERE EXISTS (SELECT 1 FROM shop_customers c WHERE c.customer_id = shop_orders.customer_id AND c.city = 'Porto')`)
    expect(count(o)).toBe(2)
    expect(rows(ORDERS)).toEqual([SEED_ORDERS[2]])
  })
  it('DELETE t FROM t JOIN u ON ... (alias or table name): does not run (syntax error)', () => {
    const a = run(`DELETE o FROM shop_orders o JOIN shop_customers c ON c.customer_id = o.customer_id WHERE c.city = 'Porto'`)
    expect(a.error).toMatch(/syntax error at or near "o"/)
    const b = run(`DELETE shop_orders FROM shop_orders JOIN shop_customers ON shop_customers.customer_id = shop_orders.customer_id WHERE city = 'Porto'`)
    expect(b.error).toMatch(/syntax error at or near "shop_orders"/)
    expect(rows(ORDERS)).toEqual(SEED_ORDERS)
  })
  it('the way round it: DELETE FROM t USING u WHERE ... (DuckDB), or a subquery', () => {
    const o = run(`DELETE FROM shop_orders USING shop_customers c WHERE c.customer_id = shop_orders.customer_id AND c.city = 'Porto'`)
    expect(o.error).toBeUndefined()
    expect(count(o)).toBe(2)
    expect(rows(ORDERS)).toEqual([SEED_ORDERS[2]])
  })
  it('DELETE TOP (n): does not run', () => {
    const o = run(`DELETE TOP (1) FROM shop_orders`)
    expect(o.error).toMatch(/syntax error at or near "TOP"/)
    expect(rows(ORDERS)).toEqual(SEED_ORDERS)
  })
  it('a parent row with orders: blocked by the FK, with DuckDB\'s wording', () => {
    const o = run(`DELETE FROM shop_customers WHERE customer_id = 1`)
    expect(o.error).toMatch(/^Constraint Error: Violates foreign key constraint because key "customer_id: 1" is still referenced by a foreign key in a different table/)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
  })
  it('the orders first, then the parent: runs', () => {
    const o = run(`DELETE FROM shop_orders WHERE customer_id = 1; DELETE FROM shop_customers WHERE customer_id = 1`)
    expect(o.error).toBeUndefined()
    expect(rows(CUSTOMERS)).toEqual([SEED_CUSTOMERS[1], SEED_CUSTOMERS[2]])
  })
  it('ON DELETE CASCADE / SET NULL / SET DEFAULT and ON UPDATE CASCADE in CREATE TABLE: do not run; the tables before it stay', () => {
    for (const action of ['ON DELETE CASCADE', 'ON DELETE SET NULL', 'ON DELETE SET DEFAULT', 'ON UPDATE CASCADE']) {
      const o = fresh(action)
      expect(o.error, action).toMatch(/FOREIGN KEY constraints cannot use CASCADE, SET NULL or SET DEFAULT/)
      // the script stopped at the second CREATE TABLE: the parent exists (empty), the child and the INSERTs do not
      expect(o.done, action).toBe(1)
      expect(rows('SELECT count(*) FROM shop_customers'), action).toEqual([[0]])
      expect(typeof rows('SELECT * FROM shop_orders'), action).toBe('string')
    }
  })
  it('ON DELETE NO ACTION (the default, written out): runs, and blocks like the default', () => {
    const o = fresh('ON DELETE NO ACTION')
    expect(o.error).toBeUndefined()
    expect(run(`DELETE FROM shop_customers WHERE customer_id = 1`).error).toMatch(/Violates foreign key constraint/)
  })
  it('TRUNCATE TABLE on a table nobody points at: runs, and does NOT reset the IDENTITY (SQL Server: the next id is 1)', () => {
    const o = run(`TRUNCATE TABLE shop_orders; INSERT INTO shop_orders (customer_id, amount, placed) VALUES (1, 1, '2026-01-01')`)
    expect(o.error).toBeUndefined()
    expect(rows('SELECT order_id FROM shop_orders')).toEqual([[4]])
  })
  it('TRUNCATE TABLE on a table an order points at: blocked (as in SQL Server); DELETE without WHERE keeps the IDENTITY in both', () => {
    expect(run(`TRUNCATE TABLE shop_customers`).error).toMatch(/Violates foreign key constraint/)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
    run(`DELETE FROM shop_orders; INSERT INTO shop_orders (customer_id, amount, placed) VALUES (1, 1, '2026-01-01')`)
    expect(rows('SELECT order_id FROM shop_orders')).toEqual([[4]])
  })
  it('NOT IN (subquery that holds a NULL): deletes nothing, like SQL Server; without the NULL it deletes the rows', () => {
    const f = fresh(' ') // the FK column may hold NULL
    expect(f.error).toBeUndefined()
    const o = run(`INSERT INTO shop_orders (customer_id, amount, placed) VALUES (NULL, 1, '2026-01-01'); DELETE FROM shop_customers WHERE customer_id NOT IN (SELECT customer_id FROM shop_orders)`)
    expect(o.error).toBeUndefined()
    expect(count(o)).toBe(0)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
    const p = run(`DELETE FROM shop_customers WHERE customer_id NOT IN (SELECT customer_id FROM shop_orders WHERE customer_id IS NOT NULL)`)
    expect(count(p)).toBe(1)
    expect(rows(CUSTOMERS)).toEqual([SEED_CUSTOMERS[0], SEED_CUSTOMERS[1]])
  })
})

describe('transactions and a failing script', () => {
  it('BEGIN TRANSACTION ... ROLLBACK: the changes go; BEGIN TRAN / ROLLBACK TRAN too', () => {
    const o = run(`BEGIN TRANSACTION; DELETE FROM shop_orders; ROLLBACK`)
    expect(o.error).toBeUndefined()
    expect(o.sql).toEqual(['BEGIN', 'DELETE FROM shop_orders', 'ROLLBACK'])
    expect(rows(ORDERS)).toEqual(SEED_ORDERS)
    expect(run(`BEGIN TRAN; DELETE FROM shop_orders; ROLLBACK TRAN`).error).toBeUndefined()
    expect(rows(ORDERS)).toEqual(SEED_ORDERS)
  })
  it('BEGIN TRANSACTION ... COMMIT: the changes stay', () => {
    const o = run(`BEGIN TRANSACTION; DELETE FROM shop_orders WHERE order_id = 1; COMMIT`)
    expect(o.error).toBeUndefined()
    expect(rows(ORDERS)).toEqual([SEED_ORDERS[1], SEED_ORDERS[2]])
  })
  it('a statement fails inside BEGIN ... COMMIT: the whole transaction is aborted, and every later statement fails until ROLLBACK (SQL Server: COMMIT would keep the others)', () => {
    const o = run(`BEGIN TRANSACTION; DELETE FROM shop_orders WHERE order_id = 1; INSERT INTO shop_orders (customer_id, amount, placed) VALUES (999, 1, '2026-01-01'); COMMIT`)
    expect(o.error).toMatch(/does not exist in the referenced table/)
    expect(o.done).toBe(2) // BEGIN and the DELETE ran; the INSERT failed; COMMIT never ran
    // the next Run, whatever it is, hits the aborted transaction (runSql sends no ROLLBACK by itself)
    expect(run('SELECT 1').error).toMatch(/Current transaction is aborted \(please ROLLBACK\)/)
    expect(run('ROLLBACK').error).toBeUndefined()
    expect(rows(ORDERS)).toEqual(SEED_ORDERS) // the DELETE went with it
  })
  it('BEGIN without COMMIT / ROLLBACK: the transaction stays open for the next Run, and CHECKPOINT (which runSql sends in a saved database) fails on it', () => {
    run(`BEGIN TRANSACTION; DELETE FROM shop_orders`)
    expect(rows(ORDERS)).toEqual([]) // this connection sees its own change
    expect(run('CHECKPOINT').error).toMatch(/Cannot CHECKPOINT: the current transaction has transaction local changes/)
    expect(rows(ORDERS)).toMatch(/Current transaction is aborted/) // and the failed CHECKPOINT aborted it
    run('ROLLBACK')
    expect(rows(ORDERS)).toEqual(SEED_ORDERS)
  })
  it('statement 3 of 4 fails: 1 and 2 stay done, 4 never runs (SQL Server: 4 would run, an FK error ends only its own statement)', () => {
    const o = run(`INSERT INTO shop_customers (name) VALUES ('P1'); UPDATE shop_customers SET credit = 1 WHERE name = 'P1'; INSERT INTO shop_orders (customer_id, amount, placed) VALUES (999, 1, '2026-01-01'); UPDATE shop_customers SET credit = 99 WHERE name = 'Carla'`)
    expect(o.error).toMatch(/Violates foreign key constraint because key "customer_id: 999" does not exist/)
    expect(o.done).toBe(2)
    expect(o.of).toBe(4)
    expect(rows(CUSTOMERS)).toEqual([...SEED_CUSTOMERS, [4, 'P1', 'Lisbon', 1]]) // Carla still 5
  })
  it('a translation error in any statement: nothing of the script runs', () => {
    const before = rows(CUSTOMERS)
    const o = run(`INSERT INTO shop_customers (name) VALUES ('Q'); UPDATE shop_customers SET FROM WHERE`)
    expect(o.translateError).toBeDefined()
    expect(o.done).toBe(0)
    expect(rows(CUSTOMERS)).toEqual(before)
  })
})

describe('runs, but not the way SQL Server does', () => {
  it('= on text is case-sensitive: WHERE name = \'ana\' touches 0 rows (SQL Server\'s default collation: 1)', () => {
    const o = run(`UPDATE shop_customers SET credit = 99 WHERE name = 'ana'`)
    expect(o.error).toBeUndefined()
    expect(count(o)).toBe(0)
    expect(rows(CUSTOMERS)).toEqual(SEED_CUSTOMERS)
  })
  it('the integer in an expression: credit / 2 is a true division (7 / 2 = 3.5), rounded when it goes back into an INT column (SQL Server: 3)', () => {
    run(`UPDATE shop_customers SET credit = (credit + 2) / 2`) // 10, 0, 5 -> 12/2, 2/2, 7/2
    expect(rows('SELECT credit FROM shop_customers ORDER BY customer_id')).toEqual([[6], [1], [4]]) // SQL Server: 6, 1, 3
  })
  it('the result of INSERT / UPDATE / DELETE is a one-cell "Count" table (SQL Server: the message "(3 rows affected)")', () => {
    const o = run(`UPDATE shop_orders SET status = 'x'`)
    expect(o.last?.header).toEqual(['Count'])
    expect(count(o)).toBe(3)
  })
})
