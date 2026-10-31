import type { PracticeSection } from '../practiceBook'

export const MISSING: PracticeSection = {
  id: 'missing',
  n: 5,
  title: 'Missing values',
  blocks: [
    {
      kind: 'note',
      text: '`isna()` gives True where a value is missing, and `sum()` adds up the True values, so `isna().sum()` counts the gaps of a column or of every column of a table.',
      syntax: 'df["chain_name"].isna().sum()   df.isna().sum()',
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
      id: 'py-missing-chain-gaps',
      title: 'Customers outside a chain',
      question: 'How many customers have no chain_name? Give the number.',
      ordered: false,
      skills: ['missing-per-column'],
      hints: ['Missing values are marked by isna().', 'customers["chain_name"].isna() is True where the name is missing.', 'Add the True values up with .sum().'],
      solution: `customers["chain_name"].isna().sum()`,
    },
    {
      kind: 'task',
      id: 'py-missing-promo-gaps-2026',
      title: 'Lines without a promotion in 2026',
      question: 'In 2026 (week_start in 2026), how many sellout lines have no promo_id? Give the number.',
      ordered: false,
      skills: ['missing-per-column', 'date-part'],
      hints: ['Keep the lines of 2026, then look at promo_id.', 'The promo_id of those lines, with isna() and sum().', 'sellout[sellout["week_start"].dt.year == 2026]["promo_id"].isna().sum()'],
      solution: `sellout[sellout["week_start"].dt.year == 2026]["promo_id"].isna().sum()`,
    },
    {
      kind: 'task',
      id: 'py-missing-where',
      title: 'Where customers have gaps',
      question: 'Which columns of customers have missing values, and how many each? Show column and missing, the most missing first, then by column. Leave out the columns with none.',
      ordered: true,
      skills: ['missing-per-column', 'name-counts', 'sort'],
      hints: ['Count the True values of isna() in each column.', 'customers.isna().sum() is a Series with a count for every column.', 'Keep the counts above 0, then .rename_axis("column").reset_index(name="missing") and sort_values(["missing", "column"], ascending=[False, True]).'],
      solution: `missing = customers.isna().sum()
missing[missing > 0].rename_axis("column").reset_index(name="missing").sort_values(["missing", "column"], ascending=[False, True])`,
    },
    {
      kind: 'note',
      text: 'To keep a row when a value is missing or another test holds, join the `isna()` test and the other with `|`. `promo_id` is `Int32` with `pd.NA`, and comparing NA with anything gives NA, not False: a filter treats NA as False, so `!=` loses the rows with no promotion too.',
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
      id: 'py-missing-chain-or-pharmacy',
      title: 'No chain, or a pharmacy',
      question: 'How many customers either have no chain_name or are in the pharmacy channel? Give the number.',
      ordered: false,
      skills: ['filter-missing', 'keep-missing', 'filter-and', 'size'],
      hints: ['Two ways to qualify: no chain_name, or channel pharmacy.', 'Join the two tests with |, each in its own brackets.', 'len(customers[customers["chain_name"].isna() | (customers["channel"] == "pharmacy")])'],
      solution: `len(customers[customers["chain_name"].isna() | (customers["channel"] == "pharmacy")])`,
      traps: [
        {
          code: `len(customers[customers["chain_name"].isna() & (customers["channel"] == "pharmacy")])`,
          says: '`&` keeps the rows that meet both tests, here the pharmacies with no chain. "Either" is `|`.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-missing-not-promo-5',
      title: 'Lines outside one promotion',
      question: 'In 2025 (week_start in 2025), how many sellout lines were not sold under promotion 5? Lines with no promotion at all count. Give the number.',
      ordered: false,
      skills: ['filter-missing', 'keep-missing', 'size', 'date-part'],
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
      text: 'A missing value is sometimes a fact: a pharmacy with no chain is independent, and a distributor has no rep. `fillna` puts a label or a number in the gaps, and `value_counts` skips NaN, so fill first when those rows must show.',
      syntax: 'df["chain_name"].fillna("Independent").value_counts()   df["chain_name"].value_counts(dropna=False)',
    },
    {
      kind: 'task',
      id: 'py-missing-chain-label',
      title: 'A label for no chain',
      question: 'Show customer_name and chain for every customer, where chain is the chain_name, or "No chain" when it is missing.',
      ordered: false,
      skills: ['fill-missing', 'add-column', 'pick-columns'],
      hints: ['A new column from chain_name, with the gaps filled.', 'customers["chain_name"].fillna("No chain") is the new column.', 'customers.assign(chain=customers["chain_name"].fillna("No chain"))[["customer_name", "chain"]]'],
      solution: `customers.assign(chain=customers["chain_name"].fillna("No chain"))[["customer_name", "chain"]]`,
    },
    {
      kind: 'task',
      id: 'py-missing-pharmacy-chains',
      title: 'Pharmacies by chain',
      question: 'How many customers of the pharmacy channel belong to each chain? Independents have no chain_name: show them as Independent. Show chain and customers, the most first.',
      ordered: true,
      skills: ['fill-missing', 'filter', 'count-values', 'name-counts', 'sort'],
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
