// "Open star in Quaera Model": the learner's star (the three gold tables) as a model in model.quaera.app, through the link
// the dataset menus use (src/core/modelLink.ts). One click at a time: while it works the button waits, so a double click
// cannot open two windows (and the window has a name, so a second try would reuse it anyway).
import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { showStarAsModel } from '../../db/modelExport'
import { SCHEMA } from '../../data/build/kaiyoSales'
import './openStar.css'

export function OpenStarInModel({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    // not awaited: the window is opened inside the click, before the first await
    showStarAsModel(SCHEMA)
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false))
  }
  return (
    <span className="open-star">
      <button className="btn" disabled={!ready || busy} onClick={open} title="Opens the three star tables as a model in Quaera Model, in another tab" data-testid="open-star-model">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Open star in Quaera Model ↗
      </button>
      {error && <span className="build-error" role="alert" data-testid="open-star-error">{error}</span>}
    </span>
  )
}
