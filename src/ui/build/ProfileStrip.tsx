// The column quality strip under a header of the Clean grid (design docs/clean-canvas-design.md, 1.4): valid / error / empty as a three-part
// bar with the shares written out, the distinct count, and one line of hints. Numbers are text too, so colour is never the only signal.
import { pct, profileHints, type ColumnProfile } from '../../core/buildProfile'
import type { BuildSourceId } from '../../data/build/kaiyoSales'
import { fmtN } from './BuildTable'
import './cleanProfile.css'

export function ProfileStrip({ source, p }: { source: BuildSourceId; p: ColumnProfile }) {
  const share = (x: number) => (p.n > 0 ? (x / p.n) * 100 : 0)
  // a part that exists is never drawn thinner than 2 px, so a lone error cannot disappear
  const seg = (x: number) => ({ width: `${share(x)}%`, minWidth: x > 0 ? 2 : 0 })
  const hints = profileHints(source, p)
  const words = `${pct(p.valid, p.n)} valid, ${pct(p.errors, p.n)} error, ${pct(p.empty, p.n)} empty, ${fmtN(p.distinct)} distinct`
  return (
    <div className="cp-strip" data-testid={`profile-${p.col}`} title={`${p.col}: ${words} (${fmtN(p.n)} rows)${hints.length ? `. ${hints.map((h) => h.title).join('. ')}` : ''}`}>
      <div className="cp-bar" role="img" aria-label={`${p.col}: ${words}`}>
        <span className="cp-valid" style={seg(p.valid)} />
        <span className="cp-error" style={seg(p.errors)} />
        <span className="cp-empty" style={seg(p.empty)} />
      </div>
      <div className="cp-nums">
        <span className="cp-n-valid">{pct(p.valid, p.n)} valid</span>
        {p.errors > 0 && <span className="cp-n-error">{pct(p.errors, p.n)} error</span>}
        {p.empty > 0 && <span className="cp-n-empty">{pct(p.empty, p.n)} empty</span>}
      </div>
      <div className="cp-distinct">{fmtN(p.distinct)} distinct</div>
      {hints.length > 0 && (
        <div className="cp-hints">
          {hints.map((h) => (
            <span key={h.text} className="cp-hint" data-testid="profile-hint">{h.text}</span>
          ))}
        </div>
      )}
    </div>
  )
}
