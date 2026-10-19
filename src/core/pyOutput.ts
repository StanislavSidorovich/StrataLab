// How a Python tab's Output shows a DataFrame inline (stage 7), as Jupyter and Colab do: a small
// table of its first rows, the whole of it one click away in the DataFrame view.

/** Rows shown inline: all of a short DataFrame (20 or fewer), else the first 10. */
export const INLINE_ALL = 20
export const INLINE_HEAD = 10
export const inlineRows = (rows: number) => (rows <= INLINE_ALL ? rows : INLINE_HEAD)

/** Columns shown inline; a wider DataFrame says how many more it has. */
export const INLINE_COLS = 40

/** A float as pandas prints it: at most 6 decimals, without trailing zeros (huge and tiny ones as they are). */
export function inlineNumber(v: number): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'inf' : '-inf'
  if (Number.isInteger(v) || Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6) return String(v)
  return String(Number(v.toFixed(6)))
}

/** "1,000 × 5": rows × columns, as pandas gives `df.shape`. */
export const frameShape = (rows: number, cols: number) => `${rows.toLocaleString('en-US')} × ${cols}`
