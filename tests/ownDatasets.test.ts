import { describe, expect, it } from 'vitest'
import {
  catalogSchemaState,
  copyRowsSql,
  createInSchema,
  datasetName,
  indexInSchema,
  isOwnSchema,
  linkedTables,
  mentionsSchema,
  planMove,
  viewInSchema,
  type MoveTable,
} from '../src/core/ownDatasets'
import { fillSql, type FillTarget } from '../src/core/fill'
import { planGeneration } from '../src/core/generate'
import { planShare } from '../src/core/shareLink'

const CATALOG = ['chinook', 'northwind', 'sakila']

const t = (name: string, extra: Partial<MoveTable> = {}): MoveTable => ({
  name,
  columns: [{ name: 'id', type: 'INTEGER', notNull: true }],
  primaryKey: ['id'],
  uniques: [],
  foreignKeys: [],
  checks: [],
  ...extra,
})

const customers = t('customers', {
  columns: [
    { name: 'id', type: 'INTEGER', notNull: true },
    { name: 'email', type: 'VARCHAR', notNull: true },
    { name: 'status', type: 'VARCHAR', notNull: false },
  ],
  uniques: [['email']],
  checks: ['(length(email) > 3)'],
  defaults: { status: "'new'" },
  indexes: ['CREATE INDEX ix_status ON sales.customers(status);'],
})
const orders = t('orders', {
  columns: [
    { name: 'id', type: 'INTEGER', notNull: true },
    { name: 'customer_id', type: 'INTEGER', notNull: false },
  ],
  foreignKeys: [{ columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] }],
})
const staff = t('Staff', {
  columns: [
    { name: 'id', type: 'INTEGER', notNull: true },
    { name: 'boss', type: 'INTEGER', notNull: false },
  ],
  foreignKeys: [{ columns: ['boss'], refTable: 'Staff', refColumns: ['id'] }],
})
const notes = t('notes')

describe('own datasets: names', () => {
  it('turns what was typed into a schema name', () => {
    expect(datasetName('Продажи 2024', [], CATALOG)).toEqual({ name: 'prodazhi_2024' })
    expect(datasetName('  Sales  ', [], CATALOG)).toEqual({ name: 'sales' })
  })
  it('refuses empty, system, catalog and taken names', () => {
    expect(datasetName(' ', [], CATALOG)).toHaveProperty('problem')
    expect(datasetName('main', [], CATALOG)).toHaveProperty('problem')
    expect(datasetName('information_schema', [], CATALOG)).toHaveProperty('problem')
    expect(datasetName('Chinook', [], CATALOG)).toMatchObject({ problem: expect.stringContaining('sample dataset') })
    expect(datasetName('sales', ['Sales'], CATALOG)).toMatchObject({ problem: expect.stringContaining('already') })
  })
  it('tells the user’s schemas from the catalog’s', () => {
    expect(isOwnSchema('sales', CATALOG)).toBe(true)
    expect(isOwnSchema('main', CATALOG)).toBe(true)
    expect(isOwnSchema('chinook', CATALOG)).toBe(false)
  })
})

describe('own datasets: a catalog dataset’s schema', () => {
  const chinook = ['Album', 'Artist', 'Track']
  it('is absent, loaded, or holds the user’s tables', () => {
    expect(catalogSchemaState(chinook, null)).toEqual({ state: 'absent', extra: [] })
    expect(catalogSchemaState(chinook, ['album', 'Artist', 'Track'])).toEqual({ state: 'loaded', extra: [] })
    expect(catalogSchemaState(chinook, ['Album'])).toEqual({ state: 'absent', extra: [] })
    expect(catalogSchemaState(chinook, [])).toEqual({ state: 'absent', extra: [] })
    expect(catalogSchemaState(chinook, ['Album', 'my_notes'])).toEqual({ state: 'foreign', extra: ['my_notes'] })
  })
})

