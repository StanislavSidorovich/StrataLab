// The link back to Quaera: one named window, left alone in an installed app, with the plain link as the fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACK_WAIT_MS, QUAERA_ORIGINS, QUAERA_WINDOW, doneKey, followQuaeraLink, type QuaeraEnv } from '../src/core/quaeraLink'

const click = (extra: Record<string, unknown> = {}) => {
  const e = { prevented: false, preventDefault() { this.prevented = true }, ...extra }
  return e
}
const env = (o: Partial<QuaeraEnv> & { calls?: [string, string][] } = {}): QuaeraEnv => ({
  standalone: o.standalone ?? (() => false),
  quaeraOpener: o.quaeraOpener ?? (() => null),
  open: o.open ?? ((url, name) => (o.calls?.push([url, name]), { opener: 'lab' })),
})

describe('followQuaeraLink', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const url = 'https://quaera.app/#lab-done=build:kaiyo-sales'
  it('opens the address in the window named quaera and stops the plain link', () => {
    const calls: [string, string][] = []
    const e = click()
    expect(followQuaeraLink(e, url, env({ calls }))).toBe(true)
    expect(calls).toEqual([[url, QUAERA_WINDOW]])
    expect(QUAERA_WINDOW).toBe('quaera-quaera')
    expect(e.prevented).toBe(true)
  })
  it('sends the address to the Quaera tab that opened Lab, without a new window', () => {
    const calls: [string, string][] = []
    const posted: [unknown, string][] = []
    const opener = { focused: false, postMessage(m: unknown, o: string) { posted.push([m, o]) }, focus() { this.focused = true } }
    const e = click()
    expect(followQuaeraLink(e, url, env({ calls, quaeraOpener: () => opener }))).toBe(true)
    expect(posted).toEqual([[{ type: 'quaera:go', url }, 'https://quaera.app']])
    expect(opener.focused).toBe(true)
    expect(calls).toEqual([])
    expect(e.prevented).toBe(true)
  })
  it('falls back to the named window when the opener cannot take the message', () => {
    const calls: [string, string][] = []
    const opener = { postMessage() { throw new Error('gone') }, focus() {} }
    const e = click()
    expect(followQuaeraLink(e, url, env({ calls, quaeraOpener: () => opener }))).toBe(true)
    expect(calls).toEqual([[url, QUAERA_WINDOW]])
  })
  it('lets the plain link go in an installed app', () => {
    const calls: [string, string][] = []
    const e = click()
    expect(followQuaeraLink(e, url, env({ calls, standalone: () => true }))).toBe(false)
    expect(calls).toEqual([])
    expect(e.prevented).toBe(false)
  })
  it('lets the plain link go when the pop-up is blocked, or the window cannot be opened', () => {
    const blocked = click()
    expect(followQuaeraLink(blocked, url, env({ open: () => null }))).toBe(false)
    expect(blocked.prevented).toBe(false)
    const thrown = click()
    expect(
      followQuaeraLink(thrown, url, env({ open: () => { throw new Error('no') } })),
    ).toBe(false)
    expect(thrown.prevented).toBe(false)
  })
  it('leaves a click with a modifier or a middle button to the browser', () => {
    const calls: [string, string][] = []
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const e = click(extra)
      expect(followQuaeraLink(e, url, env({ calls }))).toBe(false)
      expect(e.prevented).toBe(false)
    }
    expect(calls).toEqual([])
  })
})

describe('waiting for quaera:done', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const key = 'build:kaiyo-sales-more'
  const url = `https://quaera.app/#lab-done=${key}`
  type Handler = (e: { origin: string; source: unknown; data: unknown }) => void
  const setup = (origin = 'https://quaera.app') => {
    const calls: [string, string][] = []
    const posted: [unknown, string][] = []
    const handlers = new Set<Handler>()
    const opener = { postMessage(m: unknown, o: string) { posted.push([m, o]) }, focus() {} }
    const e = env({ calls, quaeraOpener: () => opener })
    e.quaeraOrigin = () => origin
    e.listen = (h) => (handlers.add(h), () => handlers.delete(h))
    const acks: boolean[] = []
    const ev = click()
    const handled = followQuaeraLink(ev, url, e, (ok) => acks.push(ok))
    const reply = (origin: string, data: unknown) => handlers.forEach((h) => h({ origin, source: opener, data }))
    return { calls, posted, handlers, acks, handled, ev, reply }
  }
  it('reads the key out of the address', () => {
    expect(doneKey(url)).toBe(key)
    expect(doneKey('https://quaera.app/')).toBeNull()
    expect(QUAERA_ORIGINS).toEqual(['https://quaera.app', 'https://www.quaera.app', 'https://querium.pages.dev'])
  })
  it('counts it on the reply and opens no window', () => {
    const t = setup()
    expect(t.handled).toBe(true)
    expect(t.ev.prevented).toBe(true)
    vi.advanceTimersByTime(ACK_WAIT_MS - 50)
    t.reply('https://quaera.app', { type: 'quaera:done', key })
    expect(t.acks).toEqual([true])
    vi.advanceTimersByTime(1000)
    expect(t.calls).toEqual([])
    expect(t.acks).toEqual([true])
    expect(t.handlers.size).toBe(0)
  })
  it('opens the named window and says so after silence', () => {
    const t = setup()
    vi.advanceTimersByTime(ACK_WAIT_MS - 1)
    expect(t.calls).toEqual([])
    vi.advanceTimersByTime(2)
    expect(t.calls).toEqual([[url, QUAERA_WINDOW]])
    expect(t.acks).toEqual([false])
    expect(t.handlers.size).toBe(0)
    t.reply('https://quaera.app', { type: 'quaera:done', key })
    expect(t.acks).toEqual([false])
  })
  it('addresses the origin that answered, and ignores a reply from elsewhere or for another key', () => {
    const t = setup('https://www.quaera.app')
    expect(t.posted).toEqual([[{ type: 'quaera:go', url }, 'https://www.quaera.app']])
    t.reply('https://evil.example', { type: 'quaera:done', key })
    t.reply('https://quaera.app', { type: 'quaera:done', key })
    t.reply('https://www.quaera.app', { type: 'quaera:done', key: 'build:kaiyo-sales' })
    expect(t.acks).toEqual([])
    vi.advanceTimersByTime(ACK_WAIT_MS)
    expect(t.acks).toEqual([false])
  })
})
