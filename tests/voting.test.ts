// Phone voting for lesson mode: codes and addresses, the server's counts as bars, the teacher's and the phone's states, the
// browser storage with a failing localStorage, and the fetch calls (a fake fetch). No network.
import { describe, expect, it, vi } from 'vitest'
import { lessonFromHash } from '../src/core/lesson'
import { ApiError, castVote, createRoom, roomState, rpc } from '../src/core/voteApi'
import { MINE_KEY, ROOMS_KEY, TOKEN_KEY, dropRoom, loadMine, loadRooms, newToken, safeStore, saveMine, saveRoom, voterToken } from '../src/core/voteStorage'
import {
  LOST_AFTER, ROOM_ALPHABET, generateRoomCode, isVoteHash, needsQuestion, normaliseRoomCode, parseRoomState, phoneMine, phoneOffline, phoneReduce, phoneStart, phoneStatus,
  readStoredRooms, roomKeyForPlan, sharesFromCounts, teacherReduce, teacherStart, teacherView, voteCodeFromHash, voteLink, votesText, ROOM_LIFE_MS,
  type PhoneEvent, type RoomState, type TeacherEvent,
} from '../src/core/voting'

const room = (o: Partial<RoomState> = {}): RoomState => ({ q_key: 'v2', q_label: 'Question 2', open: true, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0, ...o })
const UUID = '123e4567-e89b-42d3-a456-426614174000'

describe('voting: room codes', () => {
  it('has an alphabet without 0, O, 1, I and L', () => {
    for (const c of '01OIL') expect(ROOM_ALPHABET).not.toContain(c)
    expect(new Set(ROOM_ALPHABET).size).toBe(ROOM_ALPHABET.length)
  })
  it('generates five characters of the alphabet', () => {
    for (let i = 0; i < 200; i++) expect(normaliseRoomCode(generateRoomCode())).not.toBeNull()
    expect(generateRoomCode(() => 0)).toBe('AAAAA')
    expect(generateRoomCode(() => 0.999999)).toBe('99999')
  })
  it('normalises what a person types: case, spaces, dashes', () => {
    expect(normaliseRoomCode('k7m2p')).toBe('K7M2P')
    expect(normaliseRoomCode(' k7 m2-p ')).toBe('K7M2P')
    expect(normaliseRoomCode('K7M2')).toBeNull()
    expect(normaliseRoomCode('K7M2PX')).toBeNull()
    expect(normaliseRoomCode('K7M20')).toBeNull() // 0 is not in the alphabet
    expect(normaliseRoomCode('K7MIL')).toBeNull()
    expect(normaliseRoomCode('')).toBeNull()
    expect(normaliseRoomCode(null)).toBeNull()
    expect(normaliseRoomCode(undefined)).toBeNull()
  })
})

describe('voting: the phone address', () => {
  it('knows a vote address from any other', () => {
    expect(isVoteHash('#vote=K7M2P')).toBe(true)
    expect(isVoteHash('#vote')).toBe(true)
    expect(isVoteHash('#vote=')).toBe(true)
    expect(isVoteHash('#VOTE=k7m2p&x=1')).toBe(true)
    expect(isVoteHash('#voter=1')).toBe(false)
    expect(isVoteHash('#lesson=sql&set=warmup&q=1')).toBe(false)
    expect(isVoteHash('')).toBe(false)
  })
  it('reads the code, any case, and rejects garbage', () => {
    expect(voteCodeFromHash('#vote=K7M2P')).toBe('K7M2P')
    expect(voteCodeFromHash('#vote=k7m2p&x=1')).toBe('K7M2P')
    expect(voteCodeFromHash('#vote=k7%20m2p')).toBe('K7M2P')
    expect(voteCodeFromHash('#vote= k7-m2p ')).toBe('K7M2P')
    expect(voteCodeFromHash('#vote=')).toBeNull()
    expect(voteCodeFromHash('#vote')).toBeNull()
    expect(voteCodeFromHash('#vote=%E0%A4%A')).toBeNull() // bad escape: no throw
    expect(voteCodeFromHash('#vote=<script>')).toBeNull()
    expect(voteCodeFromHash('#lesson=sql')).toBeNull()
  })
  it('builds the link on the host the teacher is on', () => {
    expect(voteLink('https://lab.quaera.app', 'K7M2P')).toBe('https://lab.quaera.app/#vote=K7M2P')
    expect(voteLink('http://localhost:5181', 'K7M2P')).toBe('http://localhost:5181/#vote=K7M2P')
  })
  it('leaves the old lesson links alone', () => {
    expect(lessonFromHash('#lesson=sql&set=inner-join&mode=vote&q=2')).toEqual({ kind: 'sql', set: 'inner-join', mode: 'vote', n: 2 })
    expect(lessonFromHash('#vote=K7M2P')).toBeNull()
  })
})

