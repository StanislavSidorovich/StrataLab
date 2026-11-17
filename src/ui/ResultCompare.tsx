// After a wrong SQL / Python practice answer: "Your result" and "Expected" side by side, five rows each,
// the rows with no partner on the other side marked. Shown only after a check, never before.
import { diffRows, showCell, type Cell, type ResultData } from '../core/check'
import './resultCompare.css'

const SHOWN = 5
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`

function Side({ title, data, marks }: { title: string; data: ResultData; marks: boolean[] }) {
  const shown = data.rows.slice(0, SHOWN)
  return (
    <div className="rc-side">
      <div className="rc-title">
        <b>{title}</b> <span>{plural(data.rows.length, 'row')}, {plural(data.header.length, 'column')}</span>
      </div>
      {data.rows.length === 0 ? (
        <div className="rc-empty">no rows</div>
      ) : (
        <div className="rc-scroll">
          <table className="rc-table mono">
            <thead>
              <tr>
                {data.header.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r: Cell[], i) => (
                <tr key={i} data-off={marks[i] || undefined}>
                  {r.map((v, j) => (
                    <td key={j} data-null={v == null || undefined} data-num={typeof v === 'number' || undefined}>
                      {showCell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.rows.length > SHOWN && <div className="rc-more">first {SHOWN} of {data.rows.length.toLocaleString('en-US')} rows</div>}
    </div>
  )
}

export function ResultCompare({ got, expected, trap }: { got: ResultData; expected: ResultData; trap: boolean }) {
  const off = diffRows(got, expected)
  return (
    <div className="rc" aria-label="Your result and the expected result">
      <div className="rc-grid">
        <Side title={trap ? 'Your result (what this mistake gives)' : 'Your result'} data={got} marks={off.got} />
        <Side title="Expected" data={expected} marks={off.expected} />
      </div>
      {(off.got.some(Boolean) || off.expected.some(Boolean)) && <p className="rc-legend">Marked rows have no match on the other side.</p>}
    </div>
  )
}
