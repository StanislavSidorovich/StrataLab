// The version of what the build page keeps in the browser: one fixture per version in tests/fixtures/build/, each must load
// without losing anything and come back out as the current version. Add v<N>.json when SAVED_VERSION goes up.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SAVED_VERSION, keptState, migrateSaved, readBuild } from '../src/core/build'
import { keptJson, readSaved, restoreSaved, savedJson } from '../src/core/buildProgress'

const fixture = (v: number) => readFileSync(`tests/fixtures/build/v${v}.json`, 'utf8')

describe('saved run versions', () => {
  it('has a fixture for every version, 0 to the current one', () => {
    for (let v = 0; v <= SAVED_VERSION; v++) expect(existsSync(`tests/fixtures/build/v${v}.json`), `v${v}.json`).toBe(true)
  })

  it('v0 (saved before versions existed) has no version field', () => {
    expect('version' in JSON.parse(fixture(0))).toBe(false)
  })

  for (let v = 0; v <= SAVED_VERSION; v++) {
    it(`v${v} loads, migrates and is written as the current version without loss`, () => {
      const raw = JSON.parse(fixture(v))
      const s = readBuild(fixture(v))
      expect(s.done).toEqual(raw.done)
      expect(s.open).toBe(raw.open)
      expect(s.links).toEqual(raw.links)
      expect(s.star).toBe(raw.star)
      expect(s.work.connected).toEqual(raw.work.connected)
      expect(s.work.steps).toEqual(raw.work.steps)
      expect(s.work.passed).toEqual(raw.work.passed)
      expect(s.work.dash.blanks).toEqual(raw.work.dash.blanks)
      expect(s.work.dash.tiles).toEqual(raw.work.dash.tiles)
      expect(s.work.dash.answers).toEqual(raw.work.dash.answers)
      expect(s.work.dash.answered).toEqual(raw.work.dash.answered)
      expect(s.work.more).toEqual(raw.work.more)
      expect(s.work.refresh).toEqual(raw.work.refresh)
      expect(s.work.dash.review).toEqual(raw.work.dash?.review ?? { a4: '', a5: '' })
      const written = JSON.parse(keptJson(s))
      expect(written.version).toBe(SAVED_VERSION)
      // writing and reading again changes nothing
      expect(keptJson(readBuild(JSON.stringify(written)))).toBe(keptJson(s))
    })
  }

  it('the current fixture is written back as it is', () => {
    expect(JSON.parse(keptJson(readBuild(fixture(SAVED_VERSION))))).toEqual(JSON.parse(fixture(SAVED_VERSION)))
  })

  it('a run of an old version in My saved run also migrates', () => {
    const wrapped = JSON.stringify({ at: 1762000000000, state: JSON.parse(fixture(0)) })
    const saved = readSaved(wrapped)!
    expect(saved.state.done.length).toBe(5)
    expect(JSON.parse(savedJson(saved)).state.version).toBe(SAVED_VERSION)
    expect(restoreSaved(saved).work.dash.answered).toEqual(['A1', 'A2', 'A3'])
  })

  it('migrateSaved stamps the version and keeps a newer one', () => {
    expect(migrateSaved({}).version).toBe(SAVED_VERSION)
    expect(migrateSaved({ version: 'x' }).version).toBe(SAVED_VERSION)
    expect(migrateSaved({ version: SAVED_VERSION + 5 }).version).toBe(SAVED_VERSION + 5)
  })

  it('anything unreadable starts afresh', () => {
    expect(readBuild('[1,2]').done).toEqual([])
    expect(readBuild('not json').done).toEqual([])
    expect(keptState(readBuild(null)).version).toBe(SAVED_VERSION)
  })
})