describe('voting: counts from the server', () => {
  it('turns counts into percentages; nobody voted gives no bars', () => {
    expect(sharesFromCounts({ A: 0, B: 0, C: 0, D: 0 })).toBeNull()
    expect(sharesFromCounts(null)).toBeNull()
    expect(sharesFromCounts({ A: 1, B: 3, C: 0, D: 0 })).toEqual([
      { letter: 'A', count: 1, pct: 25 },
      { letter: 'B', count: 3, pct: 75 },
      { letter: 'C', count: 0, pct: 0 },
      { letter: 'D', count: 0, pct: 0 },
    ])
  })
  it('says "votes" in the plural, "1 vote" in the singular', () => {
    expect(votesText(0)).toBe('0 votes')
    expect(votesText(1)).toBe('1 vote')
    expect(votesText(1234)).toBe('1,234 votes')
  })
  it('reads the room state safely', () => {
    expect(parseRoomState(null)).toBeNull()
    expect(parseRoomState('x')).toBeNull()
    expect(parseRoomState({ q_key: 'v2', q_label: 'Question 2', open: true, counts: { A: 2, B: 1, C: 'x', D: -4 }, total: 99 })).toEqual(room({ counts: { A: 2, B: 1, C: 0, D: 0 }, total: 3 }))
    expect(parseRoomState({ q_key: null, q_label: 'stale', open: true, counts: {} })).toEqual({ q_key: null, q_label: null, open: false, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 })
    expect(parseRoomState({})?.q_key).toBeNull()
  })
})

const run = (events: TeacherEvent[], from = teacherStart()) => events.reduce(teacherReduce, from)

describe('voting: the teacher state machine', () => {
  it('goes idle → creating → live → question → closed → next', () => {
    let s = teacherStart()
    expect(s.phase).toBe('idle')
    s = teacherReduce(s, { t: 'start' })
    expect(s.phase).toBe('creating')
    s = teacherReduce(s, { t: 'start' }) // a second click while creating changes nothing
    expect(s.phase).toBe('creating')
    s = teacherReduce(s, { t: 'created', code: 'K7M2P', secret: UUID })
    expect(s).toMatchObject({ phase: 'live', code: 'K7M2P', secret: UUID, notice: null })
    s = teacherReduce(s, { t: 'poll', room: room({ counts: { A: 1, B: 2, C: 0, D: 0 }, total: 3 }) })
    expect(teacherView(s, { key: 'v2', label: 'Question 2' })).toMatchObject({ here: true, open: true, total: 3 })
    s = teacherReduce(s, { t: 'poll', room: room({ open: false, counts: { A: 1, B: 2, C: 0, D: 0 }, total: 3 }) })
    expect(teacherView(s, { key: 'v2', label: 'Question 2' })).toMatchObject({ here: true, open: false, total: 3 }) // closed, bars stay
    s = teacherReduce(s, { t: 'poll', room: room({ q_key: 'v3', q_label: 'Question 3' }) })
    expect(teacherView(s, { key: 'v3', label: 'Question 3' })).toMatchObject({ here: true, open: true, total: 0, shares: null })
  })
  it('shows nothing for a question the room is not on, and asks to be told', () => {
    const s = run([{ t: 'start' }, { t: 'created', code: 'K7M2P', secret: UUID }, { t: 'poll', room: room() }])
    expect(teacherView(s, { key: 'v3', label: 'Question 3' })).toMatchObject({ here: false, total: 0, shares: null })
    expect(needsQuestion(s, { key: 'v3', label: 'Question 3' })).toBe(true)
    expect(needsQuestion(s, { key: 'v2', label: 'Question 2' })).toBe(false)
    expect(needsQuestion(s, null)).toBe(true) // a task item: the room's question must become null
    expect(needsQuestion(teacherStart(), { key: 'v3', label: 'x' })).toBe(false) // no room, nobody to tell
  })
  it('a task item has no question: the room goes to null and the phones wait', () => {
    const s = run([{ t: 'resume', code: 'K7M2P', secret: UUID }, { t: 'poll', room: room({ q_key: null, q_label: null, open: false }) }])
    expect(needsQuestion(s, null)).toBe(false)
    expect(teacherView(s, null).here).toBe(false)
  })
  it('turns lost after three failed polls and recovers on the next good one', () => {
    let s = run([{ t: 'resume', code: 'K7M2P', secret: UUID }])
    for (let i = 1; i < LOST_AFTER; i++) {
      s = teacherReduce(s, { t: 'pollFailed' })
      expect(s.lost).toBe(false)
    }
    s = teacherReduce(s, { t: 'pollFailed' })
    expect(s.lost).toBe(true)
    s = teacherReduce(s, { t: 'poll', room: room() })
    expect(s).toMatchObject({ lost: false, failures: 0, phase: 'live' })
  })
  it('a failed start leaves the hands working, with the reason', () => {
    for (const reason of ['busy', 'not-set-up', 'network'] as const) {
      const s = run([{ t: 'start' }, { t: 'createFailed', reason }])
      expect(s).toMatchObject({ phase: 'idle', code: null, notice: reason })
    }
  })
  it('a room the server no longer knows ends the voting', () => {
    const s = run([{ t: 'resume', code: 'K7M2P', secret: UUID }, { t: 'poll', room: null }])
    expect(s).toMatchObject({ phase: 'idle', code: null, notice: 'ended' })
  })
  it('End voting forgets the room; a poll with nothing live changes nothing', () => {
    expect(run([{ t: 'created', code: 'K7M2P', secret: UUID }, { t: 'end' }])).toEqual(teacherStart())
    expect(teacherReduce(teacherStart(), { t: 'poll', room: room() })).toEqual(teacherStart())
    expect(teacherReduce(teacherStart(), { t: 'pollFailed' })).toEqual(teacherStart())
  })
  it('says quietly that the room lasts for this page load when storage is blocked, and keeps saying it', () => {
    const s = run([{ t: 'start' }, { t: 'storageBlocked' }, { t: 'created', code: 'K7M2P', secret: UUID }])
    expect(s.notice).toBe('storage')
  })
})

