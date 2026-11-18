// Pure generator for "New Python notebook for this table": builds a 4-stage
// (Exploration -> Preprocessing -> Processing -> Analysis) `# %%` notebook tailored
// to a table's schema, row count, and column types. No React or DuckDB imports.
import { labName } from './pyStarter'

export const MAX_NOTEBOOK_COLS = 25
export const LARGE_TABLE_ROWS = 50_000

export interface NotebookColInput {
  name: string
  type: string
  nullable?: boolean
  allNull?: boolean
}

export interface TableNotebookInput {
  schema: string
  name: string
  rows: number | null
  columns: readonly NotebookColInput[]
}

export type DuckColClass = 'numeric' | 'categorical' | 'temporal' | 'boolean' | 'other'

/** Classifies a DuckDB column type string into a high-level analysis role. */
export function classifyDuckType(type: string): DuckColClass {
  const raw = type.trim().toUpperCase()
  if (!raw) return 'other'
  if (raw.endsWith('[]') || /^(LIST|ARRAY|STRUCT|MAP|UNION|BLOB|BYTEA|BIT|BITSTRING|JSON|GEOMETRY)\b/.test(raw)) {
    return 'other'
  }
  const base = raw.replace(/\(.*\)/g, '').trim()
  if (/^(BOOL|BOOLEAN|LOGICAL)$/.test(base)) return 'boolean'
  if (/^(DATE|TIME|DATETIME|TIMESTAMP|TIMESTAMPTZ|INTERVAL)\b/.test(base) || /^TIMESTAMP(_S|_MS|_NS|_TZ)?$/.test(base)) {
    return 'temporal'
  }
  if (
    /^(TINYINT|SMALLINT|INTEGER|INT|INT1|INT2|INT4|INT8|INT128|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|UINT128|BIGNUM|VARINT|FLOAT|FLOAT4|FLOAT8|REAL|DOUBLE|DOUBLE PRECISION|DECIMAL|NUMERIC|DEC|SIGNED|SHORT|LONG)$/.test(
      base,
    )
  ) {
    return 'numeric'
  }
  if (/^(VARCHAR|CHAR|BPCHAR|TEXT|STRING|NVARCHAR|ENUM|UUID)$/.test(base)) return 'categorical'
  return 'other'
}

/** Always uses bracket notation so spaces, mixed case, quotes, non-ASCII, and Python keywords are safe. */
export function pyColExpr(dfVar: string, colName: string): string {
  return `${dfVar}[${JSON.stringify(colName)}]`
}

/** Detects pairs of column names that collide after `.trim().toLowerCase()`. */
export function duplicateNormalizedColumns(cols: readonly string[]): [string, string][] {
  const pairs: [string, string][] = []
  const seen = new Map<string, string[]>()
  for (const col of cols) {
    const key = col.trim().toLowerCase()
    const prev = seen.get(key)
    if (prev) {
      for (const p of prev) pairs.push([p, col])
      prev.push(col)
    } else {
      seen.set(key, [col])
    }
  }
  return pairs
}

const quoteSqlPart = (s: string) => `"${s.replace(/"/g, '""')}"`

const sqlTableRef = (schema: string, name: string) =>
  schema === 'main' ? quoteSqlPart(name) : `${quoteSqlPart(schema)}.${quoteSqlPart(name)}`

const mdCell = (lines: string[]): string =>
  ['# %% [markdown]', ...lines.map((l) => (l ? `# ${l}` : '#'))].join('\n')

const codeCell = (question: string, lines: string[]): string =>
  ['# %%', `# Question: ${question}`, ...lines].join('\n')

