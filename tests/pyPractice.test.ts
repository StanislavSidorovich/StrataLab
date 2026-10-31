// The Python practice page: every example, answer and trap runs in real pandas (src/python/lab.py, as
// in the worker) on the dataset's real rows. Needs Pyodide's packages in public/pyodide
// (`npm run python-packages`); skipped without them.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Table } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { compareResults, describeVerdict, type ResultData } from '../src/core/check'
import { resultRows } from '../src/db/export'
import { datasetById } from '../src/data/datasets'
import { SECTIONS, SECTION_TASKS, examplesOf, tasksOf } from '../src/data/pyPractice'
import { aliasesIn, BOOK_TABLES } from '../src/data/pyPractice/tables'
import { arrowFromFrame, frameFromArrow, type PyFrame } from '../src/python/columns'
import type { CellResult } from '../src/python/pythonWorker'
import type { Output } from '../src/core/ipynb'

const require = createRequire(import.meta.url)
const HAS_PANDAS = existsSync('public/pyodide') && readdirSync('public/pyodide').some((f) => f.startsWith('pandas-'))

describe('Python practice: words', () => {
  it('speaks of pandas, not SQL, when a Check fails', () => {
    const { detail } = describeVerdict({ ok: false, problem: 'order' }, 'python')
    expect(detail).toMatch(/sort_values/)
    expect(detail).not.toMatch(/ORDER BY/)
    expect(describeVerdict({ ok: false, problem: 'order' }).detail).toMatch(/ORDER BY/)
  })
  it('finds the tables a cell names, not words that contain them', () => {
    expect(aliasesIn('sellout.head()\nproducts["brand"]')).toEqual(['sellout', 'products'])
    expect(aliasesIn('df["raw"]\nprint("stock")\nmy_sellout.x\nx.prices')).toEqual([])
  })
})

