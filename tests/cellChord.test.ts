import { describe, expect, it } from 'vitest'
import { CHORD_TIMEOUT_MS, NO_CHORD, stepChord, type ChordState, type KeyLike } from '../src/core/cellChord'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })
const ctrlM = key('KeyM', { ctrlKey: true })

/** Feeds keys one after another, 100 ms apart; returns what each one did. */
function press(keys: KeyLike[], from: ChordState = NO_CHORD) {
  let state = from
  let now = 1000
  return keys.map((k) => {
    const step = stepChord(state, k, now)
    state = step.state
    now += 100
    return { action: step.action, handled: step.handled }
  })
}

describe('Ctrl+M B / Ctrl+M A (Colab cell shortcuts)', () => {
  it('Ctrl+M then B is a cell below, Ctrl+M then A a cell above', () => {
    expect(press([ctrlM, key('KeyB')])).toEqual([
      { action: null, handled: true },
      { action: 'below', handled: true },
    ])
    expect(press([ctrlM, key('KeyA')])[1]).toEqual({ action: 'above', handled: true })
  })

  it('works with Ctrl still held, and on any keyboard layout (it reads the key position, not the letter)', () => {
    expect(press([ctrlM, key('KeyB', { ctrlKey: true })])[1].action).toBe('below')
    expect(press([ctrlM, key('ControlLeft', { ctrlKey: true }), key('KeyA')]).map((r) => r.action)).toEqual([null, null, 'above'])
  })

  it('a double press gives two cells', () => {
    expect(press([ctrlM, key('KeyB'), ctrlM, key('KeyB')]).map((r) => r.action)).toEqual([null, 'below', null, 'below'])
  })

  it('B or A alone, or with Ctrl, Alt, Shift or Cmd and no Ctrl+M before, is just a letter', () => {
    for (const k of [key('KeyB'), key('KeyA'), key('KeyB', { ctrlKey: true }), key('KeyA', { altKey: true })])
      expect(press([k])[0]).toEqual({ action: null, handled: false })
  })

  it('Ctrl+M with Shift, Alt or Cmd is not the chord', () => {
    for (const k of [key('KeyM', { ctrlKey: true, shiftKey: true }), key('KeyM', { ctrlKey: true, altKey: true }), key('KeyM', { metaKey: true }), key('KeyM')])
      expect(press([k])[0].handled).toBe(false)
  })

  it('any other key cancels the chord and is left to the editor; B afterwards is a letter', () => {
    const r = press([ctrlM, key('KeyX'), key('KeyB')])
    expect(r[1]).toEqual({ action: null, handled: false })
    expect(r[2]).toEqual({ action: null, handled: false })
    expect(press([ctrlM, key('Escape'), key('KeyB')])[2].action).toBeNull()
  })

  it('Ctrl+M twice starts over rather than cancelling', () => {
    expect(press([ctrlM, ctrlM, key('KeyA')]).map((r) => r.action)).toEqual([null, null, 'above'])
  })

  it('Shift, Alt or Cmd with the second key is not B or A', () => {
    expect(press([ctrlM, key('KeyB', { shiftKey: true })])[1].action).toBeNull()
    expect(press([ctrlM, key('KeyA', { metaKey: true })])[1].action).toBeNull()
  })

  it('the second key must come in time', () => {
    const waiting = stepChord(NO_CHORD, ctrlM, 0).state
    expect(stepChord(waiting, key('KeyB'), CHORD_TIMEOUT_MS).action).toBe('below')
    expect(stepChord(waiting, key('KeyB'), CHORD_TIMEOUT_MS + 1)).toEqual({ state: NO_CHORD, action: null, handled: false })
  })
})
