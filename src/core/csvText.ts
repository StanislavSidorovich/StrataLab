// The writer of the build page's files (spec docs/build-kaiyo-sales-spec.md, 2.3): header line, `\n` after every
// line, NULL as an empty field, a field quoted when it holds the delimiter, a quote, a line break, or edge spaces.
import type { Cell } from './check'

export function csvTextField(v: Cell | undefined, delim: string): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  const needs = s.includes(delim) || /["\n\r]/.test(s) || (s.length > 0 && (/^\s/.test(s) || /\s$/.test(s)))
  return needs ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function csvText(columns: readonly string[], rows: Cell[][], delim = ','): string {
  const line = (r: Cell[]) => r.map((v) => csvTextField(v, delim)).join(delim)
  return [columns.map((c) => csvTextField(c, delim)).join(delim), ...rows.map(line)].join('\n') + '\n'
}
