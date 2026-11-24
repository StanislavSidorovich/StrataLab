// Lesson plans v0.72: named plans, the schema slide `s`, the results slide `r`, the step label the phones show, the links between tables.
import { describe, expect, it, vi } from 'vitest'
import { HANDS_KEY, computeResults, handsToCounts, readHands, shortText, type ResultItem } from '../src/core/lessonResults'
import { PLAN_PRESETS, isVoteItem, parsePlan, planFromHash, planHash, planKey, stepLabel, type PlanCatalog } from '../src/core/lesson'
import { linkText, linksAmong, parseKeyLine, schemaLinks, schemaOf, tablesOfQueries } from '../src/core/lessonSchema'
import { roomSummary } from '../src/core/voteApi'
import { RESULTS_KEY, parseSummary, phoneReduce, phoneStart, phoneStatus, type PhoneEvent, type RoomState } from '../src/core/voting'
import { VOTES, WARMUP } from '../src/data/lessonVotes'
import { SECTIONS } from '../src/data/sqlPractice'
import { tasksOf } from '../src/data/practiceBook'
import { arrange, warmOptions } from '../src/core/lesson'
import { planSchema } from '../src/ui/LessonPlanSlides'

const CAT: PlanCatalog = {
  warm: WARMUP.length,
  votes: Object.fromEntries(Object.entries(VOTES).map(([k, v]) => [k, v.length])),
  tasks: Object.fromEntries(SECTIONS.map((s) => [s.id, tasksOf(s).length])),
}
const block = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'tables')
const TABLES = block?.kind === 'tables' ? block.tables : []
const KEYS = block?.kind === 'tables' ? (block.keys ?? []) : []

describe('plans: s and r items', () => {
  it('reads s and r and writes them back the same', () => {
    const { items, bad } = parsePlan('s,w1,v2,r,t:where:1')
    expect(bad).toEqual([])
    expect(items.map(planKey).join(',')).toBe('s,w1,v2,r,t:where:1')
    expect(items[0]).toEqual({ kind: 's' })
    expect(items[3]).toEqual({ kind: 'r' })
  })
  it('drops a repeated s or r, and an item that only looks like one', () => {
    expect(parsePlan('s,s,r,r').items).toHaveLength(2)
    expect(parsePlan('S, R').items.map(planKey)).toEqual(['s', 'r'])
    expect(parsePlan('s2,rr,x').bad).toEqual(['s2', 'rr', 'x'])
  })
  it('keeps them through a plan address and its position', () => {
    const plan = planFromHash('#lesson=sql&plan=s,w1,r&i=3', CAT)!
    expect(plan.items.map(planKey)).toEqual(['s', 'w1', 'r'])
    expect(plan.at).toBe(3)
    expect(planHash('', plan.items, 2)).toBe('#lesson=sql&plan=s,w1,r&i=2')
  })
  it('tells the items that have four options', () => {
    expect(parsePlan('s,w1,v2,r,t:where:1').items.map(isVoteItem)).toEqual([false, true, true, false, false])
  })
})

