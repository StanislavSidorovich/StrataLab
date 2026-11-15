import { describe, expect, it } from 'vitest'
import { badSku, hintMark } from '../src/core/buildHintMark'

describe('hint marks of the Clean cards', () => {
  it('P1 marks the SKUs with a space at an edge or a small letter', () => {
    expect(['AQUA002', 'aqua002', ' KROS001', 'FRUV002 ', 'MILV004'].map(badSku)).toEqual([false, true, true, true, false])
    const m = hintMark('P1', 'products', ['product_id', 'sku_code'], [[1, 'AQUA002'], [2, 'nett002'], [3, 'KROS001 ']])!
    expect(m.cells).toEqual([[false, false], [false, true], [false, true]])
    expect(m.first).toEqual([1, 1])
    expect(m.cols).toEqual(['sku_code'])
  })
  it('P3 marks the rows whose customer_id is there twice', () => {
    const m = hintMark('P3', 'customers', ['customer_id', 'city', 'updated_at'], [[1, 'a', 'x'], [2, 'b', 'y'], [1, 'c', 'z']])!
    expect(m.cells).toEqual([[true, false, true], [false, false, false], [true, false, true]])
  })
  it('P2 marks the rows that share date, store and SKU', () => {
    const h = ['raw_id', 'sale_date', 'customer_name', 'sku_code']
    const m = hintMark('P2', 'sales', h, [[1, 'd', 'n', 's'], [2, 'd', 'n', 's'], [3, 'd', 'n', 't']])!
    expect(m.cells.map((r) => r.some(Boolean))).toEqual([true, true, false])
  })
  it('has no mark for another source or card, and none when nothing is wrong on screen', () => {
    expect(hintMark('P1', 'sales', ['sku_code'], [['a']])).toBeNull()
    expect(hintMark('P5', 'sales', ['sku_code'], [['a']])).toBeNull()
    expect(hintMark('P1', 'products', ['sku_code'], [['AQUA002']])!.first).toBeNull()
  })
})
