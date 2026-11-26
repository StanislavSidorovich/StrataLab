// The teacher's side of phone voting (src/core/voting.ts holds the rules): one room per lesson plan or single vote link, kept in
// the browser for a day, polled every 2 s. The room follows the question on the screen. Without a room, nothing here shows and
// the hand counts work as before.
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { Loader2, QrCode as QrCodeIcon, Smartphone } from 'lucide-react'
import { ApiError, createRoom, revealQuestion, roomState, setQuestion } from '../core/voteApi'
import { dropRoom, loadRooms, safeStore, saveRoom } from '../core/voteStorage'
import { TEACHER_POLL_MS, teacherReduce, teacherStart, voteLink, type RoomQuestion, type TeacherState } from '../core/voting'
import { QrCode } from './QrCode'

const store = safeStore(() => localStorage)

export interface RoomApi {
  state: TeacherState
  current: RoomQuestion | null
  start: () => void
  end: () => void
  /** the teacher pressed Reveal on this question */
  reveal: (key: string) => void
  /** the QR is folded away (phones already in follow the screen on their own); the top bar's chip still shows the code */
  qrHidden: boolean
  setQrHidden: (hidden: boolean) => void
}

const RoomContext = createContext<RoomApi | null>(null)
export const RoomProvider = RoomContext.Provider
/** The room of this lesson; null on a screen that has none (a task link, the plan builder). */
export const useRoom = () => useContext(RoomContext)

export function useTeacherRoom(roomKey: string | null, current: RoomQuestion | null): RoomApi | null {
  const [state, dispatch] = useReducer(teacherReduce, undefined, teacherStart)
  const [qrHidden, setQrHidden] = useState(false)
  const cur = useRef(current)
  cur.current = current
  const secret = useRef<string | null>(null)
  secret.current = state.secret
  const pendingReveal = useRef<string | null>(null)
  const inflight = useRef(false)

  // another lesson, another room: the saved one for this lesson (if less than a day old) is picked up
  useEffect(() => {
    dispatch({ t: 'end' })
    pendingReveal.current = null
    if (!roomKey) return
    const r = loadRooms(store)[roomKey]
    if (r) dispatch({ t: 'resume', code: r.code, secret: r.secret })
  }, [roomKey])

  const code = state.phase === 'live' ? state.code : null
  const tick = useCallback(async () => {
    if (!code || inflight.current) return
    inflight.current = true
    try {
      const room = await roomState(code)
      if (!room) {
        if (roomKey) dropRoom(store, roomKey)
        dispatch({ t: 'poll', room: null })
        return
      }
      dispatch({ t: 'poll', room })
      const want = cur.current
      const s = secret.current
      if (!s) return
      // the room is on another question than the screen: tell it (a failed call is tried again at the next poll)
      if ((room.q_key ?? null) !== (want?.key ?? null) || (want && room.q_label !== want.label)) await setQuestion(code, s, want?.key ?? null, want?.label ?? null)
      else if (pendingReveal.current && room.q_key === pendingReveal.current && room.open) await revealQuestion(code, s, pendingReveal.current)
    } catch {
      dispatch({ t: 'pollFailed' })
    } finally {
      inflight.current = false
    }
  }, [code, roomKey])

  useEffect(() => {
    if (!code) return
    void tick()
    const id = setInterval(() => void tick(), TEACHER_POLL_MS)
    return () => clearInterval(id)
  }, [code, tick])

  // the screen moved to another question: say so at once, not at the next poll
  const wantKey = current?.key ?? null
  const wantLabel = current?.label ?? null
  useEffect(() => {
    if (!code || !secret.current) return
    void setQuestion(code, secret.current, wantKey, wantLabel).then(() => tick(), () => undefined)
  }, [code, wantKey, wantLabel, tick])

  const start = useCallback(() => {
    if (!roomKey) return
    dispatch({ t: 'start' })
    createRoom().then(
      (r) => {
        if (!saveRoom(store, roomKey, { code: r.code, secret: r.secret, created: Date.now() })) dispatch({ t: 'storageBlocked' })
        dispatch({ t: 'created', code: r.code, secret: r.secret })
      },
      (e) => dispatch({ t: 'createFailed', reason: e instanceof ApiError && (e.kind === 'busy' || e.kind === 'not-set-up') ? e.kind : 'network' }),
    )
  }, [roomKey])

  const end = useCallback(() => {
    if (roomKey) dropRoom(store, roomKey)
    pendingReveal.current = null
    setQrHidden(false)
    dispatch({ t: 'end' })
  }, [roomKey])

  const reveal = useCallback(
    (key: string) => {
      pendingReveal.current = key
      if (code && secret.current) void revealQuestion(code, secret.current, key).then(() => tick(), () => undefined)
    },
    [code, tick],
  )

  if (!roomKey) return null
  return { state, current, start, end, reveal, qrHidden, setQrHidden }
}

const NOTICE: Record<string, string> = {
  busy: 'Too many rooms were opened in the last hour. Try again in a few minutes, or count hands.',
  'not-set-up': 'Phone voting is not set up yet. Count hands.',
  network: 'Could not start phone voting (no connection?). Count hands.',
  ended: 'That voting room has ended. Start a new one, or count hands.',
  storage: 'This browser will not keep the room, so it lasts until you reload this page.',
}

/** The block beside the options: Start phone voting, then the code with its QR. */
export function RoomSide() {
  const room = useRoom()
  if (!room) return null
  const { state, current } = room
  const link = state.code ? voteLink(location.origin, state.code) : ''
  return (
    <div className="lesson-room" data-testid="lesson-room">
      {state.phase === 'live' && state.code ? (
        <>
          <div className="lesson-room-code mono" data-testid="room-code">
            {state.code}
          </div>
          <QrCode text={link} label={`QR code for ${link}`} />
          <div className="lesson-muted lesson-room-link mono">{link.replace(/^https?:\/\//, '')}</div>
          {!current && <div className="lesson-muted">No vote on this screen.</div>}
          <div className="lesson-room-actions">
            <button className="btn btn-ghost" onClick={() => room.setQrHidden(true)} data-testid="room-hide" title="Phones already in follow the screen. The code stays in the top bar; click it to bring the QR back.">
              Hide QR
            </button>
            <button className="btn btn-ghost" onClick={room.end} data-testid="room-end">
              End voting
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" onClick={room.start} disabled={state.phase === 'creating'} data-testid="room-start">
          {state.phase === 'creating' ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />} Start phone voting
        </button>
      )}
      {state.notice && (
        <div className="lesson-muted lesson-room-note" role="status" data-testid="room-notice">
          {NOTICE[state.notice]}
        </div>
      )}
    </div>
  )
}

/** A small chip in the lesson's top bar, so the code stays at hand on screens without a vote. */
export function RoomChip() {
  const room = useRoom()
  if (!room || room.state.phase !== 'live' || !room.state.code) return null
  if (room.qrHidden) {
    return (
      <button className="lesson-chip mono lesson-chip-btn" title="Phone voting is on. Show the QR again" onClick={() => room.setQrHidden(false)} data-testid="room-chip">
        <Smartphone size={13} /> {room.state.code} <QrCodeIcon size={13} />
      </button>
    )
  }
  return (
    <span className="lesson-chip mono" title="Phone voting is on" data-testid="room-chip">
      <Smartphone size={13} /> {room.state.code}
    </span>
  )
}
