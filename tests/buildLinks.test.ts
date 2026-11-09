// Б5a of the build page: the pure rules of the linking screen (docs/build-linking-screen.md, 3 to 6, 8.1).
import { describe, expect, it } from 'vitest'
import { emptyBuild, modelDone, readBuild } from '../src/core/build'
import { acceptedLabel, addLink, canBuildStar, diagnoseLink, linksOfPass, matchExpected, modelLinked, readLinks, removeLink, starSql, starStatements, swap, typeFamily, type Link, type LinkFacts, type SideFacts } from '../src/core/buildLinks'
import { EXPECTED_LINKS } from '../src/data/build/linkData'

const link = (id: Link['id']): Link => {
  const e = EXPECTED_LINKS.find((x) => x.id === id)!
  return { id, many: { ...e.many }, one: { ...e.one } }
}
const ALL = EXPECTED_LINKS.map((e) => link(e.id))

function side(table: string, column: string, type: string, o: Partial<SideFacts> = {}): SideFacts {
  return { slot: { table, column }, type, total: 10, rows: 10, distinct: 10, repeated: 0, min: '1', max: '10', samples: ['a', 'b', 'c'], ...o }
}
function facts(many: SideFacts, one: SideFacts, found: LinkFacts['found']): LinkFacts {
  return { many, one, found }
}
const FOUND_OK = { unmatchedRows: 0, unmatchedValues: 0, unmatchedSamples: [], unmatchedRevenue: null, joinRows: 3000, oneUnused: 99 }

