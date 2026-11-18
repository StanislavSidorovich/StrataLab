import { describe, expect, it } from 'vitest'
import { fromNotebook, toNotebook } from '../src/core/ipynb'
import { labCalls, splitCells } from '../src/core/pyCells'
import { pythonNotebookForTable } from '../src/core/pyStarter'
import { findMatchingTab } from '../src/core/tabs'
import {
  LARGE_TABLE_ROWS,
  MAX_NOTEBOOK_COLS,
  classifyDuckType,
  duplicateNormalizedColumns,
  generateTableNotebook,
  pyColExpr,
  type TableNotebookInput,
} from '../src/core/tableNotebook'

const EM_DASH = '\u2014'

function assertValidNotebook(nbText: string, expectedLabTable: string) {
  expect(nbText).not.toContain(EM_DASH)
  const cells = splitCells(nbText)
  expect(cells.length).toBeGreaterThanOrEqual(10)
  const md = cells.filter((c) => c.kind === 'markdown').map((c) => c.source).join('\n')
  expect(md).toContain('## 1. Exploration')
  expect(md).toContain('## 2. Preprocessing')
  expect(md).toContain('## 3. Processing')
  expect(md).toContain('## 4. Analysis')

  const codeCells = cells.filter((c) => c.kind === 'code')
  expect(codeCells.length).toBe(11)
  for (const c of codeCells) {
    expect(c.source.trimStart().startsWith('# Question: '), `Missing # Question: in cell:\n${c.source}`).toBe(true)
  }
  expect(labCalls(nbText)).toEqual([{ kind: 'table', arg: expectedLabTable }])
  return { cells, codeCells, md }
}

describe('tableNotebook helpers', () => {
  it('classifies DuckDB column types accurately', () => {
    expect(classifyDuckType('INTEGER')).toBe('numeric')
    expect(classifyDuckType('bigint')).toBe('numeric')
    expect(classifyDuckType('DECIMAL(10, 2)')).toBe('numeric')
    expect(classifyDuckType('DOUBLE PRECISION')).toBe('numeric')
    expect(classifyDuckType('VARCHAR(100)')).toBe('categorical')
    expect(classifyDuckType('TEXT')).toBe('categorical')
    expect(classifyDuckType('UUID')).toBe('categorical')
    expect(classifyDuckType('DATE')).toBe('temporal')
    expect(classifyDuckType('TIMESTAMP WITH TIME ZONE')).toBe('temporal')
    expect(classifyDuckType('INTERVAL')).toBe('temporal')
    expect(classifyDuckType('BOOLEAN')).toBe('boolean')
    expect(classifyDuckType('BOOL')).toBe('boolean')
    expect(classifyDuckType('INTEGER[]')).toBe('other')
    expect(classifyDuckType('STRUCT(a INT)')).toBe('other')
    expect(classifyDuckType('BLOB')).toBe('other')
    expect(classifyDuckType('JSON')).toBe('other')
  })

  it('quotes column expressions safely for spaces, quotes, non-ASCII, and Python keywords', () => {
    expect(pyColExpr('df', 'Order Date')).toBe('df["Order Date"]')
    expect(pyColExpr('df', 'class')).toBe('df["class"]')
    expect(pyColExpr('df', 'from')).toBe('df["from"]')
    expect(pyColExpr('df', 'a"b\\c')).toBe('df["a\\"b\\\\c"]')
    expect(pyColExpr('df', 'café €')).toBe('df["café €"]')
  })

  it('detects near-duplicate column names after trimming and lowercasing', () => {
    expect(duplicateNormalizedColumns(['id', 'name', 'ID '])).toEqual([['id', 'ID ']])
    expect(duplicateNormalizedColumns(['a', 'b', 'c'])).toEqual([])
  })
})

