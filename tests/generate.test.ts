import { describe, expect, it } from 'vitest'
import { checkHints, planGeneration, valueSql, type GenTable } from '../src/core/generate'

const t = (name: string, extra: Partial<GenTable> = {}): GenTable => ({ name, columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [], rows: 0, ...extra })
const col = (name: string, type = 'INTEGER', notNull = false) => ({ name, type, notNull })

describe('data generator', () => {
  it('reads ranges and lists from simple CHECKs', () => {
    const h = checkHints(['(Quantity > 0)', '((Discount >= 0) AND (Discount <= 1))', "(status IN ('new', 'it''s done'))", '(stars BETWEEN 1 AND 5)', '(0 < f)', '((h >= g) OR (h IS NULL))', '("Unit Price" >= 0.5)'])
    expect(h.get('quantity')).toEqual({ min: 1 })
    expect(h.get('discount')).toEqual({ min: 0, max: 1 })
    expect(h.get('status')).toEqual({ values: ['new', "it's done"] })
    expect(h.get('stars')).toEqual({ min: 1, max: 5 })
    expect(h.get('f')).toEqual({ min: 1 })
    expect(h.has('h')).toBe(false)
    expect(h.get('unit price')).toEqual({ min: 0.5 })
  })

  it('makes values from the type, the name and the hints', () => {
    expect(valueSql('order_id', 'INTEGER', undefined, true, '0')).toBe('CAST(0 + r.i AS INTEGER)')
    expect(valueSql('stars', 'SMALLINT', { min: 1, max: 5 }, false, '0')).toContain('CAST(1 + floor(random() * 5) AS INTEGER)')
    expect(valueSql('status', 'VARCHAR', { values: ['new', 'done'] }, false, '0')).toBe("(['new', 'done'])[1 + floor(random() * 2)::INTEGER]")
    expect(valueSql('EmailAddress', 'VARCHAR', undefined, false, '0')).toContain("@example.com'")
    expect(valueSql('first_name', 'VARCHAR', undefined, false, '0')).toContain("'Ana'")
    expect(valueSql('price', 'DECIMAL(10,2)', { min: 0 }, false, '0')).toBe('CAST(round(0 + random() * 1000, 2) AS DECIMAL(10,2))')
    // a word inside another word is not the word: "QuantityPerUnit" has no "type"
    expect(valueSql('QuantityPerUnit', 'VARCHAR', undefined, false, '0')).toBe("'Quantity per unit ' || r.i")
    expect(valueSql('tags', 'VARCHAR[]', undefined, false, '0')).toBeNull()
  })

  it('fills parents first and picks foreign keys from existing rows', () => {
    const customers = t('customers', { columns: [col('customer_id', 'INTEGER', true), col('full_name', 'VARCHAR', true)], primaryKey: ['customer_id'] })
    const orders = t('orders', {
      columns: [col('order_id', 'INTEGER', true), col('customer_id', 'INTEGER', true), col('status', 'VARCHAR', true)],
      primaryKey: ['order_id'],
      foreignKeys: [{ columns: ['customer_id'], refTable: 'customers', refColumns: ['customer_id'] }],
      checks: ["(status IN ('new', 'done'))"],
    })
    const plan = planGeneration([orders, customers], new Map([['orders', 50], ['customers', 10]]))
    expect(plan.problems).toEqual([])
    expect(plan.steps.map((s) => [s.table, s.count])).toEqual([['customers', 10], ['orders', 50]])
    const [stage, insert] = plan.steps[1].sql
    expect(stage).toContain('JOIN (SELECT "customer_id", row_number() OVER (ORDER BY random()) - 1 AS rn, count(*) OVER () AS n FROM customers) p0')
    expect(insert).toContain("((status IN ('new', 'done')))")
    expect(insert).toContain('NOT EXISTS (SELECT 1 FROM orders x WHERE x."order_id" = s."order_id")')
    expect(insert).toMatch(/LIMIT 50$/)
  })

  it('says why a table cannot be filled', () => {
    const parent = t('parent', { columns: [col('id', 'INTEGER', true)], primaryKey: ['id'] })
    const child = t('child', { columns: [col('id', 'INTEGER', true), col('parent_id', 'INTEGER', true)], primaryKey: ['id'], foreignKeys: [{ columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }] })
    const chain = t('chain', { columns: [col('id', 'INTEGER', true), col('prev', 'INTEGER', true)], primaryKey: ['id'], foreignKeys: [{ columns: ['prev'], refTable: 'chain', refColumns: ['id'] }] })
    const odd = t('odd', { columns: [col('tags', 'VARCHAR[]', true)] })
    const plan = planGeneration([parent, child, chain, odd], new Map([['child', 5], ['chain', 5], ['odd', 5]]))
    expect(plan.steps).toEqual([])
    expect(plan.problems.map((p) => p.table)).toEqual(['child', 'chain', 'odd'])
    expect(plan.problems[0].message).toMatch(/needs rows in parent first/)
    // the parent with rows already in it is enough
    expect(planGeneration([{ ...parent, rows: 3 }, child], new Map([['child', 5]])).steps).toHaveLength(1)
  })
})
