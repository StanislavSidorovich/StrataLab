import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../src/core/aiMarkdown'

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('a **b** and *c* and `d`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'b', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' and ' },
      { t: 'i', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' and ' },
      { t: 'code', v: 'd' },
    ])
  })

  it('keeps marks inside code as typed and nests italic in bold', () => {
    expect(parseInline('`a **b** *c*`')).toEqual([{ t: 'code', v: 'a **b** *c*' }])
    expect(parseInline('**very *odd* one**')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'very ' }, { t: 'i', c: [{ t: 'text', v: 'odd' }] }, { t: 'text', v: ' one' }] },
    ])
  })

  it('leaves an unclosed ** or backtick as plain text', () => {
    expect(parseInline('half **open')).toEqual([{ t: 'text', v: 'half **open' }])
    expect(parseInline('half `open')).toEqual([{ t: 'text', v: 'half `open' }])
    expect(parseInline('a * b * c')).toEqual([{ t: 'text', v: 'a * b * c' }])
    expect(parseInline('snake_case_name and 2*3*4')).toEqual([{ t: 'text', v: 'snake_case_name and 2*3*4' }])
  })

  it('never produces markup from text: html and links stay as characters', () => {
    const t = '<img src=x onerror=alert(1)> [click](javascript:alert(1))'
    expect(parseInline(t)).toEqual([{ t: 'text', v: t }])
  })
})

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    const b = parseMarkdown('one\ntwo\n\nthree')
    expect(b).toHaveLength(2)
    expect(b[0]).toEqual({ t: 'p', c: [{ t: 'text', v: 'one\ntwo' }] })
  })

  it('reads bullet lists written with *, - and the bullet sign, and keeps the ** line a paragraph', () => {
    const b = parseMarkdown('* one\n* two\n- three\n\n**Not a bullet** here')
    expect(b[0]).toMatchObject({ t: 'ul' })
    expect((b[0] as { items: unknown[] }).items).toHaveLength(3)
    expect(b[1]).toMatchObject({ t: 'p' })
  })

  it('reads numbered lists with their start number and an indented nested level', () => {
    const b = parseMarkdown('3. third\n4. fourth\n   - nested\n   continued')
    expect(b[0]).toMatchObject({ t: 'ol', start: 3 })
    const items = (b[0] as { items: { level: number }[] }).items
    expect(items.map((i) => i.level)).toEqual([0, 0, 1])
  })

  it('reads headings and an item that continues on an indented line', () => {
    const b = parseMarkdown('## Plan\n- step one\n  more of step one')
    expect(b[0]).toMatchObject({ t: 'h', level: 2 })
    expect((b[1] as { items: { c: { v: string }[] }[] }).items[0].c[0].v).toBe('step one\nmore of step one')
  })

  it('does not choke on empty text, a lone marker or very long lines', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('**')).toEqual([{ t: 'p', c: [{ t: 'text', v: '**' }] }])
    expect(() => parseMarkdown('*a '.repeat(5000))).not.toThrow()
    expect(() => parseMarkdown('**a **'.repeat(3000))).not.toThrow()
  })
})
