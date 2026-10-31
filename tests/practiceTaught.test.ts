// A task may only ask for what the page has already shown: every function or keyword of a solution
// appears earlier in a note or an example. The learner should not have to know it from elsewhere.
import { describe, expect, it } from 'vitest'
import { SECTIONS as PY_SECTIONS } from '../src/data/pyPractice'
import { SECTIONS as SQL_SECTIONS } from '../src/data/sqlPractice'
import type { PracticeSection } from '../src/data/practiceBook'

const withoutStrings = (code: string) => code.replace(/(#|--).*$/gm, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')

const pyWords = (code: string) => {
  const c = withoutStrings(code)
  return [...[...c.matchAll(/\.([a-zA-Z_]\w*)/g)].map((m) => m[1]), ...[...c.matchAll(/(?<![.\w])([a-zA-Z_]\w*)\(/g)].map((m) => m[1])]
}
/** In prose a name stands in backticks on its own (`shape`), or as code (`len(df)`). */
const pyProse = (text: string) => [...text.matchAll(/`([^`]+)`/g)].flatMap((m) => [...pyWords(m[1]), ...(/^\w+$/.test(m[1]) ? [m[1]] : [])])

const sqlWords = (code: string) => [...withoutStrings(code).matchAll(/\b[A-Z][A-Z_]+\b/g)].map((m) => m[0])

function untaught(sections: PracticeSection[], words: (code: string) => string[], prose: (text: string) => string[]) {
  const taught = new Set<string>()
  const missing: string[] = []
  for (const s of sections)
    for (const b of s.blocks) {
      if (b.kind === 'note') for (const w of [...prose(b.text), ...(b.trap ? prose(b.trap) : []), ...(b.syntax ? words(b.syntax) : [])]) taught.add(w)
      if (b.kind === 'example') for (const w of words(b.code)) taught.add(w)
      if (b.kind === 'task') {
        const new_ = [...new Set(words(b.solution))].filter((w) => !taught.has(w))
        if (new_.length) missing.push(`${b.id}: ${new_.join(', ')}`)
      }
    }
  return missing
}

describe('practice pages teach before they ask', () => {
  it('Python', () => expect(untaught(PY_SECTIONS, pyWords, pyProse)).toEqual([]))
  it('SQL', () => expect(untaught(SQL_SECTIONS, sqlWords, sqlWords)).toEqual([]))
})
