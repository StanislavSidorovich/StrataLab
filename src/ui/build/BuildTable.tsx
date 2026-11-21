// Small pieces shared by the screens of the build page: a table of a few rows, a folded SQL, a row count line.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ResultData } from '../../core/check'
import './walk066.css'

/** A few rows as a plain table; `types` (column → short type) is drawn under the names. */
/** `errors` (same shape as the rows) marks the cells that are [Error]: NULL where the file had a value (spec 3.6). */
export function BuildTable({ data, types, caption, tone, errors, scrollHint }: { data: ResultData | null; types?: Record<string, string>; caption?: string; tone?: 'warn' | 'ok'; errors?: boolean[][]; scrollHint?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  // a scrollbar can be hidden by the system (Firefox, touch): when the columns do not fit, say so in words
  useEffect(() => {
    const el = wrap.current
    if (!scrollHint || !el) return
    const measure = () => setWide(el.scrollWidth > el.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollHint, data])
  if (!data) return <div className="build-muted">Loading…</div>
  return (
    <>
    <div className="build-table-wrap" ref={wrap} tabIndex={0} role="region" aria-label={caption ?? 'Rows'}>
      <table className={`build-table${tone ? ` is-${tone}` : ''}`}>
        <thead>
          <tr>
            {data.header.map((c) => (
              <th key={c}>
                {c}
                {types?.[c] && <span className="build-type">{types[c]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={errors?.[i]?.[j] ? 'is-error' : c === null ? 'is-null' : undefined} data-error={errors?.[i]?.[j] ? 'true' : undefined}>
                  {errors?.[i]?.[j] ? '[Error]' : c === null ? 'null' : String(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {wide && (
      <div className="build-muted bw-scrollhint" data-testid="table-scroll-hint">
        Scroll sideways for the other columns.
      </div>
    )}
    </>
  )
}

/** SQL folded under a summary line. */
export function FoldedSql({ summary, sql, children }: { summary: string; sql: string; children?: ReactNode }) {
  return (
    <details className="build-sql">
      <summary>{summary}</summary>
      <pre className="pl-code">{sql}</pre>
      {children}
    </details>
  )
}

/** DuckDB type names as short words for the Connect cards. */
export function shortType(t: string): string {
  if (t === 'VARCHAR') return 'text'
  if (t === 'BIGINT' || t === 'INTEGER') return 'whole number'
  if (t === 'DATE') return 'date'
  if (t.startsWith('DECIMAL') || t === 'DOUBLE') return 'decimal'
  return t.toLowerCase()
}

export const fmtN = (n: number) => n.toLocaleString('en-US')

/** A decimal that came back as text, as money with two places. */
export const money = (v: string | number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
