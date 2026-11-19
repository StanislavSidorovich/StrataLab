// Width of the right-hand side panel of a Python tab (the AI helper). A handle on its left edge drags it;
// the choice is kept in this browser. Under 768 px the panel is a bottom dock and none of this applies.

export const SIDE_PANEL_KEY = 'stratalab.sidePanelWidth'
/** the narrowest it was before it could be resized (Tailwind md:w-80) */
export const SIDE_PANEL_MIN = 320
/** what it was on a wide window (lg:w-96); a window under 1024 px started at the minimum */
export const SIDE_PANEL_DEFAULT_WIDE = 384
/** the editor beside it keeps at least this much */
export const EDITOR_MIN = 360
/** arrow keys on the handle */
export const SIDE_PANEL_STEP = 16

export function defaultSidePanelWidth(viewport: number): number {
  return viewport >= 1024 ? SIDE_PANEL_DEFAULT_WIDE : SIDE_PANEL_MIN
}

/** The widest the panel may be in a row of this width: the editor keeps EDITOR_MIN, the panel never goes under its minimum. */
export function maxSidePanelWidth(rowWidth: number): number {
  return Math.max(SIDE_PANEL_MIN, Math.floor(rowWidth) - EDITOR_MIN)
}

/** A width inside the limits of this row. A window that was made narrower pulls the panel in with it. */
export function clampSidePanelWidth(w: number, rowWidth: number): number {
  const n = Number.isFinite(w) ? w : SIDE_PANEL_MIN
  return Math.round(Math.min(maxSidePanelWidth(rowWidth), Math.max(SIDE_PANEL_MIN, n)))
}

/** A stored value back to a width; nothing usable (empty, text, under the minimum) is null: the default applies. */
export function parseSidePanelWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= SIDE_PANEL_MIN ? Math.round(n) : null
}

/** The width in force: the saved one (or the default), kept inside the row. The saved value itself is not changed, so a wider window gives it back. */
export function effectiveSidePanelWidth(saved: number | null, rowWidth: number, viewport: number): number {
  return clampSidePanelWidth(saved ?? defaultSidePanelWidth(viewport), rowWidth)
}

/** What an arrow key does: Left widens (the panel is on the right), Right narrows. Other keys: null. */
export function keySidePanelWidth(key: string, current: number, rowWidth: number): number | null {
  if (key === 'ArrowLeft') return clampSidePanelWidth(current + SIDE_PANEL_STEP, rowWidth)
  if (key === 'ArrowRight') return clampSidePanelWidth(current - SIDE_PANEL_STEP, rowWidth)
  if (key === 'Home') return SIDE_PANEL_MIN
  if (key === 'End') return maxSidePanelWidth(rowWidth)
  return null
}
