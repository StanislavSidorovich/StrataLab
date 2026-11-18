import { describe, expect, it } from 'vitest'
import {
  COPY_CONTEXT_TOAST,
  DEFAULT_AI_INSTRUCTION,
  MAX_AI_CELL_CHARS,
  MAX_AI_CONTEXT_CHARS,
  MAX_AI_CONTEXT_COLS,
  MAX_AI_SUMMARY_CHARS,
  buildAiContext,
  detectCellStage,
  extractComputedSummaries,
  formatLastCellOutcome,
  type AiContextTable,
} from '../src/core/aiContext'
import type { Output } from '../src/core/ipynb'

const SAMPLE_TABLE: AiContextTable = {
  name: 'demo.orders',
  rows: 649,
  columns: [
    { name: 'order_id', type: 'INTEGER', nullable: false },
    { name: 'customer_id', type: 'INTEGER', nullable: true },
    { name: 'status', type: 'VARCHAR', nullable: true },
    { name: 'total', type: 'DOUBLE', nullable: true },
  ],
}

describe('detectCellStage', () => {
  it('detects all four stages case-insensitively and checks preprocessing before processing', () => {
    const nb = [
      '# %% [markdown]',
      '# ## 1. Exploration',
      '# Inspect the dataset.',
      '',
      '# %%',
      'df = lab.table("demo.orders")',
      'df.head()',
      '',
      '# %% [markdown]',
      '# ## 2. PREPROCESSING',
      '# Clean missing values.',
      '',
      '# %%',
      'clean = df.copy()',
      '',
      '# %% [markdown]',
      '# ## 3. Processing',
      '# Group and scale.',
      '',
      '# %%',
      '# Question: Which groups answer your analysis question?',
      'grouped = clean.groupby("status").sum()',
      '',
      '# %% [markdown]',
      '# ## 4. Analysis',
      '# Final correlations.',
      '',
      '# %%',
      'clean.corr(numeric_only=True)',
    ].join('\n')

    expect(detectCellStage(nb, nb.indexOf('df.head()'))).toBe('exploration')
    expect(detectCellStage(nb, nb.indexOf('clean = df.copy()'))).toBe('preprocessing')
    expect(detectCellStage(nb, nb.indexOf('grouped ='))).toBe('processing')
    expect(detectCellStage(nb, nb.indexOf('clean.corr('))).toBe('analysis')
  })

  it('detects inline stage comments inside code cells and returns null when none exist', () => {
    const codeOnly = '# %%\n# Preprocessing: handle missing\ndf.fillna(0)'
    expect(detectCellStage(codeOnly, codeOnly.indexOf('df.fillna'))).toBe('preprocessing')

    const noStage = '# %%\ndf = lab.table("demo.orders")\ndf.shape'
    expect(detectCellStage(noStage, noStage.indexOf('df.shape'))).toBeNull()
  })
})

