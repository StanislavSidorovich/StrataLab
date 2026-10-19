// "Same task, four ways" (src/data/compare.ts): every cell is run. DuckDB (Node build) and PostgreSQL
// (PGlite) as written, T-SQL through the translator Lab uses (sqlglot in Pyodide) and then DuckDB,
// pandas in Pyodide; all four must give the same values. The pandas half needs public/pyodide.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { Table } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { COLUMNS, COMPARE, PRACTICE_SQL, type Column } from '../src/data/compare'
import { SQLGLOT_VERSION, duckdbScript, type TranslatedStatement } from '../src/dialects/tsql'
import { pgToArrow } from '../src/dialects/pgResult'
import { formatterFor } from '../src/db/format'

const require = createRequire(import.meta.url)
const HAS_PANDAS = existsSync('public/pyodide') && readdirSync('public/pyodide').some((f) => f.startsWith('pandas-'))

type Cell = string | number | null

/** Values as text, comparable across engines: 12.50 = 12.5, a date at midnight = the date. */
function norm(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  const s = String(v).replace(/ 00:00:00(\.0+)?$/, '').replace(/T00:00:00(\.0+)?Z?$/, '')
  return /^-?\d+(\.\d+)?$/.test(s) ? String(Number(Number(s).toFixed(6))) : s
}
const rowsOf = (t: Table): string[][] => {
  const fmts = t.schema.fields.map((f) => formatterFor(f))
  const out: string[][] = []
  for (let r = 0; r < t.numRows; r++) out.push(fmts.map((f, c) => norm(f(t.getChildAt(c)?.get(r)) as Cell)))
  return out
}

let duck: { query: (sql: string) => Table }
let pg: PGlite
let py: PyodideInterface

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  duck = db.connect()
  for (const s of PRACTICE_SQL.split(/;\s*\n/).filter((x) => x.trim())) duck.query(s)
  pg = new PGlite()
  await pg.exec(PRACTICE_SQL)
  py = await loadPyodide(HAS_PANDAS ? { packageBaseUrl: resolve('public/pyodide') + '/' } : {})
  py.unpackArchive(new Uint8Array(readFileSync(`public/sqlglot/sqlglot-${SQLGLOT_VERSION}-py3-none-any.whl`)), 'wheel')
  py.runPython(readFileSync('src/dialects/translate.py', 'utf8'))
  if (HAS_PANDAS) {
    await py.loadPackage(['pandas', 'numpy'])
    py.runPython(`
import json, numpy as np, pandas as pd
sales = pd.DataFrame({
  "id": [1, 2, 3, 4, 5, 6],
  "Full Name": ["Ana Silva", "Bo Chen", "Cy Dahl", "Di Okafor", "Eli Moreau", "Fay Ruiz"],
  "city": ["Lisbon", "Porto", "Lisbon", "Porto", "Faro", "Faro"],
  "amount": [120.50, 80.00, 45.25, 210.00, 99.99, 150.00],
  "discount": [5.0, None, 2.5, None, 0.0, 10.0],
  "ordered": pd.to_datetime(["2024-03-01", "2024-03-02", "2024-03-02", "2024-03-05", "2024-03-07", "2024-03-07"]),
  "shipped": pd.to_datetime(["2024-03-04", "2024-03-02", "2024-03-06", "2024-03-09", "2024-03-08", "2024-03-12"]),
})
def rows_of(x):
    if isinstance(x, pd.DataFrame): df = x
    elif isinstance(x, pd.Series): df = x.to_frame()
    elif isinstance(x, (np.ndarray, list)): df = pd.DataFrame({"v": x})
    else: df = pd.DataFrame({"v": [x]})
    def one(v):
        if v is None or (not isinstance(v, str) and pd.isna(v)): return None
        if isinstance(v, pd.Timestamp): return v.strftime("%Y-%m-%d") if v == v.normalize() else str(v)
        if isinstance(v, np.generic): return v.item()
        return v
    return json.dumps([[one(v) for v in r] for r in df.itertuples(index=False, name=None)])
`)
  }
}, 180_000)

function translate(sql: string): TranslatedStatement[] {
  py.globals.set('_script', sql)
  return JSON.parse(py.runPython('import json\njson.dumps(translate(_script))'))
}

async function run(col: Column, code: string): Promise<string[][]> {
  if (col === 'duckdb') return rowsOf(duck.query(code))
  if (col === 'postgres') {
    const r = await pg.query<unknown[]>(code, [], { rowMode: 'array' })
    return rowsOf(pgToArrow(r.fields, r.rows))
  }
  if (col === 'tsql') {
    const t = translate(code)
    expect(t, code).toHaveLength(1)
    expect(t[0].error, code).toBeNull()
    return rowsOf(duck.query(duckdbScript(t)))
  }
  py.globals.set('_code', code)
  const rows = JSON.parse(py.runPython('rows_of(eval(_code))')) as Cell[][]
  return rows.map((r) => r.map(norm))
}

describe('Compare dialects: content', () => {
  it('every task is named once and has all four cells', () => {
    expect(new Set(COMPARE.map((r) => r.task)).size).toBe(COMPARE.length)
    for (const r of COMPARE) for (const c of COLUMNS) expect(r[c.id].trim(), `${r.task} / ${c.id}`).not.toBe('')
  })

  it('has no long dashes, and every highlighted part is in its cell', () => {
    for (const r of COMPARE) {
      expect(JSON.stringify(r), r.task).not.toMatch(/—/)
      for (const [col, parts] of Object.entries(r.hl ?? {})) for (const p of parts) expect(r[col as Column], `${r.task} / ${col}: ${p}`).toContain(p)
    }
  })

  it('the practice table is created in DuckDB and PostgreSQL', async () => {
    expect(rowsOf(duck.query('SELECT count(*) FROM sales'))).toEqual([['6']])
    expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM sales')).rows[0].n).toBe(6)
  })
})

describe('Compare dialects: every cell runs and the four agree', () => {
  for (const r of COMPARE) {
    it(`${r.task}`, async () => {
      const want = await run('duckdb', r.duckdb)
      expect(want.length, 'rows').toBeGreaterThan(0)
      expect(await run('postgres', r.postgres), 'PostgreSQL').toEqual(want)
      expect(await run('tsql', r.tsql), 'T-SQL (translated)').toEqual(want)
      if (HAS_PANDAS) expect(await run('pandas', r.pandas), 'pandas').toEqual(want)
    }, 60_000)
  }
})

describe('Compare dialects: the notes tell the truth', () => {
  it('whole-number division: 3 in PostgreSQL, 3.5 in DuckDB', async () => {
    expect(rowsOf(duck.query('SELECT 7 / 2'))).toEqual([['3.5']])
    expect((await pg.query<{ x: number }>('SELECT 7 / 2 AS x')).rows[0].x).toBe(3)
  })
})
