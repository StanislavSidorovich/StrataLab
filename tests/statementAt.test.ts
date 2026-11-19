import { describe, expect, it } from 'vitest'
import { statementAt, statementRanges } from '../src/core/statementAt'

const pick = (text: string, pos: number) => {
  const r = statementAt(text, pos)
  return r && text.slice(r.from, r.to)
}

describe('statementAt', () => {
  const two = 'select *\nfrom depemp."EMPLOYEE";\n\nselect 2;\nselect 3;'

  it('picks the statement the cursor is in, wherever in it', () => {
    expect(pick(two, 0)).toBe('select *\nfrom depemp."EMPLOYEE";')
    expect(pick(two, 12)).toBe('select *\nfrom depemp."EMPLOYEE";')
    expect(pick(two, two.indexOf('select 2') + 3)).toBe('select 2;')
    expect(pick(two, two.length)).toBe('select 3;')
  })

  it('on the line between statements takes the one above', () => {
    expect(pick(two, two.indexOf('\n\n') + 1)).toBe('select *\nfrom depemp."EMPLOYEE";')
  })

  it('splits on a blank line when there is no semicolon', () => {
    expect(statementRanges('select 1\n\nselect 2')).toHaveLength(2)
    expect(pick('select 1\n  \nselect 2', 17)).toBe('select 2')
  })

  it('ignores ; and blank lines inside quotes and comments', () => {
    expect(pick("select 'a;b\n\nc' as x; select 2", 5)).toBe("select 'a;b\n\nc' as x;")
    expect(statementRanges('select 1 -- a; b\n-- c\nfrom t;')).toHaveLength(1)
    expect(statementRanges('/* x;\n\ny */ select 1;')).toHaveLength(1)
  })

  it('skips comment-only pieces and handles empty text', () => {
    expect(statementRanges('-- only a note;\n\nselect 1;')).toHaveLength(1)
    expect(statementAt('', 0)).toBeNull()
    expect(statementAt('  \n-- nothing', 3)).toBeNull()
  })

  it('a single statement is the whole text, trimmed', () => {
    expect(pick('\n  select 1  \n', 4)).toBe('select 1')
  })
})
