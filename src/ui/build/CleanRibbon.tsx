// The ribbon of Clean (design docs/clean-canvas-design.md, 1.2): the buttons of v1 in Rows / Column / Advanced groups, like the
// ribbon of Power Query. Column buttons act on the column selected in the grid; a button that does not fit the source is not drawn.
import { useEffect, useState } from 'react'
import { ChevronDown, Code2, Loader2 } from 'lucide-react'
import { CLEAN_COLUMNS, TYPE_WORD, type StepKind, type TypeTo } from '../../core/buildSteps'
import type { BuildSourceId } from '../../data/build/kaiyoSales'

interface Props {
  source: BuildSourceId
  /** the column picked in the grid, or null */
  selected: string | null
  off: boolean
  busy: boolean
  onAdd: (kind: StepKind, params?: Record<string, string>) => void
  /** drawn only when there is an Advanced SQL to open (sales, P2 and P5) */
  onAdvanced?: () => void
  advancedOpen: boolean
}

export function CleanRibbon({ source, selected, off, busy, onAdd, onAdvanced, advancedOpen }: Props) {
  const cols = CLEAN_COLUMNS[source]
  const canLatest = cols.includes('updated_at')
  const [key, setKey] = useState(cols.includes('customer_id') ? 'customer_id' : cols[0])
  const [order, setOrder] = useState(cols.includes('updated_at') ? 'updated_at' : cols[cols.length - 1])
  const [dir, setDir] = useState<'newest' | 'oldest'>('newest')
  const [find, setFind] = useState('')
  const [withText, setWithText] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [sep, setSep] = useState<'point' | 'comma'>('point')
  const [need, setNeed] = useState(false)

  useEffect(() => {
    setKey(cols.includes('customer_id') ? 'customer_id' : cols[0])
    setOrder(cols.includes('updated_at') ? 'updated_at' : cols[cols.length - 1])
    setTypeOpen(false)
    setNeed(false)
  }, [source, cols])
  useEffect(() => {
    if (selected) setNeed(false)
  }, [selected])

  /** a column button: runs on the selected column, or says to pick one */
  const onColumn = (fn: (c: string) => void) => () => {
    if (!selected) {
      setNeed(true)
      return
    }
    setNeed(false)
    fn(selected)
  }
  const pick = (c: string, to: TypeTo) => {
    setTypeOpen(false)
    onAdd('type', { column: c, to, sep: to === 'date' ? 'point' : sep })
  }
  const select = (value: string, set: (v: string) => void, label: string) => (
    <select className="build-select" value={value} onChange={(e) => set(e.target.value)} aria-label={label} disabled={off}>
      {cols.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )

  return (
    <div className="cc-ribbon" role="group" aria-label="Ribbon" data-testid="clean-ribbon">
      <div className="cc-group">
        <div className="cc-group-body">
          <button className="btn" disabled={off} onClick={() => onAdd('distinct')}>
            Remove duplicates
          </button>
          {canLatest && (
            <>
              <button className="btn" disabled={off} onClick={() => onAdd('latest', { key, order, direction: dir })}>
                Keep latest row per key
              </button>
              <label className="build-set">key {select(key, setKey, 'Key')}</label>
              <label className="build-set">order by {select(order, setOrder, 'Order column')}</label>
              <select className="build-select" value={dir} onChange={(e) => setDir(e.target.value as 'newest' | 'oldest')} aria-label="Newest or oldest" disabled={off}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </>
          )}
        </div>
        <div className="cc-group-name">Rows</div>
      </div>
      <div className="cc-group">
        <div className="cc-group-body">
          <button className="btn" disabled={off} onClick={onColumn((c) => onAdd('trim', { column: c }))}>
            Trim
          </button>
          <button className="btn" disabled={off} onClick={onColumn((c) => onAdd('upper', { column: c }))}>
            Uppercase
          </button>
          <button className="btn" disabled={off} onClick={onColumn((c) => onAdd('extract', { column: c }))} title="Keep the digits of a text as a whole number: R-03 becomes 3">
            Extract number
          </button>
          <span className="cc-replace">
            <button className="btn" disabled={off || !find} onClick={onColumn((c) => onAdd('replace', { column: c, find, with: withText }))} title="Replace a piece of text in the selected column" data-testid="build-replace">
              Replace values
            </button>
            <label className="build-set">
              find <input className="build-input" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find" spellCheck={false} disabled={off} />
            </label>
            <label className="build-set">
              with <input className="build-input" value={withText} onChange={(e) => setWithText(e.target.value)} aria-label="Replace with" spellCheck={false} disabled={off} />
            </label>
          </span>
          {source === 'sales' && (
            <span className="cc-menu">
              <button className="btn" disabled={off} aria-expanded={typeOpen} aria-haspopup="menu" onClick={() => setTypeOpen((v) => !v)} data-testid="build-change-type">
                Change type <ChevronDown size={13} />
              </button>
              {typeOpen && (
                <div className="cc-menu-list" role="menu" aria-label="Change type to">
                  {(Object.keys(TYPE_WORD) as TypeTo[]).map((t) => (
                    <button key={t} role="menuitem" className="btn" onClick={onColumn((c) => pick(c, t))} data-testid={`build-type-${t}`}>
                      {TYPE_WORD[t]}
                    </button>
                  ))}
                  <label className="build-set">
                    decimal separator
                    <select className="build-select" value={sep} onChange={(e) => setSep(e.target.value as 'point' | 'comma')} aria-label="Decimal separator">
                      <option value="point">point (3.5)</option>
                      <option value="comma">comma (3,5)</option>
                    </select>
                  </label>
                </div>
              )}
            </span>
          )}
          {busy && <Loader2 size={14} className="animate-spin" />}
        </div>
        <div className="cc-group-name">
          Column{' '}
          <span className="cc-selected" data-testid="clean-selected">
            {selected ? <>· <b>{selected}</b></> : ''}
          </span>
        </div>
      </div>
      {onAdvanced && (
        <div className="cc-group">
          <div className="cc-group-body">
            <button className="btn" aria-pressed={advancedOpen} onClick={onAdvanced} data-testid="clean-advanced">
              <Code2 size={14} /> Advanced: SQL
            </button>
          </div>
          <div className="cc-group-name">Advanced</div>
        </div>
      )}
      {need && (
        <div className="cc-need" role="status" data-testid="clean-pick-column">
          Pick a column first: click its header
        </div>
      )}
    </div>
  )
}
