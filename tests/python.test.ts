import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Bool, Float64, Int32, Int64, Table, TimestampMicrosecond, Utf8, vectorFromArray, makeData, makeVector, DateDay, Decimal } from 'apache-arrow'
import { cellAt, callKey, joinCells, labCalls, splitCells, tableSql } from '../src/core/pyCells'
import { EXTRA_WHEELS, extraWheelsFor, hasOwnPackages, packageClosure, pyodideCdn, pythonPackageFiles, servedImports, type Lock } from '../src/core/python'
import { isOnDemand } from '../src/core/pwa'
import { arrowFromFrame, frameFromArrow, uniqueNames } from '../src/python/columns'

const lock: Lock = JSON.parse(readFileSync('node_modules/pyodide/pyodide-lock.json', 'utf8'))

describe('Python tabs: cells', () => {
  const tab = `import pandas as pd\n\n# %% [markdown]\n# # Title\n# Some *text*.\n\n# %% Load\ndf = lab.table("orders")\ndf.head()\n\n# %%\n\ndf.shape\n`

  it('splits a tab at # %% lines, markdown cells without their #', () => {
    const cells = splitCells(tab)
    expect(cells.map((c) => [c.kind, c.source])).toEqual([
      ['code', 'import pandas as pd'],
      ['markdown', '# Title\nSome *text*.'],
      ['code', 'df = lab.table("orders")\ndf.head()'],
      ['code', 'df.shape'],
    ])
  })

  it('knows the line where each cell starts, for tracebacks', () => {
    const lines = tab.split('\n')
    for (const c of splitCells(tab).filter((c) => c.kind === 'code')) expect(lines[c.line - 1]).toBe(c.source.split('\n')[0])
  })

  it('finds the cell at the cursor', () => {
    const cells = splitCells(tab)
    expect(cellAt(cells, 0)).toBe(0)
    expect(cellAt(cells, tab.indexOf('df.head'))).toBe(2)
    expect(cellAt(cells, tab.indexOf('# %% Load'))).toBe(2)
    expect(cellAt(cells, tab.length)).toBe(3)
    expect(cellAt([], 0)).toBe(-1)
  })

  it('a tab without # %% is one cell; a blank tab has none', () => {
    expect(splitCells('x = 1\nx')).toEqual([{ kind: 'code', source: 'x = 1\nx', from: 0, to: 7, line: 1 }])
    expect(splitCells('\n  \n')).toEqual([])
  })

  it('joins cells back into the same cells', () => {
    const cells = splitCells(tab).map(({ kind, source }) => ({ kind, source }))
    const text = joinCells(cells)
    expect(text.startsWith('# %%\nimport pandas as pd\n\n# %% [markdown]\n# # Title\n')).toBe(true)
    expect(splitCells(text).map(({ kind, source }) => ({ kind, source }))).toEqual(cells)
  })
})

