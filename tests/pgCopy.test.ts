import { describe, expect, it } from 'vitest'
import { pgSchema, planPgCopy } from '../src/core/pgCopy'
import type { ModelTable } from '../src/core/modelLink'

const shop: ModelTable[] = [
  {
    name: 'orders',
    columns: [
      { name: 'order_id', type: 'INTEGER', notNull: true },
      { name: 'customer_id', type: 'INTEGER', notNull: true },
      { name: 'status', type: 'VARCHAR', notNull: true },
      { name: 'tags', type: 'VARCHAR[]', notNull: false },
    ],
    primaryKey: ['order_id'],
    uniques: [],
    foreignKeys: [{ columns: ['customer_id'], refTable: 'customers', refColumns: ['customer_id'] }],
    checks: ["(status IN ('delivered', 'shipped'))"],
  },
  {
    name: 'customers',
    columns: [
      { name: 'customer_id', type: 'INTEGER', notNull: true },
      { name: 'Full Name', type: 'VARCHAR', notNull: false },
      { name: 'photo', type: 'BLOB', notNull: false },
    ],
    primaryKey: ['customer_id'],
    uniques: [['Full Name']],
    foreignKeys: [],
    checks: [],
  },
]

describe('copy to PostgreSQL', () => {
  it('puts the user’s tables in public and a dataset in its own schema', () => {
    expect(pgSchema('main')).toBe('public')
    expect(pgSchema('chinook')).toBe('chinook')
  })

  it('creates referenced tables first, keys and checks inline, foreign keys after the rows', () => {
    const p = planPgCopy('main', shop)
    expect(p.tables.map((t) => t.name)).toEqual(['customers', 'orders'])
    expect(p.tables[0].create).toEqual([
      'DROP TABLE IF EXISTS public.customers CASCADE',
      'CREATE TABLE public.customers (\n  customer_id integer NOT NULL,\n  "Full Name" text,\n  photo bytea,\n  PRIMARY KEY (customer_id),\n  UNIQUE ("Full Name")\n)',
    ])
    expect(p.tables[0].select).toBe(`SELECT customer_id, "Full Name", '\\x' || hex(photo) FROM customers`)
    expect(p.tables[1].create[1]).toContain("CHECK (status IN ('delivered', 'shipped'))")
    expect(p.tables[1].createPlain).not.toContain('CHECK')
    expect(p.tables[1].copy).toBe("COPY public.orders FROM '/dev/blob' WITH (FORMAT csv)")
    expect(p.foreignKeys).toEqual([
      { sql: 'ALTER TABLE public.orders ADD CONSTRAINT "orders_fk_1" FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id)', label: 'orders (customer_id) → customers' },
    ])
    expect(p.notes).toEqual(['orders.tags is VARCHAR[] in DuckDB: copied as text.'])
  })

  it('leaves out a foreign key to a table that is not copied', () => {
    const p = planPgCopy('chinook', [shop[0]])
    expect(p.tables[0].select).toBe('SELECT order_id, customer_id, status, tags FROM chinook.orders')
    expect(p.foreignKeys).toEqual([])
    expect(p.notes).toContain('Foreign key orders (customer_id) → customers left out: customers is not being copied.')
  })
})
