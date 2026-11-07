import type { PracticeSection } from '../practiceBook'

export const GROUPBY: PracticeSection = {
  id: 'groupby',
  n: 8,
  part: 'Process',
  title: 'Group and total',
  blocks: [
    {
      kind: 'note',
      text: '`groupby` splits the rows by the values of a key, and a total or an average is then worked out for each group. The key becomes the index of the result; `as_index=False` keeps it as a column. `size` counts the rows of each group.',
      syntax: 'df.groupby("distributor_id")["units"].sum()   df.groupby(["a", "b"], as_index=False)["units"].sum()   df.groupby("brand").size()',
    },
    {
      kind: 'example',
      id: 'py-groupby-units-by-distributor',
      title: 'Units shipped to each distributor',
      code: `sellin.groupby("distributor_id", as_index=False)["units"].sum()`,
    },
    {
      kind: 'task',
      id: 'py-groupby-top-price',
      title: 'The dearest product of each category',
      question: 'What is the highest list_price in each category? Show category and the price.',
      ordered: false,
      skills: ['group-total'],
      hints: ['One key, category, and one column to sum up.', 'Group products by category, take list_price, and ask for the largest value of each group.', 'products.groupby("category", as_index=False)["list_price"].max()'],
      solution: `products.groupby("category", as_index=False)["list_price"].max()`,
    },
    {
      kind: 'task',
      id: 'py-groupby-lines-by-product',
      title: 'Lines of each product',
      question: 'How many sellout lines (rows) does each product have? Show product_id and the count.',
      ordered: false,
      skills: ['group-total'],
      hints: ['Count rows, not a column: the key is product_id.', 'groupby("product_id") on sellout, then size() counts the rows of each group.', 'sellout.groupby("product_id").size()'],
      solution: `sellout.groupby("product_id").size()`,
    },
    {
      kind: 'task',
      id: 'py-groupby-years',
      title: 'Sell-out by year',
      question: 'What were the sell-out units and revenue in each year (the year of week_start)? Show year, units and revenue, the oldest year first.',
      ordered: true,
      skills: ['group-total', 'date-part', 'sort'],
      hints: ['The key is not a column yet: make the year from week_start.', 'sellout.groupby(sellout["week_start"].dt.year) groups by the year, and the index is named week_start.', 'Add [["units", "revenue"]].sum().rename_axis("year").reset_index().'],
      solution: `sellout.groupby(sellout["week_start"].dt.year)[["units", "revenue"]].sum().rename_axis("year").reset_index().sort_values("year")`,
    },
    {
      kind: 'task',
      id: 'py-groupby-revenue-2025',
      title: 'Revenue of each product in 2025',
      question: 'What revenue did each product make in sellout in 2025 only (week_start from 2025-01-01 to 2025-12-31)? Show product_id and revenue.',
      ordered: false,
      skills: ['date-part', 'group-total'],
      hints: ['Only the lines of 2025 go into the groups.', 'Filter the rows by the year of week_start first, then group them by product_id.', 'sellout[sellout["week_start"].dt.year == 2025].groupby("product_id", as_index=False)["revenue"].sum()'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2025]
y.groupby("product_id", as_index=False)["revenue"].sum()`,
    },
    {
      kind: 'note',
      text: 'Named aggregation writes each result column in one place: `new_name=("column", "function")`. Group by a list of keys to get one row for each combination.',
      syntax: 'df.groupby(["a", "b"], as_index=False).agg(rows=("id", "size"), total=("x", "sum"), avg=("x", "mean"))',
    },
    {
      kind: 'task',
      id: 'py-groupby-brand-profile',
      title: 'A profile of each brand',
      question: 'For each brand, how many products does it have (products) and what is their average list_price (avg_price)? Show brand, products and avg_price.',
      ordered: false,
      skills: ['group-total', 'group-agg'],
      hints: ['Two results for each brand: a count of rows and an average.', 'groupby("brand", as_index=False).agg(...) with one named result for each.', 'products.groupby("brand", as_index=False).agg(products=("product_id", "size"), avg_price=("list_price", "mean"))'],
      solution: `products.groupby("brand", as_index=False).agg(products=("product_id", "size"), avg_price=("list_price", "mean"))`,
    },
    {
      kind: 'task',
      id: 'py-groupby-division-categories',
      title: 'Products of each division and category',
      question: 'How many products does each pair of division and category have? Show division, category and products.',
      ordered: false,
      skills: ['group-total', 'group-agg'],
      hints: ['Two keys give one row for each pair that exists.', 'Put both columns in a list: groupby(["division", "category"], as_index=False).', 'products.groupby(["division", "category"], as_index=False).agg(products=("product_id", "size"))'],
      solution: `products.groupby(["division", "category"], as_index=False).agg(products=("product_id", "size"))`,
    },
    {
      kind: 'task',
      id: 'py-groupby-distributor-years',
      title: 'Each distributor, each year',
      question: 'For each distributor_id and order year (the year of order_date), how many shipments, how many units and what net_amount? Show distributor_id, year, shipments, units and net_amount, by distributor_id, then year.',
      ordered: true,
      skills: ['group-total', 'group-agg', 'add-column', 'date-part', 'sort'],
      hints: ['Make a year column first, then group by two keys.', 'groupby(["distributor_id", "year"], as_index=False) gives one row for each pair, with the keys in order.', 'agg(shipments=("sellin_id", "size"), units=("units", "sum"), net_amount=("net_amount", "sum")) finishes it.'],
      solution: `s = sellin.assign(year=sellin["order_date"].dt.year)
s.groupby(["distributor_id", "year"], as_index=False).agg(shipments=("sellin_id", "size"), units=("units", "sum"), net_amount=("net_amount", "sum")).sort_values(["distributor_id", "year"])`,
    },
    {
      kind: 'note',
      text: '`size` counts the rows of a group, and `count` counts the rows that have a value in the column. They differ wherever the column has gaps, as `promo_id` does.',
      syntax: 'agg(lines=("id", "size"), with_promo=("promo_id", "count"))',
      trap: 'A "size" on `promo_id` gives all the lines, not the ones with a promotion.',
    },
    {
      kind: 'task',
      id: 'py-groupby-promo-lines-products',
      title: 'Promotion lines of each product',
      question: 'For each product_id: how many sellout lines (lines) and how many of them have a promo_id (promo_lines)? Show product_id, lines and promo_lines.',
      ordered: false,
      skills: ['group-total', 'group-agg'],
      hints: ['Two counts for each product: every row, and the rows where promo_id has a value.', 'size counts every row of the group, count skips the missing promo_id.', 'sellout.groupby("product_id", as_index=False).agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "count"))'],
      solution: `sellout.groupby("product_id", as_index=False).agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "count"))`,
      traps: [
        {
          code: `sellout.groupby("product_id", as_index=False).agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "size"))`,
          says: '`size` counts every row, so promo_lines equals lines for every product. `count` skips the rows with no promo_id.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-groupby-promo-share-years',
      title: 'Promotion lines by year',
      question: 'For each year of week_start: how many sellout lines (lines), how many of them have a promo_id (promo_lines), and what percentage is that (promo_pct, 1 decimal)? Show year, lines, promo_lines and promo_pct, the oldest year first.',
      ordered: true,
      skills: ['group-total', 'group-agg', 'date-part', 'add-column', 'sort'],
      hints: ['Group by the year, and count two things: all rows, and the rows with a promo_id.', 'size counts every row and count only the rows where promo_id is not missing.', 'agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "count")), then promo_pct = promo_lines / lines * 100 rounded.'],
      solution: `t = sellout.assign(year=sellout["week_start"].dt.year).groupby("year", as_index=False).agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "count"))
