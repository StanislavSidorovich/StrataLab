// A result as JSON: an array of objects, one per row, one line each (pandas: read_json).
import { uniqueName } from './sql'

/**
 * A DECIMAL as JSON: a number when the number says the same ("12.50" → 12.5), else the
 * text, so 12345678901234567.8901 keeps its digits.
 */
export function decimalJson(text: string): number | string {
  const n = Number(text)
  if (!Number.isFinite(n)) return text
  const trimmed = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
  return String(n) === trimmed.replace(/^(-?)0+(\d)/, '$1$2') ? n : text
}

/** Rows as a JSON array of objects; a repeated column name becomes id, id_2… as in the grid's exports. */
export function rowsToJson(header: string[], rows: unknown[][]): string {
  const keys: string[] = []
  for (const h of header) keys.push(uniqueName(h, keys))
  const lines = rows.map((r) => JSON.stringify(Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null]))))
  return lines.length ? `[\n${lines.join(',\n')}\n]\n` : '[]\n'
}
