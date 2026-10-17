import { describe, expect, it } from 'vitest'
import { pgToArrow } from '../src/dialects/pgResult'
import { formatterFor, isNumericField, typeLabel } from '../src/db/format'

describe('PostgreSQL results as Arrow', () => {
  it('keeps types, NULLs and PostgreSQL type names', () => {
    const t = pgToArrow(
      [
        { name: 'id', dataTypeID: 23 },
        { name: 'big', dataTypeID: 20 },
        { name: 'price', dataTypeID: 1700 },
        { name: 'day', dataTypeID: 1082 },
        { name: 'at', dataTypeID: 1114 },
        { name: 'tags', dataTypeID: 1009 },
        { name: 'id', dataTypeID: 25 },
      ],
      [
        [1, 9007199254740993n, '12.50', new Date(Date.UTC(2024, 0, 2)), new Date(Date.UTC(2024, 0, 2, 3, 4, 5)), ['a', 'b'], 'x'],
        [null, null, null, null, null, null, null],
      ],
    )
    expect(t.numRows).toBe(2)
    expect(t.numCols).toBe(7)
    const f = t.schema.fields
    expect(f.map(typeLabel)).toEqual(['integer', 'bigint', 'numeric', 'date', 'timestamp', 'text[]', 'text'])
    expect(f.map((x) => x.name)).toEqual(['id', 'big', 'price', 'day', 'at', 'tags', 'id_2'])
    expect(f.map(isNumericField)).toEqual([true, true, true, false, false, false, false])
    const row = f.map((field, i) => formatterFor(field)(t.getChildAt(i)?.get(0)))
    expect(row).toEqual([1, '9007199254740993', '12.50', '2024-01-02', '2024-01-02 03:04:05', '["a","b"]', 'x'])
    expect(f.map((field, i) => formatterFor(field)(t.getChildAt(i)?.get(1)))).toEqual([null, null, null, null, null, null, null])
  })

  it('handles a result with no rows', () => {
    const t = pgToArrow([{ name: 'n', dataTypeID: 23 }], [])
    expect(t.numRows).toBe(0)
    expect(t.schema.fields[0].name).toBe('n')
  })
})
