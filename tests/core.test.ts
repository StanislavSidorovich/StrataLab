import { describe, expect, it } from 'vitest'
import { decodeText, detectDateFormats, detectDecimalComma, detectDelimiter, sniffCsv, splitLine } from '../src/core/sniff'
import { quoteIdent, tableNameFrom, uniqueName } from '../src/core/sql'
import { dialectHints, splitError } from '../src/core/dialect'
import { cleanHeader, findHeaderRow, isoLocal, toCsv } from '../src/core/csvWrite'

const cp1251 = (s: string) => {
  // minimal encoder for the test: Cyrillic А..я = 0xC0..0xFF, ASCII as is
  return new Uint8Array([...s].map((ch) => {
    const c = ch.charCodeAt(0)
    if (c < 128) return c
    if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0
    throw new Error('not in test table: ' + ch)
  }))
}

describe('CSV sniffing', () => {
  it('reads UTF-8 with and without BOM', () => {
    const bytes = new TextEncoder().encode('﻿имя,город\nОльга,Лиссабон\n')
    expect(decodeText(bytes)).toEqual({ text: 'имя,город\nОльга,Лиссабон\n', encoding: 'utf-8' })
  })

  it('falls back to Windows-1251 for Russian Excel files', () => {
    const r = decodeText(cp1251('имя;сумма\nОльга;3,5\n'))
    expect(r.encoding).toBe('windows-1251')
    expect(r.text).toBe('имя;сумма\nОльга;3,5\n')
  })

  it('splits quoted fields', () => {
    expect(splitLine('1,"Silva, Ana","say ""hi"""', ',')).toEqual(['1', 'Silva, Ana', 'say "hi"'])
  })

  it('detects the delimiter', () => {
    expect(detectDelimiter(['a;b;c', '1;2,5;3', '4;5;6'])).toBe(';')
    expect(detectDelimiter(['a,b,c', '1,2,3'])).toBe(',')
    expect(detectDelimiter(['a\tb', '1\t2'])).toBe('\t')
    expect(detectDelimiter(['name,"city; region"', 'Ana,"Lisbon; PT"'])).toBe(',')
  })

  it('detects a decimal comma only when fields are not comma-separated', () => {
    expect(detectDecimalComma([['1', '3,5'], ['2', '1 234,50']], ';')).toBe(true)
    expect(detectDecimalComma([['1', '3.5']], ';')).toBe(false)
    expect(detectDecimalComma([['3,5']], ',')).toBe(false)
  })

  it('detects day-first and month-first dates', () => {
    expect(detectDateFormats([['17.10.2026']]).date).toBe('%d.%m.%Y')
    expect(detectDateFormats([['17.10.2026 14:30']]).timestamp).toBe('%d.%m.%Y %H:%M')
    expect(detectDateFormats([['25/03/2026']]).date).toBe('%d/%m/%Y')
    expect(detectDateFormats([['03/25/2026']]).date).toBe('%m/%d/%Y')
    expect(detectDateFormats([['2026-10-17']]).date).toBe(null)
  })

  it('sniffs a typical Russian Excel export', () => {
    const { options } = sniffCsv(cp1251('Дата;Клиент;Сумма\n17.10.2026;Ольга;1234,50\n18.10.2026;Иван;99,90\n'))
    expect(options).toMatchObject({ encoding: 'windows-1251', delimiter: ';', decimalComma: true, dateFormat: '%d.%m.%Y' })
  })
})

describe('names', () => {
  it('makes table names from file names', () => {
    expect(tableNameFrom('Продажи 2024 (final).xlsx')).toBe('prodazhi_2024_final')
    expect(tableNameFrom('Vendas São Paulo.csv')).toBe('vendas_sao_paulo')
    expect(tableNameFrom('2024.csv')).toBe('t_2024')
    expect(tableNameFrom('---.csv')).toBe('table')
  })
  it('avoids taken names', () => {
    expect(uniqueName('orders', ['Orders', 'orders_2'])).toBe('orders_3')
    expect(uniqueName('clients', ['orders'])).toBe('clients')
  })
  it('quotes identifiers', () => {
    expect(quoteIdent('my "odd" name')).toBe('"my ""odd"" name"')
  })
})

describe('T-SQL hints', () => {
  it('spots SQL Server habits', () => {
    const ids = dialectHints("SELECT TOP 10 [first name], ISNULL(city, 'n/a'), GETDATE() FROM t\nGO").map((h) => h.id)
    expect(ids).toEqual(expect.arrayContaining(['top', 'brackets', 'isnull', 'getdate', 'go']))
    expect(dialectHints('SELECT [Клиент] FROM t').map((h) => h.id)).toEqual(['brackets'])
  })
  it('is quiet on DuckDB SQL and ignores comments', () => {
    expect(dialectHints("SELECT coalesce(a, 'x') || b FROM t LIMIT 10 -- not TOP 10, not GETDATE()")).toEqual([])
    expect(dialectHints('SELECT list[1] FROM t')).toEqual([])
  })
  it('splits DuckDB error kinds', () => {
    expect(splitError('Catalog Error: Table with name x does not exist!')).toEqual({ kind: 'Catalog Error', text: 'Table with name x does not exist!' })
    expect(splitError('boom').kind).toBe('Error')
  })
})

describe('Excel → CSV', () => {
  it('finds the header below a title row', () => {
    expect(findHeaderRow([['Sales report'], [], ['id', 'name'], [1, 'a']])).toBe(2)
  })
  it('cleans header names', () => {
    expect(cleanHeader(['', 'a', 'A', null])).toEqual(['column1', 'a', 'A_2', 'column4'])
  })
  it('writes ISO dates and quotes when needed', () => {
    expect(isoLocal(new Date(2026, 9, 17))).toBe('2026-10-17')
    expect(isoLocal(new Date(2026, 9, 17, 9, 5, 0))).toBe('2026-10-17 09:05:00')
    expect(toCsv([['a', 'b'], ['x,y', null], [1.5, 'say "hi"']])).toBe('a,b\n"x,y",\n1.5,"say ""hi"""\n')
  })
})
