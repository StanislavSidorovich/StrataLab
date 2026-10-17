import { describe, expect, it } from 'vitest'
import { allSteps, countSteps, explainStatement, lastStatement, parseDuckPlan, parsePgPlan, planTips, readsOnly, shortTable, stepKind, withoutInternal } from '../src/core/plan'

// Shapes as DuckDB 1.5 and PostgreSQL 18 (PGlite) return them, cut down.
const duckAnalyzed = {
  latency: 0.003,
  operator_name: undefined,
  children: [
    {
      operator_name: 'EXPLAIN_ANALYZE',
      operator_timing: 0,
      operator_cardinality: 0,
      children: [
        {
          operator_name: 'TOP_N',
          operator_timing: 0.00002,
          operator_cardinality: 3,
          extra_info: { Top: '3', 'Order By': 'sum(memory.main.o.amount) DESC' },
          children: [
            {
              operator_name: 'PROJECTION',
              operator_timing: 0.000003,
              operator_cardinality: 5,
              extra_info: { Projections: ['__internal_decompress_integral_bigint(#0, 0)', '#1'], 'Estimated Cardinality': '5' },
              children: [
                {
                  operator_name: 'PERFECT_HASH_GROUP_BY',
                  operator_timing: 0.0002,
                  operator_cardinality: 5,
                  extra_info: { Groups: '#0', Aggregates: 'sum(#1)' },
                  children: [
                    {
                      operator_name: 'HASH_JOIN',
                      operator_timing: 0.0004,
                      operator_cardinality: 19780,
                      extra_info: { 'Join Type': 'INNER', Conditions: 'cid = id', 'Estimated Cardinality': '586' },
                      children: [
                        {
                          operator_name: 'SEQ_SCAN',
                          operator_timing: 0.0012,
                          operator_cardinality: 19780,
                          operator_rows_scanned: 20000,
                          extra_info: { Table: 'memory.main.o', Type: 'Sequential Scan', Projections: ['cid', 'amount'], Filters: 'cid>10', 'Estimated Cardinality': '4000' },
                          children: [],
                        },
                        {
                          operator_name: 'SEQ_SCAN',
                          operator_timing: 0.0002,
                          operator_cardinality: 989,
                          operator_rows_scanned: 1000,
                          extra_info: { Table: 'memory.main.c', Projections: ['id', 'grp'], Filters: 'id>10', 'Estimated Cardinality': '200' },
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const duckEstimated = [
  {
    name: 'HASH_GROUP_BY',
    children: [{ name: 'SEQ_SCAN ', children: [], extra_info: { Table: 'stratalab.chinook.track', Projections: ['genre_id'], 'Estimated Cardinality': '3503' } }],
    extra_info: { Groups: '#0', Aggregates: 'count_star()', 'Estimated Cardinality': '25' },
  },
]

const pgAnalyzed = [
  {
    Plan: {
      'Node Type': 'Aggregate',
      Strategy: 'Hashed',
      'Plan Rows': 5,
      'Actual Total Time': 10,
      'Actual Rows': 5,
      'Actual Loops': 1,
      'Group Key': ['c.grp'],
      'Shared Hit Blocks': 136,
      Plans: [
        {
          'Node Type': 'Hash Join',
          'Join Type': 'Inner',
          'Hash Cond': '(o.cid = c.id)',
          'Plan Rows': 200,
          'Actual Total Time': 9,
          'Actual Rows': 60000,
          'Actual Loops': 1,
          Plans: [
            { 'Node Type': 'Seq Scan', 'Relation Name': 'o', Alias: 'o', Filter: '(amount = 3)', 'Rows Removed by Filter': 19800, 'Plan Rows': 200, 'Actual Total Time': 6, 'Actual Rows': 200, 'Actual Loops': 1 },
            {
              'Node Type': 'Hash',
              'Plan Rows': 1000,
              'Actual Total Time': 1,
              'Actual Rows': 1000,
              'Actual Loops': 1,
              Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'c', Alias: 'c', 'Plan Rows': 1000, 'Actual Total Time': 0.5, 'Actual Rows': 1000, 'Actual Loops': 1 }],
            },
          ],
        },
      ],
    },
    'Execution Time': 10.2,
  },
]

describe('what Explain runs', () => {
  it('takes the last statement of a script, without comments', () => {
    expect(lastStatement('CREATE TABLE t AS SELECT 1 AS a;\n-- then\nSELECT a FROM t;')).toEqual({ statement: 'SELECT a FROM t', count: 2 })
    expect(lastStatement("SELECT ';' AS semi")).toEqual({ statement: "SELECT ';' AS semi", count: 1 })
  })

  it('runs only queries that read; anything that could write is only planned', () => {
    expect(readsOnly('SELECT * FROM orders')).toBe(true)
    expect(readsOnly('with x as (select 1) select * from x')).toBe(true)
    expect(readsOnly('FROM orders')).toBe(true)
    expect(readsOnly("SELECT 'please delete me', update_date, \"update\" FROM t")).toBe(true)
    expect(readsOnly('DELETE FROM orders')).toBe(false)
    expect(readsOnly('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x')).toBe(false)
    expect(readsOnly('CREATE TABLE t AS SELECT 1')).toBe(false)
    expect(readsOnly('PRAGMA show_tables')).toBe(false)
  })

  it('asks for JSON, with ANALYZE only when it may run', () => {
    expect(explainStatement('SELECT 1', true)).toBe('EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1')
    expect(explainStatement('DELETE FROM t', false)).toBe('EXPLAIN (FORMAT JSON) DELETE FROM t')
  })
})

describe('the steps', () => {
  it('names DuckDB and PostgreSQL steps alike', () => {
    expect(stepKind('HASH_JOIN')).toBe('hash-join')
    expect(stepKind('Hash Join')).toBe('hash-join')
    expect(stepKind('SEQ_SCAN ')).toBe('scan')
    expect(stepKind('Seq Scan')).toBe('scan')
    expect(stepKind('Index Only Scan')).toBe('index')
    expect(stepKind('CROSS_PRODUCT')).toBe('loop-join')
    expect(stepKind('Nested Loop')).toBe('loop-join')
    expect(stepKind('Aggregate', 'Hashed')).toBe('group')
    expect(stepKind('Aggregate', 'Plain')).toBe('total')
    expect(stepKind('UNGROUPED_AGGREGATE')).toBe('total')
    expect(stepKind('TOP_N')).toBe('top')
    expect(stepKind('STREAMING_LIMIT')).toBe('limit')
    expect(stepKind('DUMMY_SCAN')).toBe('values')
    expect(stepKind('CTE_SCAN')).toBe('cte')
    expect(stepKind('Subquery Scan')).toBe('other')
    expect(stepKind('SOMETHING_NEW')).toBe('other')
  })

  it('shortens table names', () => {
    expect(shortTable('memory.main.orders')).toBe('orders')
    expect(shortTable('stratalab.chinook.track')).toBe('chinook.track')
    expect(shortTable('public.orders')).toBe('orders')
  })
})

describe('reading a DuckDB plan', () => {
  it('reads EXPLAIN ANALYZE: rows, own time, share of the time', () => {
    const plan = parseDuckPlan(JSON.stringify(duckAnalyzed), true)
    expect(plan.root.op).toBe('TOP_N')
    expect(plan.root.title).toBe('Top rows (ORDER BY … LIMIT)')
    expect(plan.root.summary).toBe('first 3 by sum(o.amount) DESC')
    expect(countSteps(plan.root)).toBe(6)
    expect(plan.totalMs).toBeCloseTo(2.023, 3)
    const scan = allSteps(plan.root).find((n) => n.summary.startsWith('o'))!
    expect(scan).toMatchObject({ kind: 'scan', summary: 'o · where cid>10', rows: 19780, scanned: 20000, estimate: 4000 })
    expect(scan.ms).toBeCloseTo(1.2)
    expect(scan.share).toBeCloseTo(1.2 / 2.023, 3)
    const join = allSteps(plan.root).find((n) => n.kind === 'hash-join')!
    expect(join.summary).toBe('INNER: cid = id')
    expect(join.details).toContainEqual(['Conditions', 'cid = id'])
  })

  it('names the input columns DuckDB numbers (#0) from the step below', () => {
    const plan = parseDuckPlan(JSON.stringify([{ name: 'HASH_GROUP_BY', extra_info: { Groups: '#0', Aggregates: 'count_star()\nsum(#1)' }, children: [{ name: 'PROJECTION', extra_info: { Projections: ['full_name', 'quantity'] }, children: [] }] }]), false)
    expect(plan.root.summary).toBe('full_name · count(*)\nsum(quantity)')
    // An internal column below stays a number.
    const inner = parseDuckPlan(JSON.stringify([{ name: 'HASH_GROUP_BY', extra_info: { Groups: '#0' }, children: [{ name: 'PROJECTION', extra_info: { Projections: ['#3'] }, children: [] }] }]), false)
    expect(inner.root.summary).toBe('#0')
  })

  it('hides DuckDB’s internal column steps', () => {
    const plan = withoutInternal(parseDuckPlan(JSON.stringify(duckAnalyzed), true))
    expect(plan.hidden).toBe(1)
    expect(plan.root.children[0].kind).toBe('group')
    expect(plan.totalMs).toBeCloseTo(2.023, 3)
  })

  it('reads plain EXPLAIN: estimates, no rows or times', () => {
    const plan = parseDuckPlan(JSON.stringify(duckEstimated), false)
    expect(plan.analyzed).toBe(false)
    expect(plan.totalMs).toBeNull()
    expect(plan.root).toMatchObject({ kind: 'group', rows: null, ms: null, estimate: 25, summary: 'genre_id · count(*)' })
    expect(plan.root.children[0]).toMatchObject({ op: 'SEQ_SCAN', summary: 'chinook.track', estimate: 3503 })
    expect(planTips(plan)).toEqual([])
  })
})

describe('reading a PostgreSQL plan', () => {
  it('works out each step’s own time from the totals', () => {
    const plan = parsePgPlan(pgAnalyzed, true)
    expect(plan.engine).toBe('postgres')
    expect(plan.root).toMatchObject({ kind: 'group', summary: 'c.grp', rows: 5, estimate: 5 })
    expect(plan.root.ms).toBeCloseTo(1)
    const [scan, hash] = plan.root.children[0].children
    expect(scan).toMatchObject({ kind: 'scan', summary: 'o · where (amount = 3)', rows: 200, scanned: 20000 })
    expect(hash.kind).toBe('hash')
    expect(hash.ms).toBeCloseTo(0.5)
    expect(plan.totalMs).toBeCloseTo(10)
    expect(plan.root.details.some(([k]) => k.endsWith('Blocks'))).toBe(false)
  })

  it('reads the JSON as text too', () => {
    expect(parsePgPlan(JSON.stringify(pgAnalyzed), true).root.kind).toBe('group')
  })

  it('reads a planned write', () => {
    const plan = parsePgPlan([{ Plan: { 'Node Type': 'ModifyTable', Operation: 'Delete', 'Relation Name': 'o', 'Plan Rows': 0, Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'o', Filter: '(id < 5)', 'Plan Rows': 4 }] } }], false)
    expect(plan.root).toMatchObject({ kind: 'write', title: 'Delete rows', summary: 'o', rows: null })
  })

  it('refuses an empty plan', () => {
    expect(() => parsePgPlan([], true)).toThrow(/empty plan/)
  })
})

describe('tips', () => {
  it('names the slowest step, a join that multiplies rows and a full read an index could avoid', () => {
    const tips = planTips(parsePgPlan(pgAnalyzed, true)).map((t) => t.text)
    expect(tips[0]).toBe('Most of the time (60%) goes to “Read a table” (o · where (amount = 3)).')
    expect(tips.some((t) => t.includes('gave 60,000 rows, more than either input (200 and 1,000)'))).toBe(true)
    expect(tips.some((t) => t.startsWith('PostgreSQL read all 20,000 rows of o to keep 200.'))).toBe(true)
  })

  it('warns about a join that pairs every row with every row', () => {
    const cross = [{ name: 'CROSS_PRODUCT', extra_info: {}, children: [{ name: 'SEQ_SCAN', extra_info: { Table: 'a', 'Estimated Cardinality': '5000' } }, { name: 'SEQ_SCAN', extra_info: { Table: 'b', 'Estimated Cardinality': '3000' } }] }]
    const tips = planTips(parseDuckPlan(JSON.stringify(cross), false))
    expect(tips).toHaveLength(1)
    expect(tips[0]).toMatchObject({ warn: true })
    expect(tips[0].text).toContain('pairs 5,000 × 3,000 rows')
  })

  it('does not call a cross join’s rows a repeated key', () => {
    const scan = (t: string, rows: number) => ({ operator_name: 'SEQ_SCAN', operator_timing: 0, operator_cardinality: rows, extra_info: { Table: t } })
    const cross = { children: [{ operator_name: 'CROSS_PRODUCT', operator_timing: 0.5, operator_cardinality: 1_500_000, extra_info: {}, children: [scan('a', 500), scan('b', 3000)] }] }
    const tips = planTips(parseDuckPlan(JSON.stringify(cross), true)).map((t) => t.text)
    expect(tips.some((t) => t.includes('pairs 500 × 3,000 rows'))).toBe(true)
    expect(tips.some((t) => t.includes('the key repeats'))).toBe(false)
  })
})
