import type { PracticeSection } from '../practiceBook'

export const FILTER: PracticeSection = {
  id: 'filter',
  n: 2,
  title: 'Filter and sort',
  blocks: [
    {
      kind: 'note',
      text: 'A condition on a column gives a True or False for each row, and the table keeps the rows with True. Join conditions with `&` and `|`, each in its own brackets.',
      syntax: 'df[(df["units"] > 100) & (df["promo_id"].isna())]',
      trap: '`and` and `or` raise an error on columns, and without brackets `&` binds before `>`.',
    },
    {
      kind: 'example',
      id: 'py-filter-big-weeks',
      title: 'Weeks an outlet sold over 2,000 units',
      code: `sellout[sellout["units"] > 2000].head()`,
    },
    {
      kind: 'task',
      id: 'py-filter-pharma',
      title: 'The Pharma range',
      question: 'Which products are in the division Pharma? Show product_name, brand and list_price, the most expensive first, then by product_name.',
      ordered: true,
      hints: ['Filter products on division, then pick columns.', 'df[df["division"] == "Pharma"][[...]]', 'Finish with .sort_values(["list_price", "product_name"], ascending=[False, True]).'],
      solution: `products[products["division"] == "Pharma"][["product_name", "brand", "list_price"]].sort_values(["list_price", "product_name"], ascending=[False, True])`,
      traps: [
        {
          code: `products[products["division"] == "pharma"][["product_name", "brand", "list_price"]].sort_values(["list_price", "product_name"], ascending=[False, True])`,
          says: 'Text comparisons are exact, and the division is written `Pharma`. No match gives an empty table rather than an error.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`isin` tests against a list and `between` against a range that includes both ends. `.str.contains` looks inside text.',
      syntax: 'df["brand"].isin(["a", "b"])   df["units"].between(1, 5)   df["name"].str.contains("x")',
    },
    {
      kind: 'example',
      id: 'py-filter-cheap-fmcg',
      title: 'Low-priced products outside Pharma',
      code: `products[(products["division"] != "Pharma") & products["list_price"].between(50, 100)][["product_name", "list_price"]]`,
    },
    {
      kind: 'task',
      id: 'py-filter-q1-2026',
      title: 'Rows of the first quarter of 2026',
      question: 'How many rows of sellout have week_start from 2026-01-01 to 2026-03-31, both included? Give the number.',
      ordered: false,
      hints: ['A range on one column.', 'between takes dates as text: "2026-01-01".', 'len(sellout[sellout["week_start"].between("2026-01-01", "2026-03-31")])'],
      solution: `len(sellout[sellout["week_start"].between("2026-01-01", "2026-03-31")])`,
    },
    {
      kind: 'note',
      text: '`loc` picks rows and columns in one step, which reads better once conditions get long. `nlargest` gives the top rows of a column without a full sort.',
      syntax: 'df.loc[df["units"] > 100, ["week_start", "units"]]   df.nlargest(5, "units")',
    },
    {
      kind: 'example',
      id: 'py-filter-top-lines',
      title: 'The five biggest sales lines',
      code: `sellout.nlargest(5, "revenue")[["week_start", "customer_id", "product_id", "revenue"]]`,
    },
    {
      kind: 'task',
      id: 'py-filter-promo-weeks',
      title: 'The largest promotional sales',
      question: 'Of the rows sold on a promotion, which 5 have the highest units in 2025? Show week_start, customer_id, product_id, units and promo_id, by units from the highest, then by week_start, customer_id and product_id.',
      ordered: true,
      hints: ['Two conditions: promo_id is present, and the year of week_start is 2025.', 'df["promo_id"].notna() and df["week_start"].dt.year == 2025.', 'Sort by ["units", "week_start", "customer_id", "product_id"] with ascending=[False, True, True, True], then head(5).'],
      solution: `cols = ["week_start", "customer_id", "product_id", "units", "promo_id"]
promo_2025 = sellout.loc[sellout["promo_id"].notna() & (sellout["week_start"].dt.year == 2025), cols]
promo_2025.sort_values(["units", "week_start", "customer_id", "product_id"], ascending=[False, True, True, True]).head(5)`,
    },
  ],
}
