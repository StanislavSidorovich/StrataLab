import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Table } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { buildExampleCellInsertion, parseDmCycleOpen, parseDmCycleStage } from '../src/core/dmCycle'
import { callKey, cellAt, labCalls, splitCells, tableSql } from '../src/core/pyCells'
import { datasetById } from '../src/data/datasets'
import { DM_CYCLE_DATASET, DM_STAGES } from '../src/data/dmCycle'
import { frameFromArrow } from '../src/python/columns'

const require = createRequire(import.meta.url)
const HAS_PANDAS = existsSync('public/pyodide') && readdirSync('public/pyodide').some((f) => f.startsWith('pandas-'))

describe('Data analysis cycle: pure helpers', () => {
  it('parses open flag strictly', () => {
    expect(parseDmCycleOpen('1')).toBe(true)
    expect(parseDmCycleOpen('true')).toBe(true)
    expect(parseDmCycleOpen('0')).toBe(false)
    expect(parseDmCycleOpen('false')).toBe(false)
    expect(parseDmCycleOpen('')).toBe(false)
    expect(parseDmCycleOpen(null)).toBe(false)
  })

  it('parses stage id with exploration fallback', () => {
    expect(parseDmCycleStage('exploration')).toBe('exploration')
    expect(parseDmCycleStage('preprocessing')).toBe('preprocessing')
    expect(parseDmCycleStage('processing')).toBe('processing')
    expect(parseDmCycleStage('analysis')).toBe('analysis')
    expect(parseDmCycleStage('unknown')).toBe('exploration')
    expect(parseDmCycleStage(null)).toBe('exploration')
  })

  it('replaces an empty or whitespace tab with one valid # %% cell', () => {
    const res = buildExampleCellInsertion('   \n ', 0, 'Exploration', 'Shape check', 'import pandas as pd\ndf = lab.table("quaera.fact_sellout")\ndf.head()')
    const cells = splitCells(res.text)
    expect(cells).toHaveLength(1)
    expect(cells[0].kind).toBe('code')
    expect(cells[0].source).toBe('# Exploration: Shape check\nimport pandas as pd\ndf = lab.table("quaera.fact_sellout")\ndf.head()')
    expect(res.run).toEqual({ code: cells[0].source, line: cells[0].line, index: 0, source: cells[0].source })
    expect(cellAt(cells, res.cursor)).toBe(0)
  })

  it('inserts after the cell at the cursor and preserves surrounding # %% boundaries', () => {
    const initial = '# %%\na = 1\n\n# %%\nb = 2\n'
    const cursorInFirst = initial.indexOf('a = 1')
    const res = buildExampleCellInsertion(initial, cursorInFirst, 'Processing', 'Group by', 'import pandas as pd\npd.Series([1, 2])')
    const cells = splitCells(res.text)
    expect(cells.map((c) => c.source)).toEqual([
      'a = 1',
      '# Processing: Group by\nimport pandas as pd\npd.Series([1, 2])',
      'b = 2',
    ])
    expect(res.run.index).toBe(1)
    expect(res.run.code).toBe(cells[1].source)
    expect(res.text.split('\n')[res.run.line - 1]).toBe('# Processing: Group by')
    expect(cellAt(cells, res.cursor)).toBe(1)
  })

  it('appends cleanly after a tab with no # %% markers', () => {
    const initial = 'x = 10'
    const res = buildExampleCellInsertion(initial, 0, 'Analysis', 'Corr', 'import pandas as pd\npd.DataFrame({"x": [1]})')
    const cells = splitCells(res.text)
    expect(cells).toHaveLength(2)
    expect(cells[0].source).toBe('x = 10')
    expect(res.run.index).toBe(1)
  })
})

describe('Data analysis cycle: content structure', () => {
  const noLongDash = (s: string) => expect(s, s.slice(0, 60)).not.toMatch(/—/)

  it('has 4 stages in the exact cycle order over quaera with no em-dashes', () => {
    expect(DM_CYCLE_DATASET).toBe('quaera')
    expect(DM_STAGES.map((s) => s.id)).toEqual(['exploration', 'preprocessing', 'processing', 'analysis'])
    expect(DM_STAGES.map((s) => s.title)).toEqual(['Exploration', 'Preprocessing', 'Processing', 'Analysis'])
    expect(DM_STAGES.map((s) => s.number)).toEqual([1, 2, 3, 4])

    for (const stage of DM_STAGES) {
      noLongDash(stage.title)
      noLongDash(stage.summary)
      const sentences = stage.summary.trim().split(/(?<=[.!?])\s+/).filter(Boolean)
      expect(sentences.length, `${stage.id} summary sentence count`).toBeGreaterThanOrEqual(2)
      expect(sentences.length, `${stage.id} summary sentence count`).toBeLessThanOrEqual(3)
      expect(stage.examples.length, `${stage.id} examples`).toBeGreaterThanOrEqual(3)
      expect(stage.examples.length, `${stage.id} examples`).toBeLessThanOrEqual(5)
      for (const m of stage.methods ?? []) {
        noLongDash(m.name)
        noLongDash(m.whenToUse)
        expect(m.whenToUse.trim().length).toBeGreaterThan(10)
      }
      for (const ex of stage.examples) {
        noLongDash(ex.title)
        noLongDash(ex.why)
        noLongDash(ex.code)
        expect(ex.code).toContain('lab.table("quaera.')
      }
    }
  })

  it('includes when-to-use notes for K-means, Association rules, Segment profiling, and Rule evaluation', () => {
    const processing = DM_STAGES.find((s) => s.id === 'processing')!
    const analysis = DM_STAGES.find((s) => s.id === 'analysis')!
    expect(processing.methods?.map((m) => m.name)).toEqual(['Clustering (K-means)', 'Association rules'])
    expect(analysis.methods?.map((m) => m.name)).toEqual(['Segment profiling', 'Rule evaluation'])
  })
})

