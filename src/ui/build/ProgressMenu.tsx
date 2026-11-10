// The Progress button in the header of the build page: Start over, My saved run, Demo mode (spec, "Progress and demo").
import { useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { Menu, type MenuItem } from '../Menu'
import { savedDate, type Saved } from '../../core/buildProgress'

type Ask = { title: string; body: string; ok: string; run: () => void }

interface Props {
  demo: boolean
  saved: Saved | null
  /** nothing done on the learner's page yet */
  empty: boolean
  onStartOver: () => void
  onRestore: () => void
  /** restoring would replace work that is not saved */
  restoreAsks: boolean
  onDemo: () => void
  onExitDemo: () => void
}

export function ProgressMenu(p: Props) {
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState<Ask | null>(null)
  const items: MenuItem[] = [
    [
      'Start over',
      () => (p.empty ? p.onStartOver() : setAsk({ title: 'Start over?', body: p.saved ? "Your current run is kept under 'My saved run'. The run saved there now is replaced by it." : "Your current run is kept under 'My saved run'. The build starts again at step 1.", ok: 'Start over', run: p.onStartOver })),
      { disabled: p.demo || p.empty, hint: p.demo ? 'Not in demo mode' : p.empty ? 'Nothing to start over yet' : 'Keeps this run under My saved run, then goes back to step 1' },
    ],
    [
      'My saved run',
      () => (p.restoreAsks ? setAsk({ title: 'Restore your saved run?', body: 'The work on the page now is not saved anywhere. Restoring replaces it.', ok: 'Restore', run: p.onRestore }) : p.onRestore()),
      { disabled: p.demo || !p.saved, hint: p.demo ? 'Not in demo mode' : p.saved ? `Saved ${savedDate(p.saved.at)}` : 'Nothing saved yet: Start over saves it' },
    ],
    'separator',
    p.demo
      ? ['Exit demo', p.onExitDemo, { hint: 'Back to your own run, as you left it' }]
      : ['Demo mode', p.onDemo, { hint: 'Fill buttons walk a guest through; your own run is not touched' }],
  ]
  return (
    <div className="pm-wrap">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="progress-menu">
        <History size={14} /> Progress <ChevronDown size={12} />
      </button>
      {open && <Menu items={items} close={() => setOpen(false)} label="Progress" />}
      {ask && (
        <div className="pm-confirm-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setAsk(null)}>
          <div className="pm-confirm" role="dialog" aria-modal="true" aria-label={ask.title} data-testid="progress-confirm">
            <h3>{ask.title}</h3>
            <p>{ask.body}</p>
            <div className="pm-confirm-actions">
              <button className="btn" onClick={() => setAsk(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  const run = ask.run
                  setAsk(null)
                  run()
                }}
                data-testid="progress-confirm-ok"
              >
                {ask.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
