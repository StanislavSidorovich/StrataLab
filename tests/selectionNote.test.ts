import { describe, expect, it } from 'vitest'
import { selectedLines, selectionNote } from '../src/core/selectionNote'

describe('selectedLines', () => {
  it('counts non-blank lines, any line ending', () => {
    expect(selectedLines('a;\nb;\r\n\n  \nc;')).toBe(3)
  })
  it('is 0 for empty or whitespace', () => {
    expect(selectedLines('')).toBe(0)
    expect(selectedLines(' \n\t\n')).toBe(0)
  })
})

describe('selectionNote', () => {
  it('is null with nothing selected', () => {
    expect(selectionNote(0)).toBeNull()
  })
  it('pluralises', () => {
    expect(selectionNote(1)).toBe('Running selection only · 1 line')
    expect(selectionNote(18)).toBe('Running selection only · 18 lines')
  })
})
