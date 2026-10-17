import { describe, expect, it } from 'vitest'
import { lookColor, lookVars, mixColor, NO_LOOK, normalColor, parseLook, setLookColor, SWATCHES } from '../src/core/look'

describe('appearance (editor and panel colours)', () => {
  it('reads a stored look and drops anything that is not a #RRGGBB colour', () => {
    expect(parseLook(null)).toEqual(NO_LOOK)
    expect(parseLook('not json')).toEqual(NO_LOOK)
    expect(parseLook('{"editor":{"light":"#F8F4EA","dark":"red"},"panels":{"dark":"#18212e;color:red"},"size":2}')).toEqual({
      editor: { light: '#f8f4ea' },
      panels: {},
    })
    expect(normalColor(' #ABCDEF ')).toBe('#abcdef')
    expect(normalColor('#abc')).toBeUndefined()
    expect(normalColor(3)).toBeUndefined()
  })

  it('keeps colours per theme; the default colour or none removes the choice', () => {
    let look = setLookColor(NO_LOOK, 'panels', 'light', '#f6f1e4')
    look = setLookColor(look, 'panels', 'dark', '#18212e')
    expect(look.panels).toEqual({ light: '#f6f1e4', dark: '#18212e' })
    expect(lookColor(look, 'panels', 'dark')).toBe('#18212e')
    expect(lookColor(look, 'editor', 'dark')).toBe(SWATCHES.editor.dark[0])
    expect(setLookColor(look, 'panels', 'light', SWATCHES.panels.light[0]).panels).toEqual({ dark: '#18212e' })
    expect(setLookColor(look, 'panels', 'dark', undefined).panels).toEqual({ light: '#f6f1e4' })
  })

  it('mixes two colours', () => {
    expect(mixColor('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixColor('#102030', '#102030', 0.3)).toBe('#102030')
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('gives the CSS variables of the current theme only', () => {
    const look = { editor: { light: '#edf6f0' }, panels: { dark: '#18212e' } }
    expect(lookVars(look, 'light')).toEqual({ '--code-bg': '#edf6f0', '--panel': undefined, '--panel-2': undefined, '--grid-alt': undefined })
    const dark = lookVars(look, 'dark')
    expect(dark['--code-bg']).toBeUndefined()
    expect(dark['--panel']).toBe('#18212e')
    // the hover shade is lighter than the panel in dark mode, the striped rows in between
    const sum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0)
    expect(sum(dark['--panel-2']!)).toBeGreaterThan(sum(dark['--grid-alt']!))
    expect(sum(dark['--grid-alt']!)).toBeGreaterThan(sum('#18212e'))
    const light = lookVars({ editor: {}, panels: { light: '#f6f1e4' } }, 'light')
    expect(sum(light['--panel-2']!)).toBeLessThan(sum('#f6f1e4'))
  })

  it('offers the same number of tints in both themes, all distinct', () => {
    for (const p of ['editor', 'panels'] as const) {
      expect(SWATCHES[p].light).toHaveLength(SWATCHES[p].dark.length)
      for (const t of ['light', 'dark'] as const) {
        expect(new Set(SWATCHES[p][t]).size).toBe(SWATCHES[p][t].length)
        for (const c of SWATCHES[p][t]) expect(normalColor(c)).toBe(c)
      }
    }
  })
})
