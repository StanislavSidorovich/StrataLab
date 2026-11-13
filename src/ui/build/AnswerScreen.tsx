// Step 5 of the build page: the Answer (spec 5.4). Three questions from the Head of Sales; the learner reads the numbers
// off the dashboard and types them. The step is done when all three are right.
import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react'
import { answersDone, checkAnswer, type AnswerResult } from '../../core/buildDashboard'
import { moreCount } from '../../core/buildMore'
import type { BuildWork } from '../../core/buildSteps'
import { ANSWERS, BUILD_RETURN_URL, MORE_IDS, type AnswerId, type AnswerQuestion } from '../../data/build/kaiyoSales'
import { CountInQuaera } from './CountInQuaera'
import { DashCopy } from './DashCopy'
import { FillButton, useDemo } from './DemoContext'
import { ReviewChecks } from './ReviewChecks'
import './dashboard.css'
import './more.css'

interface Props {
  work: BuildWork
  setWork: (f: (w: BuildWork) => BuildWork) => void
  ready: boolean
  /** opens the optional step More */
  onMore: () => void
}

export function AnswerScreen({ work, setWork, ready, onMore }: Props) {
  const [results, setResults] = useState<Partial<Record<AnswerId, AnswerResult>>>({})
  const { answers, answered } = work.dash
  const { demo } = useDemo()

  const edit = (id: AnswerId, patch: Partial<{ pick: string; number: string }>) =>
    setWork((w) => ({ ...w, dash: { ...w.dash, answers: { ...w.dash.answers, [id]: { ...w.dash.answers[id], ...patch } } } }))
  const check = (id: AnswerId) => {
    const r = checkAnswer(id, answers[id])
    setResults((x) => ({ ...x, [id]: r }))
    setWork((w) => ({ ...w, dash: { ...w.dash, answered: ANSWERS.map((q) => q.id).filter((a) => (a === id ? r.ok : w.dash.answered.includes(a))) } }))
  }

  return (
    <div className="space-y-4" data-testid="build-answer">
      <p className="build-lead">The Head of Sales asked: “How are we selling this year, and which chain is carrying it?” Read your dashboard and answer in numbers.</p>
      <div className="ba-layout">
        <DashCopy work={work} ready={ready} />
        <ol className="ba-list ba-main">
          {ANSWERS.map((q) => (
            <Question key={q.id} q={q} passed={answered.includes(q.id)} value={answers[q.id]} result={results[q.id]} onEdit={(p) => edit(q.id, p)} onCheck={() => check(q.id)} />
          ))}
        </ol>
      </div>
      {answersDone(answered) && (
        <div className="build-quick" data-testid="answer-done">
          <b>You built it.</b> From four raw files to a number, a month and a chain, with every step yours: connected, cleaned, modelled, shown. Minori carries the first half of 2026.
          <div className="more-cards">
            {!demo && <div className="more-card" data-testid="answer-card-quaera">
              <div className="more-card-title">Back to Quaera</div>
              <div className="build-muted">Next there: the SQL track on GROUP BY and JOIN, the same moves you just made.</div>
              <CountInQuaera url={BUILD_RETURN_URL} primary testid="answer-count" />
            </div>}
            <div className="more-card" data-testid="answer-card-more">
              <div className="more-card-title">Keep going here: six more questions from the Head of Sales</div>
              <div className="build-muted">Answer them with SQL you write yourself (the last one with the slicers), and pin the results to your dashboard. {moreCount(work.more)} of {MORE_IDS.length} done.</div>
              <div className="build-muted">Needs JOIN and GROUP BY; the Quaera SQL track teaches them.</div>
              <button className={`btn${demo ? ' btn-primary' : ''}`} onClick={onMore} data-testid="answer-more">
                {moreCount(work.more) > 0 ? 'Continue' : 'Start'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
      {answersDone(answered) && <ReviewChecks work={work} setWork={setWork} ready={ready} />}
    </div>
  )
}

function Question({ q, passed, value, result, onEdit, onCheck }: {
  q: AnswerQuestion
  passed: boolean
  value: { pick: string; number: string }
  result?: AnswerResult
  onEdit: (p: Partial<{ pick: string; number: string }>) => void
  onCheck: () => void
}) {
  return (
    <li className={`ba-q${passed ? ' is-passed' : ''}`} data-testid={`answer-${q.id}`}>
      <div className="font-semibold">
        {q.id}. {q.question}
      </div>
      <div className="ba-fields">
        {q.options && (
          <label>
            {q.pickLabel}
            <select className="build-select" value={value.pick} onChange={(e) => onEdit({ pick: e.target.value })} data-testid={`answer-pick-${q.id}`}>
              <option value="">Choose…</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {q.numberLabel}
          <input
            className="ba-num"
            inputMode="decimal"
            autoComplete="off"
            value={value.number}
            onChange={(e) => onEdit({ number: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onCheck()}
            data-testid={`answer-number-${q.id}`}
          />
        </label>
        <button className="btn btn-primary" onClick={onCheck} data-testid={`answer-check-${q.id}`}>
          <CheckCircle2 size={14} /> Check
        </button>
        <FillButton unit={{ step: 'answer', q: q.id }} hidden={passed} />
        {passed && (
          <span className="build-ok">
            <Check size={14} /> Right
          </span>
        )}
      </div>
      {result && !result.ok && (
        <div className="build-error" role="alert" data-testid={`answer-line-${q.id}`}>
          {result.line}
        </div>
      )}
    </li>
  )
}
