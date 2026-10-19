// Save (Ctrl+S) on a Python tab that has no file yet: a script (.py, cells as # %%) or a Jupyter
// notebook (.ipynb, the same as File → Download as notebook). Enter takes the script.
import { FileCode, NotebookText, X } from 'lucide-react'
import { useLab } from './store'
import { saveSqlFile } from './sqlFiles'

export function SaveKindDialog() {
  const ask = useLab((s) => s.saveKind)
  if (!ask) return null
  const close = () => useLab.setState({ saveKind: null })
  const save = (kind: 'py' | 'ipynb') => void saveSqlFile(ask.saveAs, kind)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div role="dialog" aria-label="Save the Python tab" className="w-full max-w-sm rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex-1 font-semibold">Save the Python tab as</div>
          <button className="btn btn-ghost" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2">
          <button className="btn btn-primary justify-start text-left" autoFocus onClick={() => save('py')}>
            <FileCode size={16} className="shrink-0" />
            <span>
              <b>Python script (.py)</b>
              <span className="block" style={{ fontSize: 12, opacity: 0.85 }}>Cells as # %%: VS Code, PyCharm, Spyder</span>
            </span>
          </button>
          <button className="btn justify-start text-left" onClick={() => save('ipynb')}>
            <NotebookText size={16} className="shrink-0" />
            <span>
              <b>Jupyter notebook (.ipynb)</b>
              <span className="block" style={{ fontSize: 12, color: 'var(--muted)' }}>With the outputs of the last run: Jupyter, Colab</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
