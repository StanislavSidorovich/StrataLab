// Appearance ("Aa" in the header): the editor's background and the panels' background, chosen from
// a few pale tints or any colour, kept separately for the light and the dark theme (a pale panel
// picked in light mode must not end up behind light text in dark mode). Same idea, swatches and
// storage shape as StrataSQL's Appearance (model.quaera.app), so the Quaera apps offer the same tints.

export type Theme = 'light' | 'dark'
export type LookPart = 'editor' | 'panels'

export interface Look {
  editor: Partial<Record<Theme, string>>
  panels: Partial<Record<Theme, string>>
}

export const NO_LOOK: Look = { editor: {}, panels: {} }

/**
 * First swatch = the theme's own colour (white panels and editor; the dark panels and One Dark's
 * editor). The others are StrataSQL's tints: warm, green, blue, violet, rose, grey.
 */
export const SWATCHES: Record<LookPart, Record<Theme, string[]>> = {
  editor: {
    light: ['#ffffff', '#f8f4ea', '#edf6f0', '#edf3fb', '#f3effa', '#fbeff0', '#e9ecf0'],
    dark: ['#282c34', '#1d1b16', '#14201b', '#131b27', '#1d1826', '#0e1014', '#262a31'],
  },
  panels: {
    light: ['#ffffff', '#f6f1e4', '#e8f3ec', '#e7eff9', '#efe9f8', '#f9eaec', '#eceef2'],
    dark: ['#1b1f27', '#24211b', '#18251f', '#18212e', '#231d2d', '#121418', '#2b3038'],
  },
}

const HEX = /^#[0-9a-f]{6}$/

/** `#RRGGBB` in lower case, or undefined for anything else (it goes into CSS). */
export function normalColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const c = v.trim().toLowerCase()
  return HEX.test(c) ? c : undefined
}

function part(v: unknown): Partial<Record<Theme, string>> {
  const out: Partial<Record<Theme, string>> = {}
  if (v && typeof v === 'object') {
    for (const t of ['light', 'dark'] as const) {
      const c = normalColor((v as Record<string, unknown>)[t])
      if (c) out[t] = c
    }
  }
  return out
}

/** The stored look (JSON from localStorage); anything broken or unknown is dropped. */
export function parseLook(json: string | null): Look {
  try {
    const v = JSON.parse(json ?? '{}') as Record<string, unknown>
    return { editor: part(v?.editor), panels: part(v?.panels) }
  } catch {
    return { editor: {}, panels: {} }
  }
}

/** The look with one colour changed; undefined (or the theme's own colour) goes back to the default. */
export function setLookColor(look: Look, which: LookPart, theme: Theme, color: string | undefined): Look {
  const c = normalColor(color)
  const next = { ...look[which] }
  if (!c || c === SWATCHES[which][theme][0]) delete next[theme]
  else next[theme] = c
  return { ...look, [which]: next }
}

/** The colour shown for a part: the chosen one, or the theme's own. */
export function lookColor(look: Look, which: LookPart, theme: Theme): string {
  return look[which][theme] ?? SWATCHES[which][theme][0]
}

/** `a` moved `share` (0…1) of the way towards `b`, both `#RRGGBB`. */
export function mixColor(a: string, b: string, share: number): string {
  const ch = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16)
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * share))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * The CSS variables to set on the page; undefined = remove (the stylesheet's own value).
 * A chosen panel colour also gives the hover / header shade (`--panel-2`) and the striped grid rows
 * (`--grid-alt`) in the same tint, a little darker in light mode and lighter in dark mode.
 */
export function lookVars(look: Look, theme: Theme): Record<string, string | undefined> {
  const panel = look.panels[theme]
  const toward = theme === 'dark' ? '#ffffff' : '#000000'
  return {
    '--code-bg': look.editor[theme],
    '--panel': panel,
    '--panel-2': panel && mixColor(panel, toward, theme === 'dark' ? 0.05 : 0.04),
    '--grid-alt': panel && mixColor(panel, toward, theme === 'dark' ? 0.025 : 0.015),
  }
}