const phone = (events: PhoneEvent[], from = phoneStart()) => events.reduce(phoneReduce, from)

describe('voting: the phone state machine', () => {
  it('walks loading → open → voted → closed', () => {
    let s = phoneStart()
    expect(phoneStatus(s)).toBe('loading')
    s = phoneReduce(s, { t: 'poll', room: room() })
    expect(phoneStatus(s)).toBe('open')
    s = phoneReduce(s, { t: 'sending', letter: 'B' })
    expect(s.sending).toBe('B')
    s = phoneReduce(s, { t: 'sent', key: 'v2', letter: 'B' })
    expect(phoneStatus(s)).toBe('voted')
    expect(phoneMine(s)).toBe('B')
    s = phoneReduce(s, { t: 'poll', room: room({ open: false }) })
    expect(phoneStatus(s)).toBe('closed')
    expect(phoneMine(s)).toBe('B') // their own vote, never the right answer
  })
  it('a second tap while sending is ignored (double tap)', () => {
    const s = phone([{ t: 'poll', room: room() }, { t: 'sending', letter: 'A' }, { t: 'sending', letter: 'B' }])
    expect(s.sending).toBe('A')
  })
  it('changing the vote replaces it', () => {
    const s = phone([{ t: 'poll', room: room() }, { t: 'sent', key: 'v2', letter: 'A' }, { t: 'sent', key: 'v2', letter: 'C' }])
    expect(phoneMine(s)).toBe('C')
  })
  it('an unknown or old room is ended; no question is none; a task item means the phones wait', () => {
    expect(phoneStatus(phone([{ t: 'poll', room: null }]))).toBe('ended')
    expect(phoneStatus(phone([{ t: 'poll', room: room({ q_key: null, q_label: null, open: false }) }]))).toBe('none')
  })
  it('opening after Reveal shows closed; opening on a task item shows none', () => {
    expect(phoneStatus(phone([{ t: 'poll', room: room({ open: false }) }]))).toBe('closed')
  })
  it('follows the teacher to the next question: the earlier vote does not count there', () => {
    const s = phone([{ t: 'poll', room: room() }, { t: 'sent', key: 'v2', letter: 'A' }, { t: 'poll', room: room({ q_key: 'v3', q_label: 'Question 3' }) }])
    expect(phoneStatus(s)).toBe('open')
    expect(phoneMine(s)).toBeNull()
  })
  it('offline before the first answer is its own state; later it is a banner over the last state', () => {
    let s = phoneReduce(phoneStart(), { t: 'pollFailed' })
    expect(phoneStatus(s)).toBe('offline')
    s = phone([{ t: 'poll', room: room() }, { t: 'pollFailed' }])
    expect(phoneStatus(s)).toBe('open')
    expect(phoneOffline(s)).toBe(true)
    s = phoneReduce(s, { t: 'poll', room: room() })
    expect(phoneOffline(s)).toBe(false)
  })
  it('a failed send keeps the tap retryable and clears on the next good poll', () => {
    let s = phone([{ t: 'poll', room: room() }, { t: 'sending', letter: 'B' }, { t: 'sendFailed', problem: 'network' }])
    expect(s).toMatchObject({ sending: null, problem: 'network' })
    expect(phoneStatus(s)).toBe('open')
    s = phoneReduce(s, { t: 'poll', room: room() })
    expect(s.problem).toBeNull()
  })
  it('starts with the votes it kept', () => {
    expect(phoneMine(phone([{ t: 'poll', room: room() }], phoneStart({ v2: 'D' })))).toBe('D')
  })
})