describe('extractComputedSummaries & formatLastCellOutcome', () => {
  it('extracts latest isna().sum() and describe() summaries while ignoring raw-row head/tail/sample cells', () => {
    const runs: { source: string; outputs: Output[] }[] = [
      {
        source: 'df = lab.table("demo.orders")\ndf.head()',
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 1,
            data: {
              'text/plain': '   order_id  secret_customer_row\n0         1       alice@secret.test',
              'text/html': '<table><tr><td>alice@secret.test</td></tr></table>',
            },
            metadata: {},
          },
        ],
      },
      {
        source: 'df.isna().sum()',
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 2,
            data: { 'text/plain': 'order_id       0\nstatus        12\ndtype: int64' },
            metadata: {},
          },
        ],
      },
      {
        source: 'df.isna().sum().head(5)',
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 3,
            data: { 'text/plain': 'SHOULD_NOT_WIN_OVER_NON_HEAD' },
            metadata: {},
          },
        ],
      },
      {
        source: 'df.describe().T',
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 4,
            data: {
              'text/plain': '          count   mean\norder_id  649.0  325.0',
              'text/html': '<table><tr><td>325.0</td></tr></table>',
            },
            metadata: {},
          },
        ],
      },
    ]

    const summaries = extractComputedSummaries(runs)
    expect(summaries.nullCounts).toContain('status        12')
    expect(summaries.nullCounts).not.toContain('SHOULD_NOT_WIN_OVER_NON_HEAD')
    expect(summaries.nullCounts).not.toContain('alice@secret.test')
    expect(summaries.describeSummary).toContain('order_id  649.0  325.0')
    expect(summaries.describeSummary).not.toContain('<table>')
  })

  it('truncates long summaries at MAX_AI_SUMMARY_CHARS', () => {
    const longText = 'col_x    10\n'.repeat(300)
    const summaries = extractComputedSummaries([
      {
        source: 'df.isnull().sum()',
        outputs: [{ output_type: 'stream', name: 'stdout', text: longText }],
      },
    ])
    expect(summaries.nullCounts).not.toBeNull()
    expect(summaries.nullCounts!.length).toBeLessThanOrEqual(MAX_AI_SUMMARY_CHARS)
    expect(summaries.nullCounts).toContain('[... summary truncated]')
  })

  it('omits raw DataFrame rows, HTML, and base64 PNGs in formatLastCellOutcome', () => {
    const headOutputs: Output[] = [
      {
        output_type: 'execute_result',
        execution_count: 1,
        data: {
          'text/plain': '   id  secret\n0   1   ROW_SECRET_123',
          'text/html': '<table><tr><td>ROW_SECRET_123</td></tr></table>',
        },
        metadata: {},
      },
    ]
    for (const src of ['df.head()', 'df.tail(5)', 'df.sample(5)', 'df']) {
      const outcome = formatLastCellOutcome(headOutputs, src)
      expect(outcome.lastError).toBeNull()
      expect(outcome.outputText).toBe('<DataFrame output omitted: no raw rows included>')
      expect(outcome.outputText).not.toContain('ROW_SECRET_123')
      expect(outcome.outputText).not.toContain('<table>')
    }

    const figOutputs: Output[] = [
      {
        output_type: 'display_data',
        data: { 'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAUA', 'text/plain': '<Figure size 640x480>' },
        metadata: {},
      },
    ]
    const figOutcome = formatLastCellOutcome(figOutputs, 'df["total"].plot(kind="hist")')
    expect(figOutcome.outputText).toBe('<Figure output omitted>')
    expect(figOutcome.outputText).not.toContain('iVBORw0KGgo')
  })

  it('extracts error ename, evalue, and up to 8 traceback lines', () => {
    const tb = Array.from({ length: 12 }, (_, i) => `  line ${i + 1}`)
    const errOutputs: Output[] = [
      {
        output_type: 'error',
        ename: 'KeyError',
        evalue: "'missing_col'",
        traceback: tb,
      },
    ]
    const outcome = formatLastCellOutcome(errOutputs, 'df["missing_col"]')
    expect(outcome.lastError).toContain("KeyError: 'missing_col'")
    expect(outcome.lastError).toContain('line 8')
    expect(outcome.lastError).not.toContain('line 9')
    expect(outcome.outputText).toBeNull()
  })
})