describe('Python tabs: the tables a cell reads', () => {
  it('finds lab.table and lab.sql with a written string', () => {
    const code = `a = lab.table("orders")\nb = lab.table( 'quaera.dim_customer' )\nc = lab.sql("""\n  SELECT 1 AS "x"\n""")\nd = lab.sql('SELECT ' 'count(*) FROM orders')`
    expect(labCalls(code)).toEqual([
      { kind: 'table', arg: 'orders' },
      { kind: 'table', arg: 'quaera.dim_customer' },
      { kind: 'sql', arg: '\n  SELECT 1 AS "x"\n' },
      { kind: 'sql', arg: 'SELECT count(*) FROM orders' },
    ])
  })

  it('skips comments, other strings, names built at run time and repeats', () => {
    const code = `# lab.table("in_a_comment")\ns = "lab.table('in_a_string')"\nlab.table(name)\nlab.table(f"t_{i}")\nlab.table("x" + y)\nmylab.table("other")\nx.lab.table("attr")\nlab.table("orders")\nlab.table("orders")`
    expect(labCalls(code)).toEqual([{ kind: 'table', arg: 'orders' }])
  })

  it('reads escapes as Python does, raw strings as written', () => {
    expect(labCalls(`lab.sql("SELECT 'a\\\\b', \\"q\\"")`)).toEqual([{ kind: 'sql', arg: `SELECT 'a\\b', "q"` }])
    expect(labCalls(`lab.sql(r"SELECT '\\d'")`)).toEqual([{ kind: 'sql', arg: `SELECT '\\d'` }])
    expect(labCalls(`lab.table("caf\\u00e9")`)).toEqual([{ kind: 'table', arg: 'café' }])
  })

  it('keys a call as lab.py looks it up', () => {
    expect(callKey({ kind: 'table', arg: ' orders ' })).toBe('table:orders')
    expect(callKey({ kind: 'sql', arg: ' SELECT 1 ' })).toBe('sql: SELECT 1 ')
  })

  it('quotes a table name for DuckDB, keeping quoted parts', () => {
    expect(tableSql('orders')).toBe('SELECT * FROM "orders"')
    expect(tableSql('quaera.fact_sellout')).toBe('SELECT * FROM "quaera"."fact_sellout"')
    expect(tableSql('northwind."Order Details"')).toBe('SELECT * FROM "northwind"."Order Details"')
    expect(tableSql('Order Details')).toBe('SELECT * FROM "Order Details"')
    expect(tableSql('"a""b"')).toBe('SELECT * FROM "a""b"')
    expect(() => tableSql('')).toThrow(/not a table name/)
    expect(() => tableSql('a.b.c.d')).toThrow(/not a table name/)
    expect(() => tableSql('a..b')).toThrow(/not a table name/)
  })
})

