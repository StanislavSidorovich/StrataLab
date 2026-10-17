import { describe, expect, it } from 'vitest'
import { treeMatch } from '../src/core/tree'
import { CLOSED_TABS_KEPT, copyTitle, rememberClosed, tabsToClose } from '../src/core/tabs'
import { backupFileName, fillOrder, isDatabaseFile, wipeStatements } from '../src/core/backup'
import { decimalJson, rowsToJson } from '../src/core/jsonWrite'

describe('Object tree search', () => {
  const cols = ['CustomerId', 'FirstName', 'Email']
  it('shows everything for an empty search', () => {
    expect(treeMatch('main', 'orders', [], '  ')).toEqual({ byName: true, columns: [] })
  })
  it('finds a table by its name, ignoring case', () => {
    expect(treeMatch('chinook', 'Customer', cols, 'cust')).toEqual({ byName: true, columns: ['CustomerId'] })
    expect(treeMatch('main', 'orders', [], 'ORD')?.byName).toBe(true)
  })
  it('finds a table by schema.name', () => {
    expect(treeMatch('chinook', 'Album', [], 'chinook.al')?.byName).toBe(true)
    expect(treeMatch('main', 'Album', [], 'chinook.al')).toBeNull()
  })
  it('finds a table by its columns', () => {
    expect(treeMatch('chinook', 'Customer', cols, 'mail')).toEqual({ byName: false, columns: ['Email'] })
    expect(treeMatch('chinook', 'Customer', cols, 'price')).toBeNull()
  })
})

describe('Tab menu', () => {
  it('names a duplicate', () => {
    expect(copyTitle('Query 1', ['Query 1'])).toBe('Query 1 (copy)')
    expect(copyTitle('Query 1', ['Query 1', 'Query 1 (copy)'])).toBe('Query 1 (copy 2)')
    expect(copyTitle('Query 1 (copy)', ['Query 1', 'Query 1 (copy)'])).toBe('Query 1 (copy 2)')
  })
  it('closes others or the tabs to the right', () => {
    expect(tabsToClose(['a', 'b', 'c', 'd'], 'b', 'others')).toEqual(['a', 'c', 'd'])
    expect(tabsToClose(['a', 'b', 'c', 'd'], 'b', 'right')).toEqual(['c', 'd'])
    expect(tabsToClose(['a', 'b'], 'x', 'others')).toEqual([])
  })
  it('remembers closed tabs with something in them, up to a limit', () => {
    expect(rememberClosed([], [{ sql: '' }, { sql: 'select 1' }])).toEqual([{ sql: 'select 1' }])
    const many = Array.from({ length: CLOSED_TABS_KEPT + 5 }, (_, i) => ({ sql: String(i) }))
    const kept = rememberClosed([], many)
    expect(kept).toHaveLength(CLOSED_TABS_KEPT)
    expect(kept.at(-1)?.sql).toBe(String(CLOSED_TABS_KEPT + 4))
  })
})

describe('Database backup', () => {
  it('names the file by the date', () => {
    expect(backupFileName(new Date(2026, 9, 7))).toBe('quaera-lab-2026-10-07.duckdb')
  })
  it('fills parents before the tables that refer to them', () => {
    const t = (name: string, schema = 'main') => ({ schema, name })
    const order = fillOrder([t('order_items'), t('orders'), t('customers'), t('products')], [
      { schema: 'main', table: 'order_items', refTable: 'orders' },
      { schema: 'main', table: 'order_items', refTable: 'products' },
      { schema: 'main', table: 'orders', refTable: 'customers' },
    ]).map((x) => x.name)
    expect(order.indexOf('customers')).toBeLessThan(order.indexOf('orders'))
    expect(order.indexOf('orders')).toBeLessThan(order.indexOf('order_items'))
    expect(order.indexOf('products')).toBeLessThan(order.indexOf('order_items'))
  })
  it('keeps going through a circle of keys and a table referring to itself', () => {
    const t = (name: string) => ({ schema: 's', name })
    expect(fillOrder([t('a'), t('b'), t('emp')], [
      { schema: 's', table: 'a', refTable: 'b' },
      { schema: 's', table: 'b', refTable: 'a' },
      { schema: 's', table: 'emp', refTable: 'emp' },
    ]).map((x) => x.name)).toEqual(['emp', 'a', 'b'])
  })
  it('accepts DuckDB files', () => {
    expect(isDatabaseFile('backup.DUCKDB')).toBe(true)
    expect(isDatabaseFile('shop.db')).toBe(true)
    expect(isDatabaseFile('shop.csv')).toBe(false)
  })
  it('empties the database: views, then tables children first, then the rest', () => {
    expect(
      wipeStatements({
        schemas: ['main', 'chinook'],
        objects: [
          { schema: 'main', name: 'orders', kind: 'table' },
          { schema: 'main', name: 'customers', kind: 'table' },
          { schema: 'main', name: 'big orders', kind: 'view' },
          { schema: 'chinook', name: 'Album', kind: 'table' },
          { schema: 'main', name: 'ids', kind: 'sequence' },
          { schema: 'main', name: 'top_n', kind: 'table macro' },
        ],
        fks: [{ schema: 'main', table: 'orders', refTable: 'customers' }],
      }),
    ).toEqual([
      'DROP VIEW IF EXISTS "main"."big orders" CASCADE',
      'DROP TABLE IF EXISTS "main"."orders" CASCADE',
      'DROP TABLE IF EXISTS "chinook"."Album" CASCADE',
      'DROP TABLE IF EXISTS "main"."customers" CASCADE',
      'DROP SEQUENCE IF EXISTS "main"."ids" CASCADE',
      'DROP MACRO TABLE IF EXISTS "main"."top_n" CASCADE',
      'DROP SCHEMA IF EXISTS "chinook" CASCADE',
    ])
  })
})

describe('Result as JSON', () => {
  it('writes decimals as numbers when nothing is lost', () => {
    expect(decimalJson('12.50')).toBe(12.5)
    expect(decimalJson('-0.0100')).toBe(-0.01)
    expect(decimalJson('100.00')).toBe(100)
    expect(decimalJson('12345678901234567.8901')).toBe('12345678901234567.8901')
  })
  it('writes one object per row, repeated names made unique', () => {
    expect(rowsToJson(['id', 'name', 'id'], [[1, 'Olga', 7], [2, null, 8]])).toBe('[\n{"id":1,"name":"Olga","id_2":7},\n{"id":2,"name":null,"id_2":8}\n]\n')
    expect(rowsToJson(['id'], [])).toBe('[]\n')
  })
})
