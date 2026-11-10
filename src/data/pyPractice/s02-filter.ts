import type { PracticeSection } from '../practiceBook'

export const FILTER: PracticeSection = {
  id: 'filter',
  n: 2,
  title: 'Filter and sort',
  blocks: [
    {
      kind: 'note',
      topic: 'keeping the rows that meet a condition',
      text: 'A condition on a column, such as `sellout["units"] > 100`, gives True or False for every row. Put it inside the brackets of the table, and the table keeps only the rows with True.',
    },
    {
      kind: 'example',
      id: 'py-filter-big-weeks',
      title: 'Weeks an outlet sold over 100 units',
      code: `print((sellout["units"] > 100).head(3))
sellout[sellout["units"] > 100].head()`,
      sees: 'The first lines are the True/False answers for the first three rows (all False). The table then keeps only the rows with True: 106 rows in all, and `head()` shows the first five.',
    },
    {
      kind: 'task',
      id: 'py-filter-premium',
      title: 'The expensive products',
      question: 'Which products have a list_price over 500? Show all their columns.',
      ordered: false,
      skills: ['filter'],
      hints: ['One condition on list_price.', 'The condition goes inside products[...].', 'products[products["list_price"] > 500]'],
      solution: `products[products["list_price"] > 500]`,
    },
    {
      kind: 'note',
      topic: 'filter first, then pick columns',
      text: 'A filter gives a table, so you can pick columns from it with a second pair of brackets. The first brackets choose the rows, and the double brackets after them choose the columns.',
    },
    {
      kind: 'example',
      id: 'py-filter-rows-then-columns',
      title: 'Big weeks, three columns',
      code: `sellout[sellout["units"] > 100][["week_start", "customer_id", "units"]].head()`,
      sees: 'The same rows as before, but only the three columns you listed.',
    },
    {
      kind: 'task',
      id: 'py-filter-vitanor',
      title: 'One brand’s range',
      question: 'Which products belong to the brand Vitanor? Show product_name and list_price.',
      ordered: false,
      skills: ['filter', 'pick-columns'],
      hints: ['First the rows, then the columns.', 'df[df["brand"] == "Vitanor"], then a list of two columns.', 'products[products["brand"] == "Vitanor"][["product_name", "list_price"]]'],
      solution: `products[products["brand"] == "Vitanor"][["product_name", "list_price"]]`,
    },
    {
      kind: 'note',
      topic: 'sorting rows',
      text: '`sort_values` orders the rows by a column, and `ascending=False` puts the largest first. To break ties, pass a list of columns and a list of directions: the first `True` or `False` belongs to the first column, the second to the second.',
    },
    {
      kind: 'example',
      id: 'py-filter-sorted-prices',
      title: 'Division first, then the dearest',
      code: `products.sort_values(["division", "list_price"], ascending=[True, False])[["division", "product_name", "list_price"]].head(6)`,
      sees: 'FMCG rows come first because division is sorted A to Z (True), and Pharma would follow. Inside a division the prices go from the highest down (False).',
    },
    {
      kind: 'task',
      id: 'py-filter-price-list',
      title: 'The price list',
      question: 'List all products with all their columns, the most expensive first, then by product_name.',
      ordered: true,
      skills: ['sort'],
      hints: ['Two sort keys, because some prices are the same.', 'Pass a list of columns and a list for ascending.', 'products.sort_values(["list_price", "product_name"], ascending=[False, True])'],
      solution: `products.sort_values(["list_price", "product_name"], ascending=[False, True])`,
    },
    {
      kind: 'task',
      id: 'py-filter-fmcg-by-brand',
      title: 'The FMCG range by brand',
      question: 'Which products are in the division FMCG? Show all their columns, sorted by brand from A to Z, then by list_price from the highest, then by product_name.',
      ordered: true,
      skills: ['filter', 'sort'],
      hints: ['Filter on division first, then sort the result.', 'Three sort keys, and the directions differ: brand goes up, list_price goes down.', 'products[products["division"] == "FMCG"].sort_values(["brand", "list_price", "product_name"], ascending=[True, False, True])'],
      solution: `products[products["division"] == "FMCG"].sort_values(["brand", "list_price", "product_name"], ascending=[True, False, True])`,
    },
    {
      kind: 'task',
      id: 'py-filter-pharma',
      title: 'The Pharma range',
      question: 'Which products are in the division Pharma? Show product_name, brand and list_price, the most expensive first, then by product_name.',
      ordered: true,
      skills: ['filter', 'pick-columns', 'sort'],
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
      topic: 'two conditions at once',
      text: 'Join two conditions with `&` when both must hold, or with `|` when either is enough. Each condition goes in its own round brackets.',
      trap: '`and` and `or` raise an error on columns, and without brackets `&` binds before `>`.',
    },
    {
      kind: 'example',
      id: 'py-filter-two-conditions',
      title: 'FMCG products over 170',
      code: `products[(products["division"] == "FMCG") & (products["list_price"] > 170)][["product_name", "division", "list_price"]]`,
      sees: 'Only five rows pass both tests: FMCG and above 170. With `|` in place of `&`, every FMCG product and every product over 170 would stay.',
    },
    {
      kind: 'task',
      id: 'py-filter-cheap-pharma',
      title: 'Pharma under 500',
      question: 'Which Pharma products have a list_price under 500? Show all their columns.',
      ordered: false,
      skills: ['filter', 'filter-and'],
      hints: ['Two conditions, both must hold.', 'Each condition in brackets, joined with &.', 'products[(products["division"] == "Pharma") & (products["list_price"] < 500)]'],
      solution: `products[(products["division"] == "Pharma") & (products["list_price"] < 500)]`,
    },
    {
      kind: 'note',
      topic: 'a value from a list',
      text: '`isin` tests each row against a list of allowed values. It replaces a chain of `==` joined with `|`.',
    },
    {
      kind: 'example',
      id: 'py-filter-isin-brands',
      title: 'Two brands from one list',
      code: `products[products["brand"].isin(["Gastrivo", "Rhinolar"])][["product_name", "brand"]]`,
      sees: 'Every product of either brand, eight rows. A brand that is not in the list does not appear.',
    },
    {
      kind: 'task',
      id: 'py-filter-two-brands',
      title: 'Two brands',
      question: 'Which products are Aqualis or Fruvia? Show all their columns.',
      ordered: false,
      skills: ['filter-list'],
      hints: ['A test against a list of two brands.', 'df["brand"].isin([...]) goes inside the brackets.', 'products[products["brand"].isin(["Aqualis", "Fruvia"])]'],
      solution: `products[products["brand"].isin(["Aqualis", "Fruvia"])]`,
    },
    {
      kind: 'note',
      topic: 'a range of values',
      text: '`between` keeps the rows whose value lies in a range, and both ends of the range are included. It works on numbers and on dates.',
    },
    {
      kind: 'example',
      id: 'py-filter-cheap-fmcg',
      title: 'Prices from 62 to 74',
      code: `products[products["list_price"].between(62, 74)][["product_name", "list_price"]]`,
      sees: 'Prices of 62 and of 74 are both in the table, because the ends count. Anything cheaper than 62 or dearer than 74 is out.',
    },
    {
      kind: 'note',
      text: 'To count the rows a filter keeps, wrap it in `len(...)`.',
      syntax: 'len(products[products["division"] == "Pharma"])',
    },
    {
      kind: 'task',
      id: 'py-filter-q1-2026',
      title: 'Rows of the first quarter of 2026',
      question: 'How many rows of sellout have week_start from 2026-01-01 to 2026-03-31, both included? Give the number.',
      ordered: false,
      skills: ['size', 'filter-list'],
      hints: ['A range on one column.', 'between takes dates as text: "2026-01-01".', 'len(sellout[sellout["week_start"].between("2026-01-01", "2026-03-31")])'],
      solution: `len(sellout[sellout["week_start"].between("2026-01-01", "2026-03-31")])`,
    },
    {
      kind: 'note',
      topic: 'text that contains a word',
      text: '`.str.contains` keeps the rows whose text has a given piece anywhere inside. The match is exact, capital letters included.',
      trap: 'Searching for "kids" in lower case finds nothing here: the names say "Kids", and no match gives an empty table, not an error.',
    },
    {
      kind: 'example',
      id: 'py-filter-contains-kids',
      title: 'Products with Kids in the name',
      code: `products[products["product_name"].str.contains("Kids")][["product_name", "brand"]]`,
      sees: 'Three products from three brands, wherever the word stands in the name.',
    },
    {
      kind: 'task',
      id: 'py-filter-sparkling',
      title: 'Sparkling water',
      question: 'Which products have Sparkling in their product_name? Show all their columns.',
      ordered: false,
      skills: ['filter-text'],
      hints: ['The word is somewhere inside the name.', 'df["product_name"].str.contains(...) gives True or False for each row.', 'products[products["product_name"].str.contains("Sparkling")]'],
      solution: `products[products["product_name"].str.contains("Sparkling")]`,
    },
    {
      kind: 'note',
      topic: 'the top rows of a column',
      text: '`nlargest` gives the rows with the largest values of a column, biggest first, without sorting the whole table. Give it how many rows and which column.',
    },
    {
      kind: 'example',
      id: 'py-filter-top-lines',
      title: 'The five biggest sales lines',
      code: `sellout.nlargest(5, "revenue")[["week_start", "customer_id", "product_id", "revenue"]]`,
      sees: 'Five rows, the one with the highest revenue on top. `nsmallest` is the same from the other end.',
    },
    {
      kind: 'task',
      id: 'py-filter-top-three',
      title: 'The three dearest',
      question: 'Which 3 products have the highest list_price? Show all their columns, from the highest.',
      ordered: true,
      skills: ['top-n'],
      hints: ['No need to sort the whole table.', 'nlargest takes how many rows and which column.', 'products.nlargest(3, "list_price")'],
      solution: `products.nlargest(3, "list_price")`,
    },
    {
      kind: 'note',
      topic: 'rows that have a value',
      text: 'A gap is a cell with no value: a sale with no promotion has no `promo_id`, and pandas shows that as NaN or <NA>. `.notna()` gives True or False for every row, True where a value is there, and `isna` is its mirror. Put that True and False column inside `df[...]` and the table keeps the True rows.',
      syntax: `promo_id:  12      <NA>    7
.notna():  True    False   True      (rows 1 and 3 are kept)`,
    },
    {
      kind: 'example',
      id: 'py-filter-notna',
      title: 'Rows with a promo_id',
      code: `sellout[sellout["promo_id"].notna()][["week_start", "customer_id", "promo_id"]].head()`,
      sees: 'Every row kept has a promo_id. The rows with a gap are gone, and `isna` would have kept exactly those.',
    },
    {
      kind: 'task',
      id: 'py-filter-promo-rows',
      title: 'Rows on a promotion',
      question: 'How many rows of sellout are on a promotion? Give the number.',
      ordered: false,
      skills: ['size', 'filter-missing'],
      hints: ['A row on a promotion has a promo_id.', 'Keep the rows where df["promo_id"].notna(), then count them.', 'len(sellout[sellout["promo_id"].notna()])'],
      solution: `len(sellout[sellout["promo_id"].notna()])`,
      traps: [{ code: `len(sellout[sellout["promo_id"].isna()])`, says: '`isna` keeps the rows without a promotion. Rows on one have a `promo_id`, so the test is `notna`.' }],
    },
    {
      kind: 'note',
      topic: 'a part of a date',
      text: '`.dt` reads a part of a date column: `.dt.year` and `.dt.month` give a number for every row. Compare that number to filter by year or by month.',
    },
    {
      kind: 'example',
      id: 'py-filter-dt-month',
      title: 'Weeks that start in December',
      code: `sellout[sellout["week_start"].dt.month == 12][["week_start", "units"]].head()`,
      sees: 'Only dates in December are left, from several years. `.dt.year == 2025` would keep one year.',
    },
    {
      kind: 'task',
      id: 'py-filter-rows-2025',
      title: 'Rows of 2025',
      question: 'How many rows of sellout have a week_start from 2025-01-01 to 2025-12-31 (2025 only)? Give the number.',
      ordered: false,
      skills: ['size', 'date-part'],
      hints: ['A condition on the year of week_start.', 'df["week_start"].dt.year == 2025 is the condition.', 'len(sellout[sellout["week_start"].dt.year == 2025])'],
      solution: `len(sellout[sellout["week_start"].dt.year == 2025])`,
    },
    {
      kind: 'note',
      topic: 'rows and columns in one step',
      text: '`loc` takes the rows condition and the list of columns inside one pair of brackets, separated by a comma. It reads better than two bracket pairs once the conditions get long.',
    },
    {
      kind: 'example',
      id: 'py-filter-loc',
      title: 'Big weeks with loc',
      code: `sellout.loc[sellout["units"] > 100, ["week_start", "customer_id", "units"]].head()`,
      sees: 'The same table as with two pairs of brackets: rows over 100 units, three columns.',
    },
    {
      kind: 'note',
      topic: 'how to write a long query',
      text: 'Do not write it in one go: name each condition, look at it, and join them last. Square brackets pick (a column, the rows, `.loc[rows, columns]`, a list of names), and round brackets call (`.notna()`, `.head(5)`) or group (each condition in `( )` around `&` and `|`, because `&` binds tighter than `==`). Python may break a line inside open brackets, so wrap the whole chain in `( )` and start each line with `.method`.',
      syntax: `on_promo = sellout["promo_id"].notna()
in_year = sellout["week_start"].dt.year == 2026
sellout.loc[on_promo & in_year, cols]      # then sort, then head

(sellout
    .loc[on_promo & in_year, cols]
    .sort_values("units")
    .head(5))`,
      trap: 'A line break outside any bracket ends the statement: `sellout.loc[rows, cols]` newline `.head(5)` is a SyntaxError until the whole chain sits inside `( )`.',
    },
    {
      kind: 'example',
      id: 'py-filter-long-query',
      title: 'The same query in pieces and in one expression',
      code: `cols = ["week_start", "customer_id", "product_id", "units"]
on_promo = sellout["promo_id"].notna()
in_2026 = sellout["week_start"].dt.year == 2026
step = sellout.loc[on_promo & in_2026, cols]
step = step.sort_values(["units", "week_start", "customer_id", "product_id"], ascending=[False, True, True, True])
step = step.head(5)

one = (
    sellout
    .loc[sellout["promo_id"].notna() & (sellout["week_start"].dt.year == 2026), cols]
    .sort_values(["units", "week_start", "customer_id", "product_id"], ascending=[False, True, True, True])
    .head(5)
)
one`,
      sees: 'Five promotional rows of 2026 with the most units. `step` holds exactly the same table: check each piece on its own first, then fold them into one wrapped expression.',
    },
    {
      kind: 'task',
      id: 'py-filter-promo-weeks',
      title: 'The largest promotional sales',
      question: 'Of the rows sold on a promotion, which 5 have the highest units, counting only week_start from 2025-01-01 to 2025-12-31? Show week_start, customer_id, product_id, units and promo_id, by units from the highest, then by week_start, customer_id and product_id.',
      ordered: true,
      skills: ['filter-and', 'filter-missing', 'date-part', 'pick-columns', 'sort'],
      hints: ['Two conditions: promo_id is present, and the year of week_start is 2025.', 'df["promo_id"].notna() and df["week_start"].dt.year == 2025.', 'Sort by ["units", "week_start", "customer_id", "product_id"] with ascending=[False, True, True, True], then head(5).'],
      solution: `cols = ["week_start", "customer_id", "product_id", "units", "promo_id"]
promo_2025 = sellout.loc[sellout["promo_id"].notna() & (sellout["week_start"].dt.year == 2025), cols]
promo_2025.sort_values(["units", "week_start", "customer_id", "product_id"], ascending=[False, True, True, True]).head(5)`,
    },
  ],
}
