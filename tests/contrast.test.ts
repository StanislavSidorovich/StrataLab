import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTRAST_KEY, CONTRAST_LEVELS, parseContrast, resolveContrast } from '../src/core/contrast'

describe('text contrast choice', () => {
  it('knows the three levels and the storage key', () => {
    expect(CONTRAST_LEVELS).toEqual(['standard', 'darker', 'maximum'])
    expect(CONTRAST_KEY).toBe('stratalab.contrast')
  })

  it('reads a stored level and treats anything else as no choice', () => {
    expect(parseContrast('darker')).toBe('darker')
    expect(parseContrast('maximum')).toBe('maximum')
    expect(parseContrast('standard')).toBe('standard')
    for (const bad of [null, '', 'Darker', 'high', '1', 'undefined']) expect(parseContrast(bad), String(bad)).toBeNull()
  })

  it('without a choice, a system asking for more contrast gets Darker; an explicit choice always wins', () => {
    expect(resolveContrast(null, false)).toBe('standard')
    expect(resolveContrast(null, true)).toBe('darker')
    expect(resolveContrast('garbage', true)).toBe('darker')
    expect(resolveContrast('standard', true)).toBe('standard')
    expect(resolveContrast('maximum', false)).toBe('maximum')
  })
})

// The values in src/ui/contrast.css, measured: secondary text must keep these WCAG ratios on every surface.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const css = readFileSync('src/ui/contrast.css', 'utf8')
const tokens = readFileSync('src/family/tokens.css', 'utf8')
const pick = (selector: string, name: string) => {
  const at = css.indexOf(`${selector} {`)
  const block = at < 0 ? '' : css.slice(at, css.indexOf('}', at))
  const m = new RegExp(`--${name}: (#[0-9a-f]{6})`, 'i').exec(block)
  if (!m) throw new Error(`${selector} --${name} not found`)
  return m[1]
}
// --bg, --panel, --panel-2 of tokens.css, and the "New:" note background (practiceNote.css: hsl(150 20% 95%) / hsl(150 12% 16%))
const SURFACES = {
  light: ['#f6f7f9', '#ffffff', '#f1f3f6', '#eff5f2'],
  dark: ['#14171d', '#1b1f27', '#20252f', '#242d29'],
}

describe('contrast.css keeps the ratios it promises', () => {
  it('uses the surfaces the app really has', () => {
    for (const hex of [...SURFACES.light.slice(0, 3), ...SURFACES.dark.slice(0, 3)]) expect(tokens.toLowerCase()).toContain(hex)
  })

  const wanted = { darker: { text: 12, muted: 7 }, maximum: { text: 14, muted: 10 } }
  for (const level of ['darker', 'maximum'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${theme} ${level}: text >= ${wanted[level].text}:1, secondary text >= ${wanted[level].muted}:1 everywhere`, () => {
        const sel = theme === 'dark' ? `:root.dark[data-contrast='${level}']` : `:root[data-contrast='${level}']`
        const text = pick(sel, 'text')
        const muted = pick(sel, 'muted')
        for (const bg of SURFACES[theme]) {
          expect(ratio(text, bg), `${text} on ${bg}`).toBeGreaterThanOrEqual(wanted[level].text)
          expect(ratio(muted, bg), `${muted} on ${bg}`).toBeGreaterThanOrEqual(wanted[level].muted)
        }
      })
    }
  }

  it('each level is darker than the one before (light) or lighter (dark)', () => {
    const m = (sel: string) => lum(pick(sel, 'muted'))
    expect(m(":root[data-contrast='maximum']")).toBeLessThan(m(":root[data-contrast='darker']"))
    expect(m(":root[data-contrast='darker']")).toBeLessThan(lum('#626a7c'))
    expect(m(":root.dark[data-contrast='maximum']")).toBeGreaterThan(m(":root.dark[data-contrast='darker']"))
    expect(m(":root.dark[data-contrast='darker']")).toBeGreaterThan(lum('#98a0b3'))
  })
})
