// The skills of the Python practice page, by the section that teaches each. Rules: RULES.md.
// `uses` runs on a solution with its strings emptied, so a column name reads "".
import type { PracticeSkill } from '../practiceBook'

export const SKILLS: PracticeSkill[] = [
  { id: 'size', section: 'first-look', uses: /\blen\(|\.shape\b/ },
  { id: 'pick-columns', section: 'first-look', uses: /\[\[|\.loc\[.*,/ },
  { id: 'distinct', section: 'first-look', uses: /\.n?unique\(/ },
  { id: 'one-number', section: 'first-look', uses: /\.(max|min|mean|median|sum)\(\)/ },

  { id: 'filter', section: 'filter', uses: /\]\s*(==|!=|>=?|<=?)\s/ },
  { id: 'filter-and', section: 'filter', uses: /\s[&|]\s/ },
  { id: 'filter-list', section: 'filter', uses: /\.(isin|between)\(/ },
  { id: 'filter-text', section: 'filter', uses: /\.str\.contains\(/ },
  { id: 'filter-missing', section: 'filter', uses: /\.(isna|notna)\(\)/ },
  { id: 'date-part', section: 'filter', uses: /\.dt\.(year|month|day)\b/ },
  { id: 'sort', section: 'filter', uses: /\.sort_values\(/ },
  { id: 'top-n', section: 'filter', uses: /\.n(largest|smallest)\(/ },

  { id: 'count-values', section: 'summaries', uses: /\.value_counts\(/ },
  { id: 'share', section: 'summaries', uses: /\)\.mean\(\)/ },

  { id: 'add-column', section: 'new-columns', uses: /\.assign\(|\[""\]\s*=(?!=)/ },
  { id: 'if-column', section: 'new-columns', uses: /\bnp\.where\(/ },
  { id: 'bands', section: 'new-columns', uses: /\bpd\.cut\(/ },
  { id: 'map-values', section: 'new-columns', uses: /\.map\(/ },
  { id: 'name-counts', section: 'new-columns', uses: /\.rename_axis\(|\.reset_index\(name=/ },
  { id: 'text-parts', section: 'new-columns', uses: /\.str\.(extract|split)\(/ },
  { id: 'to-type', section: 'new-columns', uses: /\.astype\(/ },
  { id: 'drop-missing', section: 'new-columns', uses: /\.dropna\(/ },

  { id: 'missing-per-column', section: 'missing', uses: /\.isna\(\)\.sum\(\)/ },
  { id: 'keep-missing', section: 'missing', uses: /\.isna\(\)\s*\|/ },
  { id: 'fill-missing', section: 'missing', uses: /\.fillna\(/ },

  { id: 'weekday', section: 'dates', uses: /\.dt\.(dayofweek|day_name)/ },
  { id: 'month-start', section: 'dates', uses: /\.to_period\(/ },
  { id: 'date-gap', section: 'dates', uses: /\.dt\.days\b/ },
  { id: 'one-row-table', section: 'dates', uses: /\bpd\.DataFrame\(/ },

  { id: 'clean-text', section: 'clean-export', uses: /\.str\.(strip|upper|lower)\(/ },
  { id: 'replace-text', section: 'clean-export', uses: /\.str\.replace\(/ },
  { id: 'to-numeric', section: 'clean-export', uses: /\bpd\.to_numeric\(/ },
  { id: 'parse-dates', section: 'clean-export', uses: /\bpd\.to_datetime\(/ },
  { id: 'drop-duplicates', section: 'clean-export', uses: /\.drop_duplicates\(/ },

  { id: 'group-total', section: 'groupby', uses: /\.groupby\(/ },
  { id: 'group-agg', section: 'groupby', uses: /\.agg\(/ },
  { id: 'filter-groups', section: 'groupby' },

  { id: 'merge', section: 'merge', uses: /\.merge\(/ },
  { id: 'merge-other-names', section: 'merge', uses: /\bleft_on=/ },
  { id: 'merge-left', section: 'merge', uses: /\bhow=/ },
  { id: 'no-match', section: 'merge', uses: /\bindicator=/ },
  { id: 'merge-validate', section: 'merge', uses: /\bvalidate=/ },

  { id: 'pivot', section: 'reshape', uses: /\.pivot_table\(/ },
  { id: 'crosstab', section: 'reshape', uses: /\bpd\.crosstab\(/ },
  { id: 'melt', section: 'reshape', uses: /\.melt\(/ },

  { id: 'share-of-group', section: 'across-rows', uses: /\.transform\(/ },
  { id: 'change', section: 'across-rows', uses: /\.pct_change\(/ },
  { id: 'rolling', section: 'across-rows', uses: /\.rolling\(/ },
  { id: 'running-total', section: 'across-rows', uses: /\.cumsum\(/ },
  { id: 'rank', section: 'across-rows', uses: /\.rank\(/ },

  { id: 'line-chart', section: 'charts', uses: /\.plot\(/ },
  { id: 'bar-chart', section: 'charts', uses: /\.plot\.barh?\(/ },
]
