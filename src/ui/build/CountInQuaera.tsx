// "Count it in Quaera": the link back to the trainer with the answer it gives. The trainer replies `quaera:done` to the click
// (src/core/quaeraLink.ts); then "Counted in Quaera ✓" stands next to the button. Silence opens the named window instead.
import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { followQuaeraLink } from '../../core/quaeraLink'
import './count.css'

export function CountInQuaera({ url, primary, testid }: { url: string; primary?: boolean; testid: string }) {
  const [counted, setCounted] = useState(false)
  return (
    <span className="count-q">
      <a className={`btn${primary ? ' btn-primary' : ''}`} href={url} target="_blank" rel="noopener" onClick={(e) => followQuaeraLink(e, url, undefined, (ok) => ok && setCounted(true))} data-testid={testid}>
        Count it in Quaera <ExternalLink size={14} />
      </a>
      {counted && (
        <span className="build-ok" role="status" data-testid={`${testid}-counted`}>
          <Check size={14} /> Counted in Quaera
        </span>
      )}
    </span>
  )
}
