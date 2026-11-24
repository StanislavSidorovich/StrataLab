import { describe, expect, it } from 'vitest'
import { needleRegex, newTermsOf, proseParts, termNeedle, termRanges } from '../src/core/terms'
import { SECTIONS as PY } from '../src/data/pyPractice'
import { SECTIONS as SQL } from '../src/data/sqlPractice'
import { SECTIONS as PBI } from '../src/data/powerBiPractice'

describe('new terms in practice notes', () => {
  it('backticks in a "New:" note are new terms; a leading ~ makes one calm; ~~ keeps a tilde', () => {
    const kinds = proseParts('Use `np.where` with `~assign` and `~~mask` on `x`.', true).filter((p) => p.kind !== 'text')
    expect(kinds).toEqual([
      { text: 'np.where', kind: 'new' },
      { text: 'assign', kind: 'code' },
      { text: '~mask', kind: 'new' },
      { text: 'x', kind: 'new' },
    ])
  })
  it('in other text backticked code is calm and shown as written, tilde included', () => {
    expect(proseParts('a `~x` b', false)).toEqual([
      { text: 'a ', kind: 'text' },
      { text: '~x', kind: 'code' },
      { text: ' b', kind: 'text' },
    ])
  })
  it('the needle drops arguments and brackets; empty or bracket-only terms give none', () => {
    expect(termNeedle('reset_index(name=...)')).toBe('reset_index')
    expect(termNeedle('dropna(subset=[...])')).toBe('dropna')
    expect(termNeedle('df[...]')).toBe('df')
    expect(termNeedle('products["name"] = ...')).toBe('products["name"]')
    expect(termNeedle('GROUP BY')).toBe('GROUP BY')
    expect(termNeedle('()')).toBeUndefined()
    expect(termNeedle('( )')).toBeUndefined()
    expect(termNeedle('  ')).toBeUndefined()
  })
  it('chips: each term once, by needle', () => {
    expect(newTermsOf('`astype`, `astype(str)` and `~old` and `ASTYPE(x)`').map((t) => t.label)).toEqual(['astype'])
  })
  it('matching escapes brackets and quotes, respects word edges, ignores case only when asked', () => {
    const doc = 'df["col"] = np.where(a, 1, 0)\nx.assign(n=1)\nreassign = 1\nGroup   by x'
    expect(termRanges(doc, ['df["col"]'], false)).toEqual([[0, 9]])
    expect(termRanges(doc, [`[["a","b"]]`, '(('], false)).toEqual([])
    expect(termRanges(doc, ['np.where'], false)).toEqual([[12, 20]])
    expect(termRanges(doc, ['assign'], false)).toEqual([[32, 38]])
    expect(termRanges(doc, ['GROUP BY'], false)).toEqual([])
    expect(termRanges(doc, ['GROUP BY'], true)).toHaveLength(1)
    expect(needleRegex('a.b', false).test('axb')).toBe(false)
  })
  it('a list of columns in double brackets is marked by its opening brackets', () => {
    expect(newTermsOf('the `[[...]]` part')).toEqual([{ label: '[[...]]', needle: '[[' }])
    expect(termRanges('df[["a", "b"]]', ['[['], false)).toEqual([[2, 4]])
  })
  it('overlapping matches do not nest', () => {
    expect(termRanges('np.where', ['np.where', 'where'], false)).toEqual([[0, 8]])
  })
})

describe('every "New:" note introduces a term', () => {
  const sets: [string, { id: string; blocks?: unknown[] }[]][] = [['python', PY], ['sql', SQL], ['power bi', PBI as never]]
  for (const [name, sections] of sets) {
    it(`${name}: at least one new term per note with a topic`, () => {
      const bad: string[] = []
      for (const s of sections)
        for (const b of (s.blocks ?? []) as { kind: string; topic?: string; text: string }[])
          if (b.kind === 'note' && b.topic && newTermsOf(b.text).length === 0) bad.push(`${s.id}: ${b.topic}`)
      expect(bad).toEqual([])
    })
  }
})