t["promo_pct"] = (t["promo_lines"] / t["lines"] * 100).round(1)
t.sort_values("year")`,
      traps: [
        {
          code: `t = sellout.assign(year=sellout["week_start"].dt.year).groupby("year", as_index=False).agg(lines=("sellout_id", "size"), promo_lines=("promo_id", "size"))
t["promo_pct"] = (t["promo_lines"] / t["lines"] * 100).round(1)
t.sort_values("year")`,
          says: '`size` counts every row, so promo_lines equals lines and the share is 100 in every year. `count` skips the rows with no promo_id.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'A condition on the result of a group filters the groups, and a condition on `df` before `groupby` filters the rows that go into them. They answer different questions.',
      syntax: 't = df.groupby("k", as_index=False).agg(avg=("x", "mean"))   t[t["avg"] > 10]',
    },
    {
      kind: 'task',
      id: 'py-groupby-wide-brands',
      title: 'Brands with many products',
      question: 'Which brands have at least 5 products? Show brand and products (the number of products).',
      ordered: false,
      skills: ['group-total', 'group-agg', 'filter-groups'],
      hints: ['The condition is on the count of a group, not on a product.', 'Count the products of each brand first, then keep the rows of that result with 5 or more.', 't = products.groupby("brand", as_index=False).agg(products=("product_id", "size"))   then t[t["products"] >= 5]'],
      solution: `t = products.groupby("brand", as_index=False).agg(products=("product_id", "size"))
