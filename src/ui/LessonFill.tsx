// The projector's side of a fill-the-gaps question (plan item `f<n>`, src/core/lessonFill.ts): the code with its gaps, how many phones
// answered, and after Reveal the share fully right, the share right per gap, the most common wrong answer per gap, and the filled query
// to run on the demo shop. There is no hands fallback: the answers come from phones only.
import { useEffect, useState } from 'react'
import type { Table } from 'apache-arrow'
import { Loader2, Play } from 'lucide-react'
import { ApiError, fillRead } from '../core/voteApi'
import { answeredText, splitTemplate, wrongText, type FillRow, type FillStats } from '../core/lessonFill'
import { errorLine, PICK_ROWS } from '../core/lesson'
import { TEACHER_POLL_MS } from '../core/voting'
import { Grid } from './PracticeBook'
import { useRoom } from './LessonRoom'
import { runPracticeQuery } from './store'

/** The room's fill answers for one question, polled while the room is live: rows, "0003 not run" and "cannot reach". */
export function useFillRead(key: string): { rows: FillRow[]; missing: boolean; failed: boolean } {
  const room = useRoom()
  const code = room?.state.phase === 'live' ? room.state.code : null
  const secret = room?.state.secret ?? null
  const [rows, setRows] = useState<FillRow[]>([])
  const [missing, setMissing] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setRows([])
    setMissing(false)
    setFailed(false)
    if (!code || !secret) return
    let off = false
    const tick = async () => {
      try {
        const r = await fillRead(code, secret, key)
        if (off) return
        setRows(r)
        setMissing(false)
        setFailed(false)
      } catch (e) {
        if (off) return
        if (e instanceof ApiError && e.kind === 'not-set-up') setMissing(true)
        else setFailed(true) // the last counts stay
      }
    }
    void tick()
    const id = setInterval(() => void tick(), TEACHER_POLL_MS)
    return () => {
      off = true
      clearInterval(id)
    }
  }, [code, secret, key])
  return { rows, missing, failed }
}

/** The query with its gaps: empty boxes, or the given words in them (the right ones after Reveal). */
export function FillCode({ template, words }: { template: string; words: readonly string[] | null }) {
  const parts = splitTemplate(template)
  return (
    <pre className="mono fill-code fill-code-board" data-testid="fill-code">
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span className={`fill-gap${words ? ' filled right' : ''}`} data-testid={`fill-gap-${i + 1}`}>
              {words ? words[i] : ''}
            </span>
          )}
        </span>
      ))}
    </pre>
  )
}

/** After Reveal: what the phones did. Nothing is divided by 0: no answers is a sentence, not percentages. */
export function FillStatsPanel({ stats, live }: { stats: FillStats; live: boolean }) {
  if (!live)
    return (
      <p className="lesson-muted" data-testid="fill-offline">
        Phones are needed for this question: start phone voting before the question to see what the room answered.
      </p>
    )
  if (stats.total === 0)
    return (
      <p className="lesson-muted" data-testid="fill-noanswers">
        No answers yet.
      </p>
    )
  return (
    <div className="fill-stats" data-testid="fill-stats">
      <div className="fill-fully" data-testid="fill-fully">
        <b>{stats.fullyPct}%</b> got every gap right <span className="lesson-muted">({stats.fully.toLocaleString('en-US')} of {stats.total.toLocaleString('en-US')})</span>
      </div>
      {stats.gaps.map((g, i) => (
        <div key={i} className="lesson-barrow fill-gaprow" data-testid={`fill-stat-${i + 1}`}>
          <b className="lesson-letter">{i + 1}</b>
          <div className="lesson-bartrack">
            <div className="lesson-barfill right" style={{ width: `${g.rightPct ?? 0}%` }} />
          </div>
          <span className="lesson-barnum">{g.rightPct}% right</span>
          <span className="fill-wrong mono" data-testid={`fill-wrong-${i + 1}`}>
            {g.wrong ? wrongText(g.wrong) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/** "N phones answered" under the code, or why there is no count. */
export function FillPhones({ total, live, missing, failed, open }: { total: number; live: boolean; missing: boolean; failed: boolean; open: boolean }) {
  if (!live)
    return (
      <p className="lesson-muted" data-testid="fill-need-phones">
        This question needs phones: press Start phone voting. There is no hand count for gaps.
      </p>
    )
  if (missing)
    return (
      <p className="lesson-lost" role="status" data-testid="fill-missing">
        Run supabase/0003 to collect fill answers.
      </p>
    )
  return (
    <div className="lesson-phonehead" data-testid="fill-phones">
      <b data-testid="fill-total">{answeredText(total)}</b> <span className="lesson-muted">{open ? ' · open' : ' · closed'}</span>
      {failed && (
        <span className="lesson-muted" role="status">
          {' '}
          · cannot reach the room, the last count stays
        </span>
      )}
    </div>
  )
}

/** The filled query and a button that runs it on the demo shop. */
export function FilledQuery({ sql }: { sql: string }) {
  const [state, setState] = useState<{ status: 'idle' } | { status: 'running' } | { status: 'error'; text: string } | { status: 'rows'; table: Table; total: number }>({ status: 'idle' })
  const run = async () => {
    setState({ status: 'running' })
    try {
      const { table } = await runPracticeQuery(sql, 'lesson-fill', () => false)
      setState({ status: 'rows', table: table.slice(0, PICK_ROWS), total: table.numRows })
    } catch (e) {
      setState({ status: 'error', text: errorLine(e instanceof Error ? e.message : String(e)) })
    }
  }
  return (
    <div className="fill-run" data-testid="fill-filled">
      <pre className="mono fill-sql">{sql}</pre>
      <button className="btn btn-primary" onClick={() => void run()} disabled={state.status === 'running'} data-testid="fill-run">
        {state.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run on the demo shop
      </button>
      {state.status === 'error' && (
        <div className="lesson-pick-err" data-testid="fill-run-error">
          <b>Error:</b> {state.text}
        </div>
      )}
      {state.status === 'rows' && (
        <div data-testid="fill-run-rows">
          <div className="lesson-pick-ok">
            <b>{state.total === 0 ? '0 rows.' : `${state.total.toLocaleString('en-US')} row${state.total === 1 ? '' : 's'}${state.total > PICK_ROWS ? `, the first ${PICK_ROWS} shown` : ''}.`}</b>
          </div>
          {state.table.numRows > 0 && <Grid table={state.table} />}
        </div>
      )}
    </div>
  )
}
