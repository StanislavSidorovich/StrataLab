import { describe, expect, it } from 'vitest'
import { lookColor, lookVars, mixColor, NO_LOOK, normalColor, parseLook, setLookColor, SWATCHES } from '../src/core/look'

describe('appearance (editor and panel colours)', () => {
  it('reads a stored look and drops anything that is not a #RRGGBB colour', () => {
    expect(parseLook(null)).toEqual(NO_LOOK)
    expect(parseLook('not json')).toEqual(NO_LOOK)
    expect(parseLook('{"editor":{"light":"#F8F4EA","dark":"red"},"panels":{"dark":"#18212e;color:red"},"size":2}')).toEqual({
      editor: { light: '#f8f4ea' },
      left: {},
      right: {},
      grid: {},
    })
    expect(normalColor(' #ABCDEF ')).toBe('#abcdef')
    expect(normalColor('#abc')).toBeUndefined()
    expect(normalColor(3)).toBeUndefined()
  })

  it('keeps colours per theme; the default colour or none removes the choice', () => {
    let look = setLookColor(NO_LOOK, 'left', 'light', '#f6f1e4')
    look = setLookColor(look, 'left', 'dark', '#18212e')
    expect(look.left).toEqual({ light: '#f6f1e4', dark: '#18212e' })
    expect(look.right).toEqual({})
    expect(lookColor(look, 'left', 'dark')).toBe('#18212e')
    expect(lookColor(look, 'right', 'dark')).toBe(SWATCHES.right.dark[0])
    expect(lookColor(look, 'editor', 'dark')).toBe(SWATCHES.editor.dark[0])
    expect(setLookColor(look, 'left', 'light', SWATCHES.left.light[0]).left).toEqual({ dark: '#18212e' })
    expect(setLookColor(look, 'left', 'dark', undefined).left).toEqual({ light: '#f6f1e4' })
  })

  it('mixes two colours', () => {
    expect(mixColor('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixColor('#102030', '#102030', 0.3)).toBe('#102030')
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('gives the CSS variables of the current theme only', () => {
    const look = { editor: { light: '#edf6f0' }, left: { dark: '#18212e' }, right: {}, grid: { dark: '#18212e' } }
    const light0 = lookVars(look, 'light')
    expect(light0['--code-bg']).toBe('#edf6f0')
    expect(light0['--work-hover']).toBeDefined()
    for (const k of ['--panel', '--panel-2', '--panel-right', '--panel-right-2', '--grid-bg', '--grid-head', '--grid-alt']) expect(light0[k]).toBeUndefined()
    const dark = lookVars(look, 'dark')
    expect(dark['--code-bg']).toBeUndefined()
    expect(dark['--panel']).toBe('#18212e')
    // the hover shade is lighter than the panel in dark mode, the striped rows in between
    const sum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0)
    expect(sum(dark['--grid-head']!)).toBeGreaterThan(sum(dark['--grid-alt']!))
    expect(sum(dark['--grid-alt']!)).toBeGreaterThan(sum('#18212e'))
    const light = lookVars({ editor: {}, left: { light: '#f6f1e4' }, right: {}, grid: {} }, 'light')
    expect(sum(light['--panel-2']!)).toBeLessThan(sum('#f6f1e4'))
  })

  it('offers the same number of tints in both themes, all distinct', () => {
    for (const p of ['editor', 'left', 'right', 'grid'] as const) {
      expect(SWATCHES[p].light).toHaveLength(SWATCHES[p].dark.length)
      for (const t of ['light', 'dark'] as const) {
        expect(new Set(SWATCHES[p][t]).size).toBe(SWATCHES[p][t].length)
        for (const c of SWATCHES[p][t]) expect(normalColor(c)).toBe(c)
      }
    }
  })
})

describe('data grid colour', () => {
  it('an older saved look without a grid keeps the default grid, even with a panel colour', () => {
    const look = parseLook('{"editor":{},"panels":{"light":"#f6f1e4"}}')
    expect(look.grid).toEqual({})
    const v = lookVars(look, 'light')
    expect(v['--panel']).toBe('#f6f1e4')
    expect(v['--grid-bg']).toBeUndefined()
  })
  it('a chosen grid colour sets its own variables only', () => {
    const look = setLookColor(NO_LOOK, 'grid', 'light', '#e7eff9')
    const v = lookVars(look, 'light')
    expect(v['--grid-bg']).toBe('#e7eff9')
    expect(v['--panel']).toBeUndefined()
  })
})

describe('left and right panels', () => {
  it('a look saved with only `panels` gives that colour to both sides, per theme', () => {
    const look = parseLook('{"panels":{"light":"#F9EAEC","dark":"#18212e"}}')
    expect(look.left).toEqual({ light: '#f9eaec', dark: '#18212e' })
    expect(look.right).toEqual({ light: '#f9eaec', dark: '#18212e' })
    expect(look.editor).toEqual({})
    // the two copies are separate: changing one side leaves the other
    const next = setLookColor(look, 'right', 'light', '#e7eff9')
    expect(next.left.light).toBe('#f9eaec')
    expect(next.right.light).toBe('#e7eff9')
    expect(next.right.dark).toBe('#18212e')
  })
  it('a new look wins over an old `panels`; a side not saved stays default', () => {
    const look = parseLook('{"panels":{"light":"#f9eaec"},"left":{"light":"#e7eff9"}}')
    expect(look.left).toEqual({ light: '#e7eff9' })
    expect(look.right).toEqual({ light: '#f9eaec' })
    const only = parseLook('{"left":{"light":"#e7eff9"}}')
    expect(only.right).toEqual({})
  })
  it('no look or a broken one is the default look: no variables', () => {
    for (const json of [null, '', '{', '[1]', 'null', '{"panels":5,"left":"x"}']) {
      expect(parseLook(json)).toEqual(NO_LOOK)
      for (const t of ['light', 'dark'] as const) expect(Object.values(lookVars(parseLook(json), t)).every((v) => v === undefined)).toBe(true)
    }
  })
  it('left and right give their own variables; the right one does not touch --panel', () => {
    const look = { ...NO_LOOK, left: { light: '#f9eaec' }, right: { light: '#e7eff9', dark: '#18212e' } }
    const l = lookVars(look, 'light')
    expect(l['--panel']).toBe('#f9eaec')
    expect(l['--panel-right']).toBe('#e7eff9')
    expect(l['--panel-right-2']).not.toBe('#e7eff9')
    const d = lookVars(look, 'dark')
    expect(d['--panel']).toBeUndefined()
    expect(d['--panel-right']).toBe('#18212e')
    expect(lookVars({ ...NO_LOOK, right: { dark: '#18212e' } }, 'light')['--panel-right']).toBeUndefined()
  })
  it('the editor colour gives the hover shade of the work-area buttons, darker in light, lighter in dark', () => {
    const sum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0)
    expect(sum(lookVars({ ...NO_LOOK, editor: { light: '#ffffff' } }, 'light')['--work-hover']!)).toBeLessThan(sum('#ffffff'))
    expect(sum(lookVars({ ...NO_LOOK, editor: { dark: '#282c34' } }, 'dark')['--work-hover']!)).toBeGreaterThan(sum('#282c34'))
  })
  it('the centre has its own card colours from the editor colour, not from the left panel', () => {
    const sum = (c: string) => [1, 3, 5].reduce((s, i) => s + parseInt(c.slice(i, i + 2), 16), 0)
    const v = lookVars({ ...NO_LOOK, left: { light: '#f9eaec' }, editor: { light: '#edf6f0' } }, 'light')
    expect(v['--work-panel']).toBe('#edf6f0')
    expect(sum(v['--work-panel-2']!)).toBeLessThan(sum('#edf6f0'))
    expect(v['--panel']).toBe('#f9eaec')
    const none = lookVars({ ...NO_LOOK, left: { light: '#f9eaec' } }, 'light')
    expect(none['--work-panel']).toBeUndefined()
    expect(none['--work-panel-2']).toBeUndefined()
  })
})
