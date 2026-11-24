// Phone voting for lesson mode (hidden, see lesson.ts). Pure: no fetch, no storage, no React.
// A teacher opens a room (`#vote=K7M2P` is what the phones open), the room's current question follows the teacher's screen,
// phones send one letter, the teacher sees counts. The server side is `supabase/0001_lesson_voting.sql`; the fetch calls are in voteApi.ts.
import { LETTERS, handShares, type HandShare, type Letter } from './lesson'

// ------------------------------------------------------------------ room codes and addresses

/** No 0, O, 1, I or L: a code read off a projector cannot be mistyped for another. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5

/** A code from `rand` (a function giving 0 ≤ x < 1). The real codes come from the server; this is for tests and the offline look. */
export function generateRoomCode(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_ALPHABET[Math.min(ROOM_ALPHABET.length - 1, Math.floor(rand() * ROOM_ALPHABET.length))]
  return s
}

/** What a person typed or a link held, as a room code: upper case, spaces, dashes and dots dropped; null when it is not a code. */
export function normaliseRoomCode(raw: string | null | undefined): string | null {
  const t = (raw ?? '').toUpperCase().replace(/[\s\-_.]+/g, '')
  return t.length === ROOM_CODE_LENGTH && [...t].every((c) => ROOM_ALPHABET.includes(c)) ? t : null
}

/** Is this address the phone page? (`#vote`, `#vote=`, `#vote=K7M2P`, `#VOTE=k7m2p&x=1`). Decided before anything heavy is loaded. */
export const isVoteHash = (hash: string): boolean => /^#vote(?:=|&|$)/i.test(hash.trim())

/** The code in a phone address: a code, or null when there is none or it is not one (the page then asks for it). */
export function voteCodeFromHash(hash: string): string | null {
  const m = /^#vote=([^&]*)/i.exec(hash.trim())
  if (!m) return null
  let v = m[1]
  try {
    v = decodeURIComponent(v)
  } catch {
    /* use as written */
  }
  return normaliseRoomCode(v)
}

export const voteHash = (code: string): string => `#vote=${code}`

/** The link a phone opens, on whatever host the teacher is on. */
export const voteLink = (origin: string, code: string): string => `${origin}/${voteHash(code)}`

// ------------------------------------------------------------------ what the server tells

export type Counts = Record<Letter, number>
export const emptyCounts = (): Counts => ({ A: 0, B: 0, C: 0, D: 0 })

/** The room as `lesson_room_state` returns it. */
export interface RoomState {
  q_key: string | null
  q_label: string | null
  open: boolean
  counts: Counts
  total: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

/** The server's answer made safe: null for an unknown or expired room (or anything that is not a room). */
export function parseRoomState(raw: unknown): RoomState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const c = (r.counts && typeof r.counts === 'object' ? r.counts : {}) as Record<string, unknown>
  const counts: Counts = { A: num(c.A), B: num(c.B), C: num(c.C), D: num(c.D) }
  const key = typeof r.q_key === 'string' && r.q_key ? r.q_key : null
  return {
    q_key: key,
    q_label: key && typeof r.q_label === 'string' ? r.q_label : null,
    open: key !== null && r.open === true,
    counts,
    total: LETTERS.reduce((a, l) => a + counts[l], 0),
  }
}

/** Bars from the server's counts: null when nobody voted (0 votes: no bars, no division by 0). */
export function sharesFromCounts(counts: Counts | null | undefined): HandShare[] | null {
  if (!counts) return null
  return handShares(LETTERS.map((l) => String(counts[l] ?? 0)))
}

/** The room's question key while the results slide of a plan is shown (the plan item `r`). */
export const RESULTS_KEY = 'r'

/** `lesson_room_summary`: `[{q_key, counts, total}]` as a map from question key to counts; null when it is not that shape. */
export function parseSummary(raw: unknown): Record<string, Counts> | null {
  if (!Array.isArray(raw)) return null
  const out: Record<string, Counts> = {}
  for (const row of raw) {
    const r = parseRoomState({ q_key: (row as { q_key?: unknown })?.q_key, counts: (row as { counts?: unknown })?.counts })
    if (r?.q_key) out[r.q_key] = r.counts
  }
  return out
}

