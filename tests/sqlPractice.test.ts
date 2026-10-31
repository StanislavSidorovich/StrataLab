// The SQL practice page: every example, answer and trap goes through the translator Lab uses
// (sqlglot in Pyodide) and runs in DuckDB on the dataset's real rows, as on the page.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Table } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { compareResults, type ResultData } from '../src/core/check'
import { emptyProgress, fabricNotes, hashWithPractice, hashWithoutPractice, nextTask, offersKnown, practiceCounts, practiceFromHash, readProgress, readableError } from '../src/core/sqlPractice'
import { resultRows } from '../src/db/export'
import { datasetById } from '../src/data/datasets'
import { SECTIONS, SECTION_TASKS, examplesOf, tasksOf } from '../src/data/sqlPractice'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'

const require = createRequire(import.meta.url)

describe('SQL practice: the address', () => {
  it('reads the page and its section, and leaves other parts alone', () => {
    expect(practiceFromHash('#practice=sql')).toEqual({ at: null })
    expect(practiceFromHash('#practice=sql&at=left-join')).toEqual({ at: 'left-join' })
    expect(practiceFromHash('#ds=quaera')).toBeNull()
    expect(practiceFromHash('#practice=sqlx')).toBeNull()
    expect(hashWithoutPractice('#practice=sql&at=joins&ds=quaera')).toBe('#ds=quaera')
    expect(hashWithoutPractice('#practice=sql')).toBe('')
    expect(hashWithPractice('#ds=quaera', 'joins')).toBe('#practice=sql&at=joins&ds=quaera')
    expect(hashWithPractice('#practice=sql&at=old', null)).toBe('#practice=sql')
  })
})

describe('SQL practice: progress', () => {
  const sections = [
    { id: 'a', taskIds: ['a1', 'a2'] },
    { id: 'b', taskIds: ['b1', 'b2', 'b3'] },
  ]
  it('reads what was saved, and starts afresh from anything else', () => {
    expect(readProgress(null)).toEqual(emptyProgress())
    expect(readProgress('not json')).toEqual(emptyProgress())
    expect(readProgress('{"solved":["a1"],"known":"x"}')).toEqual({ ...emptyProgress(), solved: ['a1'] })
  })
  it('counts solved and known apart: marking a section never counts as solving it', () => {
    const p = { ...emptyProgress(), solved: ['a1', 'b1'], known: ['b'] }
    expect(practiceCounts(sections, p)).toEqual({ solved: 2, known: 2, left: 1 })
  })
  it('continues at the first unsolved task outside known sections', () => {
    expect(nextTask(sections, emptyProgress())).toBe('a1')
    expect(nextTask(sections, { ...emptyProgress(), known: ['a'] })).toBe('b1')
    expect(nextTask(sections, { ...emptyProgress(), solved: ['a1', 'a2', 'b1', 'b2', 'b3'] })).toBeNull()
  })
  it('offers "known" after the hardest task only when there is something to skip', () => {
    expect(offersKnown(sections[1], 'b3', emptyProgress())).toBe(true)
    expect(offersKnown(sections[1], 'b1', emptyProgress())).toBe(false)
    expect(offersKnown(sections[1], 'b3', { ...emptyProgress(), solved: ['b1', 'b2'] })).toBe(false)
    expect(offersKnown(sections[1], 'b3', { ...emptyProgress(), known: ['b'] })).toBe(false)
  })
})

describe('SQL practice: errors', () => {
  it('takes the sentence out of an error in JSON', () => {
    expect(readableError('{"exception_type":"Parser","exception_message":"syntax error at SELEC"}')).toBe('syntax error at SELEC')
    expect(readableError('Binder Error: no such column')).toBe('Binder Error: no such column')
    expect(readableError('{not json')).toBe('{not json')
  })
})

