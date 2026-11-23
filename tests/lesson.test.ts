// Lesson mode: the address, the tables a task names, the shuffle of a vote, and every vote option run on the real rows.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { compareResults, type ResultData } from '../src/core/check'
import { LETTERS, arrange, describeRun, errorLine, lastTask, clampIndex, hashWithoutLesson, lessonFromHash, lessonHash, lessonTables, tablesNamed } from '../src/core/lesson'
import { resultRows } from '../src/db/export'
import { datasetById } from '../src/data/datasets'
import { SECTIONS, tasksOf } from '../src/data/sqlPractice'
import { INNER_JOIN } from '../src/data/sqlPractice/s07-inner-join'
import { INNER_JOIN_VOTES } from '../src/data/lessonVotes/innerJoin'
import { practiceFromHash } from '../src/core/sqlPractice'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'

const require = createRequire(import.meta.url)

describe('lesson: the address', () => {
  it('reads kind, set, mode and number, in any case', () => {
    expect(lessonFromHash('#lesson=sql&set=inner-join&task=3')).toEqual({ kind: 'sql', set: 'inner-join', mode: 'task', n: 3 })
    expect(lessonFromHash('#lesson=SQL&SET=Inner-Join&Mode=VOTE&q=2')).toEqual({ kind: 'sql', set: 'inner-join', mode: 'vote', n: 2 })
    expect(lessonFromHash('#lesson=python')).toEqual({ kind: 'python', set: null, mode: 'task', n: null })
    expect(lessonFromHash('#lesson=sql&set=inner-join&task=abc')?.n).toBeNaN()
  })
  it('is not a lesson for other links, and leaves them alone', () => {
    expect(lessonFromHash('#ds=quaera')).toBeNull()
    expect(lessonFromHash('#practice=sql&at=joins')).toBeNull()
    expect(lessonFromHash('#lesson=chess')).toBeNull()
    expect(practiceFromHash('#lesson=sql&set=x&practice=sql&at=a')).toEqual({ kind: 'sql', at: 'a' })
    expect(hashWithoutLesson('#lesson=sql&set=inner-join&task=3&ds=quaera')).toBe('#ds=quaera')
    expect(lessonHash('#ds=quaera', { kind: 'sql', set: 'inner-join', n: 2 })).toBe('#lesson=sql&set=inner-join&task=2&ds=quaera')
    expect(lessonHash('', { kind: 'sql', set: 'inner-join', mode: 'vote', n: 1 })).toBe('#lesson=sql&set=inner-join&mode=vote&q=1')
  })
  it('holds a number to 1..count', () => {
    expect(clampIndex(null, 7)).toBe(1)
    expect(clampIndex(NaN, 7)).toBe(1)
    expect(clampIndex(0, 7)).toBe(1)
    expect(clampIndex(-4, 7)).toBe(1)
    expect(clampIndex(99, 7)).toBe(7)
    expect(clampIndex(3.9, 7)).toBe(3)
    expect(clampIndex(5, 0)).toBe(1)
  })
})

describe('lesson: small rules', () => {
  it('says what a query gave, in one line', () => {
    expect(describeRun({ header: ['a', 'b'], rows: [['ecom', 61799300], ['pharmacy', 2.5], ['x', null], ['y', 1]] })).toBe('4 rows: ecom · 61,799,300; pharmacy · 2.5; x · NULL; …')
    expect(describeRun({ header: ['a'], rows: [] })).toBe('0 rows.')
    expect(describeRun({ header: ['a'], rows: [[1]] })).toBe('1 row: 1')
    expect(describeRun({ header: [], rows: [] })).toBe('0 rows.')
    expect(errorLine('Binder Error: x\nLINE 1')).toBe('Binder Error: x')
  })
  it('reopens at the last task only for the same set, and never fails', () => {
    expect(lastTask('{"set":"inner-join","task":4}', 'inner-join', 7)).toBe(4)
    expect(lastTask('{"set":"inner-join","task":4}', 'where', 7)).toBeNull()
    expect(lastTask('{"set":"inner-join","task":9}', 'inner-join', 7)).toBeNull()
    expect(lastTask('not json', 'inner-join', 7)).toBeNull()
    expect(lastTask(null, 'inner-join', 7)).toBeNull()
  })
})

describe('lesson: tables of a task', () => {
  const all = SECTIONS.flatMap((s) => s.blocks).find((b) => b.kind === 'tables')!
  const tables = all.kind === 'tables' ? all.tables : []
  it('finds the tables after FROM and JOIN, once each, skipping comments', () => {
    const names = tables.map((t) => t.name)
    expect(tablesNamed('SELECT 1 FROM quaera.fact_sellout AS s JOIN quaera.dim_customer c ON 1=1 JOIN quaera.dim_customer d ON 1=1', names)).toEqual(['fact_sellout', 'dim_customer'])
    expect(tablesNamed('-- FROM quaera.dim_rep\nSELECT 1', names)).toEqual([])
    expect(tablesNamed('SELECT 1', names)).toEqual([])
    expect(tablesNamed('SELECT * FROM nowhere', names)).toEqual([])
  })
  it('gives columns and the key for task 3', () => {
    const t = lessonTables(tasksOf(INNER_JOIN)[2], tables)
    expect(t.map((x) => [x.name, x.key])).toEqual([['fact_sellout', 'sellout_id'], ['dim_customer', 'customer_id']])
    expect(t[0].columns.length).toBeGreaterThan(3)
  })
})