describe('Python packages served with the site', () => {
  it('takes pandas, matplotlib and what they need from Pyodide’s build', () => {
    const names = packageClosure(lock, ['pandas', 'matplotlib']).map((p) => p.name)
    expect(names).toEqual(expect.arrayContaining(['numpy', 'pandas', 'python-dateutil', 'pytz', 'six', 'matplotlib', 'Pillow', 'fonttools', 'kiwisolver', 'contourpy', 'cycler', 'pyparsing', 'packaging']))
    expect(names).not.toContain('scipy')
    expect(names).not.toContain('pyarrow')
    expect(() => packageClosure(lock, ['no-such-package'])).toThrow(/not in Pyodide/)
  })

  it('serves every wheel with its hash, seaborn from PyPI', () => {
    const files = pythonPackageFiles(lock)
    expect(files.every((f) => /\.whl$/.test(f.file) && /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)
    expect(files.at(-1)).toEqual({ file: 'seaborn-0.13.2-py3-none-any.whl', sha256: EXTRA_WHEELS[0].sha256 })
    expect(new Set(files.map((f) => f.file)).size).toBe(files.length)
  })

  it('uses its own copies only when every file is there, else jsDelivr', () => {
    const all = pythonPackageFiles(lock).map((f) => f.file)
    expect(hasOwnPackages(all, lock)).toBe(true)
    expect(hasOwnPackages(all.slice(1), lock)).toBe(false)
    expect(hasOwnPackages([], lock)).toBe(false)
    expect(pyodideCdn('314.0.7')).toBe('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/')
  })

  it('downloads only what the site serves when code imports it', () => {
    const served = servedImports(lock)
    expect(served.matplotlib).toBe('matplotlib')
    expect(served.PIL).toBe('Pillow')
    expect(served.dateutil).toBe('python-dateutil')
    expect(served.sklearn).toBeUndefined()
    expect(extraWheelsFor(['pandas', 'seaborn']).map((w) => w.module)).toEqual(['seaborn'])
  })

  it('keeps them in the service worker after first use', () => {
    for (const f of pythonPackageFiles(lock)) expect(isOnDemand(`pyodide/${f.file}`)).toBe(true)
    expect(isOnDemand('pyodide/python-packages-NOTICE.txt')).toBe(true)
  })
})

describe('Python tabs: tables to pandas and back', () => {
  const table = new Table({
    a: vectorFromArray([1, null, 3], new Int32()),
    big: vectorFromArray([1n, 2n, null], new Int64()),
    f: vectorFromArray([1.5, NaN, null], new Float64()),
    b: vectorFromArray([true, null, false], new Bool()),
    s: vectorFromArray(['x', null, 'zé'], new Utf8()),
    d: vectorFromArray([new Date('2024-01-02'), null, new Date('1999-12-31')], new DateDay()),
    ts: makeVector(makeData({ type: new TimestampMicrosecond(), length: 3, data: new BigInt64Array([1700000000123456n, 0n, -1000n]) } as never)),
    dec: makeVector(makeData({ type: new Decimal(2, 10, 128), length: 3, data: new Uint32Array([12345, 0, 0, 0, 4294967295, 4294967295, 4294967295, 4294967295, 0, 0, 0, 0]) } as never)),
  })

  it('sends numbers as their bytes, dates as microseconds, text as strings, with a null mask', () => {
    const f = frameFromArrow(table)
    expect(f.rows).toBe(3)
    const col = (n: string) => f.columns.find((c) => c.name === n)!
    expect(col('a').dtype).toBe('int32')
    expect([...new Int32Array(col('a').data!.slice().buffer)].filter((_, i) => i !== 1)).toEqual([1, 3])
    expect([...col('a').nulls!]).toEqual([0, 1, 0])
    expect(col('big').dtype).toBe('int64')
    expect(col('f').dtype).toBe('float64')
    expect(col('b')).toMatchObject({ dtype: 'bool', data: new Uint8Array([1, 0, 0]), nulls: new Uint8Array([0, 1, 0]) })
    expect(col('s')).toMatchObject({ dtype: 'str', values: ['x', null, 'zé'] })
    expect(col('d').dtype).toBe('datetime64[us]')
    expect(new BigInt64Array(col('d').data!.slice().buffer)[0]).toBe(BigInt(Date.UTC(2024, 0, 2)) * 1000n)
    expect(new BigInt64Array(col('ts').data!.slice().buffer)[0]).toBe(1700000000123456n)
    expect(col('dec').dtype).toBe('float64')
    expect([...new Float64Array(col('dec').data!.slice().buffer)]).toEqual([123.45, -0.01, 0])
  })

  it('makes an Arrow table of a DataFrame with the same values', () => {
    const back = arrowFromFrame(frameFromArrow(table))
    expect(back.schema.fields.map((f) => f.name)).toEqual(['a', 'big', 'f', 'b', 's', 'd', 'ts', 'dec'])
    const row = (i: number) => Object.fromEntries(back.schema.fields.map((f, j) => [f.name, back.getChildAt(j)!.get(i)]))
    expect(row(0)).toMatchObject({ a: 1, big: 1n, f: 1.5, b: true, s: 'x', d: Date.UTC(2024, 0, 2), dec: 123.45 })
    expect(row(1)).toMatchObject({ a: null, b: null, s: null, d: null })
    expect(row(2)).toMatchObject({ big: null, b: false, s: 'zé', f: null })
    expect(Number.isNaN(row(1).f)).toBe(true)
    expect(row(0).ts).toBeCloseTo(1700000000123.456, 3)
  })

  it('gives repeated column names a number', () => {
    expect(uniqueNames(['x', 'X', 'x', '', ''])).toEqual(['x', 'X_1', 'x_2', 'column', 'column_1'])
  })
})

describe('Python tabs: example, download bar, switching', () => {
  it('uses the demo shop starter only when the demo is loaded', async () => {
    const { pythonStarter } = await import('../src/core/pyStarter')
    expect(pythonStarter([], true)).toContain('lab.table("orders")')
    const none = pythonStarter([], false)
    expect(none).toContain('lab.sql("SELECT 42 AS answer")')
    expect(none).toContain('Sample datasets')
    expect(none).not.toContain('"orders"')
  })

  it('reads the first table that is loaded: mine before a dataset, tables before views', async () => {
    const { pythonStarter } = await import('../src/core/pyStarter')
    const t = (schema: string, name: string, kind = 'table') => ({ schema, name, kind })
    expect(pythonStarter([t('chinook', 'Album'), t('main', 'v', 'view'), t('main', 'sales')], false)).toContain('lab.table("sales")')
    expect(pythonStarter([t('chinook', 'Album'), t('northwind', 'Order Details')], false)).toContain('lab.table("chinook.Album")')
  })

  it('works out the bytes of a download from the package sizes, and is unsure without them', async () => {
    const { bytesToLoad } = await import('../src/core/python')
    const sizes = { pandas: { size: 5, depends: ['numpy'] }, numpy: { size: 7, depends: [] }, seaborn: { size: 0, depends: [] } }
    expect(bytesToLoad(sizes, ['pandas'], new Set())).toBe(12)
    expect(bytesToLoad(sizes, ['pandas'], new Set(['numpy']))).toBe(5)
    expect(bytesToLoad(sizes, ['seaborn'], new Set())).toBeNull()
    expect(bytesToLoad(sizes, ['scipy'], new Set())).toBeNull()
  })

  it('words the download: megabytes and percent, never 100 %', async () => {
    const { pythonProgressLabel, pythonProgressShare } = await import('../src/core/progress')
    expect(pythonProgressLabel('Downloading Python', { loaded: 7_400_000, total: 17_700_000 })).toBe('Python 7.4 / 17.7 MB · 41 %')
    expect(pythonProgressLabel('Downloading Python', { loaded: 20_000_000, total: 17_700_000 })).toBe('Python 17.7 / 17.7 MB · 99 %')
    expect(pythonProgressLabel('Downloading seaborn', { loaded: 1_000_000, total: null })).toBe('seaborn 1.0 MB')
    expect(pythonProgressShare({ loaded: 5, total: 10 })).toBe(0.5)
    expect(pythonProgressShare({ loaded: 5, total: null })).toBeNull()
  })

  it('opens a new tab when text would cross between SQL and Python, else switches in place', async () => {
    const { dialectSwitch } = await import('../src/core/tabs')
    expect(dialectSwitch('duckdb', 'python', 'SELECT 1')).toBe('new-tab')
    expect(dialectSwitch('python', 'tsql', 'df = 1')).toBe('new-tab')
    expect(dialectSwitch('duckdb', 'python', '  \n')).toBe('in-place')
    expect(dialectSwitch('duckdb', 'tsql', 'SELECT 1')).toBe('in-place')
    expect(dialectSwitch('python', 'python', 'x')).toBe('in-place')
  })
})

describe('name hints', () => {
  const tables = [{ schema: 'adventureworks', name: 'Product' }, { schema: 'adventureworks', name: 'Address' }, { schema: 'quaera', name: 'fact_sellout' }, { schema: 'main', name: 'orders' }]
  it('Python: a dataset name or a table name that is not a variable', async () => {
    const { pythonNameHint } = await import('../src/core/dialect')
    expect(pythonNameHint("name 'adventureworks' is not defined", tables)).toContain('lab.table("adventureworks.Product"), lab.table("adventureworks.Address")')
    expect(pythonNameHint("name 'Product' is not defined", tables)).toContain('Did you mean lab.table("adventureworks.Product")?')
    expect(pythonNameHint("name 'fact_sellout' is not defined", tables)).toContain('lab.table("quaera.fact_sellout")')
    expect(pythonNameHint("name 'orders' is not defined", tables)).toContain('lab.table("orders")')
    expect(pythonNameHint("name 'x' is not defined", tables)).toBeNull()
  })
  it('SQL: names the schema-qualified table unless DuckDB already did', async () => {
    const { sqlNameHint } = await import('../src/core/dialect')
    expect(sqlNameHint('Catalog Error: Table with name Product does not exist!\nDid you mean "Products"?', tables)).toContain('adventureworks.Product')
    expect(sqlNameHint('Catalog Error: Table with name Product does not exist!\nDid you mean "adventureworks.Product"?', tables)).toBeNull()
    expect(sqlNameHint('Catalog Error: Table with name nothing does not exist!', tables)).toBeNull()
  })
})