describe('SQL practice: notes on Fabric', () => {
  const ids = (sql: string) => fabricNotes(sql).map((n) => n.id)
  it('finds what runs here but not on Fabric', () => {
    expect(ids('SELECT a FROM t LIMIT 5')).toEqual(['limit'])
    expect(ids('SELECT a::INT FROM t')).toEqual(['cast-colons'])
    expect(ids('SELECT COUNT(*) FILTER (WHERE a = 1) FROM t')).toEqual(['filter'])
    expect(ids('SELECT a FROM t JOIN u USING (a)')).toEqual(['using'])
    expect(ids('SELECT a FROM t JOIN u AS x USING (a)')).toEqual(['using'])
    expect(ids('SELECT a, COUNT(*) FROM t GROUP BY ALL')).toEqual(['group-by-all'])
  })
  it('finds a GROUP BY or HAVING on a computed name, at the level it was given', () => {
    expect(ids('SELECT YEAR(d) AS y, COUNT(*) AS n FROM t GROUP BY y')).toEqual(['group-by-alias'])
    expect(ids('SELECT p.brand AS b, COUNT(*) AS n FROM t GROUP BY b')).toEqual(['group-by-alias'])
    expect(ids('SELECT a, SUM(x) AS s FROM t GROUP BY a HAVING s > 1')).toEqual(['having-alias'])
    // The name comes from a CTE or a subquery below: legal.
    expect(ids('WITH m AS (SELECT YEAR(d) AS y FROM t) SELECT y, COUNT(*) AS n FROM m GROUP BY y')).toEqual([])
    expect(ids('SELECT y, COUNT(*) AS n FROM (SELECT YEAR(d) AS y FROM t) AS m GROUP BY y')).toEqual([])
    // The same name as the column it is: legal.
    expect(ids('SELECT p.brand AS brand, COUNT(*) AS n FROM t AS p GROUP BY p.brand')).toEqual([])
    expect(ids('SELECT brand AS brand, COUNT(*) AS n FROM t GROUP BY brand')).toEqual([])
    // ORDER BY may use it.
    expect(ids('SELECT YEAR(d) AS y, COUNT(*) AS n FROM t GROUP BY YEAR(d) ORDER BY y')).toEqual([])
    // CAST's AS is not a name.
    expect(ids('SELECT CAST(a AS INT) AS x FROM t GROUP BY CAST(a AS INT)')).toEqual([])
  })
  it('finds whole-number division, not a decimal one', () => {
    expect(ids('SELECT 7 / 2')).toEqual(['int-division'])
    expect(ids('SELECT COUNT(*) / 1000 FROM t')).toEqual(['int-division'])
    expect(ids('SELECT 1.0 * COUNT(*) / 1000 FROM t')).toEqual([])
    expect(ids('SELECT 7.0 / 2')).toEqual([])
    expect(ids('SELECT SUM(a) / COUNT(*) FROM t')).toEqual([])
  })
  it('does not read comments or strings as code', () => {
    expect(ids("-- LIMIT 5\nSELECT 'a::b LIMIT 5' AS x FROM t")).toEqual([])
  })
})

describe('SQL practice: content', () => {
  const cells = SECTIONS.flatMap((s) => s.blocks)
  const tasks = SECTIONS.flatMap(tasksOf)
  const examples = SECTIONS.flatMap(examplesOf)

  it('has unique ids and section numbers in order', () => {
    const ids = [...tasks, ...examples].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length)
    const ns = SECTIONS.map((s) => s.n)
    expect(ns).toEqual([...ns].sort((a, b) => a - b))
    expect(SECTION_TASKS.flatMap((s) => s.taskIds)).toEqual(tasks.map((t) => t.id))
  })
  it('keeps to the writing rules', () => {
    expect(JSON.stringify(SECTIONS)).not.toMatch(/—/)
    for (const t of tasks) expect(t.hints.length, t.id).toBe(3)
    for (const b of cells) if (b.kind === 'note') expect((b.text.match(/[.!?](\s|$)/g) ?? []).length, b.text).toBeLessThanOrEqual(3)
  })
  it('has only T-SQL that Fabric takes', () => {
    for (const e of examples) expect(fabricNotes(e.sql), e.id).toEqual([])
    for (const t of tasks) expect(fabricNotes(t.solution), t.id).toEqual([])
  })
  it('names real columns on the data map', () => {
    const d = datasetById('quaera')!
    for (const b of cells) {
      if (b.kind !== 'tables') continue
      for (const t of b.tables) {
        const ddl = d.ddl.find((s) => s.startsWith(`CREATE TABLE quaera."${t.name}"`))
        expect(ddl, t.name).toBeDefined()
        for (const c of t.columns) expect(ddl, `${t.name}.${c}`).toMatch(new RegExp(`\\b${c}\\b`))
      }
    }
  })

  describe('run on the real data', () => {
    let duck: { query: (sql: string) => Table }
    let py: PyodideInterface

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

    function run(sql: string): ResultData {
      py.globals.set('_script', sql)
      const t = JSON.parse(py.runPython('import json\njson.dumps(translate(_script))')) as TranslatedStatement[]
      expect(t, sql).toHaveLength(1)
      expect(t[0].error, sql).toBeNull()
      return resultRows(duck.query(duckdbScript(t)))
    }

    it('every example returns rows', () => {
      for (const e of examples) expect(run(e.sql).rows.length, e.id).toBeGreaterThan(0)
    })
    it('every answer returns rows, passes its own Check, and is not too long', () => {
      for (const t of tasks) {
        const rows = run(t.solution)
        expect(rows.rows.length, t.id).toBeGreaterThan(0)
        expect(rows.rows.length, t.id).toBeLessThanOrEqual(1000)
        expect(compareResults(rows, rows, t.ordered).ok, t.id).toBe(true)
      }
    })
    it('an ordered answer asks for an order, and the question names it', () => {
      for (const t of tasks) if (t.ordered) expect(t.solution, t.id).toMatch(/\border by\b/i)
    })
    it('every trap runs and gives a result the answer does not', () => {
      for (const t of tasks) for (const trap of t.traps ?? []) expect(compareResults(run(trap.sql), run(t.solution), t.ordered).ok, `${t.id}: ${trap.says}`).toBe(false)
    })
  })
})