describe('lesson: the vote', () => {
  const tasks = tasksOf(INNER_JOIN)
  it('has a question for every task of the section, in order, built on its solution', () => {
    expect(INNER_JOIN_VOTES.map((q) => q.taskId)).toEqual(tasks.map((t) => t.id))
    INNER_JOIN_VOTES.forEach((q, i) => {
      expect(q.right).toBe(tasks[i].solution)
      expect(q.question).toBe(tasks[i].question)
      expect(q.why.length).toBeGreaterThan(20)
      expect(new Set([q.right, ...q.wrong]).size).toBe(4)
    })
  })
  it('puts the right query on every letter in turn, the same each time', () => {
    const where = INNER_JOIN_VOTES.map((q, i) => arrange(q, i).findIndex((o) => o.right))
    expect(new Set(where.slice(0, 4)).size).toBe(4)
    expect(where.some((w) => w !== 0)).toBe(true)
    expect(where).toEqual(INNER_JOIN_VOTES.map((q, i) => arrange(q, i).findIndex((o) => o.right)))
    for (const [i, q] of INNER_JOIN_VOTES.entries()) {
      const a = arrange(q, i)
      expect(a.map((o) => o.letter)).toEqual([...LETTERS])
      expect([...a.map((o) => o.sql)].sort()).toEqual([q.right, ...q.wrong].sort())
    }
  })

  describe('on the data', () => {
    let py: PyodideInterface
    let duck: { query: (sql: string) => Table_ }
    type Table_ = Parameters<typeof resultRows>[0]
    beforeAll(async () => {
      const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
      const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
      const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
      await db.instantiate()
      duck = db.connect()
      duck.query('CREATE SCHEMA quaera')
      for (const t of datasetById('quaera')!.tables) duck.query(`CREATE TABLE quaera."${t.name}" AS SELECT * FROM read_parquet('${resolve('public/datasets/quaera', t.file).replace(/\\/g, '/')}')`)
      py = await loadPyodide()
      py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
      py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
    }, 180_000)

    /** The result, or the error text: what Run all four shows. */
    function attempt(sql: string): ResultData | { error: string } {
      py.globals.set('_script', sql)
      const t = JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')) as TranslatedStatement[]
      if (t.some((s) => s.error)) return { error: t.find((s) => s.error)!.error! }
      try {
        return resultRows(duck.query(duckdbScript(t)))
      } catch (e) {
        return { error: String(e) }
      }
    }
    const isError = (r: ReturnType<typeof attempt>): r is { error: string } => 'error' in r

    it('the right option matches its task; every wrong one fails or answers differently', () => {
      for (const [i, q] of INNER_JOIN_VOTES.entries()) {
        const task = tasks[i]
        const answer = attempt(task.solution)
        expect(isError(answer), task.id).toBe(false)
        const good = attempt(q.right)
        expect(isError(good) ? good.error : compareResults(good, answer as ResultData, task.ordered).ok, `${task.id}: right option`).toBe(true)
        for (const [j, w] of q.wrong.entries()) {
          const got = attempt(w)
          if (isError(got)) continue
          expect(compareResults(got, answer as ResultData, task.ordered).ok, `${task.id}: wrong option ${j + 1} gives the right answer`).toBe(false)
        }
      }
    })
    it('question 3 reproduces the mock-up: C runs and lies (two rows, no ecom), B fails', () => {
      const q = INNER_JOIN_VOTES[2]
      const b = attempt(q.wrong[0])
      expect(isError(b)).toBe(true)
      const c = attempt(q.wrong[1]) as ResultData
      expect(c.rows.length).toBe(2)
      expect(c.rows.map((r) => r[0])).not.toContain('ecom')
      expect((attempt(q.right) as ResultData).rows[0][0]).toBe('ecom')
    })
  })
})

describe('lesson: other links', () => {
  it('a lesson address is not the demo shop task link, which shares the name task=', async () => {
    const { taskFromHash } = await import('../src/data/practice')
    expect(taskFromHash('#lesson=sql&set=inner-join&task=3')).toBe('3') // the old parser still sees it: the store skips it when lessonFromHash is set
    expect(lessonFromHash('#lesson=sql&set=inner-join&task=3')?.n).toBe(3)
    expect(lessonFromHash('#task=3')).toBeNull()
  })
})