describe('generateTableNotebook: standard mixed tables', () => {
  it('builds a full 4-stage notebook for a main-schema table (student_data)', () => {
    const table: TableNotebookInput = {
      schema: 'main',
      name: 'student_data',
      rows: 420,
      columns: [
        { name: 'student_id', type: 'INTEGER', nullable: false },
        { name: 'major', type: 'VARCHAR', nullable: true },
        { name: 'campus', type: 'VARCHAR', nullable: true },
        { name: 'gpa', type: 'DOUBLE', nullable: true },
        { name: 'credits', type: 'INTEGER', nullable: true },
        { name: 'enrolled_at', type: 'DATE', nullable: true },
        { name: 'full_time', type: 'BOOLEAN', nullable: true },
      ],
    }
    const nb = pythonNotebookForTable(table)
    assertValidNotebook(nb, 'student_data')

    expect(nb).toContain('lab.table("student_data")')
    expect(nb).toContain('print("Shape:", df.shape)')
    expect(nb).toContain('df.info()')
    expect(nb).toContain('df.isna().sum().sort_values(ascending=False)')
    expect(nb).toContain('print("Exact duplicate rows:", int(df.duplicated().sum()))')
    expect(nb).toContain('df[["student_id","gpa","credits"]].describe().T')
    expect(nb).toContain('display(df["major"].value_counts(dropna=False).head(15))')
    expect(nb).toContain('display(df["campus"].value_counts(dropna=False).head(15))')
    expect(nb).toContain('display(df["full_time"].value_counts(dropna=False).head(15))')
    expect(nb).toContain('kind="hist"')
    expect(nb).toContain('12,50')
    expect(nb).toContain('DD.MM.YYYY')
    expect(nb).toContain('.str.replace(",", ".", regex=False).astype(float)')
    expect(nb).toContain('pd.to_datetime(')
    expect(nb).toContain('clean.groupby("major", dropna=False)["student_id"]')
    expect(nb).toContain('.corr(numeric_only=True).round(2)')
  })

  it('qualifies non-main schema tables (demo.orders)', () => {
    const table: TableNotebookInput = {
      schema: 'demo',
      name: 'orders',
      rows: 1200,
      columns: [
        { name: 'order_id', type: 'INTEGER' },
        { name: 'status', type: 'VARCHAR' },
        { name: 'total', type: 'DECIMAL(10, 2)' },
        { name: 'ordered_at', type: 'TIMESTAMP' },
      ],
    }
    const nb = generateTableNotebook(table)
    assertValidNotebook(nb, 'demo.orders')
    expect(nb).toContain('lab.table("demo.orders")')
    expect(nb).toContain('clean.groupby("status", dropna=False)["order_id"]')
    expect(nb).toContain('clean[["order_id","total"]].corr(numeric_only=True).round(2)')
  })
})

