// The fetch calls of phone voting: plain `fetch` to Supabase's `/rest/v1/rpc/<function>`, no supabase-js, an 8 s timeout, errors
// sorted into the few kinds the screens speak about. The functions are in supabase/0001_lesson_voting.sql.
import type { Letter } from './lesson'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './voteConfig'
import { REQUEST_TIMEOUT_MS, parseRoomState, type RoomState } from './voting'

export type ApiErrorKind = 'network' | 'not-set-up' | 'busy' | 'server'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  constructor(kind: ApiErrorKind, message?: string) {
    super(message ?? kind)
    this.kind = kind
  }
}

type Fetch = typeof fetch

/** Calls one SQL function and gives its JSON result. 404 (the function is not there yet) is `not-set-up`; no answer in time is `network`. */
export async function rpc(fn: string, args: Record<string, unknown>, f: Fetch = (...a) => fetch(...a), timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  let res: Response
  try {
    res = await f(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify(args),
      signal: ctl.signal,
    })
  } catch {
    throw new ApiError('network')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 404) throw new ApiError('not-set-up')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (/PGRST202|Could not find the function|42883/.test(body)) throw new ApiError('not-set-up')
    throw new ApiError('server', body.slice(0, 200))
  }
  try {
    return await res.json()
  } catch {
    throw new ApiError('server', 'unreadable answer')
  }
}

export interface CreatedRoom {
  code: string
  secret: string
}

export async function createRoom(f?: Fetch): Promise<CreatedRoom> {
  const r = (await rpc('lesson_create_room', {}, f)) as { code?: unknown; secret?: unknown; error?: unknown } | null
  if (r && r.error === 'busy') throw new ApiError('busy')
  if (!r || typeof r.code !== 'string' || typeof r.secret !== 'string') throw new ApiError('server', 'no room')
  return { code: r.code, secret: r.secret }
}

export const setQuestion = (code: string, secret: string, key: string | null, label: string | null, f?: Fetch) => rpc('lesson_set_question', { p_code: code, p_secret: secret, p_q_key: key, p_q_label: label }, f)

export const revealQuestion = (code: string, secret: string, key: string, f?: Fetch) => rpc('lesson_reveal', { p_code: code, p_secret: secret, p_q_key: key }, f)

export async function roomState(code: string, f?: Fetch): Promise<RoomState | null> {
  return parseRoomState(await rpc('lesson_room_state', { p_code: code }, f))
}

export type CastResult = 'ok' | 'closed' | 'unknown' | 'room_full' | 'too_many_changes'

export async function castVote(code: string, key: string, token: string, letter: Letter, f?: Fetch): Promise<CastResult> {
  const r = await rpc('lesson_cast_vote', { p_code: code, p_q_key: key, p_token: token, p_letter: letter }, f)
  return r === 'ok' || r === 'closed' || r === 'room_full' || r === 'too_many_changes' ? r : 'unknown'
}
