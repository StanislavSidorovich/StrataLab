import { describe, expect, it } from 'vitest'
import { MAX_MODEL_URL, modelDdl, modelUrl, postgresType, starModel, type ModelTable } from '../src/core/modelLink'
import { decodeDdl } from '../src/core/ddlLink'

const t = (name: string, extra: Partial<ModelTable> = {}): ModelTable => ({ name, columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [], ...extra })

describe('show as model (stage 2c)', () => {
  it('names DuckDB types the way StrataSQL reads them', () => {
    expect(postgresType('INTEGER')).toBe('integer')
    expect(postgresType('DECIMAL(19,4)')).toBe('numeric(19,4)')
    expect(postgresType('VARCHAR')).toBe('text')
    expect(postgresType('DOUBLE')).toBe('double precision')
    expect(postgresType('TIMESTAMP WITH TIME ZONE')).toBe('timestamptz')
    expect(postgresType('UUID')).toBe('uuid')
    expect(postgresType('INTEGER[]')).toBeNull()
  })

  it('writes referenced tables first, with keys, quoting only what needs it', () => {
    const lines = t('Order Details', {
      columns: [
        { name: 'OrderID', type: 'INTEGER', notNull: true },
        { name: 'Quantity', type: 'SMALLINT', notNull: true },
      ],
      primaryKey: ['OrderID'],
      foreignKeys: [{ columns: ['OrderID'], refTable: 'orders', refColumns: ['order_id'] }],
      checks: ['(Quantity > 0)'],
    })
    const orders = t('orders', { columns: [{ name: 'order_id', type: 'INTEGER', notNull: true }, { name: 'tags', type: 'VARCHAR[]', notNull: false }], primaryKey: ['order_id'], uniques: [['order_id']] })
    const { sql, notes } = modelDdl([lines, orders], 'My tables')
    expect(sql.indexOf('CREATE TABLE orders')).toBeLessThan(sql.indexOf('CREATE TABLE "Order Details"'))
    expect(sql).toContain('  "OrderID" integer NOT NULL,')
    expect(sql).toContain('  PRIMARY KEY ("OrderID")')
    expect(sql).toContain('  FOREIGN KEY ("OrderID") REFERENCES orders (order_id)')
    expect(sql).toContain('  CHECK (Quantity > 0)')
    expect(sql).toContain('  UNIQUE (order_id)')
    expect(sql).toContain('  tags text')
    expect(notes).toEqual(['orders.tags is VARCHAR[] in DuckDB, sent as text.'])
  })

  it('leaves out a key to a table that is not sent, and keeps a key to itself', () => {
    const emp = t('emp', { columns: [{ name: 'id', type: 'INTEGER', notNull: true }, { name: 'boss', type: 'INTEGER', notNull: false }], primaryKey: ['id'], foreignKeys: [
      { columns: ['boss'], refTable: 'emp', refColumns: ['id'] },
      { columns: ['id'], refTable: 'people', refColumns: ['id'] },
    ] })
    const { sql, notes } = modelDdl([emp], 'x')
    expect(sql).toContain('FOREIGN KEY (boss) REFERENCES emp (id)')
    expect(sql).not.toContain('people')
    expect(notes[0]).toMatch(/refers to people/)
  })

  it('packs the statements into a model.quaera.app link', async () => {
    const url = new URL(await modelUrl('CREATE TABLE a (id integer);', 'Chinook'))
    expect(url.origin).toBe('https://model.quaera.app')
    const p = new URLSearchParams(url.hash.slice(1))
    expect(p.get('name')).toBe('Chinook')
    expect(await decodeDdl(p.get('sql')!)).toBe('CREATE TABLE a (id integer);')
  })
})

describe('starModel (the build page)', () => {
  const col = (name: string) => ({ name, type: 'INTEGER', notNull: false })
  const t = (name: string, cols: string[]): ModelTable => ({ name, columns: cols.map(col), primaryKey: [], uniques: [], foreignKeys: [], checks: [] })
  const all = [t('bronze_sales', ['x']), t('clean_sales', ['x']), t('gold_fact_sales', ['customer_id', 'product_id', 'revenue']), t('gold_dim_customer', ['customer_id', 'city']), t('gold_dim_product', ['product_id', 'sku_code'])]
  it('keeps the three gold tables, fact first, with the keys of the two links', () => {
    const m = starModel(all)
    expect(m.map((x) => x.name)).toEqual(['gold_fact_sales', 'gold_dim_customer', 'gold_dim_product'])
    expect(m[1].primaryKey).toEqual(['customer_id'])
    expect(m[0].foreignKeys.map((f) => f.refTable)).toEqual(['gold_dim_customer', 'gold_dim_product'])
    const { sql } = modelDdl(m, 'Kaiyo sales star')
    expect(sql).toContain('FOREIGN KEY (customer_id) REFERENCES gold_dim_customer (customer_id)')
  })
  it('sends what is there when the star is not complete, and nothing when it is empty', () => {
    expect(starModel(all.filter((x) => x.name !== 'gold_dim_product')).map((x) => x.name)).toEqual(['gold_fact_sales', 'gold_dim_customer'])
    expect(starModel(all.filter((x) => x.name === 'gold_dim_product')).length).toBe(1)
    expect(starModel([t('clean_sales', ['x'])])).toEqual([])
  })
  it('fits the address limit with room to spare', async () => {
    const { sql } = modelDdl(starModel(all), 'Kaiyo sales star')
    expect((await modelUrl(sql, 'Kaiyo sales star')).length).toBeLessThan(MAX_MODEL_URL)
  })
})