export const votesText = (n: number): string => `${n.toLocaleString('en-US')} vote${n === 1 ? '' : 's'}`

export const parseLetter = (raw: unknown): Letter | null => (typeof raw === 'string' && (LETTERS as readonly string[]).includes(raw.toUpperCase()) ? (raw.toUpperCase() as Letter) : null)

// ------------------------------------------------------------------ the question a room follows

export interface RoomQuestion {
  key: string
  label: string
}

/** Caps the server holds too (kept here so the text can say them). */
export const LIMITS = { tokens: 300, changes: 20, roomsPerHour: 30, hours: 24 } as const
export const ROOM_LIFE_MS = LIMITS.hours * 3600_000
export const TEACHER_POLL_MS = 2000
export const PHONE_POLL_MS = 2500
export const REQUEST_TIMEOUT_MS = 8000
/** Failed polls in a row before the teacher is told to count hands. */
export const LOST_AFTER = 3

/** The room a lesson address shares: one per plan (its items in order, not the position) or per single vote set; none elsewhere. */
export const roomKeyForPlan = (itemKeys: readonly string[]): string => `plan:${itemKeys.join(',')}`
export const roomKeyForSet = (set: string): string => `set:${set}`

// ------------------------------------------------------------------ the teacher's rooms kept in the browser

export interface StoredRoom {
  code: string
  secret: string
  created: number
}
export type StoredRooms = Record<string, StoredRoom>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What was saved, read back: bad entries and rooms older than a day are dropped (the server forgets them too). */
export function readStoredRooms(raw: string | null, now: number): StoredRooms {
  let p: unknown
  try {
    p = raw ? JSON.parse(raw) : null
  } catch {
    return {}
  }
  if (!p || typeof p !== 'object') return {}
  const out: StoredRooms = {}
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const r = v as Partial<StoredRoom> | null
    if (r && typeof r.code === 'string' && normaliseRoomCode(r.code) && typeof r.secret === 'string' && UUID.test(r.secret) && typeof r.created === 'number' && r.created <= now + 60_000 && now - r.created < ROOM_LIFE_MS) out[k] = { code: r.code, secret: r.secret, created: r.created }
  }
  return out
}

// ------------------------------------------------------------------ the teacher's side: a small state machine

export type TeacherNotice = null | 'busy' | 'not-set-up' | 'network' | 'ended' | 'storage'

export interface TeacherState {
  phase: 'idle' | 'creating' | 'live'
  code: string | null
  secret: string | null
  /** what the server says the room is on now */
  q_key: string | null
  q_label: string | null
  open: boolean
  counts: Counts
  total: number
  /** failed polls in a row */
  failures: number
  /** three failed polls: the hand counts are offered again */
  lost: boolean
  notice: TeacherNotice
}

export const teacherStart = (): TeacherState => ({ phase: 'idle', code: null, secret: null, q_key: null, q_label: null, open: false, counts: emptyCounts(), total: 0, failures: 0, lost: false, notice: null })

export type TeacherEvent =
  | { t: 'start' }
  | { t: 'created'; code: string; secret: string }
  | { t: 'createFailed'; reason: Exclude<TeacherNotice, null | 'ended' | 'storage'> }
  | { t: 'resume'; code: string; secret: string }
  | { t: 'poll'; room: RoomState | null }
  | { t: 'pollFailed' }
  | { t: 'storageBlocked' }
  | { t: 'end' }

export function teacherReduce(s: TeacherState, e: TeacherEvent): TeacherState {
  switch (e.t) {
    case 'start':
      return s.phase === 'idle' ? { ...teacherStart(), phase: 'creating' } : s
    case 'created':
    case 'resume':
      return { ...teacherStart(), phase: 'live', code: e.code, secret: e.secret, notice: s.notice === 'storage' ? 'storage' : null }
    case 'createFailed':
      return s.phase === 'creating' ? { ...teacherStart(), notice: e.reason } : s
    case 'poll':
      if (s.phase !== 'live') return s
      if (!e.room) return { ...teacherStart(), notice: 'ended' } // unknown or older than a day: the room is gone
      return { ...s, q_key: e.room.q_key, q_label: e.room.q_label, open: e.room.open, counts: e.room.counts, total: e.room.total, failures: 0, lost: false }
    case 'pollFailed': {
      if (s.phase !== 'live') return s
      const failures = s.failures + 1
      return { ...s, failures, lost: failures >= LOST_AFTER }
    }
    case 'storageBlocked':
      return { ...s, notice: 'storage' }
    case 'end':
      return teacherStart()
  }
}