describe('own datasets: moving tables', () => {
  const all = [orders, customers, staff, notes]
  it('finds the tables linked by keys, either way', () => {
    expect(linkedTables(all, 'orders').sort()).toEqual(['customers', 'orders'])
    expect(linkedTables(all, 'customers').sort()).toEqual(['customers', 'orders'])
    expect(linkedTables(all, 'staff')).toEqual(['Staff'])
    expect(linkedTables(all, 'notes')).toEqual(['notes'])
  })
  it('makes the table again with its defaults, NOT NULLs, keys and CHECKs', () => {
    expect(createInSchema(customers, 'hr')).toBe(
      `CREATE TABLE "hr"."customers" ("id" INTEGER NOT NULL, "email" VARCHAR NOT NULL, "status" VARCHAR DEFAULT ('new'), PRIMARY KEY ("id"), UNIQUE ("email"), CHECK ((length(email) > 3)))`,
    )
    expect(createInSchema(orders, 'hr')).toContain(`FOREIGN KEY ("customer_id") REFERENCES "hr"."customers" ("id")`)
  })
  it('moves parents first and drops children first', () => {
    const plan = planMove(all, ['orders', 'customers'], 'sales', 'hr', [])
    if ('problem' in plan) throw new Error(plan.problem)
    expect(plan.tables).toEqual(['customers', 'orders'])
    expect(plan.copy.map((c) => c.sql)).toEqual([
      `INSERT INTO "hr"."customers" BY NAME SELECT * FROM "sales"."customers"`,
      `INSERT INTO "hr"."orders" BY NAME SELECT * FROM "sales"."orders"`,
    ])
    expect(plan.drop).toEqual([`DROP TABLE "sales"."orders"`, `DROP TABLE "sales"."customers"`])
    expect(plan.indexes).toEqual([`CREATE INDEX ix_status ON "hr"."customers"(status)`])
  })
  it('refuses to split tables linked by a key, and a name already taken', () => {
    expect(planMove(all, ['orders'], 'sales', 'hr', [])).toMatchObject({ problem: expect.stringContaining('only move together') })
    expect(planMove(all, ['notes'], 'sales', 'main', ['Notes'])).toMatchObject({ problem: expect.stringContaining('My tables already has a table called notes') })
    expect(planMove(all, ['notes'], 'sales', 'sales', [])).toHaveProperty('problem')
  })
  it('copies a table that refers to itself in rounds', () => {
    const c = copyRowsSql(staff, 'main', 'hr')
    expect(c.rounds).toBe(true)
    expect(c.sql).toContain(`NOT EXISTS (SELECT 1 FROM "hr"."Staff" x WHERE x."id" = s."id")`)
    expect(c.sql).toContain(`(s."boss" IS NULL OR EXISTS (SELECT 1 FROM "hr"."Staff" x WHERE x."id" = s."boss"))`)
  })
  it('points DuckDB’s own index statements at the new place', () => {
    expect(indexInSchema('CREATE UNIQUE INDEX "My Ix" ON sales."Order Details"("id", lower(x));', 'Order Details', 'hr')).toBe(
      `CREATE UNIQUE INDEX "My Ix" ON "hr"."Order Details"("id", lower(x))`,
    )
    expect(indexInSchema('nonsense', 'x', 'hr')).toBeNull()
  })
})

describe('own datasets: views on a renamed dataset', () => {
  it('rewrites the schema before a dot, quoted or not, and nothing else', () => {
    expect(viewInSchema('CREATE VIEW sales.v AS SELECT * FROM sales.orders JOIN "sales"."Customers" USING (id) WHERE x.sales = 1;', 'sales', 'shop')).toBe(
      'CREATE VIEW "shop".v AS SELECT * FROM "shop".orders JOIN "shop"."Customers" USING (id) WHERE x.sales = 1;',
    )
    expect(mentionsSchema('SELECT * FROM Sales . orders', 'sales')).toBe(true)
    expect(mentionsSchema('SELECT sales FROM presales.orders', 'sales')).toBe(false)
  })
})

describe('own datasets: filling and generating rows there', () => {
  it('fills a table of a dataset by its qualified name', () => {
    const target: FillTarget = {
      table: 'orders',
      schema: 'sales',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, hasDefault: false },
        { name: 'customer_id', type: 'INTEGER', nullable: true, hasDefault: false },
      ],
      constraints: [
        { kind: 'primary', columns: ['id'] },
        { kind: 'foreign', columns: ['customer_id'], refTable: 'customers', refColumns: ['id'] },
      ],
    }
    const sql = fillSql(target, { id: 'id', customer_id: 'customer_id' }, [{ name: 'id', type: 'INTEGER' }, { name: 'customer_id', type: 'INTEGER' }], 'staged', 'v', 'rowid + 2')
    expect(sql.insert(null)).toContain('INSERT INTO "sales"."orders"')
    expect(sql.problems).toContain('FROM "sales"."orders" t')
    expect(sql.problems).toContain('FROM "sales"."customers" r')
  })
  it('generates rows into a dataset’s tables', () => {
    const plan = planGeneration(
      [
        { ...customers, rows: 0, schema: 'sales' },
        { ...orders, rows: 0, schema: 'sales' },
      ],
      new Map([['customers', 5], ['orders', 5]]),
    )
    expect(plan.steps.map((s) => s.schema)).toEqual(['sales', 'sales'])
    expect(plan.steps[1].sql.join('\n')).toContain('FROM sales.customers')
    expect(plan.steps[1].sql.join('\n')).toContain('INSERT INTO sales.orders')
  })
})

describe('own datasets: share links', () => {
  it('warns that a dataset’s tables are not in the link', () => {
    const { notShared } = planShare([{ title: 'q', sql: 'SELECT * FROM sales.orders JOIN "sales"."Customers" USING (id) JOIN hr.staff_2 USING (id)' }], {
      datasets: [],
      demoTables: [],
      ownTables: ['orders'],
      ownDatasetTables: [
        { schema: 'sales', name: 'orders' },
        { schema: 'sales', name: 'Customers' },
        { schema: 'hr', name: 'staff' },
      ],
    })
    expect(notShared).toEqual(['sales.orders', 'sales.Customers'])
  })
})
