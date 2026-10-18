import { describe, expect, it } from 'vitest'
import { sqliteSchema, sqliteSession } from '../src/core/sqliteDialect'

describe('SQLite (Quaera): around the query', () => {
  it('finds the trainer’s tables by bare name and divides whole numbers as SQLite does', () => {
    expect(sqliteSession(['main', 'quaera'])).toEqual({
      before: ["SET search_path = 'quaera,main'", 'SET integer_division = true'],
      after: ['RESET search_path', 'RESET integer_division'],
    })
  })
  it('leaves the search path alone without the dataset (DuckDB refuses a missing schema)', () => {
    expect(sqliteSession(['main'])).toEqual({ before: ['SET integer_division = true'], after: ['RESET integer_division'] })
  })
  it('tells the translator the column types a bare name reaches, the trainer’s tables first', () => {
    const col = (name: string, type: string) => ({ name, type })
    const tables = [
      { schema: 'main', name: 'fact_sellout', columns: [col('note', 'VARCHAR')] },
      { schema: 'main', name: 'orders', columns: [col('total', 'DECIMAL(10,2)')] },
      { schema: 'quaera', name: 'fact_sellout', columns: [col('revenue', 'DOUBLE'), col('week_start', 'DATE')] },
      { schema: 'chinook', name: 'Track', columns: [col('Name', 'VARCHAR')] },
    ]
    expect(sqliteSchema(tables)).toEqual({ fact_sellout: { revenue: 'DOUBLE', week_start: 'DATE' }, orders: { total: 'DECIMAL(10,2)' } })
  })
})
