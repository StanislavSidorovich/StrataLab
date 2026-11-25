// What phone voting remembers in the browser, with a memory fallback for when localStorage throws (a blocked or full store,
// an in-app browser): then it lives for this page load only. No React, no fetch.
import { LETTERS, type Letter } from './lesson'
import { normaliseRoomCode, readStoredRooms, type StoredRoom, type StoredRooms } from './voting'

export const ROOMS_KEY = 'stratalab.lesson.room.v1'
export const TOKEN_KEY = 'stratalab.vote.token.v1'
export const MINE_KEY = 'stratalab.vote.mine.v1'
export const FILL_KEY = 'stratalab.vote.fill.v1'

export interface Store {
  get(key: string): string | null
  /** false when the browser would not keep it (it is held in memory instead) */
  set(key: string, value: string): boolean
  persistent(): boolean
}

/** A store over a Storage-like thing that may throw on every call; what it cannot keep it holds in memory. */
export function safeStore(open: () => Pick<Storage, 'getItem' | 'setItem'>): Store {
  const mem = new Map<string, string>()
  let ok = true
  return {
    get(key) {
      try {
        const v = open().getItem(key)
        if (v !== null) return v
      } catch {
        ok = false
      }
      return mem.get(key) ?? null
    },
    set(key, value) {
      mem.set(key, value)
      try {
        open().setItem(key, value)
        return true
      } catch {
        ok = false
        return false
      }
    },
    persistent: () => ok,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CryptoLike = { getRandomValues?: (a: Uint8Array) => unknown; randomUUID?: () => string }

/** A random UUID: crypto.randomUUID, or built from getRandomValues, or (no crypto at all) from Math.random: it only tells phones apart. */
export function newToken(c: CryptoLike | undefined = globalThis.crypto as CryptoLike | undefined): string {
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      /* fall through */
    }
  }
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** This phone's voter token: kept, or made and kept; in memory when the browser will not keep it. */
export function voterToken(store: Store, make: () => string = newToken): string {
  const have = store.get(TOKEN_KEY)
  if (have && UUID.test(have)) return have
  const t = make()
  store.set(TOKEN_KEY, t)
  return t
}

export function loadRooms(store: Store, now = Date.now()): StoredRooms {
  return readStoredRooms(store.get(ROOMS_KEY), now)
}

/** Keeps a room under the lesson's key. Returns false when it could not be kept past this page load. */
export function saveRoom(store: Store, key: string, room: StoredRoom, now = Date.now()): boolean {
  const rooms = { ...loadRooms(store, now), [key]: room }
  return store.set(ROOMS_KEY, JSON.stringify(rooms))
}

export function dropRoom(store: Store, key: string, now = Date.now()): void {
  const rooms = loadRooms(store, now)
  delete rooms[key]
  store.set(ROOMS_KEY, JSON.stringify(rooms))
}

/** The phone's own votes in a room, `{question key: letter}`, so a reload still shows them. */
export function loadMine(store: Store, code: string): Record<string, Letter> {
  try {
    const all = JSON.parse(store.get(MINE_KEY) ?? 'null') as Record<string, Record<string, string>> | null
    const mine = all?.[code]
    if (!mine || typeof mine !== 'object') return {}
    const out: Record<string, Letter> = {}
    for (const [k, v] of Object.entries(mine)) if ((LETTERS as readonly string[]).includes(v)) out[k] = v as Letter
    return out
  } catch {
    return {}
  }
}

/** The phone's own fill answers in a room, `{question key: [answers]}`, so a reload still shows them. */
export function loadFillMine(store: Store, code: string): Record<string, string[]> {
  try {
    const all = JSON.parse(store.get(FILL_KEY) ?? 'null') as Record<string, Record<string, unknown>> | null
    const mine = all?.[code]
    if (!mine || typeof mine !== 'object') return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(mine)) if (Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every((x) => typeof x === 'string')) out[k] = v as string[]
    return out
  } catch {
    return {}
  }
}

export function saveFillMine(store: Store, code: string, mine: Record<string, string[]>): void {
  if (!normaliseRoomCode(code)) return
  store.set(FILL_KEY, JSON.stringify({ [code]: mine }))
}

/** Only the latest room's votes are kept (a phone sees one room at a time). */
export function saveMine(store: Store, code: string, mine: Record<string, Letter>): void {
  if (!normaliseRoomCode(code)) return
  store.set(MINE_KEY, JSON.stringify({ [code]: mine }))
}