/** Generates a 4-stage `# %%` Python notebook tailored to the given table's columns and row count. */
export function generateTableNotebook(input: TableNotebookInput): string {
  const tableName = labName({ schema: input.schema, name: input.name, kind: 'table' })
  const tableLit = JSON.stringify(tableName)
  const cols = input.columns
  const colNames = cols.map((c) => c.name)
  const numCols = cols.filter((c) => classifyDuckType(c.type) === 'numeric').map((c) => c.name)
  const catBoolCols = cols
    .filter((c) => {
      const cls = classifyDuckType(c.type)
      return cls === 'categorical' || cls === 'boolean'
    })
    .map((c) => c.name)
  const nonNumCols = cols.filter((c) => classifyDuckType(c.type) !== 'numeric').map((c) => c.name)
  const allNullCols = cols.filter((c) => c.allNull === true).map((c) => c.name)
  const dupPairs = duplicateNormalizedColumns(colNames)
  const isLarge = input.rows != null && input.rows > LARGE_TABLE_ROWS
  const isWide = cols.length > MAX_NOTEBOOK_COLS
  const shownCols = colNames.slice(0, MAX_NOTEBOOK_COLS)
  const shownNumCols = numCols.slice(0, MAX_NOTEBOOK_COLS)

  const rowInfo = input.rows != null ? `${input.rows.toLocaleString()} rows` : 'row count unknown'

  const cells: string[] = []

  // Header
  cells.push(
    mdCell([
      `# ${tableName} (schema: ${input.schema})`,
      `Guided 4-stage notebook for \`lab.table(${tableLit})\` (${rowInfo}, ${cols.length} columns).`,
      'This cell: Ctrl+Enter · this cell, then on to the next: Shift+Enter · every cell: Ctrl+Shift+Enter or F5.',
    ]),
  )

  // Stage 1: Exploration
  cells.push(
    mdCell([
      '## 1. Exploration',
      'Inspect dimensions, types, missing values, duplicates, numeric spread, categories, and distributions before making edits.',
    ]),
  )

  const loadLines = ['import pandas as pd', 'import matplotlib.pyplot as plt']
  if (input.rows === 0) {
    loadLines.push('# Note: this table currently has 0 rows; add or load data before expecting summaries or charts.')
  }
  if (isLarge) {
    const sampleSql = `SELECT * FROM ${sqlTableRef(input.schema, input.name)} LIMIT ${LARGE_TABLE_ROWS}`
    loadLines.push(
      `# Large table (${input.rows!.toLocaleString()} rows): if memory or speed becomes tight, sample in SQL first:`,
      `# df = lab.sql(${JSON.stringify(sampleSql)})`,
    )
  }
  if (isWide) {
    loadLines.push(`# Wide table: ${cols.length} columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
  }
  if (cols.length === 0) {
    loadLines.push('# Note: this table has 0 columns in metadata.')
  } else if (cols.length === 1) {
    loadLines.push(`# Note: this table has 1 column (${JSON.stringify(cols[0].name)}); multi-column comparisons are skipped.`)
  }
  loadLines.push(`df = lab.table(${tableLit})`, 'df.head()')
  cells.push(codeCell('What do the first few rows of this table look like?', loadLines))

  cells.push(
    codeCell(
      'How many rows and columns are in this table, and are any types wrong (such as numbers or dates stored as text)?',
      ['print("Shape:", df.shape)', 'df.info()'],
    ),
  )

  const nullLines: string[] = []
  if (allNullCols.length > 0) {
    nullLines.push(`# Note: all values are NULL in: ${allNullCols.map((c) => JSON.stringify(c)).join(', ')}`)
  }
  nullLines.push('df.isna().sum().sort_values(ascending=False)')
  cells.push(
    codeCell(
      'Which columns have missing values, and could missing mean zero or not applicable?',
      nullLines,
    ),
  )

  const dupLines: string[] = []
  if (dupPairs.length > 0) {
    const pairText = dupPairs.map(([a, b]) => `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).join(', ')
    dupLines.push(`# Warning: near-duplicate column names after trimming/lowercasing: ${pairText}`)
  }
  dupLines.push('print("Exact duplicate rows:", int(df.duplicated().sum()))')
  cells.push(
    codeCell('Are there exact duplicate rows or repeated IDs that could inflate totals?', dupLines),
  )

  const summaryLines: string[] = []
  if (shownNumCols.length > 0) {
    if (numCols.length > MAX_NOTEBOOK_COLS) {
      summaryLines.push(`# Wide table: ${numCols.length} numeric columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
    }
    summaryLines.push(`df[${JSON.stringify(shownNumCols)}].describe().T`)
  } else if (cols.length > 0) {
    summaryLines.push(
      '# No numeric columns are typed as numbers yet (check Stage 2 if decimal commas were imported as text).',
    )
    if (isWide) {
      summaryLines.push(`# Wide table: ${cols.length} columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
      summaryLines.push(`df[${JSON.stringify(shownCols)}].describe(include="all").T`)
    } else {
      summaryLines.push('df.describe(include="all").T')
    }
  } else {
    summaryLines.push('# No columns available to summarize.', 'df.shape')
  }
  cells.push(
    codeCell(
      'What are the min, max, median, and spread of the numeric columns - do any look impossible?',
      summaryLines,
    ),
  )

  const vcLines: string[] = []
  let vcCols: string[] = []
  if (catBoolCols.length > 0) {
    vcCols = catBoolCols.slice(0, 3)
  } else if (nonNumCols.length > 0) {
    vcLines.push('# No categorical or boolean columns found; inspecting the first non-numeric column instead.')
    vcCols = [nonNumCols[0]]
  } else if (colNames.length > 0) {
    vcLines.push('# No categorical columns found; inspecting the first column instead.')
    vcCols = [colNames[0]]
  } else {
    vcLines.push('# No columns available for value counts.', 'df.columns.tolist()')
  }
  for (const c of vcCols) {
    vcLines.push(`display(${pyColExpr('df', c)}.value_counts(dropna=False).head(15))`)
  }
  cells.push(
    codeCell('Which categories dominate, and are there typos or inconsistent spellings/casing?', vcLines),
  )

  const histLines: string[] = []
  if (numCols.length >= 1) {
    const firstNum = numCols[0]
    histLines.push(`s = ${pyColExpr('df', firstNum)}.dropna()`)
    if (isLarge) {
      histLines.push(
        '# Sampling up to 10,000 non-null rows so the histogram stays fast on large tables.',
        'if len(s) > 10_000:',
        '    s = s.sample(n=10_000, random_state=42)',
      )
    }
    histLines.push(
      'if len(s) > 0:',
      `    s.plot(kind="hist", bins=20, title=${JSON.stringify(`Distribution of ${firstNum}`)})`,
      `    plt.xlabel(${JSON.stringify(firstNum)})`,
      '    plt.show()',
      's.describe()',
    )
  } else if (colNames.length > 0) {
    const firstCol = colNames[0]
    histLines.push(
      '# A histogram needs a numeric column (convert text numbers in Stage 2 first).',
      '# Plotting top values of the first column instead:',
      `vc = ${pyColExpr('df', firstCol)}.value_counts(dropna=False).head(10)`,
      'if len(vc) > 0:',
      `    vc.plot(kind="barh", title=${JSON.stringify(`Top values of ${firstCol}`)})`,
      '    plt.xlabel("Count")',
      '    plt.show()',
      'vc',
    )
  } else {
    histLines.push('# No columns available to plot.', 'df.shape')
  }
  cells.push(
    codeCell('How is the first numeric column distributed (skewed, bimodal, or extreme outliers)?', histLines),
  )

  // Stage 2: Preprocessing
  cells.push(
    mdCell([
      '## 2. Preprocessing',
      'Convert text-encoded numbers or dates explicitly, and inspect missing values and outliers before editing.',
    ]),
  )

  cells.push(
    codeCell(
      'Are any numbers (like "12,50") or dates (like "31.12.2025") stored as text that need explicit conversion?',
      [
        'text_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()',
        'comma_num_cols = [',
        '    c for c in text_cols',
        '    if df[c].dropna().astype(str).str.match(r"^-?\\d+,\\d+$").any()',
        ']',
        'dmy_date_cols = [',
        '    c for c in text_cols',
        '    if df[c].dropna().astype(str).str.match(r"^\\d{2}\\.\\d{2}\\.\\d{4}$").any()',
        ']',
        'print("Text columns:", text_cols)',
        'print("Possible decimal-comma number columns:", comma_num_cols)',
        'print("Possible DD.MM.YYYY date columns:", dmy_date_cols)',
        '# Explicit conversion examples (verify the column format first; never guess silently):',
        '# df["amount"] = df["amount"].astype(str).str.replace(",", ".", regex=False).astype(float)',
        '# df["order_date"] = pd.to_datetime(df["order_date"], format="%d.%m.%Y", errors="coerce")',
      ],
    ),
  )

  const cleanLines = [
    'clean = df.copy()',
    '# Example imputation (uncomment only after deciding what missing means for that column):',
    '# clean["col"] = clean["col"].fillna(clean["col"].median())',
  ]
  if (numCols.length >= 1) {
    const firstNum = numCols[0]
    cleanLines.push(
      `s_iqr = ${pyColExpr('clean', firstNum)}.dropna()`,
      'if len(s_iqr) > 0:',
      '    q1, q3 = s_iqr.quantile([0.25, 0.75])',
      '    iqr = q3 - q1',
      '    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr',
      '    outliers = int(((s_iqr < low) | (s_iqr > high)).sum())',
      `    print(${JSON.stringify(firstNum)}, f"IQR bounds: [{low:.2f}, {high:.2f}], outside bounds: {outliers}")`,
      '# Optional capping example:',
      '# clean["col"] = clean["col"].clip(lower=low, upper=high)',
    )
  }
  cleanLines.push('clean.shape')
  cells.push(
    codeCell('Which missing values or IQR outliers should you impute, cap, or keep (and why)?', cleanLines),
  )

  // Stage 3: Processing
  cells.push(
    mdCell([
      '## 3. Processing',
      'Group, derive features, or scale numeric columns to answer your analysis question.',
    ]),
  )

  const procLines: string[] = []
  if (catBoolCols.length > 0 && numCols.length > 0) {
    const catCol = catBoolCols[0]
    const numCol = numCols[0]
    procLines.push(
      'grouped = (',
      `    clean.groupby(${JSON.stringify(catCol)}, dropna=False)[${JSON.stringify(numCol)}]`,
      '    .agg(["count", "mean", "sum"])',
      '    .sort_values("sum", ascending=False)',
      ')',
      'grouped.head(15)',
    )
  } else if (numCols.length > 0) {
    const numCol = numCols[0]
    procLines.push(
      '# Min-max scaling starter (no categorical columns present for grouping):',
      `s_scale = ${pyColExpr('clean', numCol)}`,
      'span = s_scale.max() - s_scale.min()',
      'scaled = (s_scale - s_scale.min()) / span if pd.notna(span) and span != 0 else s_scale * 0.0',
      'scaled.describe()',
    )
  } else {
    procLines.push('clean.head(5)')
  }
  cells.push(
    codeCell('Which groups, derived columns, or scaled numeric features answer your analysis question?', procLines),
  )

  // Stage 4: Analysis
  cells.push(
    mdCell([
      '## 4. Analysis',
      'Check relationships between variables and note limitations before drawing conclusions.',
    ]),
  )

  const analysisLines: string[] = []
  if (numCols.length >= 2) {
    if (numCols.length > MAX_NOTEBOOK_COLS) {
      analysisLines.push(`# Wide table: ${numCols.length} numeric columns total; correlating the first ${MAX_NOTEBOOK_COLS}.`)
    }
    if (isLarge) {
      analysisLines.push(
        `# Large table: sampling up to ${LARGE_TABLE_ROWS.toLocaleString()} rows before computing correlations.`,
        `corr_df = clean[${JSON.stringify(shownNumCols)}]`,
        `if len(corr_df) > ${LARGE_TABLE_ROWS}:`,
        `    corr_df = corr_df.sample(n=${LARGE_TABLE_ROWS}, random_state=42)`,
        'corr_df.corr(numeric_only=True).round(2)',
      )
    } else {
      analysisLines.push(`clean[${JSON.stringify(shownNumCols)}].corr(numeric_only=True).round(2)`)
    }
  } else {
    analysisLines.push('# Correlation requires at least 2 numeric columns; showing overall summary instead.')
    if (colNames.length > 0) {
      if (isWide) {
        analysisLines.push(`# Wide table: ${cols.length} columns total; showing the first ${MAX_NOTEBOOK_COLS} here.`)
        analysisLines.push(`clean[${JSON.stringify(shownCols)}].describe(include="all").T`)
      } else {
        analysisLines.push('clean.describe(include="all").T')
      }
    } else {
      analysisLines.push('clean.shape')
    }
  }
  cells.push(
    codeCell('Which variables move together, and what limitations might affect your conclusions?', analysisLines),
  )

  return cells.join('\n\n') + '\n'
}
