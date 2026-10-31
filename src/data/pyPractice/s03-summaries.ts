import type { PracticeSection } from '../practiceBook'

export const SUMMARIES: PracticeSection = {
  id: 'summaries',
  n: 3,
  title: 'Quick summaries',
  blocks: [
    {
      kind: 'note',
      text: '`value_counts` is the fastest answer to "what is in this column, and how often". It sorts from the most frequent and gives a named index, so the values are a column of the answer once `reset_index` makes it a table.',
      syntax: 'df["brand"].value_counts()   df["brand"].value_counts(normalize=True)   df["brand"].value_counts().reset_index()',
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
      syntax: 'df[df["x"] == 1]["units"].sum()   df["promo_id"].count()   df["promo_id"].isna().mean()   round(x, 1)   df["x"].round(1)',
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
      question: 'On average, how many more units does a sellout row on a promotion sell than a row outside promotions? Give the difference rounded to 1 decimal.',
      ordered: false,
      hints: ['Two averages of units: the rows with a promo_id and the rows without one.', 'sellout[sellout["promo_id"].notna()]["units"].mean() is the first.', 'Keep the two in variables, then round(promo - regular, 1).'],
      solution: `promo = sellout[sellout["promo_id"].notna()]["units"].mean()
regular = sellout[sellout["promo_id"].isna()]["units"].mean()
round(promo - regular, 1)`,
    },
  ],
}