describe('plans: named plans', () => {
  it('expands plan=intro and lists no skipped items', () => {
    const plan = planFromHash('#lesson=sql&plan=intro', CAT)!
    expect(plan.skipped).toEqual([])
    expect(plan.items.map(planKey).join(',')).toBe(PLAN_PRESETS.intro)
    expect(plan.at).toBe(1)
  })
  it('is case-insensitive and keeps the short name in the address', () => {
    const plan = planFromHash('#lesson=sql&plan=INTRO&i=4', CAT)!
    expect(plan.items.length).toBeGreaterThan(5)
    expect(plan.at).toBe(4)
    expect(planHash('', plan.items, plan.at)).toBe('#lesson=sql&plan=intro&i=4')
    expect(planHash('', plan.items, 1)).toBe('#lesson=sql&plan=intro')
  })
  it('treats an unknown name like a bad item', () => {
    const plan = planFromHash('#lesson=sql&plan=nope', CAT)!
    expect(plan.items).toEqual([])
    expect(plan.skipped).toEqual(['nope'])
  })
  it('still reads written plans as before', () => {
    expect(planFromHash('#lesson=sql&plan=w3,v2,t:inner-join:4&i=2', CAT)!.items.map(planKey)).toEqual(['w3', 'v2', 't:inner-join:4'])
    expect(planHash('', parsePlan('w3,v2').items, 2)).toBe('#lesson=sql&plan=w3,v2&i=2')
  })
  it('every item of intro exists, in the order schema → votes → results → one task', () => {
    const keys = PLAN_PRESETS.intro.split(',')
    expect(keys[0]).toBe('s')
    expect(keys.indexOf('r')).toBeGreaterThan(keys.findIndex((k) => /^[wv]/.test(k)))
    expect(keys[keys.length - 1]).toMatch(/^t:/)
    expect(keys.filter((k) => /^[wv]/.test(k)).length).toBeGreaterThanOrEqual(6)
  })
  it('intro: warm-ups are easy, votes use one fact table at most and never sell-in', () => {
    const { items } = parsePlan(PLAN_PRESETS.intro)
    for (const it of items) {
      if (it.kind === 'w') expect(WARMUP[it.n - 1].level).toBe('easy')
      if (it.kind !== 'w' && it.kind !== 'v') continue
      const sqls = it.kind === 'w' ? warmOptions(WARMUP[it.n - 1]).flatMap((o) => (o.sql ? [o.sql] : [])) : [VOTES[it.set][it.n - 1].right, ...VOTES[it.set][it.n - 1].wrong]
      const used = tablesOfQueries(sqls, TABLES)
      expect(used.filter((t) => t.startsWith('fact_')).length, planKey(it)).toBeLessThanOrEqual(1)
      expect(used, planKey(it)).not.toContain('fact_sellin')
    }
  })
  it('intro: the outer-join warm-ups are in, the task is the plain Yellow tag filter', () => {
    const keys = PLAN_PRESETS.intro.split(',')
    expect(keys).toContain('w5')
    expect(keys).toContain('w9')
    const t = parsePlan(PLAN_PRESETS.intro).items.at(-1)!
    const task = t.kind === 't' ? tasksOf(SECTIONS.find((s) => s.id === t.set)!)[t.n - 1] : null
    expect(task?.id).toBe('where-yellow-tag-promos')
    expect(task?.solution).not.toMatch(/JOIN/i)
  })
})

describe('plans: the step label', () => {
  it('is the text of the teacher header', () => {
    expect(stepLabel(3, 8)).toBe('Step 3 of 8')
    expect(stepLabel(1, 1)).toBe('Step 1 of 1')
  })
})

describe('phone: the results slide', () => {
  const room = (q_key: string | null): RoomState => ({ q_key, q_label: q_key ? 'Step 8 of 9' : null, open: true, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 })
  it('says results are on the screen, not "closed"', () => {
    expect(phoneStatus(phoneReduce(phoneStart(), { t: 'poll', room: room(RESULTS_KEY) } satisfies PhoneEvent))).toBe('results')
    expect(phoneStatus(phoneReduce(phoneStart(), { t: 'poll', room: room(null) }))).toBe('none')
    expect(phoneStatus(phoneReduce(phoneStart(), { t: 'poll', room: room('w1') }))).toBe('open')
  })
})

