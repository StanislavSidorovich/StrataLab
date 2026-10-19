import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { DATASETS, datasetById, datasetFromHash, hashWithoutDataset } from '../src/data/datasets'
import { qualifiedName, sqlName } from '../src/core/sql'

describe('dataset catalog', () => {
  it('reads #ds= links', () => {
    expect(datasetFromHash('#ds=chinook')).toBe('chinook')
    expect(datasetFromHash('#x=1&ds=Sakila')).toBe('sakila')
    expect(datasetFromHash('#ddl=abc')).toBeNull()
    expect(hashWithoutDataset('#ds=chinook')).toBe('')
    expect(hashWithoutDataset('#x=1&ds=chinook')).toBe('#x=1')
  })

  it('names tables as they are typed', () => {
    expect(sqlName('orders')).toBe('orders')
    expect(sqlName('Order Details')).toBe('"Order Details"')
    expect(qualifiedName('main', 'orders')).toBe('orders')
    expect(qualifiedName('chinook', 'Track')).toBe('chinook."Track"')
    expect(qualifiedName('northwind', 'Order Details')).toBe('northwind."Order Details"')
  })

  it('has every built dataset described, with its files on disk', () => {
    expect(DATASETS.map((d) => d.id)).toEqual(['chinook', 'northwind', 'adventureworks', 'sakila', 'quaera'])
    for (const d of DATASETS) {
      expect(d.tables.length, d.id).toBeGreaterThan(0)
      expect(d.ddl.length).toBe(d.tables.length)
      // every statement creates a table in the dataset's own schema, in load order
      d.ddl.forEach((stmt, i) => expect(stmt.startsWith(`CREATE TABLE ${d.id}."${d.tables[i].name}"`), stmt.slice(0, 60)).toBe(true))
      for (const t of d.tables) {
        const file = `public/datasets/${d.id}/${t.file}`
        expect(existsSync(file), file).toBe(true)
        expect(statSync(file).size).toBe(t.bytes)
      }
      // the starter query only uses the dataset's schema
      expect(d.starter).toContain(`${d.id}.`)
      // "New Python notebook" reads its main table, which is one of its tables
      expect(d.tables.map((t) => t.name), d.id).toContain(d.main)
    }
    expect(datasetById('chinook')?.tables.find((t) => t.name === 'Employee')?.selfRef?.columns).toEqual(['ReportsTo'])
    expect(datasetById('adventureworks')?.tables.find((t) => t.name === 'ProductCategory')?.selfRef?.columns).toEqual(['ParentProductCategoryID'])
  })
})