const throwing = () => {
  throw new Error('denied')
}

describe('voting: what the browser keeps', () => {
  const fake = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
  }
  it('keeps a room, resumes it within a day, forgets it after', () => {
    const ls = fake()
    const st = safeStore(() => ls)
    const now = 1_000_000_000_000
    expect(saveRoom(st, 'plan:w1,v2', { code: 'K7M2P', secret: UUID, created: now }, now)).toBe(true)
    expect(loadRooms(st, now + 3600_000)['plan:w1,v2']).toEqual({ code: 'K7M2P', secret: UUID, created: now })
    expect(loadRooms(st, now + ROOM_LIFE_MS - 1)['plan:w1,v2']).toBeDefined()
    expect(loadRooms(st, now + ROOM_LIFE_MS)['plan:w1,v2']).toBeUndefined()
    dropRoom(st, 'plan:w1,v2', now)
    expect(loadRooms(st, now)).toEqual({})
  })
  it('two lessons have two rooms', () => {
    const st = safeStore(() => fake())
    saveRoom(st, roomKeyForPlan(['w1']), { code: 'AAAAA', secret: UUID, created: Date.now() })
    saveRoom(st, roomKeyForPlan(['w2']), { code: 'BBBBB', secret: UUID, created: Date.now() })
    expect(Object.keys(loadRooms(st))).toHaveLength(2)
  })
  it('ignores damaged storage', () => {
    expect(readStoredRooms('{not json', 0)).toEqual({})
    expect(readStoredRooms('[1,2]', 0)).toEqual({})
    expect(readStoredRooms(JSON.stringify({ a: { code: 'bad', secret: UUID, created: 0 } }), 0)).toEqual({})
    expect(readStoredRooms(JSON.stringify({ a: { code: 'K7M2P', secret: 'x', created: 0 } }), 0)).toEqual({})
    expect(readStoredRooms(JSON.stringify({ a: { code: 'K7M2P', secret: UUID, created: 9e15 } }), 0)).toEqual({}) // from the future
  })
  it('keeps working in memory when localStorage throws, and says it was not kept', () => {
    const st = safeStore(() => ({ getItem: throwing, setItem: throwing }))
    expect(saveRoom(st, 'k', { code: 'K7M2P', secret: UUID, created: Date.now() })).toBe(false)
    expect(st.persistent()).toBe(false)
    expect(loadRooms(st).k?.code).toBe('K7M2P') // for this page load
    const a = voterToken(st)
    expect(voterToken(st)).toBe(a) // one token for the page load
  })
  it('keeps the voter token between loads, and replaces a damaged one', () => {
    const ls = fake()
    const st = safeStore(() => ls)
    const a = voterToken(st)
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(voterToken(safeStore(() => ls))).toBe(a)
    ls.setItem(TOKEN_KEY, 'junk')
    const b = voterToken(safeStore(() => ls))
    expect(b).not.toBe('junk')
    expect(b).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('makes a UUID without randomUUID, and without crypto at all', () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(newToken({ getRandomValues: (a: Uint8Array) => a.fill(7) })).toMatch(v4)
    expect(newToken({ randomUUID: throwing, getRandomValues: (a: Uint8Array) => a.fill(9) })).toMatch(v4)
    expect(newToken(undefined)).toMatch(v4)
    expect(newToken({ randomUUID: () => UUID })).toBe(UUID)
  })
  it('keeps the phone\'s votes for a reload', () => {
    const ls = fake()
    const st = safeStore(() => ls)
    saveMine(st, 'K7M2P', { v2: 'B' })
    expect(loadMine(st, 'K7M2P')).toEqual({ v2: 'B' })
    expect(loadMine(st, 'ZZZZZ')).toEqual({})
    ls.setItem(MINE_KEY, '{{')
    expect(loadMine(st, 'K7M2P')).toEqual({})
    ls.setItem(MINE_KEY, JSON.stringify({ K7M2P: { v2: 'Z', v3: 'C' } }))
    expect(loadMine(st, 'K7M2P')).toEqual({ v3: 'C' })
    expect(ROOMS_KEY).toBe('stratalab.lesson.room.v1')
  })
})

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response