describe('generateTableNotebook: edge cases', () => {
  it('handles 0 rows', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'empty_orders',
      rows: 0,
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'label', type: 'VARCHAR' },
      ],
    })
    assertValidNotebook(nb, 'empty_orders')
    expect(nb).toContain('currently has 0 rows')
  })

  it('handles 0 columns', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'no_cols',
      rows: 0,
      columns: [],
    })
    assertValidNotebook(nb, 'no_cols')
    expect(nb).toContain('0 columns in metadata')
    expect(nb).not.toContain('df.describe(include="all")')
  })

  it('handles 1 column', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'single_col',
      rows: 10,
      columns: [{ name: 'amount', type: 'DOUBLE' }],
    })
    assertValidNotebook(nb, 'single_col')
    expect(nb).toContain('1 column ("amount")')
    expect(nb).toContain('Correlation requires at least 2 numeric columns')
  })

  it('notes allNull columns', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'sparse',
      rows: 50,
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'notes', type: 'VARCHAR', nullable: true, allNull: true },
      ],
    })
    assertValidNotebook(nb, 'sparse')
    expect(nb).toContain('all values are NULL in: "notes"')
  })

  it('handles 0 numeric columns', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'all_text',
      rows: 25,
      columns: [
        { name: 'city', type: 'VARCHAR' },
        { name: 'amount_text', type: 'VARCHAR' },
      ],
    })
    assertValidNotebook(nb, 'all_text')
    expect(nb).toContain('No numeric columns are typed as numbers yet')
    expect(nb).toContain('df.describe(include="all").T')
    expect(nb).toContain('kind="barh"')
    expect(nb).not.toContain('.corr(numeric_only=True)')
  })

  it('handles 0 categorical columns with numeric-only fallback', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'metrics',
      rows: 100,
      columns: [
        { name: 'x', type: 'DOUBLE' },
        { name: 'y', type: 'DOUBLE' },
      ],
    })
    assertValidNotebook(nb, 'metrics')
    expect(nb).toContain('No categorical columns found')
    expect(nb).toContain('Min-max scaling starter')
    expect(nb).not.toContain('clean.groupby(')
  })

  it('handles 1 numeric column (< 2 numeric columns)', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'one_num',
      rows: 30,
      columns: [
        { name: 'category', type: 'VARCHAR' },
        { name: 'score', type: 'INTEGER' },
      ],
    })
    assertValidNotebook(nb, 'one_num')
    expect(nb).toContain('Correlation requires at least 2 numeric columns')
    expect(nb).not.toContain('.corr(numeric_only=True)')
  })

  it('caps wide tables (120 columns) at MAX_NOTEBOOK_COLS', () => {
    const columns = Array.from({ length: 120 }, (_, i) => ({
      name: `col_${i + 1}`,
      type: i % 2 === 0 ? 'INTEGER' : 'VARCHAR',
    }))
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'wide_tbl',
      rows: 500,
      columns,
    })
    assertValidNotebook(nb, 'wide_tbl')
    expect(nb).toContain(`Wide table: 120 columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
    expect(nb).toContain(`Wide table: 60 numeric columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
    expect(nb).toContain('col_49')
    expect(nb).not.toContain('"col_51"')
  })

  it('adds SQL LIMIT and sampling hints on large tables (200,000 rows)', () => {
    const nb = generateTableNotebook({
      schema: 'quaera',
      name: 'big_events',
      rows: 200_000,
      columns: [
        { name: 'event_id', type: 'BIGINT' },
        { name: 'region', type: 'VARCHAR' },
        { name: 'amount', type: 'DOUBLE' },
      ],
    })
    assertValidNotebook(nb, 'quaera.big_events')
    expect(nb).toContain(`LIMIT ${LARGE_TABLE_ROWS}`)
    expect(nb).toContain('s.sample(n=10_000, random_state=42)')
    expect(nb).toContain(`corr_df.sample(n=${LARGE_TABLE_ROWS}, random_state=42)`)
  })

  it('safely quotes tricky column names (spaces, mixed case, non-ASCII, duplicates, Python keywords)', () => {
    const nb = generateTableNotebook({
      schema: 'main',
      name: 'Tricky Table',
      rows: 15,
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'ID ', type: 'INTEGER' },
        { name: 'class', type: 'VARCHAR' },
        { name: 'from', type: 'VARCHAR' },
        { name: 'def', type: 'DOUBLE' },
        { name: 'café {price}', type: 'DOUBLE' },
      ],
    })
    assertValidNotebook(nb, 'Tricky Table')
    expect(nb).toContain('near-duplicate column names after trimming/lowercasing: "id" vs "ID "')
    expect(nb).toContain('df["class"].value_counts(dropna=False).head(15)')
    expect(nb).toContain('df["from"].value_counts(dropna=False).head(15)')
    expect(nb).toContain('clean.groupby("class", dropna=False)["id"]')
    expect(nb).not.toMatch(/\bdf\.(class|from|def)\b/)
    expect(nb).not.toMatch(/f"[^"]*café \{price\}/)
  })

  it('round-trips cleanly through splitCells, toNotebook, and fromNotebook', () => {
    const nb = generateTableNotebook({
      schema: 'quaera',
      name: 'fact_sellout',
      rows: 1000,
      columns: [
        { name: 'sku_code', type: 'VARCHAR' },
        { name: 'units', type: 'INTEGER' },
        { name: 'revenue', type: 'DOUBLE' },
      ],
    })
    const cells = splitCells(nb)
    const ipynb = toNotebook({
      cells,
      runs: cells.map(() => null),
      datasets: [{ id: 'quaera', tables: [{ name: 'fact_sellout', file: 'fact_sellout.parquet' }] }],
    })
    const parsed = JSON.parse(ipynb)
    expect(parsed.nbformat).toBe(4)
    expect(parsed.cells.length).toBe(cells.length + 1)

    const reopened = fromNotebook(ipynb)
    expect(reopened.cells).toBe(cells.length)
    expect(splitCells(reopened.text).map((c) => ({ kind: c.kind, source: c.source }))).toEqual(
      cells.map((c) => ({ kind: c.kind, source: c.source })),
    )
  })

  it('deduplicates repeated opens via findMatchingTab (used by addOrFocusTab)', () => {
    const code = generateTableNotebook({
      schema: 'main',
      name: 'orders',
      rows: 10,
      columns: [{ name: 'id', type: 'INTEGER' }],
    })
    const tabs = [{ id: 't1', title: 'orders · Python', sql: code, dialect: 'python' }]
    expect(findMatchingTab(tabs, code, 'orders · Python', 'python')?.id).toBe('t1')
    expect(findMatchingTab(tabs, code + '\n# edited', 'orders · Python', 'python')).toBeUndefined()
    expect(findMatchingTab(tabs, code, 'orders · Python', 'duckdb')).toBeUndefined()
  })
})
