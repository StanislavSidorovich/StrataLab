// The two ways out of the build and pipeline pages: back to Quaera (the trainer the learner came from), and Lab home
// (✕ Close: the hash is cleared, no reload, saved progress untouched). The first goes through `followQuaeraLink`: with Quaera as the opener its tab is focused, otherwise one named
// window is used, so a double click never piles up tabs. Not from Quaera at all? It is a plain link to quaera.app.
import { ArrowLeft, X } from 'lucide-react'
import { followQuaeraLink } from '../../core/quaeraLink'
import './backToQuaera.css'

/** Where "Back to Quaera" leads: the data map, which is where the build and the pipeline are offered. */
export const BACK_URL = 'https://quaera.app/?roles=map'

export function ExitButtons({ onWorkbench, testid }: { onWorkbench: () => void; testid: string }) {
  return (
    <span className="exit-buttons">
      <a className="btn btn-ghost" href={BACK_URL} target="_blank" rel="noopener" onClick={(e) => followQuaeraLink(e, BACK_URL)} aria-label="Back to Quaera" data-testid={`${testid}-back`}>
        <ArrowLeft size={14} /> <span className="exit-text">Back to Quaera</span>
      </a>
      <button className="btn btn-ghost" onClick={onWorkbench} aria-label="Close" title="Close this page and go to Lab home (your progress stays saved)" data-testid={`${testid}-workbench`}>
        <X size={14} /> <span className="exit-text">Close</span>
      </button>
    </span>
  )
}
