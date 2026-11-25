// Fill-the-gaps questions (plan items f<n>): the comparison, what the projector computes from the room's counts, the pad's tap and drag
// rules, and the two shop questions run on the demo rows.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  FILL_GAP, FILL_MAX_LEN, allRight, answeredText, answersToSend, checkAnswers, cleanAnswer, fillNumber, fillQuery, fillStats, gapCount, matchesGap, normalizeAnswer, parseFillRows, rightQuery, splitTemplate, wrongText, type FillRow,
} from '../src/core/lessonFill'
import { dragGap, dragOut, dropChip, emptySlots, isComplete, slotsFromWords, tapChip, tapGap, usedChips, wordsOf } from '../src/core/fillPad'
import { computeResults } from '../src/core/lessonResults'
import { castFill, fillRead } from '../src/core/voteApi'
import { loadFillMine, safeStore, saveFillMine } from '../src/core/voteStorage'
import { PLAN_PRESETS, isRoomItem, isShopKey, parsePlan, planFromHash, planKey } from '../src/core/lesson'
import { FILL_QUESTIONS } from '../src/data/lessonFill'
import { FILL_ANSWERS, FILL_WHY } from '../src/data/lessonFillAnswers'
import { DEMO_SQL } from '../src/data/demo'
import { resultRows } from '../src/db/export'

const require = createRequire(import.meta.url)

describe('fill: comparing an answer', () => {
  it('ignores case, extra spaces, line breaks and a trailing semicolon', () => {
    for (const a of ['GROUP BY', 'group by', '  Group   By ', 'group\nby', 'group by;', 'GROUP BY ;']) expect(matchesGap(['GROUP BY'], a), a).toBe(true)
    expect(normalizeAnswer('  Group   By ;')).toBe('group by')
  })
  it('does not ignore what matters', () => {
    expect(matchesGap(['GROUP BY'], 'GROUPBY')).toBe(false)
    expect(matchesGap(['GROUP BY'], 'ORDER BY')).toBe(false)
    expect(matchesGap(['c.customer_id'], 'customer_id')).toBe(false)
    expect(matchesGap(['WHERE'], 'where;;')).toBe(true)
  })
  it('an empty answer is never right', () => {
    expect(matchesGap(['WHERE'], '')).toBe(false)
    expect(matchesGap(['WHERE'], '   ')).toBe(false)
    expect(matchesGap(['WHERE'], ';')).toBe(false)
    expect(matchesGap([''], '')).toBe(false)
  })
  it('accepts any listed spelling', () => {
    const acc = ['LEFT JOIN', 'LEFT OUTER JOIN']
    expect(matchesGap(acc, 'left outer join')).toBe(true)
    expect(matchesGap(acc, 'Left  Join')).toBe(true)
    expect(matchesGap(acc, 'RIGHT JOIN')).toBe(false)
  })
  it('checks every gap; a missing answer is wrong', () => {
    const acc = [['WHERE'], ['GROUP BY'], ['HAVING']]
    expect(checkAnswers(acc, ['where', 'group by', 'having'])).toEqual([true, true, true])
    expect(checkAnswers(acc, ['where', 'having'])).toEqual([true, false, false])
    expect(allRight(acc, ['where', 'group by', 'having'])).toBe(true)
    expect(allRight(acc, ['where', 'group by'])).toBe(false)
    expect(allRight(acc, ['where', 'group by', 'having', 'x'])).toBe(false)
  })
})

describe('fill: what a phone may send', () => {
  it('cleans spaces and keeps the case', () => {
    expect(cleanAnswer('  Group   By ')).toBe('Group By')
    expect(answersToSend([' where ', 'c.customer_id'])).toEqual(['where', 'c.customer_id'])
  })
  it('refuses none, more than three, an empty gap and a too long answer', () => {
    expect(answersToSend([])).toBeNull()
    expect(answersToSend(['a', 'b', 'c', 'd'])).toBeNull()
    expect(answersToSend(['a', ' '])).toBeNull()
    expect(answersToSend(['x'.repeat(FILL_MAX_LEN)])).not.toBeNull()
    expect(answersToSend(['x'.repeat(FILL_MAX_LEN + 1)])).toBeNull()
  })
})

