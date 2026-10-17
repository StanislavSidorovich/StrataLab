import { describe, expect, it } from 'vitest'
import { isSqlFile, looksLikeTable, sqlFileName, tabTitleFromFile } from '../src/core/editorFiles'

describe('Open / Save .sql', () => {
  it('names a tab after the file', () => {
    expect(tabTitleFromFile('Monthly report.sql')).toBe('Monthly report')
    expect(tabTitleFromFile('notes.TXT')).toBe('notes')
    expect(tabTitleFromFile('.sql')).toBe('Query')
  })

  it('names a file after the tab', () => {
    expect(sqlFileName('Query 1')).toBe('Query 1.sql')
    expect(sqlFileName('revenue / month: 2026?')).toBe('revenue _ month_ 2026_.sql')
    expect(sqlFileName('already.sql')).toBe('already.sql')
    expect(sqlFileName('  ..  ')).toBe('query.sql')
    expect(sqlFileName('Отчёт')).toBe('Отчёт.sql')
  })

  it('tells .sql files from data files', () => {
    expect(isSqlFile('a.SQL')).toBe(true)
    expect(isSqlFile('a.csv')).toBe(false)
    expect(isSqlFile('sql')).toBe(false)
  })
})

describe('Paste a table', () => {
  it('takes cells copied from Excel', () => {
    expect(looksLikeTable('name\tcity\r\nOlga\tLisbon\r\nIvan\tPorto\r\n')).toBe(true)
    expect(looksLikeTable('id\tamount\n1\t3,5')).toBe(true)
  })

  it('does not count tabs inside quoted cells', () => {
    expect(looksLikeTable('name\tnote\nOlga\t"a\tb"')).toBe(true)
  })

  it('refuses text that is not a table', () => {
    expect(looksLikeTable('SELECT * FROM t')).toBe(false)
    expect(looksLikeTable('one\ttwo')).toBe(false)
    expect(looksLikeTable('a\tb\nc')).toBe(false)
    expect(looksLikeTable('line one\nline two')).toBe(false)
    expect(looksLikeTable('')).toBe(false)
  })
})
