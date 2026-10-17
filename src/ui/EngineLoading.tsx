import { Loader2 } from 'lucide-react'
import type { EngineProgress } from '../db/engine'
import { useLab } from './store'

/** Short status for the header: "Loading DuckDB 42%", then "Starting DuckDB…". */
export function engineLoadingLabel(p: EngineProgress): string {
  if (p.step === 'start') return 'Starting DuckDB…'
  return p.percent === null ? 'Loading DuckDB…' : `Loading DuckDB ${p.percent}%`
}

/** The same for a phone-width header, where the card below says the rest. */
export function engineLoadingShort(p: EngineProgress): string {
  return p.step === 'download' && p.percent !== null ? `${p.percent}%` : 'DuckDB…'
}

/**
 * Shown in the result pane while DuckDB downloads and starts. The first visit
 * takes a few seconds (the engine is a ~8 MB download), so say what is going on.
 */
export function EngineLoading() {
  const engine = useLab((s) => s.engine)
  if (engine.status !== 'loading') return null
  const { progress, withModel } = engine
  const percent = progress.step === 'download' ? progress.percent : 100
  const known = percent !== null
  return (
    <div className="h-full overflow-auto flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl p-5 space-y-3" style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }} role="status" aria-live="polite">
        <div className="flex items-center gap-2 font-semibold text-[15px]">
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
          Getting the SQL engine ready
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--line)' }}
          role="progressbar"
          aria-label="DuckDB loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={known ? percent : undefined}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${progress.step === 'start' || !known ? 'animate-pulse' : ''}`}
            style={{ width: `${known ? Math.max(percent, 2) : 100}%`, background: 'var(--accent)', opacity: known ? 1 : 0.5 }}
          />
        </div>
        <div className="flex justify-between gap-3" style={{ fontSize: 13 }}>
          <span>{progress.step === 'start' ? 'Step 2 of 2 · starting the database' : 'Step 1 of 2 · downloading DuckDB'}</span>
          {progress.step === 'download' && known && <span className="tabular-nums font-semibold">{percent}%</span>}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          The first visit downloads the engine once (about 8 MB). Next time it comes from your browser's cache and starts in a second or two. Your files are never uploaded: everything runs on this computer.
        </p>
        {withModel && (
          <p className="rounded-md px-3 py-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13 }}>
            Your model from model.quaera.app opens as soon as the engine is ready.
          </p>
        )}
      </div>
    </div>
  )
}