describe('Python practice: content', () => {
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
    expect(SECTIONS[0].part, 'the page opens a part').toBeTruthy()
  })
  it('names real columns on the data map', () => {
    const d = datasetById('quaera')!
    for (const b of cells) {
      if (b.kind !== 'tables') continue
      for (const t of b.tables) {
        const ddl = d.ddl.find((s) => s.startsWith(`CREATE TABLE quaera."${t.name}"`))
        expect(ddl, t.name).toBeDefined()
        if (t.alias) expect(BOOK_TABLES[t.alias], t.alias).toBe(`quaera.${t.name}`)
        for (const c of t.columns) expect(ddl, `${t.name}.${c}`).toMatch(new RegExp(`\\b${c}\\b`))
      }
    }
  })

  describe.skipIf(!HAS_PANDAS)('run in pandas on the real data', () => {
    let py: PyodideInterface
    let count = 0

    /** A cell as the page runs it: clean, with the tables as variables. */
    async function cell(code: string, given: Record<string, PyFrame> = {}): Promise<{ result: CellResult; answer: Table | null; outputs: Output[] }> {
      py.globals.set('_code', code)
      py.globals.set('_given', py.toPy(given))
      py.globals.set('_count', ++count)
      const proxy = await py.runPythonAsync('await run_cell(_code, 1, _count, _given, [], None, True)')
      const result = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as CellResult
      proxy.destroy()
      return { result, answer: result.answer ? arrowFromFrame(result.answer) : null, outputs: result.outputs }
    }

    async function answer(code: string, id: string): Promise<ResultData> {
      const { answer: t, outputs } = await cell(code)
      const failed = outputs.find((o) => o.output_type === 'error')
      expect(failed && failed.output_type === 'error' ? `${failed.ename}: ${failed.evalue}` : null, `${id}\n${code}`).toBeNull()
      expect(t, `${id} gives no answer`).not.toBeNull()
      return resultRows(t!)
    }

    beforeAll(async () => {
      const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
      const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
      const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
      await db.instantiate()
      const duck = db.connect()
      py = await loadPyodide({ packageBaseUrl: resolve('public/pyodide') + '/' })
      await py.loadPackage(['pandas', 'matplotlib'])
      py.FS.writeFile('/home/pyodide/lab_backend.py', readFileSync('src/python/lab_backend.py', 'utf8'))
      py.runPython(readFileSync('src/python/lab.py', 'utf8'))
      const given: Record<string, PyFrame> = {}
      const files = datasetById('quaera')!.tables
      for (const [alias, table] of Object.entries(BOOK_TABLES)) {
        const f = files.find((t) => `quaera.${t.name}` === table)!
        given[alias] = frameFromArrow(duck.query(`SELECT * FROM read_parquet('${resolve('public/datasets/quaera', f.file).replace(/\\/g, '/')}')`) as Table)
      }
      await cell('1', given)
    }, 180_000)

    it('a cell starts clean: what one does never reaches the next', async () => {
      await answer('sellout["units"] = 0\nleft_over = 1\nsellout.drop(columns="revenue", inplace=True)\n1', 'dirty')
      const after = await answer('int((sellout["units"] > 0).any()), "revenue" in sellout.columns, "left_over" in globals()', 'clean')
      expect(after.rows.map((r) => String(r[0]).toLowerCase())).toEqual(['1', 'true', 'false'])
    })
    it('an unnamed index is row labels, a named one is a column', async () => {
      const series = await answer('sellout.groupby("product_id")["units"].sum().sort_values(ascending=False).head(3)', 'series')
      const frame = await answer('sellout.groupby("product_id", as_index=False)["units"].sum().sort_values("units", ascending=False).head(3)', 'frame')
      expect(series.header).toEqual(['product_id', 'units'])
      expect(frame.header).toEqual(['product_id', 'units'])
      expect(compareResults(series, frame, true).ok).toBe(true)
    })
    it('a number, a text, an array and a list are answers; an assignment is not', async () => {
      expect((await answer('len(sellout)', 'n')).rows).toEqual([[118449]])
      expect((await answer('products["division"].nunique() > 0', 'b')).rows.length).toBe(1)
      expect((await answer('products["brand"].unique()', 'arr')).header).toEqual(['value'])
      expect((await cell('x = 1')).answer).toBeNull()
    })
    it('a failing cell gives an error, not an answer', async () => {
      const { answer: t, outputs } = await cell('sellout["no_such_column"]')
      expect(t).toBeNull()
      expect(outputs.some((o) => o.output_type === 'error')).toBe(true)
    })

    it('every example runs', async () => {
      for (const e of examples) {
        const { outputs } = await cell(e.code)
        const failed = outputs.find((o) => o.output_type === 'error')
        expect(failed && failed.output_type === 'error' ? `${failed.ename}: ${failed.evalue}` : null, `${e.id}\n${e.code}`).toBeNull()
      }
    }, 120_000)
    it('every answer gives rows, passes its own Check, and is not too long', async () => {
      for (const t of tasks) {
        const rows = await answer(t.solution, t.id)
        expect(rows.rows.length, t.id).toBeGreaterThan(0)
        expect(rows.rows.length, t.id).toBeLessThanOrEqual(1000)
        expect(compareResults(rows, rows, t.ordered).ok, t.id).toBe(true)
      }
    }, 120_000)
    it('an ordered answer sorts', () => {
      for (const t of tasks) if (t.ordered) expect(t.solution, t.id).toMatch(/sort_values|sort_index|nlargest|nsmallest|value_counts/)
    })
    it('every trap runs and gives a result the answer does not', async () => {
      for (const t of tasks)
        for (const trap of t.traps ?? []) {
          const wrong = await answer(trap.code, `${t.id} trap`)
          expect(compareResults(wrong, await answer(t.solution, t.id), t.ordered).ok, `${t.id}: ${trap.says}`).toBe(false)
        }
    }, 120_000)
  })
})