describe('fill: the template', () => {
  it('counts gaps and fills them; the semicolon after the last gap stays outside', () => {
    const t = 'A ___ B ___;'
    expect(gapCount(t)).toBe(2)
    expect(splitTemplate(t)).toEqual(['A ', ' B ', ';'])
    expect(fillQuery(t, ['x', 'y'])).toBe('A x B y;')
    expect(fillQuery(t, ['x'])).toBe(`A x B ${FILL_GAP};`)
    expect(gapCount('no gaps')).toBe(0)
  })
  it('reads the key f3 and nothing else', () => {
    expect(fillNumber('f3')).toBe(3)
    for (const k of ['d3', 'f', 'f0x', 'F3', null, undefined, '']) expect(fillNumber(k), String(k)).toBeNull()
  })
})

describe('fill: what the projector shows', () => {
  const acc = [['WHERE'], ['GROUP BY'], ['HAVING']]
  const row = (answers: string[], n: number, q_key = 'f1'): FillRow => ({ q_key, answers: answers.map(normalizeAnswer), sample: answers, n })
  it('with 0 answers there are no percentages and no division by 0', () => {
    const s = fillStats(acc, [])
    expect(s.total).toBe(0)
    expect(s.fullyPct).toBeNull()
    expect(s.gaps.every((g) => g.rightPct === null && g.wrong === null)).toBe(true)
  })
  it('gives the share fully right, right per gap and the most common wrong answer per gap', () => {
    const rows = [row(['WHERE', 'GROUP BY', 'HAVING'], 50), row(['HAVING', 'GROUP BY', 'HAVING'], 38), row(['WHERE', 'ORDER BY', 'WHERE'], 12)]
    const s = fillStats(acc, rows)
    expect(s.total).toBe(100)
    expect(s.fully).toBe(50)
    expect(s.fullyPct).toBe(50)
    expect(s.gaps.map((g) => g.rightPct)).toEqual([62, 88, 88])
    expect(s.gaps[0].wrong).toEqual({ text: 'HAVING', n: 38, pct: 38 })
    expect(wrongText(s.gaps[0].wrong!)).toBe('38% put HAVING')
    expect(s.gaps[1].wrong).toEqual({ text: 'ORDER BY', n: 12, pct: 12 })
    expect(s.gaps[2].wrong).toEqual({ text: 'WHERE', n: 12, pct: 12 })
  })
  it('counts spellings of one wrong answer together, and shows one as typed', () => {
    const s = fillStats([['WHERE']], [row(['Having'], 2), row(['having;'], 1), row(['group by'], 2)])
    expect(s.gaps[0].wrong).toEqual({ text: 'Having', n: 3, pct: 60 })
  })
  it('a right answer spelled another way counts as right', () => {
    const s = fillStats([['LEFT JOIN', 'LEFT OUTER JOIN'], ['c.customer_id']], [row(['left outer join', 'C.customer_id'], 4)])
    expect(s.fullyPct).toBe(100)
    expect(s.gaps.every((g) => g.wrong === null)).toBe(true)
  })
  it('everyone right leaves no wrong answer to name; a tie names the first by text', () => {
    expect(fillStats(acc, [row(['where', 'group by', 'having'], 3)]).gaps.map((g) => g.wrong)).toEqual([null, null, null])
    const t = fillStats([['A']], [row(['z'], 1), row(['b'], 1)])
    expect(t.gaps[0].wrong?.text).toBe('b')
  })
  it('300 phones are one list of at most 300 distinct answers: still a plain sum', () => {
    const rows = Array.from({ length: 300 }, (_, i) => row([i % 3 === 0 ? 'WHERE' : `w${i}`, 'GROUP BY', 'HAVING'], 1))
    const s = fillStats(acc, rows)
    expect(s.total).toBe(300)
    expect(s.fullyPct).toBe(33)
  })
  it('ignores rows of another shape (a changed question) instead of miscounting', () => {
    expect(fillStats(acc, [row(['WHERE'], 5)]).total).toBe(0)
  })
  it('words the count', () => {
    expect(answeredText(0)).toBe('0 phones answered')
    expect(answeredText(1)).toBe('1 phone answered')
    expect(answeredText(1200)).toBe('1,200 phones answered')
  })
  it('reads the server rows safely', () => {
    expect(parseFillRows(null)).toBeNull()
    expect(parseFillRows({})).toBeNull()
    expect(parseFillRows([{ q_key: 'f1', answers: ['a'], sample: ['A'], n: 2 }, { q_key: 'f1', answers: 'x', n: 1 }, { q_key: '', answers: ['a'], n: 1 }, { q_key: 'f1', answers: ['a'], n: 0 }, null, { q_key: 'f1', answers: ['a', 'b', 'c', 'd'], n: 1 }])).toEqual([
      { q_key: 'f1', answers: ['a'], sample: ['A'], n: 2 },
    ])
    expect(parseFillRows([{ q_key: 'f1', answers: ['a'], n: 3 }])).toEqual([{ q_key: 'f1', answers: ['a'], sample: ['a'], n: 3 }])
  })
})

