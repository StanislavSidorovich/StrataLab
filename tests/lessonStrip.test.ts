// The "Tables used" strip under a question on the projector (v0.75): which tables a question's queries use, for every warm-up, vote,
// demo shop question and fill question; the rows are read live and are not tested here (e2e/lessonTables.spec.ts).
import { describe, expect, it } from 'vitest'
import { VOTES, WARMUP } from '../src/data/lessonVotes'
import { SHOP_VOTES } from '../src/data/lessonVotes/shop'
import { FILL_QUESTIONS } from '../src/data/lessonFill'
import { SHOP_TABLES } from '../src/data/shopTables'
import { SECTIONS } from '../src/data/sqlPractice'
import type { PlanItem } from '../src/core/lesson'
import { sqlsOfItem, stripTables } from '../src/ui/LessonPlanSlides'

const block = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'tables')
const KAIYO = block?.kind === 'tables' ? block.tables.map((t) => t.name) : []
const SHOP = SHOP_TABLES.map((t) => t.name)

const items: { item: PlanItem; label: string }[] = [
  ...WARMUP.map((_, i) => ({ item: { kind: 'w', n: i + 1 } as PlanItem, label: `w${i + 1}` })),
  ...Object.entries(VOTES).flatMap(([set, qs]) => qs.map((_, i) => ({ item: { kind: 'v', set, n: i + 1 } as PlanItem, label: `v:${set}:${i + 1}` }))),
  ...SHOP_VOTES.map((_, i) => ({ item: { kind: 'd', n: i + 1 } as PlanItem, label: `d${i + 1}` })),
  ...FILL_QUESTIONS.map((_, i) => ({ item: { kind: 'f', n: i + 1 } as PlanItem, label: `f${i + 1}` })),
]

describe('stripTables', () => {
  it('covers every warm-up, vote, demo shop and fill question', () => {
    expect(items.length).toBeGreaterThan(30)
  })
  it.each(items)('$label names at least one existing table, with its key', ({ item }) => {
    const { schema, tables } = stripTables(item)
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const known = item.kind === 'd' || item.kind === 'f' ? SHOP : KAIYO
    expect(schema).toBe(item.kind === 'd' || item.kind === 'f' ? 'demo' : 'quaera')
    for (const t of tables) {
      expect(known).toContain(t.name)
      expect(t.key).toBe(t.columns[0])
    }
    expect(new Set(tables.map((t) => t.name)).size).toBe(tables.length) // each once
  })
  it('a fill question is read from its right answers, so a table named after a gap (LEFT JOIN demo.orders) counts', () => {
    expect(stripTables({ kind: 'f', n: 2 }).tables.map((t) => t.name).sort()).toEqual(['customers', 'orders'])
    expect(sqlsOfItem({ kind: 'f', n: 2 })[0]).toMatch(/join demo\.orders/i)
  })
  it('an item that does not exist, or the schema slide, has no tables and no crash', () => {
    expect(stripTables({ kind: 'w', n: 9999 }).tables).toEqual([])
    expect(stripTables({ kind: 's' }).tables).toEqual([])
    expect(stripTables({ kind: 'f', n: 9999 }).tables).toEqual([])
  })
})
