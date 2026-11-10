// The rows a Clean card is about (P2: sales sent twice, P3: stores twice), as they are in the file and as the clean table
// has them now, so the effect of a step is visible even when the first ten rows of the table do not change.
import { useEffect, useState } from 'react'
import { affectedRows, type AffectedRows as Affected } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import { BuildTable } from './BuildTable'
import './clean.css'

const WHAT = {
  P2: { noun: 'sales', fileTitle: 'In the files, with the given step applied: the same sale on two rows', clean: 'clean_sales' },
  P3: { noun: 'stores', fileTitle: 'In customers.csv: the same store on two rows', clean: 'clean_customers' },
} as const

export function AffectedRows({ card, ready, rev }: { card: 'P2' | 'P3'; ready: boolean; rev: number }) {
  const [data, setData] = useState<Affected | null>(null)
  const [error, setError] = useState<string | null>(null)
  const w = WHAT[card]

  useEffect(() => {
    if (!ready) return
    let alive = true
    affectedRows(enginePort, card)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [card, ready, rev])

  if (error) return <div className="build-error">{error}</div>
  if (!data) return <div className="build-muted">Looking for the rows…</div>
  const before = data.file.rows.length
  const now = data.now.rows.length
  return (
    <div className="build-affected" data-testid={`affected-${card}`}>
      <div className="build-affected-head" data-testid={`affected-${card}-count`}>
        {data.groups.toLocaleString('en-US')} {w.noun} are in twice{card === 'P2' ? '; here are the first four' : ''}.{' '}
        <b>{before} rows</b> in the file → <b>{now} rows</b> in {w.clean} now.
      </div>
      <div className="build-affected-grid">
        <div className="build-affected-box">
          <div className="build-muted">{w.fileTitle}</div>
          <BuildTable data={data.file} tone="warn" caption="Rows sent twice, in the file" />
        </div>
        <div className="build-affected-box">
          <div className="build-muted">The same {w.noun} in {w.clean} after your steps</div>
          <BuildTable data={data.now} tone={now < before ? 'ok' : 'warn'} caption="The same rows in the clean table" />
        </div>
      </div>
    </div>
  )
}
