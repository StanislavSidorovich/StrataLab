// Text contrast ("Text contrast" in the Aa menu): Standard, Darker, Maximum, no slider. The choice sets
// data-contrast on <html>; src/ui/contrast.css maps it to the text colours, for the light and the dark theme.
// Kept in this browser only. Nobody chose and the system asks for more contrast (prefers-contrast: more): Darker.
// index.html applies the attribute before the first paint so the page does not flash.

export const CONTRAST_LEVELS = ['standard', 'darker', 'maximum'] as const
export type Contrast = (typeof CONTRAST_LEVELS)[number]

export const CONTRAST_KEY = 'stratalab.contrast'

export const contrastLabel = (c: Contrast) => c[0].toUpperCase() + c.slice(1)

/** A stored value to a level; nothing stored, or anything unknown, is null (no choice made). */
export function parseContrast(raw: string | null): Contrast | null {
  return CONTRAST_LEVELS.find((c) => c === raw) ?? null
}

/** The level in force: the stored choice, else Darker for a system that asks for more contrast, else Standard. */
export function resolveContrast(stored: string | null, systemWantsMore: boolean): Contrast {
  return parseContrast(stored) ?? (systemWantsMore ? 'darker' : 'standard')
}

function systemWantsMore(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-contrast: more)').matches
  } catch {
    return false
  }
}

export function readContrast(): Contrast {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(CONTRAST_KEY)
  } catch {
    /* private mode: no stored choice */
  }
  return resolveContrast(stored, systemWantsMore())
}

/** Puts the level on <html>; Standard removes the attribute. Does not remember anything. */
export function showContrast(c: Contrast): void {
  const el = document.documentElement
  if (c === 'standard') el.removeAttribute('data-contrast')
  else el.setAttribute('data-contrast', c)
}

/** The user's own pick: shown now and remembered (Standard too, so it beats prefers-contrast: more). */
export function chooseContrast(c: Contrast): void {
  showContrast(c)
  try {
    localStorage.setItem(CONTRAST_KEY, c)
  } catch {
    /* private mode: the choice holds for this session only */
  }
}
