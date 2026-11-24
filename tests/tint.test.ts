import { describe, expect, it } from 'vitest'
import { accentOk, codeOk, termOk, calloutTextContrast, clampTint, lightnessRange, NO_TINT, parseTint, tintColor, tintVars, TINT_DEFAULT } from '../src/core/tint'

describe('appearance tint (callout and accent colours)', () => {
  it('the defaults themselves keep the contrast', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(accentOk(TINT_DEFAULT.accent[theme], theme)).toBe(true)
      expect(calloutTextContrast(TINT_DEFAULT.callout[theme], theme)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('every lightness the sliders allow keeps 4.5:1, for any hue and saturation', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (let h = 0; h <= 360; h += 20) {
        for (const s of [0, 30, 60, 100]) {
          const [lo, hi] = lightnessRange('accent', theme, h, s)
          for (const l of [lo, hi]) expect(accentOk({ h, s, l }, theme), `${theme} h${h} s${s} l${l}`).toBe(true)
          const [clo, chi] = lightnessRange('callout', theme, h, Math.min(s, 60))
          for (const l of [clo, chi]) expect(calloutTextContrast({ h, s: Math.min(s, 60), l }, theme)).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('a value outside the range is brought back in, not kept', () => {
    // pure yellow at 100% lightness would be white on white
    const c = clampTint('accent', 'light', { h: 60, s: 100, l: 95 })
    expect(c.l).toBeLessThan(95)
    expect(accentOk(c, 'light')).toBe(true)
    expect(clampTint('callout', 'dark', { h: 999, s: 500, l: -4 })).toEqual({ h: 360, s: 60, l: 30 })
  })

  it('storage: numbers out of range are clamped; strings, NaN, broken JSON give the defaults', () => {
    expect(parseTint(null)).toEqual(NO_TINT)
    expect(parseTint('{nope')).toEqual(NO_TINT)
    expect(parseTint('{"callout":{"light":{"h":"red","s":1,"l":2}},"accent":{"dark":{"h":null,"s":1,"l":2}}}')).toEqual(NO_TINT)
    const t = parseTint('{"callout":{"light":{"h":900,"s":99,"l":99}}}')
    expect(tintColor(t, 'callout', 'light')).toEqual({ h: 360, s: 60, l: 65 })
    expect(tintColor(t, 'callout', 'dark')).toEqual(TINT_DEFAULT.callout.dark)
  })

  it('writes variables only for what is chosen, as hsl()', () => {
    expect(Object.values(tintVars(NO_TINT, 'light')).every((v) => v === undefined)).toBe(true)
    const v = tintVars({ callout: { light: { h: 10, s: 20, l: 40 } }, accent: {}, term: {}, code: {} }, 'light')
    expect(v['--note-border']).toBe('hsl(10 20% 40%)')
    expect(v['--accent']).toBeUndefined()
    expect(tintVars({ callout: { light: { h: 10, s: 20, l: 40 } }, accent: {}, term: {}, code: {} }, 'dark')['--note-border']).toBeUndefined()
  })

  it('new-term and inline-code colours: defaults and every allowed lightness keep 4.5:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(termOk(TINT_DEFAULT.term[theme], theme)).toBe(true)
      expect(codeOk(TINT_DEFAULT.code[theme], theme)).toBe(true)
      for (let h = 0; h <= 360; h += 30) {
        for (const s of [0, 40, 100]) {
          for (const l of lightnessRange('term', theme, h, s)) expect(termOk({ h, s, l }, theme), `term ${theme} h${h} s${s} l${l}`).toBe(true)
          for (const l of lightnessRange('code', theme, h, Math.min(s, 60))) expect(codeOk({ h, s: Math.min(s, 60), l }, theme), `code ${theme} h${h} s${s} l${l}`).toBe(true)
        }
      }
    }
  })

  it('the chosen term and code colours become CSS variables; a broken stored one is dropped', () => {
    const v = tintVars({ ...NO_TINT, term: { dark: { h: 10, s: 80, l: 70 } }, code: { dark: { h: 200, s: 10, l: 25 } } }, 'dark')
    expect(v['--term-new']).toBe('hsl(10 80% 70%)')
    expect(v['--term-new-bg']).toContain('hsl(10 80% 70%)')
    expect(v['--code-inline-bg']).toBe('hsl(200 10% 25%)')
    expect(tintVars({ ...NO_TINT, term: { dark: { h: 10, s: 80, l: 70 } } }, 'light')['--term-new']).toBeUndefined()
    expect(parseTint('{"term":{"light":{"h":"x","s":1,"l":2}}}')).toEqual(NO_TINT)
  })
})
