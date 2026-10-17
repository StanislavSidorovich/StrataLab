import { describe, expect, it } from 'vitest'
import { autoMap, fillSql, mappingProblems, normalizeName, type FillTarget } from '../src/core/fill'

const target: FillTarget = {
  table: 'orders',
  columns: [
    { name: 'order_id', type: 'INTEGER', nullable: false, hasDefault: false },
    { name: 'customer_id', type: 'INTEGER', nullable: true, hasDefault: false },
    { name: 'amount', type: 'DECIMAL(10,2)', nullable: true, hasDefault: false },
    { name: 'status', type: 'VARCHAR', nullable: false, hasDefault: true },
  ],
  constraints: [
    { kind: 'primary', columns: ['order_id'] },
    { kind: 'foreign', columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] },
    { kind: 'check', expression: '(amount >= 0)' },
  ],
}

describe('filling a table from a file', () => {
  it('normalises column names', () => {
    expect(normalizeName('Customer ID')).toBe('customerid')
    expect(normalizeName('customer_id')).toBe('customerid')
    expect(normalizeName('Сумма')).toBe('summa')
  })

  it('matches file columns by name', () => {
    const m = autoMap([{ name: 'Order ID', type: 'BIGINT' }, { name: 'AMOUNT', type: 'DOUBLE' }, { name: 'note', type: 'VARCHAR' }], target.columns)
    expect(m).toEqual({ order_id: 'Order ID', customer_id: null, amount: 'AMOUNT', status: null })
  })

  it('matches by position when no name matches and the counts agree', () => {
    const m = autoMap(['a', 'b', 'c', 'd'].map((name) => ({ name, type: 'VARCHAR' })), target.columns)
    expect(m).toEqual({ order_id: 'a', customer_id: 'b', amount: 'c', status: 'd' })
  })

  it('asks for NOT NULL columns without a default', () => {
    expect(mappingProblems(target, { order_id: null, customer_id: 'x', amount: null, status: null })).toEqual(['order_id is NOT NULL: choose a file column for it.'])
    expect(mappingProblems(target, { order_id: null, customer_id: null, amount: null, status: null })[0]).toMatch(/at least one/)
  })

  it('builds one check per rule and inserts only mapped columns', () => {
    const src = [{ name: 'id', type: 'DOUBLE' }, { name: 'cust', type: 'VARCHAR' }, { name: 'sum', type: 'DOUBLE' }]
    const sql = fillSql(target, { order_id: 'id', customer_id: 'cust', amount: 'sum', status: null }, src, 'staged', 'v', 'rowid + 2')
    expect(sql.view).toContain('TRY_CAST("id" AS INTEGER) AS "order_id"')
    expect(sql.view).toContain('CAST(NULL AS VARCHAR) AS "status"')
    // 5.6 into an INTEGER column is reported, not rounded
    expect(sql.problems).toContain('__src0 <> trunc(__src0)')
    for (const kind of ['type', 'notnull', 'duplicate', 'exists', 'foreign', 'check']) expect(sql.problems).toContain(`'${kind}' AS kind`)
    expect(sql.problems).toContain('FROM "customers" r WHERE r."id" = f."customer_id"')
    expect(sql.insert('bad')).toBe('INSERT INTO "orders" ("order_id", "customer_id", "amount") SELECT "order_id", "customer_id", "amount" FROM v WHERE __row NOT IN (SELECT __row FROM bad) ORDER BY __row')
    expect(sql.insert(null)).not.toContain('NOT IN')
  })

  it('skips key checks on columns that are not filled', () => {
    const sql = fillSql(target, { order_id: 'id', customer_id: null, amount: null, status: null }, [{ name: 'id', type: 'INTEGER' }], 'staged', 'v', 'rowid + 2')
    expect(sql.problems).not.toContain("'foreign' AS kind")
    expect(sql.problems).not.toContain('trunc')
  })

  it('reads text numbers with a decimal comma when the file uses one', () => {
    const src = [{ name: 'id', type: 'BIGINT' }, { name: 'sum', type: 'VARCHAR' }]
    const m = { order_id: 'id', customer_id: null, amount: 'sum', status: null }
    expect(fillSql(target, m, src, 's', 'v', 'rowid', true).view).toContain(String.raw`TRY_CAST(replace(regexp_replace("sum", '[\s\x{a0}]', '', 'g'), ',', '.') AS DECIMAL(10,2))`)
    expect(fillSql(target, m, src, 's', 'v', 'rowid', false).view).toContain('TRY_CAST("sum" AS DECIMAL(10,2))')
  })
})