describe('schema: links between tables', () => {
  it('reads a written key line', () => {
    expect(parseKeyLine('fact_sellin.distributor_id → dim_customer.customer_id')).toEqual({ table: 'fact_sellin', from: 'distributor_id', to: 'dim_customer', toColumn: 'customer_id' })
    expect(parseKeyLine('a.b -> c.d')).toEqual({ table: 'a', from: 'b', to: 'c', toColumn: 'd' })
    expect(parseKeyLine('nonsense')).toBeNull()
  })
  const L = schemaLinks(TABLES, KEYS)
  const text = (t: string) => L[t].map((l) => linkText(t, l)).sort()
  it('derives <x>_id → the table whose key is <x>_id, not the own key', () => {
    expect(text('fact_sellout')).toEqual(['fact_sellout.customer_id → dim_customer', 'fact_sellout.product_id → dim_product', 'fact_sellout.promo_id → dim_promo'])
    expect(text('dim_customer')).toContain('dim_customer.region_id → dim_region')
    expect(text('dim_rep')).toContain('dim_rep.region_id → dim_region')
    expect(text('dim_region')).toEqual([])
    expect(text('dim_product')).toEqual([])
  })
  it('keeps the written links and does not guess for them', () => {
    expect(text('fact_sellin')).toContain('fact_sellin.distributor_id → dim_customer.customer_id')
    expect(text('fact_sellin').filter((l) => l.includes('distributor_id'))).toHaveLength(1)
    expect(text('dim_customer')).toContain('dim_customer.served_by_distributor_id → dim_customer.customer_id')
    expect(text('dim_rep')).toContain('dim_rep.manager_id → dim_rep.rep_id')
    expect(L.dim_customer.some((l) => l.from === 'customer_id')).toBe(false) // the own key is never a link
  })
  it('derives on small tables too, and ignores a column with no table behind it', () => {
    const t = [
      { name: 'a', row: 'x', columns: ['a_id', 'b_id', 'c_id'] },
      { name: 'b', row: 'y', columns: ['b_id', 'name'] },
    ]
    expect(schemaLinks(t)).toEqual({ a: [{ from: 'b_id', to: 'b', toColumn: 'b_id' }], b: [] })
  })
  it('shows only the links between the shown tables', () => {
    const shown = schemaOf(['fact_sellout', 'dim_customer'], TABLES, KEYS)
    expect(linksAmong(shown)).toEqual(['fact_sellout.customer_id → dim_customer', 'dim_customer.served_by_distributor_id → dim_customer.customer_id'])
    expect(shown[0].key).toBe('sellout_id')
  })
})

describe('schema: the tables of a plan', () => {
  it('finds the tables named by FROM and JOIN in all queries, facts first', () => {
    expect(tablesOfQueries(['SELECT * FROM quaera.dim_customer c JOIN quaera.dim_region r ON 1=1', 'select 1 from quaera.fact_sellout'], TABLES)).toEqual(['fact_sellout', 'dim_customer', 'dim_region'])
    expect(tablesOfQueries(['SELECT 1'], TABLES)).toEqual([])
  })
  it('intro uses sell-out, customers, regions, reps, products and promos only', () => {
    const names = planSchema(parsePlan(PLAN_PRESETS.intro).items).map((t) => t.name)
    expect(names).toContain('dim_customer')
    expect(names).toContain('fact_sellout')
    expect(names).not.toContain('fact_sellin')
    expect(names.length).toBeLessThan(TABLES.length)
  })
  it('a plan with no query shows all the tables', () => {
    expect(planSchema(parsePlan('s,r').items)).toHaveLength(TABLES.length)
  })
})

const item = (step: number, key: string, right: 'A' | 'B' | 'C' | 'D' = 'B'): ResultItem => ({ step, key, text: key, right })
const c = (A: number, B: number, C: number, D: number) => ({ A, B, C, D })

