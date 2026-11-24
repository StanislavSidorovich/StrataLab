// The phone page of lesson voting: `#vote=K7M2P`. Small on purpose: no DuckDB, no store, no App; only fetch and localStorage (with a
// memory fallback), so it opens in a camera app or an in-app browser. Rules: src/core/voting.ts.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { LETTERS, type Letter } from '../core/lesson'
import { ApiError, castVote, roomState } from '../core/voteApi'
import { loadMine, safeStore, saveMine, voterToken } from '../core/voteStorage'
import { PHONE_POLL_MS, PROBLEM_TEXT, isVoteHash, normaliseRoomCode, phoneMine, phoneOffline, phoneReduce, phoneStart, phoneStatus, voteCodeFromHash, voteHash } from '../core/voting'

const store = safeStore(() => localStorage)

export function VotePage() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  // somebody changed the address to something that is not a vote: let the workbench have it
  useEffect(() => {
    if (!isVoteHash(hash)) location.reload()
  }, [hash])
  const code = voteCodeFromHash(hash)
  return (
    <main className="vote-root">
      <header className="vote-head">
        <span className="vote-logo" aria-hidden="true">Q</span>
        <span>Quaera Lab · class vote</span>
      </header>
      {code ? <Room key={code} code={code} /> : <CodeForm bad={/^#vote=[^&]+/i.test(hash)} />}
    </main>
  )
}

function CodeForm({ bad }: { bad: boolean }) {
  const [text, setText] = useState('')
  const code = normaliseRoomCode(text)
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    if (code) location.hash = voteHash(code)
  }
  return (
    <form className="vote-card" onSubmit={go} data-testid="vote-code-form">
      <p className="vote-msg">{bad ? 'That code does not look right.' : 'Type the code from the screen.'}</p>
      <input
        className="vote-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        placeholder="K7M2P"
        aria-label="Room code"
        data-testid="vote-code-input"
      />
      <button className="vote-btn" type="submit" disabled={!code}>
        Join
      </button>
    </form>
  )
}

function Room({ code }: { code: string }) {
  const [s, dispatch] = useReducer(phoneReduce, undefined, () => phoneStart(loadMine(store, code)))
  const tokenRef = useRef<string | null>(null)
  const sending = useRef(false)
  const sRef = useRef(s)
  sRef.current = s

  useEffect(() => {
    let off = false
    const tick = async () => {
      try {
        const room = await roomState(code)
        if (!off) dispatch({ t: 'poll', room })
      } catch (e) {
        // the functions are not in the project yet: nothing can be voted on here, which a phone cannot tell from a wrong code
        if (!off) dispatch(e instanceof ApiError && e.kind === 'not-set-up' ? { t: 'poll', room: null } : { t: 'pollFailed' })
      }
    }
    void tick()
    const id = setInterval(() => void tick(), PHONE_POLL_MS)
    return () => {
      off = true
      clearInterval(id)
    }
  }, [code])

  const status = phoneStatus(s)
  const room = s.room
  const mine = phoneMine(s)

  const vote = useCallback(
    async (letter: Letter) => {
      const key = sRef.current.room?.q_key
      if (!key || sending.current) return
      sending.current = true
      dispatch({ t: 'sending', letter })
      try {
        tokenRef.current ??= voterToken(store)
        const r = await castVote(code, key, tokenRef.current, letter)
        if (r === 'ok') {
          dispatch({ t: 'sent', key, letter })
          saveMine(store, code, { ...sRef.current.mine, [key]: letter })
        } else dispatch({ t: 'sendFailed', problem: r === 'closed' ? 'closed' : r === 'room_full' ? 'full' : r === 'too_many_changes' ? 'limit' : 'ended' })
        if (r === 'closed' || r === 'unknown') void roomState(code).then((rs) => dispatch({ t: 'poll', room: rs }), () => undefined)
      } catch {
        dispatch({ t: 'sendFailed', problem: 'network' })
      } finally {
        sending.current = false
      }
    },
    [code],
  )

  return (
    <>
      {phoneOffline(s) && (
        <div className="vote-offline" role="status" data-testid="vote-offline">
          No connection. Trying again…
        </div>
      )}
      {status === 'loading' && <p className="vote-msg" data-testid="vote-state">Connecting…</p>}
      {status === 'offline' && (
        <p className="vote-msg" data-testid="vote-state">
          Cannot reach the vote. Check your connection.
        </p>
      )}
      {status === 'ended' && (
        <div data-testid="vote-state" data-state="ended">
          <p className="vote-msg">This vote has ended or the code is wrong.</p>
          <CodeForm bad={false} />
        </div>
      )}
      {status === 'none' && (
        <p className="vote-msg" data-testid="vote-state" data-state="none">
          No vote right now, look at the screen.
        </p>
      )}
      {status === 'closed' && room && (
        <div data-testid="vote-state" data-state="closed">
          <h1 className="vote-q">{room.q_label}</h1>
          <p className="vote-msg">Closed, look at the screen.</p>
          {mine && <p className="vote-mine">Your vote: <b>{mine}</b></p>}
        </div>
      )}
      {(status === 'open' || status === 'voted') && room && (
        <div data-testid="vote-state" data-state={status}>
          <h1 className="vote-q">{room.q_label}</h1>
          <div className="vote-letters" role="group" aria-label="Your answer">
            {LETTERS.map((l) => (
              <button key={l} className={`vote-letter${mine === l ? ' on' : ''}`} disabled={!!s.sending} aria-pressed={mine === l} data-testid={`vote-${l}`} onClick={() => void vote(l)}>
                {s.sending === l ? '…' : l}
              </button>
            ))}
          </div>
          {s.problem && (
            <p className="vote-problem" role="alert" data-testid="vote-problem">
              {PROBLEM_TEXT[s.problem]}
            </p>
          )}
          {!s.problem && mine && (
            <p className="vote-mine" data-testid="vote-received">
              Vote received: <b>{mine}</b>. You can change it until the teacher reveals.
            </p>
          )}
          {!s.problem && !mine && <p className="vote-msg">Tap A, B, C or D.</p>}
        </div>
      )}
    </>
  )
}
