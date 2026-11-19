// Colab's cell shortcuts in a Python tab: Ctrl+M, then B (a new cell below) or A (above).
// A two-key chord: the first press is swallowed (CodeMirror's own Ctrl+M, tab-focus mode, never runs),
// the second decides. Keys are read by `code`, so they work on a Russian layout too.

export const CHORD_TIMEOUT_MS = 3000

export interface ChordState {
  pending: boolean
  at: number
}

export const NO_CHORD: ChordState = { pending: false, at: 0 }

export interface KeyLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface ChordStep {
  state: ChordState
  action: 'below' | 'above' | null
  /** the key belongs to the chord: the editor must not handle it */
  handled: boolean
}

const MODIFIERS = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])

export function stepChord(state: ChordState, e: KeyLike, now: number): ChordStep {
  const pending = state.pending && now - state.at <= CHORD_TIMEOUT_MS
  if (pending) {
    // a modifier alone (Ctrl is often still down) keeps waiting
    if (MODIFIERS.has(e.code)) return { state, action: null, handled: false }
    if (!e.metaKey && !e.altKey && !e.shiftKey && (e.code === 'KeyB' || e.code === 'KeyA'))
      return { state: NO_CHORD, action: e.code === 'KeyB' ? 'below' : 'above', handled: true }
    // anything else cancels, and the key does what it always does (Ctrl+M again starts over)
    if (!isStart(e)) return { state: NO_CHORD, action: null, handled: false }
  }
  if (isStart(e)) return { state: { pending: true, at: now }, action: null, handled: true }
  return { state: NO_CHORD, action: null, handled: false }
}

const isStart = (e: KeyLike) => e.code === 'KeyM' && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
