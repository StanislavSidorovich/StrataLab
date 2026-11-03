import { describe, expect, it } from 'vitest'
import { parseZoom, zoomLabel } from '../src/core/practiceZoom'

describe('practice zoom', () => {
  it('keeps a known step', () => {
    expect(parseZoom('1.05')).toBe(1.05)
    expect(parseZoom('1.2')).toBe(1.2)
  })
  it('falls back to 100% for anything else', () => {
    expect(parseZoom(null)).toBe(1)
    expect(parseZoom('abc')).toBe(1)
    expect(parseZoom('3')).toBe(1)
  })
  it('labels as a percentage', () => {
    expect(zoomLabel(1.05)).toBe('105%')
  })
})