describe('voting: the calls', () => {
  it('posts to the function with the key in both headers', async () => {
    const f = vi.fn().mockResolvedValue(reply(200, 'ok'))
    await castVote('K7M2P', 'v2', UUID, 'B', f)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://lueignziprnjnjiixdsh.supabase.co/rest/v1/rpc/lesson_cast_vote')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toMatch(/^sb_publishable_/)
    expect(init.headers.Authorization).toBe(`Bearer ${init.headers.apikey}`)
    expect(JSON.parse(init.body)).toEqual({ p_code: 'K7M2P', p_q_key: 'v2', p_token: UUID, p_letter: 'B' })
  })
  it('maps the answers of a vote', async () => {
    for (const r of ['ok', 'closed', 'room_full', 'too_many_changes'] as const) expect(await castVote('K7M2P', 'v2', UUID, 'A', vi.fn().mockResolvedValue(reply(200, r)))).toBe(r)
    expect(await castVote('K7M2P', 'v2', UUID, 'A', vi.fn().mockResolvedValue(reply(200, 'unknown')))).toBe('unknown')
    expect(await castVote('K7M2P', 'v2', UUID, 'A', vi.fn().mockResolvedValue(reply(200, 'surprise')))).toBe('unknown')
  })
  it('gives null for an unknown room and the counts for a known one', async () => {
    expect(await roomState('K7M2P', vi.fn().mockResolvedValue(reply(200, null)))).toBeNull()
    expect((await roomState('K7M2P', vi.fn().mockResolvedValue(reply(200, { q_key: 'v2', q_label: 'Question 2', open: true, counts: { A: 1, B: 0, C: 0, D: 0 }, total: 1 }))))?.total).toBe(1)
  })
  it('no network is "network"; a missing function is "not-set-up"', async () => {
    await expect(rpc('lesson_room_state', {}, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))).rejects.toMatchObject({ kind: 'network' })
    await expect(rpc('lesson_room_state', {}, vi.fn().mockResolvedValue(reply(404, { code: 'PGRST202' })))).rejects.toMatchObject({ kind: 'not-set-up' })
    await expect(rpc('lesson_room_state', {}, vi.fn().mockResolvedValue(reply(400, { code: 'PGRST202', message: 'Could not find the function' })))).rejects.toMatchObject({ kind: 'not-set-up' })
    await expect(rpc('lesson_room_state', {}, vi.fn().mockResolvedValue(reply(500, 'boom')))).rejects.toMatchObject({ kind: 'server' })
  })
  it('gives up after the timeout', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))))
    await expect(rpc('lesson_room_state', {}, hang as unknown as typeof fetch, 20)).rejects.toMatchObject({ kind: 'network' })
  })
  it('creates a room, or says busy', async () => {
    expect(await createRoom(vi.fn().mockResolvedValue(reply(200, { code: 'K7M2P', secret: UUID })))).toEqual({ code: 'K7M2P', secret: UUID })
    await expect(createRoom(vi.fn().mockResolvedValue(reply(200, { error: 'busy' })))).rejects.toBeInstanceOf(ApiError)
    await expect(createRoom(vi.fn().mockResolvedValue(reply(200, { error: 'busy' })))).rejects.toMatchObject({ kind: 'busy' })
    await expect(createRoom(vi.fn().mockResolvedValue(reply(200, { error: 'collision' })))).rejects.toMatchObject({ kind: 'server' })
  })
})