describe('fill: the results slide', () => {
  const acc = [['WHERE'], ['GROUP BY']]
  it('shows the share of phones with every gap right, phones only', () => {
    const rows = computeResults([{ step: 8, key: 'f1', text: 'q', fill: acc }], null, { f1: ['5', '0', '0', '0'] }, { f1: [{ q_key: 'f1', answers: ['where', 'group by'], sample: ['WHERE', 'GROUP BY'], n: 3 }, { q_key: 'f1', answers: ['having', 'group by'], sample: ['HAVING', 'GROUP BY'], n: 1 }] })
    expect(rows[0]).toMatchObject({ total: 4, rightPct: 75, source: 'phones', counts: null })
  })
  it('is "not counted" with no answers', () => {
    expect(computeResults([{ step: 8, key: 'f1', text: 'q', fill: acc }], null, null, null)[0]).toMatchObject({ total: 0, rightPct: null, source: null })
    expect(computeResults([{ step: 8, key: 'f1', text: 'q', fill: acc }], null, null, { f1: [] })[0].rightPct).toBeNull()
  })
})

describe('fill: the pad', () => {
  const bank = ['ORDER BY', 'HAVING', 'ON', 'WHERE', 'GROUP BY']
  it('a tap on a chip fills the first empty gap; a placed chip does nothing; a full pad takes no more', () => {
    let s = emptySlots(3)
    s = tapChip(s, 3)
    expect(s).toEqual([3, null, null])
    expect(tapChip(s, 3)).toBe(s)
    s = tapChip(tapChip(s, 4), 1)
    expect(s).toEqual([3, 4, 1])
    expect(isComplete(s)).toBe(true)
    expect(tapChip(s, 0)).toBe(s)
    expect(wordsOf(s, bank)).toEqual(['WHERE', 'GROUP BY', 'HAVING'])
  })
  it('a tap on a filled gap returns the chip; the next tap fills that gap', () => {
    let s: (number | null)[] = [3, 4, 1]
    s = tapGap(s, 1)
    expect(s).toEqual([3, null, 1])
    expect(usedChips(s)).toEqual(new Set([3, 1]))
    expect(wordsOf(s, bank)).toBeNull()
    expect(tapChip(s, 0)).toEqual([3, 0, 1])
    expect(tapGap(s, 1)).toBe(s) // an empty gap
  })
  it('a drag puts a chip into any gap; onto a filled one the old chip returns', () => {
    expect(dropChip([null, null, null], 3, 2)).toEqual([null, null, 3])
    expect(dropChip([3, null, null], 1, 0)).toEqual([1, null, null])
    expect(usedChips(dropChip([3, null, null], 1, 0)).has(3)).toBe(false)
    expect(dropChip([3, null, null], 3, 2)).toEqual([null, null, 3]) // a placed chip moves
    expect(dropChip([3, null, null], 3, 0)).toEqual([3, null, null])
    expect(dropChip([3, null, null], 1, 7)).toEqual([3, null, null])
  })
  it('a drag between gaps swaps; onto an empty gap it moves; out of every gap it returns', () => {
    expect(dragGap([3, 4, 1], 0, 2)).toEqual([1, 4, 3])
    expect(dragGap([3, null, 1], 0, 1)).toEqual([null, 3, 1])
    expect(dragGap([3, null, 1], 1, 0)).toEqual([3, null, 1])
    expect(dragGap([3, 4, 1], 1, 1)).toEqual([3, 4, 1])
    expect(dragOut([3, 4, 1], 1)).toEqual([3, null, 1])
  })
  it('puts a saved answer back, or says it does not fit', () => {
    expect(slotsFromWords(['WHERE', 'GROUP BY', 'HAVING'], bank)).toEqual([3, 4, 1])
    expect(slotsFromWords(['WHERE', 'WHERE'], bank)).toBeNull() // one chip, used once
    expect(slotsFromWords(['SELECT'], bank)).toBeNull()
    expect(slotsFromWords(['WHERE'], ['WHERE', 'WHERE'])).toEqual([0])
    expect(slotsFromWords(['WHERE', 'WHERE'], ['WHERE', 'WHERE'])).toEqual([0, 1])
  })
  it('an empty pad is not complete (no gaps is not complete either)', () => {
    expect(isComplete(emptySlots(2))).toBe(false)
    expect(isComplete([])).toBe(false)
  })
})

