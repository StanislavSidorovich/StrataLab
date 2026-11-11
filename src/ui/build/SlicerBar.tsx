// Two rows of chips above the dashboard tiles: Chain and Brand, single select, the selected chip clears itself; a line says
// what is shown and clears both. The values are read from the dimension tables of the star.
import { useEffect, useState } from 'react'
import { sliceLine, sliceOn, toggleSlice, type SliceDim } from '../../core/buildSlice'
import { sliceValues, type SliceValues } from '../../db/buildSlice'
import { enginePort } from '../../db/pipelinePort'
import { useSlice } from './SliceContext'
import './slicer.css'

export function SlicerBar({ ready }: { ready: boolean }) {
  const { filter, setFilter } = useSlice()
  const [values, setValues] = useState<SliceValues | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    void sliceValues(enginePort)
      .then((v) => alive && setValues(v))
      .catch(() => alive && setValues(null))
    return () => {
      alive = false
    }
  }, [ready])
  if (!values) return null
  const row = (dim: SliceDim, label: string, list: string[]) => (
    <div className="sl-row" role="group" aria-label={`${label} slicer`} data-testid={`slicer-${dim}`}>
      <span className="sl-label">{label}</span>
      {list.map((v) => (
        <button key={v} className={`sl-chip${filter[dim] === v ? ' is-on' : ''}`} aria-pressed={filter[dim] === v} onClick={() => setFilter(toggleSlice(filter, dim, v))} data-testid={`slicer-${dim}-${v}`}>
          {v}
        </button>
      ))}
    </div>
  )
  const line = sliceLine(filter)
  return (
    <div className="sl-bar" data-testid="slicers">
      {row('chain', 'Chain', values.chains)}
      {row('brand', 'Brand', values.brands)}
      <div className="sl-line" data-testid="slicer-line">
        {sliceOn(filter) ? (
          <>
            <span>Showing: {line}</span>
            <button className="sl-clear" onClick={() => setFilter({ chain: null, brand: null })} data-testid="slicer-clear">
              Clear
            </button>
          </>
        ) : (
          <span className="build-muted">No slicer on: every tile shows all the sales.</span>
        )}
      </div>
    </div>
  )
}
