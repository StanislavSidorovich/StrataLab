// The two ways out of the build and pipeline pages: back to Quaera (the trainer the learner came from), and the plain SQL
// workbench. The first goes through `followQuaeraLink`: with Quaera as the opener its tab is focused, otherwise one named
// window is used, so a double click never piles up tabs. Not from Quaera at all? It is a plain link to quaera.app.
import { ArrowLeft, Database } from 'lucide-react'
import { followQuaeraLink } from '../../core/quaeraLink'
import './backToQuaera.css'

/** Where "Back to Quaera" leads: the data map, which is where the build and the pipeline are offered. */
export const BACK_URL = 'https://quaera.app/?roles=map'

export function ExitButtons({ onWorkbench, testid }: { onWorkbench: () => void; testid: string }) {
  return (
    <span className="exit-buttons">
      <a className="btn btn-ghost" href={BACK_URL} target="_blank" rel="noopener" onClick={(e) => followQuaeraLink(e, BACK_URL)} data-testid={`${testid}-back`}>
        <ArrowLeft size={14} /> Back to Quaera
      </a>
      <button className="btn btn-ghost" onClick={onWorkbench} title="Leave this page for the SQL workbench" data-testid={`${testid}-workbench`}>
        <Database size={14} /> SQL Workbench
      </button>
    </span>
  )
}
