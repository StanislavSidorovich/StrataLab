// What the phone shows once a question is closed (the teacher pressed Reveal): the student's own answer, right or wrong, and why.
// No tables or row counts here (those stay on the projector). Loaded with a dynamic import by VotePage only when a question is closed,
// so the answer key (right index, the options' "why", lessonFillAnswers) is not in the phone's first bundle.
import { useMemo, type ReactNode } from 'react'
import { LETTERS } from '../core/lesson'
import { allRight, checkAnswers, fillQuery } from '../core/lessonFill'
import { voteOutcome, type PhoneFill, type PhoneVote } from '../core/lessonPhone'
import { phoneItems } from '../data/lessonPhone'

const Code = ({ children }: { children: string }) => <pre className="phone-code mono">{children}</pre>

function Verdict({ kind }: { kind: 'right' | 'wrong' | 'none' }) {
  if (kind === 'right') return <p className="phone-verdict ok" data-testid="phone-verdict">✓ Right</p>
  if (kind === 'wrong') return <p className="phone-verdict bad" data-testid="phone-verdict">✗ Not this one</p>
  return <p className="phone-verdict none" data-testid="phone-verdict">You did not answer</p>
}

function VoteResult({ item, mine }: { item: PhoneVote; mine: string | null }) {
  const outcome = voteOutcome(mine, item.right)
  const right = item.options[item.right]
  const rightLetter = LETTERS[item.right]
  const mineIdx = mine ? 'ABCD'.indexOf(mine) : -1
  const picked = mineIdx >= 0 ? item.options[mineIdx] : null
  return (
    <div data-testid="phone-result" data-outcome={outcome}>
      <Verdict kind={outcome} />
      {outcome === 'wrong' && picked && (
        <>
          <p className="phone-pick">
            Your answer: <b>{mine}</b>
          </p>
          <Code>{picked.text}</Code>
          <p className="phone-why" data-testid="phone-why">{picked.why ?? item.why}</p>
          {picked.mssql && (
            <div className="phone-err" data-testid="phone-err" role="note">
              <b>In SQL Server:</b> {picked.mssql}
            </div>
          )}
          <p className="phone-pick">
            The right answer: <b>{rightLetter}</b>
          </p>
          <Code>{right.text}</Code>
        </>
      )}
      {outcome === 'right' && (
        <>
          <p className="phone-pick">
            Your answer: <b>{rightLetter}</b>
          </p>
          <Code>{right.text}</Code>
          <p className="phone-why" data-testid="phone-why">{right.why ?? item.why}</p>
        </>
      )}
      {outcome === 'none' && (
        <>
          <p className="phone-pick">
            The right answer: <b>{rightLetter}</b>
          </p>
          <Code>{right.text}</Code>
          <p className="phone-why" data-testid="phone-why">{right.why ?? item.why}</p>
        </>
      )}
    </div>
  )
}

function FillResult({ item, mine }: { item: PhoneFill; mine: string[] | null }) {
  const words = item.accepted.map((a) => a[0])
  const marks = mine && mine.length === words.length ? checkAnswers(item.accepted, mine) : null
  const outcome = !mine ? 'none' : marks && allRight(item.accepted, mine) ? 'right' : 'wrong'
  return (
    <div data-testid="phone-result" data-outcome={outcome}>
      <Verdict kind={outcome} />
      {outcome === 'wrong' && mine && (
        <ul className="phone-gaps" data-testid="phone-gaps">
          {words.map((w, i) => {
            const ok = !!marks?.[i]
            return (
              <li key={i} className={ok ? 'ok' : 'bad'}>
                <span className="phone-gap-n">Gap {i + 1}</span> <b className="mono">{mine[i] ?? ''}</b> {ok ? '✓' : <>✗ <span className="phone-gap-right">right: <b className="mono">{w}</b></span></>}
              </li>
            )
          })}
        </ul>
      )}
      {outcome === 'none' && <p className="phone-pick">The right words: <b className="mono">{words.join(' · ')}</b></p>}
      <Code>{fillQuery(item.template, words)}</Code>
      <p className="phone-why" data-testid="phone-why">{item.why}</p>
    </div>
  )
}

/**
 * The closed question's body for a phone: `qkey` is the room's key (`d7`, `f3`, `w5`), `mine` the letter the phone sent, `mineFill` the words.
 * A question with no known item (an old link, a key from another version) shows `fallback` and nothing else, so nothing can crash here.
 */
export function PhoneResult({ qkey, mine, mineFill, fallback }: { qkey: string; mine: string | null; mineFill: string[] | null; fallback: ReactNode }) {
  const items = useMemo(() => phoneItems(), [])
  const item = items[qkey]
  if (!item) return <>{fallback}</>
  return item.kind === 'vote' ? <VoteResult item={item} mine={mine} /> : <FillResult item={item} mine={mineFill} />
}
