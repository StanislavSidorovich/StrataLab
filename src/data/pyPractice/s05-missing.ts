import type { PracticeSection } from '../practiceBook'

export const MISSING: PracticeSection = {
  id: 'missing',
  n: 5,
  title: 'Missing values',
  blocks: [
    {
      kind: 'note',
      text: '`isna()` gives True where a value is missing, and `notna()` the opposite. `fillna` replaces the gaps and `dropna(subset=...)` removes the rows that have one in the listed columns.',
      syntax: 'df.isna().sum()   df["x"].fillna(0)   df.dropna(subset=["x"])',
      trap: '`count()` counts the values that are present, while `len()` counts every row.',
    },
    {
      kind: 'example',
      id: 'py-missing-no-rep',
      title: 'Who has no rep',
      code: `customers[customers["rep_id"].isna()]["channel"].value_counts()`,
    },
    {
      kind: 'task',
      id: 'py-missing-where',
      title: 'Where customers have gaps',
      question: 'Which columns of customers have missing values, and how many each? Show column and missing, the most missing first, then by column. Leave out the columns with none.',
      ordered: true,
      hints: ['Count the True values of isna() in each column.', 'customers.isna().sum() is a Series with a count for every column.', 'Keep the counts above 0, then .rename_axis("column").reset_index(name="missing") and sort_values(["missing", "column"], ascending=[False, True]).'],
      solution: `missing = customers.isna().sum()
missing[missing > 0].rename_axis("column").reset_index(name="missing").sort_values(["missing", "column"], ascending=[False, True])`,
    },
    {
      kind: 'note',
      text: '`promo_id` is `Int32` with `pd.NA`, and comparing NA with anything gives NA, not False. A filter treats NA as False, so `!=` loses the rows with no promotion too.',
      syntax: 'df[df["promo_id"].isna() | (df["promo_id"] != 5)]',
      trap: '`df["promo_id"] != 5` does not mean everything but 5: it leaves out the lines with no promotion.',
    },
    {
      kind: 'example',
      id: 'py-missing-managers',
      title: 'Managers have no manager',
      code: `reps[reps["manager_id"].isna()][["rep_name", "role"]]`,
    },
    {
      kind: 'task',
      id: 'py-missing-not-promo-5',
      title: 'Lines outside one promotion',
      question: 'In 2025 (week_start in 2025), how many sellout lines were not sold under promotion 5? Lines with no promotion at all count. Give the number.',
      ordered: false,
      hints: ['Two kinds of lines qualify: no promo_id, and a promo_id other than 5.', '`!= 5` alone gives NA on the lines with no promotion, so add the missing ones with |.', 'len(y[y["promo_id"].isna() | (y["promo_id"] != 5)]) where y holds the lines of 2025.'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2025]
len(y[y["promo_id"].isna() | (y["promo_id"] != 5)])`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2025]
len(y[y["promo_id"] != 5])`,
          says: 'A comparison with a missing `promo_id` gives NA, and the filter drops it. This counts only the lines on some other promotion, not the lines with no promotion.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'A missing value is sometimes a fact: a pharmacy with no chain is independent, and a distributor has no rep. `value_counts` skips NaN, so fill the label in first when those rows must show.',
      syntax: 'df["chain_name"].fillna("Independent").value_counts()   df["chain_name"].value_counts(dropna=False)',
    },
    {
      kind: 'task',
      id: 'py-missing-pharmacy-chains',
      title: 'Pharmacies by chain',
      question: 'How many customers of the pharmacy channel belong to each chain? Independents have no chain_name: show them as Independent. Show chain and customers, the most first.',
      ordered: true,
      hints: ['Keep the customers with channel pharmacy.', 'Fill chain_name with "Independent" before counting.', 'ph["chain_name"].fillna("Independent").value_counts().rename_axis("chain").reset_index(name="customers") gives the table, already from the most.'],
      solution: `ph = customers[customers["channel"] == "pharmacy"]
ph["chain_name"].fillna("Independent").value_counts().rename_axis("chain").reset_index(name="customers").sort_values(["customers", "chain"], ascending=[False, True])`,
      traps: [
        {
          code: `ph = customers[customers["channel"] == "pharmacy"]
ph["chain_name"].value_counts().rename_axis("chain").reset_index(name="customers").sort_values(["customers", "chain"], ascending=[False, True])`,
          says: '`value_counts` skips missing values, so the 17 independent pharmacies are gone. Fill the label in with `fillna` before counting.',
        },
      ],
    },
  ],
}
