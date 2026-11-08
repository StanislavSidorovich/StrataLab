import { describe, expect, it } from 'vitest'
import {
  allDone,
  buildFromHash,
  currentStep,
  emptyBuild,
  goNext,
  hashWithBuild,
  hashWithoutBuild,
  isUnlocked,
  markDone,
  nextStep,
  openStep,
  readBuild,
  statusOf,
  STEP_IDS,
} from '../src/core/build'

describe('build address', () => {
  it('reads a known id and ignores the rest', () => {
    expect(buildFromHash('#build=kaiyo-sales')).toBe('kaiyo-sales')
    expect(buildFromHash('#x=1&build=Kaiyo-Sales')).toBe('kaiyo-sales')
    expect(buildFromHash('#build=nope')).toBeNull()
    expect(buildFromHash('#pipeline=kaiyo-sellout')).toBeNull()
    expect(buildFromHash('')).toBeNull()
  })
  it('writes and removes it, keeping other parts', () => {
    expect(hashWithBuild('', 'kaiyo-sales')).toBe('#build=kaiyo-sales')
    expect(hashWithBuild('#a=1', 'kaiyo-sales')).toBe('#build=kaiyo-sales&a=1')
    expect(hashWithBuild('#build=kaiyo-sales&a=1', 'kaiyo-sales')).toBe('#build=kaiyo-sales&a=1')
    expect(hashWithoutBuild('#build=kaiyo-sales&a=1')).toBe('#a=1')
    expect(hashWithoutBuild('#build=kaiyo-sales')).toBe('')
  })
})

describe('build steps', () => {
  it('starts on Connect with the rest locked', () => {
    const s = emptyBuild()
    expect(s.open).toBe('connect')
    expect(STEP_IDS.map((id) => statusOf(s, id))).toEqual(['current', 'locked', 'locked', 'locked', 'locked'])
  })
  it('opens the next step only after the previous one is done', () => {
    let s = emptyBuild()
    expect(openStep(s, 'clean')).toEqual(s)
    expect(nextStep(s)).toBeNull()
    expect(goNext(s)).toEqual(s)
    s = markDone(s)
    expect(statusOf(s, 'connect')).toBe('done')
    expect(isUnlocked(s, 'clean')).toBe(true)
    expect(nextStep(s)).toBe('clean')
    s = goNext(s)
    expect(s.open).toBe('clean')
    expect(openStep(s, 'model').open).toBe('clean')
    expect(openStep(s, 'connect').open).toBe('connect')
  })
  it('cannot mark a locked step done, and marking twice changes nothing', () => {
    const s = emptyBuild()
    expect(markDone(s, 'model')).toBe(s)
    const d = markDone(s)
    expect(markDone(d, 'connect')).toBe(d)
  })
  it('finishes after the fifth step', () => {
    let s = emptyBuild()
    for (let i = 0; i < 5; i++) s = goNext(markDone(s))
    expect(allDone(s)).toBe(true)
    expect(s.open).toBe('answer')
    expect(nextStep(s)).toBeNull()
    expect(currentStep(s)).toBe('answer')
  })
})

describe('build storage', () => {
  it('survives junk', () => {
    expect(readBuild(null)).toEqual(emptyBuild())
    expect(readBuild('{')).toEqual(emptyBuild())
    expect(readBuild('5')).toEqual(emptyBuild())
  })
  it('drops gaps and a locked open step', () => {
    const s = readBuild(JSON.stringify({ done: ['connect', 'model', 'bogus'], open: 'answer' }))
    expect(s.done).toEqual(['connect'])
    expect(s.open).toBe('clean')
  })
  it('keeps a good state', () => {
    const s = readBuild(JSON.stringify({ done: ['connect', 'clean'], open: 'connect' }))
    expect(s).toEqual({ ...emptyBuild(), done: ['connect', 'clean'], open: 'connect' })
  })
})
