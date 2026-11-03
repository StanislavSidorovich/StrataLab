// Text size of the practice pages ("Size" in their header): a few steps over 100%, for a comfortable read.
// Kept in this browser only; both books (SQL and Python) share the choice.

export const ZOOM_STEPS = [1, 1.05, 1.1, 1.2] as const

export const ZOOM_KEY = 'stratalab.practiceZoom'

/** A stored value back to one of the steps; anything else is 100%. */
export function parseZoom(raw: string | null): number {
  const n = Number(raw)
  return ZOOM_STEPS.find((z) => z === n) ?? 1
}

export const zoomLabel = (z: number) => `${Math.round(z * 100)}%`