t[t["products"] >= 5]`,
    },
    {
      kind: 'task',
      id: 'py-groupby-big-distributors',
      title: 'Distributors with big 2025',
      question: 'Which distributors were shipped more than 50,000 units in 2025 (order_date in 2025)? Show distributor_id and units, the most first, then by distributor_id.',
      ordered: true,
      skills: ['filter', 'date-part', 'group-total', 'filter-groups', 'sort'],
      hints: ['Rows of 2025 go into the groups, and the condition is on the total of a group.', 'Filter sellin by the year of order_date, group by distributor_id, sum units, keep the totals above 50000.', 'Sort with sort_values(["units", "distributor_id"], ascending=[False, True]).'],
      solution: `y = sellin[sellin["order_date"].dt.year == 2025]
g = y.groupby("distributor_id", as_index=False)["units"].sum()
g[g["units"] > 50000].sort_values(["units", "distributor_id"], ascending=[False, True])`,
    },
    {
      kind: 'task',
      id: 'py-groupby-fast-products',
      title: 'Products with big lines',
      question: 'Which products had an average above 13 units per sellout line in 2025 only (week_start from 2025-01-01 to 2025-12-31)? Show product_id, lines and avg_units (1 decimal), the highest average first, then by product_id.',
      ordered: true,
      skills: ['date-part', 'group-total', 'group-agg', 'filter-groups'],
      hints: ['The average comes from all the lines of 2025 of a product; the condition is on the average.', 'Group the lines of 2025 by product_id, work out lines and the mean, then keep the groups above 13.', 'Round avg_units after the filter, and sort_values(["avg_units", "product_id"], ascending=[False, True]).'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2025]
g = y.groupby("product_id", as_index=False).agg(lines=("sellout_id", "size"), avg_units=("units", "mean"))
g = g[g["avg_units"] > 13]
g.assign(avg_units=g["avg_units"].round(1)).sort_values(["avg_units", "product_id"], ascending=[False, True])`,
      traps: [
        {
          code: `y = sellout[(sellout["week_start"].dt.year == 2025) & (sellout["units"] > 13)]
g = y.groupby("product_id", as_index=False).agg(lines=("sellout_id", "size"), avg_units=("units", "mean"))
g.assign(avg_units=g["avg_units"].round(1)).sort_values(["avg_units", "product_id"], ascending=[False, True])`,
          says: 'This keeps only the lines above 13 units and averages those, so every average is high and the lines are fewer. The condition belongs on the average of the group.',
        },
      ],
    },
  ],
}