describe('buildAiContext', () => {
  it('builds schema and unrun exploration message with default instruction', () => {
    const tabText = '# %%\ndf = lab.table("demo.orders")\ndf.shape'
    const built = buildAiContext({
      tabTitle: 'Orders analysis',
      tabText,
      cursorPos: tabText.indexOf('df.shape'),
      tables: [SAMPLE_TABLE],
      cellRuns: [],
    })

    expect(COPY_CONTEXT_TOAST).toBe('Copied: schema and summary, no rows')
    expect(built.truncated).toBe(false)
    expect(built.hasSummary).toBe(false)
    expect(built.lastError).toBeNull()
    expect(built.stage).toBeNull()
    expect(built.referencedTables).toEqual(['demo.orders'])

    expect(built.text).toContain('=== Table & Schema ===')
    expect(built.text).toContain('demo.orders (649 rows, 4 columns)')
    expect(built.text).toContain('order_id: INTEGER')
    expect(built.text).toContain('total: DOUBLE')
    expect(built.text).toContain(
      'Not computed yet: run exploration first (df.isna().sum() and df.describe()) to include null counts and summary statistics.',
    )
    expect(built.text).toContain('=== Current Cell ===')
    expect(built.text).toContain('df.shape')
    expect(built.text).toContain(`=== Instruction ===\n${DEFAULT_AI_INSTRUCTION}`)
    expect(built.text).not.toContain('First 20 Rows')
  })

  it('includes computed summaries and stage-specific instruction while omitting df.head() rows', () => {
    const tabText = [
      '# %% [markdown]',
      '# ## 2. Preprocessing',
      '',
      '# %%',
      'df = lab.table("demo.orders")',
      'df.head()',
      '',
      '# %%',
      'df.isna().sum()',
      '',
      '# %%',
      'df.describe().T',
      '',
      '# %%',
      'clean = df.dropna(subset=["status"])',
    ].join('\n')

    const built = buildAiContext({
      tabTitle: 'Orders',
      tabText,
      cursorPos: tabText.indexOf('clean ='),
      tables: [SAMPLE_TABLE],
      cellRuns: [
        {
          source: 'df = lab.table("demo.orders")\ndf.head()',
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 1,
              data: {
                'text/plain': 'order_id status\n1 SECRET_ROW_VALUE',
                'text/html': '<table><tr><td>SECRET_ROW_VALUE</td></tr></table>',
              },
              metadata: {},
            },
          ],
        },
        {
          source: 'df.isna().sum()',
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 2,
              data: { 'text/plain': 'order_id    0\nstatus      5\ndtype: int64' },
              metadata: {},
            },
          ],
        },
        {
          source: 'df.describe().T',
          outputs: [
            {
              output_type: 'execute_result',
              execution_count: 3,
              data: { 'text/plain': '       count   mean\ntotal  649.0  42.50' },
              metadata: {},
            },
          ],
        },
      ],
    })

    expect(built.stage).toBe('preprocessing')
    expect(built.hasSummary).toBe(true)
    expect(built.text).toContain('order_id    0\nstatus      5')
    expect(built.text).toContain('total  649.0  42.50')
    expect(built.text).not.toContain('SECRET_ROW_VALUE')
    expect(built.text).toContain(
      'I am doing data mining preprocessing; explain the decision, do not just give the final code.',
    )
  })

  it('extracts error from current cell or fallbackLastOutputs', () => {
    const tabText = '# %%\ndf["bad_col"]'
    const errOutput: Output[] = [
      {
        output_type: 'error',
        ename: 'KeyError',
        evalue: "'bad_col'",
        traceback: ['Traceback (most recent call last):', '  Cell [2], line 1', "KeyError: 'bad_col'"],
      },
    ]

    const fromCell = buildAiContext({
      tabTitle: 'Err',
      tabText,
      cursorPos: 6,
      tables: [SAMPLE_TABLE],
      cellRuns: [{ source: 'df["bad_col"]', outputs: errOutput }],
    })
    expect(fromCell.lastError).toContain("KeyError: 'bad_col'")
    expect(fromCell.text).toContain('=== Last Error / Output ===')
    expect(fromCell.text).toContain("KeyError: 'bad_col'")

    const fromFallback = buildAiContext({
      tabTitle: 'Err',
      tabText,
      cursorPos: 6,
      tables: [SAMPLE_TABLE],
      cellRuns: [],
      fallbackLastOutputs: errOutput,
    })
    expect(fromFallback.lastError).toContain("KeyError: 'bad_col'")
  })

  it('handles edge cases: 0 rows, 1 column, 120 columns cap, spaces/non-ASCII columns, long cell, and overall cap', () => {
    const zeroRows: AiContextTable = {
      name: 'Order Details',
      rows: 0,
      columns: [{ name: 'Año escolar', type: 'VARCHAR' }],
    }
    const basicText = '# %%\ndf = lab.table("Order Details")'
    const zeroBuilt = buildAiContext({
      tabTitle: 'Edge',
      tabText: basicText,
      cursorPos: 10,
      tables: [zeroRows],
      cellRuns: [],
    })
    expect(zeroBuilt.text).toContain('Order Details (0 rows, 1 column)')
    expect(zeroBuilt.text).toContain('Año escolar: VARCHAR')

    const wideTable: AiContextTable = {
      name: 'wide_tbl',
      rows: null,
      columns: Array.from({ length: 120 }, (_, i) => ({
        name: `col_${i + 1}`,
        type: 'INTEGER',
      })),
    }
    const longCell = '# %%\n' + 'x = 1\n'.repeat(900)
    expect(longCell.length).toBeGreaterThan(MAX_AI_CELL_CHARS)

    const wideBuilt = buildAiContext({
      tabTitle: 'Wide',
      tabText: longCell,
      cursorPos: 10,
      tables: [wideTable],
      cellRuns: [],
    })
    expect(wideBuilt.text).toContain('wide_tbl (row count unknown, 120 columns)')
    expect(wideBuilt.text).toContain(`col_${MAX_AI_CONTEXT_COLS}: INTEGER`)
    expect(wideBuilt.text).not.toContain(`col_${MAX_AI_CONTEXT_COLS + 1}: INTEGER`)
    expect(wideBuilt.text).toContain(`... and ${120 - MAX_AI_CONTEXT_COLS} more columns`)
    expect(wideBuilt.text).toContain('[... cell truncated]')

    const giantSummary = 'summary_line_abcdefghij\n'.repeat(100)
    const hugeTables: AiContextTable[] = Array.from({ length: 10 }, (_, t) => ({
      name: `tbl_${t}`,
      rows: 100,
      columns: Array.from({ length: 60 }, (_, c) => ({
        name: `very_long_column_name_for_table_${t}_column_${c}`,
        type: 'VARCHAR',
      })),
    }))
    const hugeTab = `# %%\n${hugeTables.map((t) => `lab.table("${t.name}")`).join('\n')}\n${'y = 2\n'.repeat(800)}`
    const capped = buildAiContext({
      tabTitle: 'Huge',
      tabText: hugeTab,
      cursorPos: 10,
      tables: hugeTables,
      cellRuns: [
        { source: 'df.isna().sum()', outputs: [{ output_type: 'stream', name: 'stdout', text: giantSummary }] },
      ],
    })
    expect(capped.truncated).toBe(true)
    expect(capped.text.length).toBeLessThanOrEqual(MAX_AI_CONTEXT_CHARS)
    expect(capped.text).toContain('[Context truncated to fit size limit]')
  })

  it('omits sampleRows by default and includes them only when explicitly passed', () => {
    const tabText = '# %%\ndf = lab.table("demo.orders")'
    const withoutRows = buildAiContext({
      tabTitle: 'Orders',
      tabText,
      cursorPos: 5,
      tables: [SAMPLE_TABLE],
      cellRuns: [],
      sampleRows: null,
    })
    expect(withoutRows.text).not.toContain('First 20 Rows')

    const withRows = buildAiContext({
      tabTitle: 'Orders',
      tabText,
      cursorPos: 5,
      tables: [SAMPLE_TABLE],
      cellRuns: [],
      sampleRows: {
        tableName: 'demo.orders',
        header: ['order_id', 'status'],
        rows: [
          ['1', 'paid'],
          ['2', 'pending'],
        ],
      },
    })
    expect(withRows.text).toContain('=== First 20 Rows (explicit user opt-in) ===')
    expect(withRows.text).toContain('order_id | status')
    expect(withRows.text).toContain('1 | paid')
  })
})
