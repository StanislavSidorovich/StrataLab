// Demo mode as the screens see it: whether it is on, and what a Fill button does. Outside demo mode FillButton draws nothing.
import { createContext, useContext } from 'react'
import { Wand2 } from 'lucide-react'
import type { FillUnit } from '../../core/buildFill'

export interface DemoValue {
  demo: boolean
  /** the tables are not being rebuilt */
  ready: boolean
  fill: (unit: FillUnit) => void
}

export const DemoContext = createContext<DemoValue>({ demo: false, ready: false, fill: () => undefined })

/** "Fill this step": puts the right answer of one card, tile or question in. Only in demo mode. */
export function FillButton({ unit, label = 'Fill this step', hidden = false }: { unit: FillUnit; label?: string; hidden?: boolean }) {
  const { demo, ready, fill } = useContext(DemoContext)
  if (!demo || hidden) return null
  return (
    <button className="btn demo-fill" disabled={!ready} onClick={() => fill(unit)} title="Demo: puts the right answer in" data-testid={`fill-${Object.values(unit).join('-')}`}>
      <Wand2 size={14} /> {label}
    </button>
  )
}

export const useDemo = () => useContext(DemoContext)