/** Bars and the count for the question the teacher is on now: none while the room is on another question or has none. */
export function teacherView(s: TeacherState, current: RoomQuestion | null): { here: boolean; open: boolean; total: number; shares: HandShare[] | null } {
  const here = s.phase === 'live' && !!current && s.q_key === current.key
  return { here, open: here && s.open, total: here ? s.total : 0, shares: here ? sharesFromCounts(s.counts) : null }
}

/** True when the room must be told about the question (or that there is none): the server is on another one. */
export const needsQuestion = (s: TeacherState, current: RoomQuestion | null): boolean => s.phase === 'live' && (s.q_key ?? null) !== (current?.key ?? null)

// ------------------------------------------------------------------ the phone's side

export type PhoneStatus = 'loading' | 'ended' | 'none' | 'results' | 'open' | 'voted' | 'closed' | 'offline'
export type SendProblem = 'network' | 'closed' | 'full' | 'limit' | 'ended' | 'busy' | null

export interface PhoneState {
  /** undefined: not heard yet; null: the room is unknown or gone */
  room: RoomState | null | undefined
  failures: number
  /** the phone's own votes, by question key */
  mine: Record<string, Letter>
  sending: Letter | null
  problem: SendProblem
}

export const phoneStart = (mine: Record<string, Letter> = {}): PhoneState => ({ room: undefined, failures: 0, mine, sending: null, problem: null })

export type PhoneEvent = { t: 'poll'; room: RoomState | null } | { t: 'pollFailed' } | { t: 'sending'; letter: Letter } | { t: 'sent'; key: string; letter: Letter } | { t: 'sendFailed'; problem: Exclude<SendProblem, null> }

export function phoneReduce(s: PhoneState, e: PhoneEvent): PhoneState {
  switch (e.t) {
    case 'poll':
      return { ...s, room: e.room, failures: 0, problem: s.problem === 'network' ? null : s.problem }
    case 'pollFailed':
      return { ...s, failures: s.failures + 1 }
    case 'sending':
      return s.sending ? s : { ...s, sending: e.letter, problem: null }
    case 'sent':
      return { ...s, sending: null, problem: null, mine: { ...s.mine, [e.key]: e.letter } }
    case 'sendFailed':
      return { ...s, sending: null, problem: e.problem }
  }
}

export function phoneStatus(s: PhoneState): PhoneStatus {
  if (s.room === undefined) return s.failures > 0 ? 'offline' : 'loading'
  if (s.room === null) return 'ended'
  if (!s.room.q_key) return 'none'
  if (s.room.q_key === RESULTS_KEY) return 'results' // the results slide is on the screen: nothing to vote on
  if (!s.room.open) return 'closed'
  return s.mine[s.room.q_key] ? 'voted' : 'open'
}

/** The banner while polls fail on a page that already has a room. */
export const phoneOffline = (s: PhoneState): boolean => s.room !== undefined && s.failures > 0

/** The phone's own letter for the question it shows, if any. */
export const phoneMine = (s: PhoneState): Letter | null => (s.room && s.room.q_key ? (s.mine[s.room.q_key] ?? null) : null)

export const PROBLEM_TEXT: Record<Exclude<SendProblem, null>, string> = {
  network: 'Not sent, tap again.',
  closed: 'This vote has just closed. Look at the screen.',
  full: 'The room is full (300 phones). Raise your hand instead.',
  limit: 'You have changed your vote too many times.',
  ended: 'This vote has ended or the code is wrong.',
  busy: 'Not sent, tap again.',
}