describe('typeFamily (8.1)', () => {
  it('sorts DuckDB types into text, number, date, other', () => {
    for (const t of ['VARCHAR', 'VARCHAR(20)']) expect(typeFamily(t)).toBe('text')
    for (const t of ['TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT', 'UBIGINT', 'DECIMAL(12,2)', 'DOUBLE', 'FLOAT']) expect(typeFamily(t)).toBe('number')
    for (const t of ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE']) expect(typeFamily(t)).toBe('date')
    for (const t of ['BOOLEAN', 'BLOB', 'INTEGER[]']) expect(typeFamily(t)).toBe('other')
  })
})

describe('pairs', () => {
  it('swap turns a pair round, matchExpected knows the five by orientation and pass', () => {
    const l1 = link('L1')
    expect(swap(l1).many).toEqual(l1.one)
    expect(matchExpected(l1, 1)?.id).toBe('L1')
    expect(matchExpected(l1, 2)).toBeNull()
    expect(matchExpected(swap(l1), 1)).toBeNull()
    expect(matchExpected(link('F2'), 2)?.id).toBe('F2')
  })
})

describe('diagnoseLink (4.2)', () => {
  const sales = (o?: Partial<SideFacts>) => side('clean_sales', 'customer_name', 'VARCHAR', { total: 3000, rows: 3000, distinct: 45, repeated: 40, ...o })
  const customers = (o?: Partial<SideFacts>) => side('clean_customers', 'customer_name', 'VARCHAR', { total: 144, rows: 144, distinct: 144, repeated: 0, ...o })

  it('passes L1 with the lookup note and the 99 note', () => {
    const d = diagnoseLink(facts(sales(), customers(), FOUND_OK), 1)
    expect(d.key).toBe('pass')
    expect(d.ok).toBe(true)
    expect(d.chips.map((c) => c.state)).toEqual(['pass', 'pass', 'pass', 'pass'])
    expect(d.line).toBe('One customer for each value, and all 3,000 rows of sales found theirs.')
    expect(d.notes).toEqual(['99 of 144 customers have no sales. Normal: a dimension lists everything, the fact only what was sold.', 'Linked by name: fine for looking the id up. The star will link by id.'])
    expect(d.result).toBe('customers: 144 rows, keys unique · sales: 0 of 3,000 rows found no customer')
    expect(acceptedLabel(facts(sales(), customers(), FOUND_OK))).toBe('3,000 → 144 · all found')
  })
  it('refuses a made link', () => {
    const d = diagnoseLink(facts(sales(), customers(), FOUND_OK), 1, true)
    expect(d.ok).toBe(false)
    expect(d.line).toMatch(/already made/)
  })
  it('sameTable first', () => {
    const d = diagnoseLink(facts(sales(), side('clean_sales', 'sku_code', 'VARCHAR'), FOUND_OK), 1)
    expect(d.key).toBe('sameTable')
  })
  it('typeMismatch for region_id, with the fix button, and Found not run', () => {
    const d = diagnoseLink(
      facts(side('clean_customers', 'region_id', 'BIGINT', { samples: ['1'] }), side('clean_regions', 'region_id', 'VARCHAR', { samples: ['R-01'] }), null),
      1,
    )
    expect(d.key).toBe('typeMismatch')
    expect(d.fix).toEqual({ kind: 'region' })
    expect(d.chips.map((c) => c.state)).toEqual(['fail', 'pass', 'skip', 'skip'])
    expect(d.line).toBe("customers.region_id is a number (BIGINT) and regions.region_id is text (VARCHAR): 1 and R-01 can't be compared. Fix the type in Clean first.")
  })
  it('wrongWay when the 1 side repeats and the N side does not, notUnique when both repeat', () => {
    const wrong = diagnoseLink(facts(customers({ total: 144 }), sales({ rows: 3000, distinct: 45, repeated: 40 }), { ...FOUND_OK, unmatchedRows: 99, unmatchedValues: 99 }), 1)
    expect(wrong.key).toBe('wrongWay')
    expect(wrong.fix).toEqual({ kind: 'swap' })
    expect(wrong.line).toMatch(/^sales\.customer_name repeats: 3,000 rows, only 45 different values\./)
    const both = diagnoseLink(facts(sales(), customers({ rows: 148, distinct: 144, repeated: 4 }), { ...FOUND_OK, joinRows: 3385 }), 1)
    expect(both.key).toBe('notUnique')
    expect(both.line).toBe(`customers.customer_name isn't unique on the "1" side: 4 values appear more than once, so 3,000 sales would become 3,385. Each value needs one row.`)
    expect(both.fix).toEqual({ kind: 'clean', source: 'customers' })
  })
  it('noMatch beats wrongWay; unmatched says the money', () => {
    const none = diagnoseLink(
      facts(sales(), side('clean_customers', 'chain_name', 'VARCHAR', { rows: 71, distinct: 12, repeated: 12, samples: ['Bazario', 'Farmalux', 'Hakobu'] }), {
        ...FOUND_OK,
        unmatchedRows: 3000,
        unmatchedValues: 45,
        unmatchedSamples: ['Ichiba #1026', 'Ichiba #1035', 'Ichiba #1036'],
      }),
      1,
    )
    expect(none.key).toBe('noMatch')
    expect(none.line).toBe("Not one row of sales.customer_name finds a partner in customers.chain_name: 'Ichiba #1026', 'Ichiba #1035', 'Ichiba #1036' against 'Bazario', 'Farmalux', 'Hakobu'. Is it the right column?")
    const part = diagnoseLink(
      facts(side('clean_sales', 'sku_code', 'VARCHAR', { total: 3000, rows: 3000, distinct: 29, repeated: 29 }), side('clean_products', 'sku_code', 'VARCHAR', { total: 47, rows: 47, distinct: 47 }), {
        ...FOUND_OK,
        unmatchedRows: 714,
        unmatchedValues: 6,
        unmatchedSamples: ['AQUA002', 'FRUV002 ', ' KROS001'],
        unmatchedRevenue: '392540.33',
        joinRows: 2286,
      }),
      1,
    )
    expect(part.key).toBe('unmatched')
    expect(part.line).toBe("714 sales found no product (6 different values: 'AQUA002', 'FRUV002␣', '␣KROS001', …): 392,540.33 of revenue would be left out. A key has to match to the character.")
    expect(part.badLabel).toBe('714 not found')
  })
  it('F-x: every data check passes, so Right pair says it is by chance; other pairs say notExpected', () => {
    const fx = diagnoseLink(
      facts(side('gold_fact_sales', 'product_id', 'INTEGER', { total: 3000, rows: 3000, distinct: 29, repeated: 29, max: '47' }), side('gold_dim_customer', 'customer_id', 'INTEGER', { total: 144, rows: 144, distinct: 144, max: '144' }), FOUND_OK),
      2,
    )
    expect(fx.key).toBe('sameByChance')
    expect(fx.ok).toBe(false)
    expect(fx.chips.map((c) => c.state)).toEqual(['pass', 'pass', 'pass', 'fail'])
    expect(fx.line).toMatch(/fact_sales\.product_id runs 1 to 47 and dim_customer\.customer_id runs 1 to 144/)
    const other = diagnoseLink(facts(sales(), side('clean_products', 'product_name', 'VARCHAR'), FOUND_OK), 1)
    expect(other.key).toBe('notExpected')
  })
})

describe('the links and what is kept', () => {
  it('addLink keeps one per id in order; removing a lookup after the star clears the id links', () => {
    let l: Link[] = []
    for (const id of ['L3', 'L1', 'L2'] as const) l = addLink(l, link(id))
    expect(l.map((x) => x.id)).toEqual(['L1', 'L2', 'L3'])
    expect(canBuildStar(l)).toBe(true)
    expect(modelLinked(l)).toBe(false)
    l = addLink(addLink(l, link('F2')), link('F1'))
    expect(modelLinked(l)).toBe(true)
    expect(linksOfPass(l, 2).map((x) => x.id)).toEqual(['F1', 'F2'])
    expect(removeLink(l, true, 'F1')).toEqual({ links: l.filter((x) => x.id !== 'F1'), star: true })
    const r = removeLink(l, true, 'L2')
    expect(r.star).toBe(false)
    expect(r.links.map((x) => x.id)).toEqual(['L1', 'L3'])
    expect(removeLink(l.slice(0, 3), false, 'L2').links.map((x) => x.id)).toEqual(['L1', 'L3'])
  })
  it('readLinks drops what is not expected and the id links without a star', () => {
    const odd = { id: 'L1', many: { table: 'clean_sales', column: 'sku_code' }, one: { table: 'clean_customers', column: 'customer_name' } }
    expect(readLinks([odd, ...ALL], true).map((x) => x.id)).toEqual(['L1', 'L2', 'L3', 'F1', 'F2'])
    expect(readLinks([odd, ...ALL], false).map((x) => x.id)).toEqual(['L1', 'L2', 'L3'])
    expect(readLinks([odd], true)).toEqual([])
    expect(readLinks('x', true)).toEqual([])
  })
  it('readBuild keeps links and star, repairs the rest, and keeps a first-version state done', () => {
    const base = { ...emptyBuild(), done: ['connect', 'clean'], open: 'model', links: ALL, star: true }
    const s = readBuild(JSON.stringify(base))
    expect(s.links.map((x) => x.id)).toEqual(['L1', 'L2', 'L3', 'F1', 'F2'])
    expect(s.star).toBe(true)
    expect(s.v1).toBe(false)
    expect(modelDone(s)).toBe(true)
    // pass-2 links without a star are dropped
    expect(readBuild(JSON.stringify({ ...base, star: false })).links.map((x) => x.id)).toEqual(['L1', 'L2', 'L3'])
    // saved by the first version: no `links` key, Model done
    const old: Record<string, unknown> = { ...emptyBuild(), done: ['connect', 'clean', 'model'], open: 'dashboard' }
    for (const k of ['links', 'star', 'v1']) delete old[k]
    const v1 = readBuild(JSON.stringify(old))
    expect(v1.v1).toBe(true)
    expect(v1.done).toContain('model')
    expect(v1.links).toEqual([])
    // a state of the new version with Model done keeps no v1 flag
    expect(readBuild(JSON.stringify({ ...emptyBuild(), done: ['connect', 'clean', 'model'] })).v1).toBe(false)
  })
})

describe('Build the star (6)', () => {
  it('needs L1 to L3 and writes the SQL from them', () => {
    expect(starSql(ALL.slice(0, 2))).toBeNull()
    expect(starStatements(ALL.slice(0, 2))).toBeNull()
    const sql = starSql(ALL)!
    expect(starStatements(ALL)).toHaveLength(3)
    expect(sql).toContain('LEFT JOIN build_kaiyo.clean_regions r ON r.region_id = c.region_id')
    expect(sql).toContain('-- your link L1')
    expect(sql).toContain('-- your link L2')
    expect(sql).toContain('-- your link L3')
    expect(sql).toContain('c.customer_name = s.customer_name')
    expect(sql).toContain('p.sku_code = s.sku_code')
    expect(sql).toContain('r.region_name, r.macro_region')
    expect(sql.trim().endsWith(';')).toBe(true)
  })
})
