// One line under a revenue number: the returns that came with a positive revenue are summed as sent (card P8 says so).
import { useEffect, useState } from 'react'
import { returnsNote } from '../../core/buildOdd'
import { oddValues } from '../../db/buildRun'
import { enginePort } from '../../db/pipelinePort'
import './walk066.css'

export function ReturnsNote({ ready, rev = 0 }: { ready: boolean; rev?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ready) return
    let alive = true
    oddValues(enginePort)
      .then((o) => alive && setN(o?.returnsPositive ?? 0))
      .catch(() => alive && setN(0))
    return () => {
      alive = false
    }
  }, [ready, rev])
  const text = returnsNote(n)
  return text ? (
    <p className="build-muted bw-returns" data-testid="returns-note">
      {text}
    </p>
  ) : null
}
