// Tables between DuckDB and pandas through real Pyodide + pandas (src/python/lab.py), as in the
// Python worker: every kind of missing value must reach the grid as NULL, never as text.
// Needs Pyodide's packages in public/pyodide (`npm run python-packages`); skipped without them.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Bool, Float64, Int32, Table, TimestampMicrosecond, Utf8, vectorFromArray } from 'apache-arrow'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { arrowFromFrame, frameFromArrow, type PyFrame } from '../src/python/columns'

const HAS_PANDAS = existsSync('public/pyodide') && readdirSync('public/pyodide').some((f) => f.startsWith('pandas-'))

let py: PyodideInterface

/** A frame through pandas and back, as lab.table(...) then the grid does. */
function roundTrip(frame: PyFrame, python = 'df'): Table {
  py.globals.set('_f', py.toPy(frame))
  const out = py.runPython(`df = _frame(_f)\n_encode(_shown(${python}))`)
  const back = out.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as PyFrame
  out.destroy()
  return arrowFromFrame(back)
}

describe.skipIf(!HAS_PANDAS)('Python tabs: NULLs between DuckDB and pandas', () => {
  beforeAll(async () => {
    py = await loadPyodide({ packageBaseUrl: resolve('public/pyodide') + '/' })
    await py.loadPackage(['pandas'])
    py.runPython(readFileSync('src/python/lab.py', 'utf8'))
  }, 120_000)

  it('a VARCHAR NULL stays NULL, not the text "jsnull" (AdventureWorks Product.Size)', () => {
    const t = new Table({ Size: vectorFromArray(['58', null, 'M'], new Utf8()) })
    const back = roundTrip(frameFromArrow(t))
    expect(back.getChild('Size')!.toArray()).toEqual(['58', null, 'M'])
  })

  it('NULLs of every type stay NULL', () => {
    const t = new Table({
      i: vectorFromArray([1, null, 3], new Int32()),
      f: vectorFromArray([1.5, null, 2.5], new Float64()),
      b: vectorFromArray([true, null, false], new Bool()),
      d: vectorFromArray([1_700_000_000_000, null, 1_700_000_100_000], new TimestampMicrosecond()),
      s: vectorFromArray([null, 'x', null], new Utf8()),
    })
    const back = roundTrip(frameFromArrow(t))
    for (const name of ['i', 'f', 'b', 'd']) expect(back.getChild(name)!.isValid(1), name).toBe(false)
    expect(back.getChild('s')!.toArray()).toEqual([null, 'x', null])
  })

  it('None, NaN, pd.NA and NaT made in Python reach the grid as NULL', () => {
    const t = new Table({ k: vectorFromArray([1, 2, 3, 4], new Int32()) })
    const back = roundTrip(frameFromArrow(t), `df.assign(o=pd.Series(["a", None, np.nan, pd.NA], dtype=object), t=pd.Series([pd.NaT, pd.Timestamp("2024-01-01"), pd.NaT, pd.NaT], dtype=object), n=[1.0, np.nan, None, 4.0])`)
    expect(back.getChild('o')!.toArray()).toEqual(['a', null, null, null])
    expect([0, 2, 3].map((i) => back.getChild('t')!.isValid(i))).toEqual([false, false, false])
    expect([1, 2].map((i) => back.getChild('n')!.isValid(i))).toEqual([false, false])
  })

  it("keeps the columns in the DataFrame's order, also when names look like numbers (a pivot's years)", () => {
    const t = new Table({ k: vectorFromArray([1, 2], new Int32()) })
    const back = roundTrip(frameFromArrow(t), `pd.DataFrame({"country": ["A", "B"], 2021: [1.0, 2.0], 2022: [3.0, None]})`)
    expect(back.schema.fields.map((f) => f.name)).toEqual(['country', '2021', '2022'])
    expect(back.getChild('2022')!.isValid(1)).toBe(false)
  })
})