describe('fill: the shop questions', () => {
  it('one choose and one type, 1 to 3 gaps, a bank of 4 to 6 chips with distractors', () => {
    expect(FILL_QUESTIONS.map((q) => q.id)).toEqual(['f1', 'f2'])
    expect(FILL_QUESTIONS.map((q) => q.mode)).toEqual(['choose', 'type'])
    for (const q of FILL_QUESTIONS) {
      const g = gapCount(q.template)
      expect(g, q.id).toBeGreaterThanOrEqual(1)
      expect(g, q.id).toBeLessThanOrEqual(3)
      expect(FILL_ANSWERS[q.id], q.id).toHaveLength(g)
      expect(FILL_WHY[q.id].length, q.id).toBeGreaterThan(20)
      FILL_ANSWERS[q.id].forEach((acc, i) => expect(acc.length, `${q.id} gap ${i + 1}`).toBeGreaterThan(0))
      expect(q.template, q.id).not.toMatch(/quaera\./)
      if (q.mode === 'choose') {
        expect(q.bank!.length).toBeGreaterThanOrEqual(4)
        expect(q.bank!.length).toBeLessThanOrEqual(6)
        expect(new Set(q.bank).size).toBe(q.bank!.length)
        for (const acc of FILL_ANSWERS[q.id]) expect(q.bank).toContain(acc[0]) // every right word is on the bank
        expect(q.bank!.length, 'distractors').toBeGreaterThan(g)
        // the bank is not in the order of the gaps
        expect(q.bank!.slice(0, g)).not.toEqual(FILL_ANSWERS[q.id].map((a) => a[0]))
      } else expect(q.bank).toBeUndefined()
    }
  })
  it('a phone gets no answers: the phone-side files never import them', () => {
    for (const f of ['src/data/lessonFill.ts', 'src/core/lessonFill.ts', 'src/ui/FillPhone.tsx', 'src/ui/VotePage.tsx', 'src/core/fillPad.ts'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\s+'[^']*lessonFillAnswers'|FILL_ANSWERS/)
  })
  it('the plan `shop` ends with the two fill questions before the results', () => {
    expect(PLAN_PRESETS.shop).toBe('s,d1,d2,d3,d4,d5,d6,f1,f2,r')
    const p = planFromHash('#lesson=sql&plan=shop', { warm: 30, shop: 6, fill: FILL_QUESTIONS.length, votes: {}, tasks: {} })!
    expect(p.items.map(planKey).join(',')).toBe(PLAN_PRESETS.shop)
    expect(p.skipped).toEqual([])
    expect(planFromHash('#lesson=sql&plan=f1,f9', { warm: 30, fill: 2, votes: {}, tasks: {} })!.skipped).toEqual(['f9'])
    expect(parsePlan('f1,F1,f2').items.map(planKey)).toEqual(['f1', 'f2'])
    expect(parsePlan('f0,fx').bad).toEqual(['f0', 'fx'])
    expect(isRoomItem({ kind: 'f', n: 1 })).toBe(true)
    expect(isRoomItem({ kind: 's' })).toBe(false)
    expect(isShopKey('f2')).toBe(true)
  })
})

describe('fill: the filled queries on the demo rows', () => {
  let duck: { query: (sql: string) => Parameters<typeof resultRows>[0] }
  beforeAll(async () => {
    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
    await db.instantiate()
    duck = db.connect()
    for (const s of DEMO_SQL.split(';\n').map((x) => x.trim()).filter(Boolean)) duck.query(s)
  }, 120_000)
  const run = (sql: string) => resultRows(duck.query(sql))

  it('the right answers give a query that runs and returns rows', () => {
    for (const q of FILL_QUESTIONS) {
      const r = run(rightQuery(q.template, FILL_ANSWERS[q.id]))
      expect(r.rows.length, q.id).toBeGreaterThan(0)
    }
  })
  it('every accepted spelling gives the same rows', () => {
    for (const q of FILL_QUESTIONS) {
      const base = JSON.stringify(run(rightQuery(q.template, FILL_ANSWERS[q.id])).rows)
      FILL_ANSWERS[q.id].forEach((acc, g) => {
        for (const spelling of acc) {
          const answers = FILL_ANSWERS[q.id].map((a, i) => (i === g ? spelling : a[0]))
          expect(JSON.stringify(run(fillQuery(q.template, answers)).rows), `${q.id} gap ${g + 1}: ${spelling}`).toBe(base)
        }
      })
    }
  })
  it('f1: swapping the words fails or gives other rows (a wrong answer is visible when run)', () => {
    const q = FILL_QUESTIONS[0]
    const base = JSON.stringify(run(rightQuery(q.template, FILL_ANSWERS.f1)).rows)
    let different = 0
    for (const bad of [['HAVING', 'GROUP BY', 'WHERE'], ['WHERE', 'ORDER BY', 'HAVING'], ['WHERE', 'GROUP BY', 'ON']]) {
      try {
        if (JSON.stringify(run(fillQuery(q.template, bad)).rows) !== base) different++
      } catch {
        different++
      }
    }
    expect(different).toBe(3)
  })
})

describe('fill: the calls', () => {
  const reply = (status: number, body: unknown): typeof fetch => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch
  it('a phone’s answer: ok, closed, full, too many changes, invalid; anything else is unknown', async () => {
    for (const r of ['ok', 'closed', 'room_full', 'too_many_changes', 'invalid']) expect(await castFill('K7M2P', 'f1', 'tok', ['a'], reply(200, JSON.stringify(r)))).toBe(r)
    expect(await castFill('K7M2P', 'f1', 'tok', ['a'], reply(200, '"surprise"'))).toBe('unknown')
  })
  it('sends the answers as the function’s arguments', async () => {
    let body = ''
    const f = (async (_u: string, init: RequestInit) => ((body = String(init.body)), new Response('"ok"', { status: 200 }))) as unknown as typeof fetch
    await castFill('K7M2P', 'f1', 'tok', ['WHERE', 'GROUP BY'], f)
    expect(JSON.parse(body)).toEqual({ p_code: 'K7M2P', p_q_key: 'f1', p_token: 'tok', p_answers: ['WHERE', 'GROUP BY'] })
  })
  it('the teacher’s read: rows, nothing for a wrong secret, and "not set up" while 0003 has not been run', async () => {
    expect(await fillRead('K7M2P', 'sec', 'f1', reply(200, [{ q_key: 'f1', answers: ['a'], sample: ['A'], n: 2 }]))).toEqual([{ q_key: 'f1', answers: ['a'], sample: ['A'], n: 2 }])
    expect(await fillRead('K7M2P', 'sec', 'f1', reply(200, 'null'))).toEqual([])
    await expect(fillRead('K7M2P', 'sec', 'f1', reply(404, ''))).rejects.toMatchObject({ kind: 'not-set-up' })
    await expect(fillRead('K7M2P', 'sec', 'f1', reply(404, '{"code":"PGRST202","message":"Could not find the function public.lesson_fill_read"}'))).rejects.toMatchObject({ kind: 'not-set-up' })
    await expect(castFill('K7M2P', 'f1', 'tok', ['a'], (async () => { throw new TypeError('offline') }) as typeof fetch)).rejects.toMatchObject({ kind: 'network' })
  })
  it('keeps the phone’s answers, in memory when the browser will not keep them', () => {
    const store = safeStore(() => { throw new Error('denied') })
    saveFillMine(store, 'K7M2P', { f1: ['WHERE', 'GROUP BY', 'HAVING'] })
    expect(loadFillMine(store, 'K7M2P')).toEqual({ f1: ['WHERE', 'GROUP BY', 'HAVING'] })
    expect(loadFillMine(store, 'ZZZZZ')).toEqual({})
    store.set('stratalab.vote.fill.v1', '{"K7M2P":{"f1":["a",1],"f2":[],"f3":["ok"]}}')
    expect(loadFillMine(store, 'K7M2P')).toEqual({ f3: ['ok'] })
    store.set('stratalab.vote.fill.v1', 'not json')
    expect(loadFillMine(store, 'K7M2P')).toEqual({})
  })
})