describe.skipIf(!HAS_PANDAS)('Data analysis cycle: every example runs on real quaera data', () => {
  interface Conn {
    query: (sql: string) => Table
  }
  let conn: Conn
  let py: PyodideInterface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runCell: any
  let count = 0

  let prevUserProfile: string | undefined
  let prevHome: string | undefined

  beforeAll(async () => {
    prevUserProfile = process.env.USERPROFILE
    prevHome = process.env.HOME
    const localParquet = resolve('public/duckdb-ext/v1.5.4/wasm_eh/parquet.duckdb_extension.wasm')
    if (existsSync(localParquet)) {
      const cacheHome = resolve('node_modules/.cache/duckdb-home')
      const extDir = resolve(cacheHome, '.duckdb/extensions/extensions.duckdb.org/v1.5.4/wasm_eh')
      mkdirSync(extDir, { recursive: true })
      copyFileSync(localParquet, resolve(extDir, 'parquet.duckdb_extension.wasm'))
      process.env.USERPROFILE = cacheHome
      process.env.HOME = cacheHome
    }

    const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
    const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
    const db = await duckdb.createDuckDB(
      { mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } },
      new duckdb.VoidLogger(),
      duckdb.NODE_RUNTIME,
    )
    await db.instantiate()
    conn = db.connect()

    const quaera = datasetById('quaera')!
    const noFk = (s: string) => s.replace(/,?\s*FOREIGN KEY \([^)]*\) REFERENCES \S+ \([^)]*\)/g, '').replace(/ REFERENCES \S+ \("[^"]*"\)/g, '')
    conn.query(`CREATE SCHEMA "${quaera.id}"`)
    for (const s of quaera.ddl) conn.query(noFk(s))
    for (const t of quaera.tables) {
      const file = resolve(`public/datasets/${quaera.id}/${t.file}`).split(sep).join('/')
      conn.query(`INSERT INTO "${quaera.id}"."${t.name}" BY NAME SELECT * FROM read_parquet('${file}')`)
    }

    py = await loadPyodide({ packageBaseUrl: resolve('public/pyodide') + '/' })
    await py.loadPackage(['pandas', 'matplotlib'])
    py.FS.writeFile('/home/pyodide/lab.py', readFileSync('src/python/lab.py', 'utf8'))
    py.FS.writeFile('/home/pyodide/lab_backend.py', readFileSync('src/python/lab_backend.py', 'utf8'))
    runCell = py.pyimport('lab').run_cell
  }, 180_000)

  afterAll(() => {
    if (prevUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = prevUserProfile
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
  })

  async function runIsolated(code: string) {
    // Reset user variables between examples so self-containment is genuinely verified.
    py.runPython(`
import lab as _lab_mod
for _k in list(_lab_mod.namespace.keys()):
    if _k not in ("__name__", "__builtins__", "display", "lab"):
        del _lab_mod.namespace[_k]
`)
    const fetched: Record<string, unknown> = {}
    for (const c of labCalls(code)) {
      fetched[callKey(c)] = frameFromArrow(conn.query(c.kind === 'table' ? tableSql(c.arg) : c.arg))
    }
    const f = py.toPy(fetched)
    const names = py.toPy([])
    try {
      const proxy = await runCell(code, 1, ++count, f, names, null)
      const r = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as {
        outputs: { output_type: string; ename?: string; evalue?: string; text?: string; data?: Record<string, string> }[]
        frames: { at: number; frame: { rows: number } }[]
      }
      proxy.destroy()
      return r
    } finally {
      f.destroy()
      names.destroy()
    }
  }

  for (const stage of DM_STAGES) {
    for (const ex of stage.examples) {
      it(`${stage.id} / ${ex.id} runs cleanly and produces output`, async () => {
        const r = await runIsolated(ex.code)
        const errors = r.outputs.filter((o) => o.output_type === 'error').map((o) => `${o.ename}: ${o.evalue}`)
        expect(errors, `${stage.id} / ${ex.id}`).toEqual([])
        expect(r.outputs.length, `${stage.id} / ${ex.id}: outputs`).toBeGreaterThan(0)
        const hasFigure = r.outputs.some((o) => Boolean(o.data?.['image/png']))
        expect(r.frames.length > 0 || hasFigure, `${stage.id} / ${ex.id}: frame or figure`).toBe(true)
        if (ex.id === 'dm-ana-chart') expect(hasFigure, 'dm-ana-chart figure').toBe(true)
        if (r.frames.length > 0) {
          expect(r.frames[r.frames.length - 1].frame.rows, `${stage.id} / ${ex.id}: non-empty frame`).toBeGreaterThan(0)
        }
      }, 60_000)
    }
  }
})
