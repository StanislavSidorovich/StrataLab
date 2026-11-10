// "Your star" on the Dashboard step: the gold tables the learner built, with their columns and types, read from the
// database (not from the model screen), so what is shown is what the tiles can read. Folded on a narrow screen.
import { useEffect, useState } from 'react'
import { goldTables, type GoldTable } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { shortType } from './BuildTable'
import './dashboard.css'

export function StarPanel({ ready }: { ready: boolean }) {
  const [tables, setTables] = useState<GoldTable[] | null>(null)
  const [open, setOpen] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(min-width: 1000px)').matches : true))

  useEffect(() => {
    if (!ready) return
    let alive = true
    goldTables(enginePort)
      .then((t) => alive && setTables(t))
      .catch(() => alive && setTables([]))
    return () => {
      alive = false
    }
  }, [ready])

  return (
    <details className="bs-panel" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="star-panel">
      <summary>Your star: the tables the tiles read</summary>
      {tables === null ? (
        <div className="build-muted">Loading…</div>
      ) : tables.length === 0 ? (
        <div className="build-muted">The star is not built yet. Go back to Model.</div>
      ) : (
        <div className="bs-tables">
          {tables.map((t) => (
            <div className="bs-table" key={t.table} data-testid={`star-${t.table}`}>
              <div className="bs-name">{t.table}</div>
              <ul className="bs-cols">
                {t.columns.map((c) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <span className="bs-type">{shortType(c.type)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </details>
  )
}
