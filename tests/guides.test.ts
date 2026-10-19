// The dataset guides (src/data/guides.ts): every example and cheat sheet line runs on the real
// data without edits. SQL in DuckDB-WASM (Node build) over public/datasets, loaded as Lab loads
// them; Python in Pyodide with pandas through lab.py's own cell runner, its lab.table calls
// fetched from the same DuckDB as the page does. The Python half needs public/pyodide
// (`npm run python-packages`) and is skipped without it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Table } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { DATASETS } from '../src/data/datasets'
import { GUIDES, cheatSetup, cheatSheet, guideNotebook } from '../src/data/guides'
import { callKey, labCalls, splitCells, tableSql } from '../src/core/pyCells'
import { frameFromArrow } from '../src/python/columns'

const require = createRequire(import.meta.url)
const HAS_PANDAS = existsSync('public/pyodide') && readdirSync('public/pyodide').some((f) => f.startsWith('pandas-'))

interface Conn {
  query: (sql: string) => Table
}
let conn: Conn

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  conn = db.connect()
  // Each dataset in its schema with its own CREATE TABLEs (types, NOT NULL, PK); foreign keys
  // are left out so the tables can fill in any order (the order of loading isn't under test here).
  const noFk = (s: string) => s.replace(/,?\s*FOREIGN KEY \([^)]*\) REFERENCES \S+ \([^)]*\)/g, '').replace(/ REFERENCES \S+ \("[^"]*"\)/g, '')
  for (const d of DATASETS) {
    conn.query(`CREATE SCHEMA "${d.id}"`)
    for (const s of d.ddl) conn.query(noFk(s))
    for (const t of d.tables) {
      const file = resolve(`public/datasets/${d.id}/${t.file}`).split(sep).join('/')
      conn.query(`INSERT INTO "${d.id}"."${t.name}" BY NAME SELECT * FROM read_parquet('${file}')`)
    }
  }
}, 120_000)

const noLongDash = (s: string) => expect(s, s.slice(0, 60)).not.toMatch(/—/)

describe('Dataset guides: content', () => {
  it('every catalog dataset has a guide with 6 to 8 examples, from a first look on', () => {
    expect(GUIDES.map((g) => g.id).sort()).toEqual(DATASETS.map((d) => d.id).sort())
    for (const g of GUIDES) {
      expect(g.examples.length).toBeGreaterThanOrEqual(6)
      expect(g.examples.length).toBeLessThanOrEqual(8)
      expect(g.examples[0].level).toBe('look')
      for (const level of ['filter', 'group', 'join', 'window', 'pivot']) expect(g.examples.some((e) => e.level === level), `${g.id} ${level}`).toBe(true)
    }
  })

  it('has no long dashes in its texts', () => {
    for (const g of GUIDES) {
      for (const s of [g.summary, ...g.facts, ...g.links, ...g.tables.flatMap((t) => [t.name, t.about])]) noLongDash(s)
      for (const e of g.examples) for (const s of [e.title, e.question, e.sql, e.python]) noLongDash(s)
    }
  })

  it('the one-tab version keeps every Python example as its own cell', () => {
    const g = GUIDES[0]
    const code = splitCells(guideNotebook(g, 'Chinook', 'python')).filter((c) => c.kind === 'code')
    expect(code.map((c) => c.source.trim())).toEqual(g.examples.map((e) => e.python.trim()))
  })
})

describe('Dataset guides: SQL runs on the real data', () => {
  for (const g of GUIDES) {
    it(`${g.id}: examples`, () => {
      for (const e of g.examples) {
        const t = conn.query(e.sql)
        expect(t.numRows, `${g.id} / ${e.title}`).toBeGreaterThan(0)
      }
    })
    it(`${g.id}: cheat sheet`, () => {
      for (const line of cheatSheet(g.cheat)) {
        const t = conn.query(line.sql)
        expect(t.numRows, `${g.id} / ${line.task}`).toBeGreaterThan(0)
      }
    })
  }
})

describe.skipIf(!HAS_PANDAS)('Dataset guides: Python runs on the real data', () => {
  let py: PyodideInterface
  let count = 0

  beforeAll(async () => {
    py = await loadPyodide({ packageBaseUrl: resolve('public/pyodide') + '/' })
    await py.loadPackage(['pandas'])
    py.runPython(readFileSync('src/python/lab.py', 'utf8'))
  }, 180_000)

  /** Runs a cell as the worker does: its lab.table / lab.sql fetched first. Its outputs and grid rows. */
  async function run(code: string) {
    const fetched: Record<string, unknown> = {}
    for (const c of labCalls(code)) fetched[callKey(c)] = frameFromArrow(conn.query(c.kind === 'table' ? tableSql(c.arg) : c.arg))
    const runCell = py.globals.get('run_cell')
    const f = py.toPy(fetched)
    const names = py.toPy([])
    try {
      const proxy = await runCell(code, 1, ++count, f, names, null)
      const r = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as { outputs: { output_type: string; ename?: string; evalue?: string }[]; grid: { rows: number } | null }
      proxy.destroy()
      return r
    } finally {
      f.destroy()
      names.destroy()
      runCell.destroy()
    }
  }

  const errorOf = (r: Awaited<ReturnType<typeof run>>) => r.outputs.filter((o) => o.output_type === 'error').map((o) => `${o.ename}: ${o.evalue}`)

  for (const g of GUIDES) {
    it(`${g.id}: examples, with as many rows as their SQL`, async () => {
      for (const e of g.examples) {
        const r = await run(e.python)
        expect(errorOf(r), `${g.id} / ${e.title}`).toEqual([])
        expect(r.grid, `${g.id} / ${e.title}: a DataFrame for the grid`).not.toBeNull()
        if (e.level !== 'look') expect(r.grid!.rows, `${g.id} / ${e.title}: rows`).toBe(conn.query(e.sql).numRows)
      }
    }, 120_000)

    it(`${g.id}: cheat sheet`, async () => {
      for (const line of cheatSheet(g.cheat)) {
        const r = await run(cheatSetup(g.cheat, line.python))
        expect(errorOf(r), `${g.id} / ${line.task}`).toEqual([])
      }
    }, 120_000)
  }
})
