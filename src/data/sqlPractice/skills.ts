// The skills of the SQL practice page, by the section that teaches each. Rules: RULES.md.
// `uses` runs on a solution with its strings emptied, so a text value reads ''.
import type { PracticeSkill } from '../practiceBook'

export const SKILLS: PracticeSkill[] = [
  { id: 'select', section: 'select', uses: /\bSELECT\b/ },
  { id: 'alias', section: 'select', uses: /\bAS\s+\w+\s*(,|\n|FROM\b)/ },
  { id: 'order-by', section: 'select', uses: /\bORDER BY\b/ },
  { id: 'top', section: 'select', uses: /\bTOP\b/ },

  { id: 'where', section: 'where', uses: /\bWHERE\b/ },
  { id: 'where-and-or', section: 'where', uses: /(?<!BETWEEN\s+\S+\s+)\bAND\b|\bOR\b/ },
  { id: 'where-in', section: 'where', uses: /\bIN\s*\(/ },
  { id: 'where-between', section: 'where', uses: /\bBETWEEN\b/ },
  { id: 'where-like', section: 'where', uses: /\bLIKE\b/ },

  { id: 'is-null', section: 'null', uses: /\bIS (NOT )?NULL\b/ },
  { id: 'coalesce', section: 'null', uses: /\b(COALESCE|ISNULL)\(/ },

  { id: 'count', section: 'totals', uses: /\bCOUNT\(/ },
  { id: 'count-distinct', section: 'totals', uses: /\bCOUNT\(DISTINCT\b/ },
  { id: 'sum-avg', section: 'totals', uses: /\b(SUM|AVG|MIN|MAX)\(/ },
  { id: 'ratio', section: 'totals', uses: /\b1\.0 \*|\/ SUM\(/ },

  { id: 'group-by', section: 'group-by', uses: /\bGROUP BY\b/ },
  { id: 'group-expression', section: 'group-by', uses: /\bGROUP BY [A-Z]+\(|\bGROUP BY FLOOR\b/ },
  { id: 'having', section: 'group-by', uses: /\bHAVING\b/ },

  { id: 'date-part', section: 'dates', uses: /\b(YEAR|MONTH)\(/ },
  { id: 'month-start', section: 'dates', uses: /\bDATETRUNC\(/ },
  { id: 'date-gap', section: 'dates', uses: /\bDATEDIFF\(/ },
  { id: 'date-add', section: 'dates', uses: /\bDATEADD\(/ },

  { id: 'join', section: 'inner-join', uses: /\bJOIN\b/ },
  { id: 'join-chain', section: 'inner-join', uses: /\bJOIN\b[\s\S]*\bJOIN\b/ },

  { id: 'left-join', section: 'left-join', uses: /\bLEFT JOIN\b/ },
  { id: 'left-on-condition', section: 'left-join', uses: /\bLEFT JOIN\b[^\n]*\n?\s*ON [^\n]*\n\s*AND\b/ },
  { id: 'no-match', section: 'left-join', uses: /\bLEFT JOIN\b[\s\S]*\bWHERE\b[\s\S]*\bIS NULL\b/ },
  { id: 'repeated-rows', section: 'left-join' },

  { id: 'case', section: 'case', uses: /\bCASE\b/ },
  { id: 'case-total', section: 'case', uses: /\b(SUM|COUNT)\(CASE\b/ },

  { id: 'subquery', section: 'cte', uses: /\(\s*SELECT\b/ },
  { id: 'cte', section: 'cte', uses: /\bWITH\b/ },
  { id: 'two-ctes', section: 'cte', uses: /\),\s*\w+ AS \(/ },

  { id: 'window', section: 'windows', uses: /\bOVER\b/ },
  { id: 'partition', section: 'windows', uses: /\bPARTITION BY\b/ },
  { id: 'running', section: 'windows', uses: /\bOVER \((PARTITION BY [^)]*?)?ORDER BY\b/ },
  { id: 'lag', section: 'windows', uses: /\bLAG\(/ },
  { id: 'frame', section: 'windows', uses: /\bROWS BETWEEN\b/ },

  { id: 'dense-rank', section: 'ranking', uses: /\bDENSE_RANK\(/ },
  { id: 'row-number', section: 'ranking', uses: /\bROW_NUMBER\(/ },
  { id: 'ntile', section: 'ranking', uses: /\bNTILE\(/ },
]
