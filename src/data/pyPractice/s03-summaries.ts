import type { PracticeSection } from '../practiceBook'

export const SUMMARIES: PracticeSection = {
  id: 'summaries',
  n: 3,
  title: 'Quick summaries',
  blocks: [
    {
      kind: 'note',
      text: '`value_counts` is the fastest answer to "what is in this column, and how often". It sorts from the most frequent and gives a named index, so the values are a column of the answer.',
      syntax: 'df["brand"].value_counts()   df["brand"].value_counts(normalize=True)',
    },
    {
      kind: 'example',
      id: 'py-summaries-categories',
      title: 'Products per category',
      code: `products["category"].value_counts()`,
    },
    {
      kind: 'task',
      id: 'py-summaries-brand-sizes',
      title: 'The widest brands',
      question: 'How many products does each brand have? Show brand and count, the most first, then by brand.',
      ordered: true,
      hints: ['value_counts on brand gives the numbers.', 'Ties need a second key: make it a table with reset_index first.', 'products["brand"].value_counts().reset_index().sort_values(["count", "brand"], ascending=[False, True])'],
      solution: `products["brand"].value_counts().reset_index().sort_values(["count", "brand"], ascending=[False, True])`,
    },
    {
      kind: 'note',
      text: 'A filter followed by a total answers most first questions without any grouping. Totals skip missing values, so `count` on a column tells how many rows have one.',
      syntax: 'df[df["x"] == 1]["units"].sum()   df["promo_id"].count()   df["promo_id"].isna().mean()',
    },
    {
      kind: 'example',
      id: 'py-summaries-total-2025',
      title: 'Sell-out revenue in 2025',
      code: `sellout[sellout["week_start"].dt.year == 2025]["revenue"].sum()`,
    },
    {
      kind: 'task',
      id: 'py-summaries-off-promo',
      title: 'Share of rows outside promotions',
      question: 'What share of sellout rows has no promotion? Give it as a percentage rounded to 1 decimal.',
      ordered: false,
      hints: ['No promotion means promo_id is missing.', 'The mean of True and False is the share of True.', 'round(sellout["promo_id"].isna().mean() * 100, 1)'],
      solution: `round(sellout["promo_id"].isna().mean() * 100, 1)`,
    },
    {
      kind: 'task',
      id: 'py-summaries-avg-promo-units',
      title: 'Units on a promotional line',
      question: 'On average, how many units does a sellout row on a promotion sell, and how many does a row outside promotions? Give two numbers in a Series named units_per_row, indexed by on_promo (True or False), each rounded to 1 decimal.',
      ordered: false,
      hints: ['Group by a condition: a True/False Series can be the key.', 'sellout["units"].groupby(sellout["promo_id"].notna()).mean()', 'Round the result, then .rename_axis("on_promo").rename("units_per_row").'],
      solution: `sellout["units"].groupby(sellout["promo_id"].notna()).mean().round(1).rename_axis("on_promo").rename("units_per_row")`,
    },
  ],
}