describe('results: phones and hands', () => {
  it('computes the share of right answers', () => {
    const [r] = computeResults([item(2, 'w1', 'B')], { w1: c(1, 3, 0, 0) }, null)
    expect(r).toMatchObject({ step: 2, total: 4, rightPct: 75, source: 'phones' })
  })
  it('nothing counted: no percentage, no division by zero', () => {
    const [r] = computeResults([item(1, 'w1')], { w1: c(0, 0, 0, 0) }, { w1: ['', '', '', ''] })
    expect(r).toMatchObject({ counts: null, total: 0, rightPct: null, source: null })
    expect(computeResults([item(1, 'w1')], null, null)[0].rightPct).toBeNull()
  })
  it('uses hands when no phone voted, and phones win when both exist', () => {
    const hands = { w1: ['1', '2', '0', '0'] }
    expect(computeResults([item(1, 'w1')], null, hands)[0]).toMatchObject({ source: 'hands', total: 3, rightPct: 67 })
    expect(computeResults([item(1, 'w1')], { w1: c(0, 0, 0, 0) }, hands)[0].source).toBe('hands')
    expect(computeResults([item(1, 'w1')], { w1: c(5, 0, 0, 0) }, hands)[0]).toMatchObject({ source: 'phones', total: 5, rightPct: 0 })
  })
  it('keeps the plan order and an item never revealed still shows its counts', () => {
    const rows = computeResults([item(3, 'v1', 'A'), item(5, 'w4', 'C')], { w4: c(0, 0, 2, 0) }, null)
    expect(rows.map((r) => r.step)).toEqual([3, 5])
    expect(rows[0].rightPct).toBeNull()
    expect(rows[1].rightPct).toBe(100)
  })
  it('reads typed hands: junk counts as zero', () => {
    expect(handsToCounts(undefined)).toBeNull()
    expect(handsToCounts(['x', '-1', '1.5', ''])).toBeNull()
    expect(handsToCounts(['2', '', ' 3 ', '0'])).toEqual(c(2, 0, 3, 0))
  })
  it('shortens a question to about 80 characters', () => {
    expect(shortText('a `b`   c')).toBe('a b c')
    const long = shortText('x'.repeat(200))
    expect(long.length).toBe(80)
    expect(long.endsWith('…')).toBe(true)
  })
  it('reads the kept hands safely', () => {
    expect(readHands(null)).toEqual({})
    expect(readHands('{bad')).toEqual({})
    expect(readHands('[1]')).toEqual({})
    expect(readHands(JSON.stringify({ s: { w1: ['1', '2', '3', '4'], w2: [1], w3: 'x' }, t: 5 }))).toEqual({ s: { w1: ['1', '2', '3', '4'] } })
    expect(HANDS_KEY).toBe('stratalab.lesson.hands.v1')
  })
})

describe('results: the summary from the room', () => {
  it('turns the rows into a map by question', () => {
    expect(parseSummary([{ q_key: 'w1', counts: { A: 1, B: 2, C: 0, D: 0 }, total: 3 }, { q_key: 'v2', counts: { D: 4 } }])).toEqual({ w1: c(1, 2, 0, 0), v2: c(0, 0, 0, 4) })
    expect(parseSummary([])).toEqual({})
    expect(parseSummary(null)).toBeNull()
    expect(parseSummary([{ counts: {} }, 5, null])).toEqual({})
  })
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response
  it('asks lesson_room_summary; a missing function gives null, an unknown room gives nothing', async () => {
    const f = vi.fn().mockResolvedValue(reply(200, [{ q_key: 'w1', counts: { A: 1, B: 0, C: 0, D: 0 }, total: 1 }]))
    expect(await roomSummary('K7M2P', f)).toEqual({ w1: c(1, 0, 0, 0) })
    expect(f.mock.calls[0][0]).toMatch(/\/rpc\/lesson_room_summary$/)
    expect(await roomSummary('K7M2P', vi.fn().mockResolvedValue(reply(404, { code: 'PGRST202' })))).toBeNull()
    expect(await roomSummary('K7M2P', vi.fn().mockResolvedValue(reply(200, null)))).toEqual({})
    await expect(roomSummary('K7M2P', vi.fn().mockRejectedValue(new TypeError('x')))).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('plans: arrange stays as before', () => {
  it('puts the right query of a vote where the rule says', () => {
    expect(arrange(VOTES['inner-join'][0], 0).find((o) => o.right)!.letter).toBe('B')
  })
})
