// Appearance: the colour of the practice pages' "New:" callouts and of the accent (primary buttons, links,
// active tab), each as hue / saturation / lightness per theme. Pure: the panel (src/ui/Appearance.tsx) only
// writes the CSS variables this file returns. Lightness is clamped per theme (and, for the accent, per hue and
// saturation) so text on the callout and on a primary button keeps contrast >= 4.5:1.

export type Theme = 'light' | 'dark'
export type TintPart = 'callout' | 'accent' | 'term' | 'code'
export interface Hsl { h: number; s: number; l: number }
export type Tint = Record<TintPart, Partial<Record<Theme, Hsl>>>
export const NO_TINT: Tint = { callout: {}, accent: {}, term: {}, code: {} }
export const TINT_PARTS: TintPart[] = ['callout', 'accent', 'term', 'code']
export const TINT_KEY = 'stratalab.tint'

// Surfaces and text of the family kit (src/family/tokens.css).
const SURFACE: Record<Theme, string> = { light: '#ffffff', dark: '#1b1f27' }
const TEXT: Record<Theme, string> = { light: '#1d2330', dark: '#e4e7ee' }
const INK: Record<Theme, string> = { light: '#ffffff', dark: '#14171d' }

/** The values the stylesheet uses when nothing is chosen (practiceNote.css, family tokens). */
export const TINT_DEFAULT: Record<TintPart, Record<Theme, Hsl>> = {
  callout: { light: { h: 150, s: 22, l: 44 }, dark: { h: 150, s: 20, l: 40 } },
  accent: { light: { h: 142, s: 72, l: 29 }, dark: { h: 142, s: 69, l: 58 } },
  /** the terms a "New:" note introduces (practiceCode.css): warm, so they stand apart from the green callout */
  term: { light: { h: 22, s: 85, l: 33 }, dark: { h: 38, s: 90, l: 66 } },
  /** inline code that is not new: a cool grey-blue chip, clearly different from the callout's fill */
  code: { light: { h: 215, s: 22, l: 90 }, dark: { h: 215, s: 16, l: 27 } },
}

/** The most saturated a part may be: the callout and the code chip stay soft. */
export const SAT_MAX_OF: Record<TintPart, number> = { callout: 60, accent: 100, term: 100, code: 60 }
const TERM_FILL = 0.14

export const HUE_MAX = 360
export const SAT_MAX = 100
/** Callout: the border carries the colour; it must stay visible, the fill is a faint mix. */
const CALLOUT_L: Record<Theme, [number, number]> = { light: [30, 65], dark: [30, 70] }
const CALLOUT_FILL = 0.1

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function hslToHex({ h, s, l }: Hsl): string {
  const S = s / 100
  const L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function mix(a: string, b: string, t: number): string {
  const ch = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t))
  return '#' + [1, 3, 5].map((i) => ch(i).toString(16).padStart(2, '0')).join('')
}

/** Does this accent keep 4.5:1 for the ink on a primary button and for a link / active tab on the surface? */
export function accentOk(c: Hsl, theme: Theme): boolean {
  const hex = hslToHex(c)
  return contrast(hex, INK[theme]) >= 4.5 && contrast(hex, SURFACE[theme]) >= 4.5
}

/** A new term: its text keeps 4.5:1 on the page and on its own faint fill. */
export function termOk(c: Hsl, theme: Theme): boolean {
  const hex = hslToHex(c)
  return contrast(hex, SURFACE[theme]) >= 4.5 && contrast(hex, mix(hex, SURFACE[theme], TERM_FILL)) >= 4.5
}

/** The code chip: the text colour keeps 4.5:1 on it. */
export function codeOk(c: Hsl, theme: Theme): boolean {
  return contrast(hslToHex(c), TEXT[theme]) >= 4.5
}

const OK: Record<'accent' | 'term' | 'code', (c: Hsl, theme: Theme) => boolean> = { accent: accentOk, term: termOk, code: codeOk }

/** The lightness range the sliders may use: the callout's fixed one; the others' by contrast, for this hue and saturation. */
export function lightnessRange(part: TintPart, theme: Theme, h: number, s: number): [number, number] {
  if (part === 'callout') return CALLOUT_L[theme]
  let lo = Infinity
  let hi = -Infinity
  for (let l = 8; l <= 92; l++) {
    if (OK[part]({ h, s, l }, theme)) {
      lo = Math.min(lo, l)
      hi = Math.max(hi, l)
    }
  }
  return lo === Infinity ? [TINT_DEFAULT[part][theme].l, TINT_DEFAULT[part][theme].l] : [lo, hi]
}

/** A value from storage or a slider, brought into range. */
export function clampTint(part: TintPart, theme: Theme, c: Hsl): Hsl {
  const h = clamp(Math.round(c.h), 0, HUE_MAX)
  const s = clamp(Math.round(c.s), 0, SAT_MAX_OF[part])
  const [lo, hi] = lightnessRange(part, theme, h, s)
  return { h, s, l: clamp(Math.round(c.l), lo, hi) }
}

function readHsl(v: unknown): Hsl | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const [h, s, l] = [num(o.h), num(o.s), num(o.l)]
  return h === undefined || s === undefined || l === undefined ? undefined : { h, s, l }
}

/** The stored tint (JSON from localStorage); anything broken is dropped (the default), out-of-range numbers are clamped. */
export function parseTint(json: string | null): Tint {
  const out: Tint = { callout: {}, accent: {}, term: {}, code: {} }
  try {
    const v = JSON.parse(json ?? '{}') as Record<string, Record<string, unknown> | undefined>
    for (const part of TINT_PARTS) {
      for (const theme of ['light', 'dark'] as const) {
        const c = readHsl(v?.[part]?.[theme])
        if (c) out[part][theme] = clampTint(part, theme, c)
      }
    }
  } catch {
    /* not JSON: defaults */
  }
  return out
}

export function tintColor(t: Tint, part: TintPart, theme: Theme): Hsl {
  return t[part][theme] ?? TINT_DEFAULT[part][theme]
}

/** The text on the callout's fill: its contrast, for the tests. */
export function calloutFill(c: Hsl, theme: Theme): string {
  return mix(hslToHex(c), SURFACE[theme], CALLOUT_FILL)
}
export function calloutTextContrast(c: Hsl, theme: Theme): number {
  return contrast(calloutFill(c, theme), TEXT[theme])
}

/** CSS custom properties for the theme; a name with undefined is to be removed (the stylesheet's own value then applies). */
export function tintVars(t: Tint, theme: Theme): Record<string, string | undefined> {
  const call = t.callout[theme]
  const acc = t.accent[theme]
  const term = t.term[theme]
  const code = t.code[theme]
  const hsl = (c: Hsl) => `hsl(${c.h} ${c.s}% ${c.l}%)`
  return {
    '--note-border': call ? hsl(call) : undefined,
    '--note-bg': call ? `color-mix(in srgb, ${hsl(call)} ${CALLOUT_FILL * 100}%, var(--q-surface))` : undefined,
    '--accent': acc ? hsl(acc) : undefined,
    '--term-new': term ? hsl(term) : undefined,
    '--term-new-bg': term ? `color-mix(in srgb, ${hsl(term)} ${TERM_FILL * 100}%, transparent)` : undefined,
    '--code-inline-bg': code ? hsl(code) : undefined,
    '--accent-soft': acc ? `color-mix(in srgb, ${hsl(acc)} ${theme === 'dark' ? 20 : 14}%, var(--q-surface))` : undefined,
  }
}
