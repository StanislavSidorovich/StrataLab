// The link back to Quaera: one named window, left alone in an installed app, with the plain link as the fallback.
import { describe, expect, it } from 'vitest'
import { QUAERA_WINDOW, followQuaeraLink, type QuaeraEnv } from '../src/core/quaeraLink'

const click = (extra: Record<string, unknown> = {}) => {
  const e = { prevented: false, preventDefault() { this.prevented = true }, ...extra }
  return e
}
const env = (o: Partial<QuaeraEnv> & { calls?: [string, string][] } = {}): QuaeraEnv => ({
  standalone: o.standalone ?? (() => false),
  open: o.open ?? ((url, name) => (o.calls?.push([url, name]), { opener: 'lab' })),
})

describe('followQuaeraLink', () => {
  const url = 'https://quaera.app/#lab-done=build:kaiyo-sales'
  it('opens the address in the window named quaera and stops the plain link', () => {
    const calls: [string, string][] = []
    const e = click()
    expect(followQuaeraLink(e, url, env({ calls }))).toBe(true)
    expect(calls).toEqual([[url, QUAERA_WINDOW]])
    expect(QUAERA_WINDOW).toBe('quaera-quaera')
    expect(e.prevented).toBe(true)
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
