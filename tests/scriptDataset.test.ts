import { describe, expect, it } from 'vitest'
import { DATASET_AT, choiceKey, qualifyDrops, suggestDatasetName, tablesCreated } from '../src/core/scriptDataset'

describe('which scripts are offered a dataset', () => {
  it('counts the tables a script makes in the default schema', () => {
    const sql = `CREATE TABLE a (id INT);\ncreate table if not exists "B" (id int);\nCREATE OR REPLACE TABLE c AS SELECT 1;\nCREATE TABLE a (id INT);`
    expect(tablesCreated(sql)).toEqual(['a', 'b', 'c'])
    expect(tablesCreated(sql).length).toBeGreaterThanOrEqual(DATASET_AT)
  })

  it('leaves out temporary tables, tables with a schema, and comments', () => {
    expect(tablesCreated('CREATE TEMP TABLE t (id INT); CREATE TABLE sales.orders (id INT); -- create table ghost (id int)\n/* create table ghost2 (id int) */')).toEqual([])
  })

  it('keeps its hands off a script that picks its own place', () => {
    expect(tablesCreated('CREATE SCHEMA hr; CREATE TABLE a (id INT); CREATE TABLE b (id INT); CREATE TABLE c (id INT)')).toEqual([])
    expect(tablesCreated("SET search_path = 'hr'; CREATE TABLE a (id INT)")).toEqual([])
    expect(tablesCreated('USE hr; CREATE TABLE a (id INT)')).toEqual([])
  })

  it('reads bracketed names as they come out of a T-SQL translation', () => {
    expect(tablesCreated('CREATE TABLE [Order Line] (id INT)')).toEqual(['order line'])
  })
})

describe('the suggested name', () => {
  const none: string[] = []
  it('is the tab name when the tab has one, a file name without its extension', () => {
    expect(suggestDatasetName('finalclean.sql', none, none)).toBe('finalclean')
    expect(suggestDatasetName('Vet clinic', none, none)).toBe('vet_clinic')
  })
  it('is my_dataset for a tab nobody named, and never one that is taken', () => {
    expect(suggestDatasetName('Query 4', none, none)).toBe('my_dataset')
    expect(suggestDatasetName('Query 4', ['my_dataset'], none)).toBe('my_dataset_2')
    expect(suggestDatasetName('chinook', none, ['chinook'])).toBe('chinook_2')
  })
})

describe('DROPs stay in the dataset', () => {
  it('names the dataset in every plain DROP', () => {
    expect(qualifyDrops('DROP TABLE IF EXISTS orders; drop view v; DROP TABLE "Order Line" CASCADE; DROP INDEX IF EXISTS ix; DROP SEQUENCE s', 'ds')).toBe(
      'DROP TABLE IF EXISTS ds.orders; drop view ds.v; DROP TABLE ds."Order Line" CASCADE; DROP INDEX IF EXISTS ds.ix; DROP SEQUENCE ds.s',
    )
    expect(qualifyDrops('DROP TABLE a, b', 'ds')).toBe('DROP TABLE ds.a, ds.b')
  })
  it('leaves a DROP that already says where, and other statements, as they are', () => {
    const sql = 'DROP TABLE main.orders; DROP TABLE sales.orders; DROP SCHEMA x; SELECT 1'
    expect(qualifyDrops(sql, 'ds')).toBe(sql)
  })
})

it('the same tables in the same tab are the same script', () => {
  expect(choiceKey('t1', ['b', 'a'])).toBe(choiceKey('t1', ['a', 'b']))
  expect(choiceKey('t1', ['a'])).not.toBe(choiceKey('t2', ['a']))
})
