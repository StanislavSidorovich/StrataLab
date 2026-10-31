import type { PracticeSection } from '../practiceBook'

export const GROUPBY: PracticeSection = {
  id: 'groupby',
  n: 8,
  part: 'Process',
  title: 'Group and total',
  blocks: [
    {
      kind: 'note',
      text: '`groupby` splits the rows by the values of a key, and a total or an average is then worked out for each group. The key becomes the index of the result; `as_index=False` keeps it as a column.',
      syntax: 'df.groupby("distributor_id")["units"].sum()   df.groupby(["a", "b"], as_index=False)["units"].sum()',
    },
    {
      kind: 'example',
      id: 'py-groupby-units-by-distributor',
      title: 'Units shipped to each distributor',
      code: `sellin.groupby("distributor_id", as_index=False)["units"].sum()`,
    },
    {
      kind: 'task',
      id: 'py-groupby-years',
      title: 'Sell-out by year',
      question: 'What were the sell-out units and revenue in each year (the year of week_start)? Show year, units and revenue, the oldest year first.',
      ordered: true,
      hints: ['The key is not a column yet: make the year from week_start.', 'sellout.groupby(sellout["week_start"].dt.year) groups by the year, and the index is named week_start.', 'Add .agg(units=("units", "sum"), revenue=("revenue", "sum")).rename_axis("year").reset_index().'],
      solution: `sellout.groupby(sellout["week_start"].dt.year).agg(units=("units", "sum"), revenue=("revenue", "sum")).rename_axis("year").reset_index().sort_values("year")`,
    },
    {
      kind: 'note',
      text: 'Named aggregation writes each result column in one place: `new_name=("column", "function")`. Group by a list of keys to get one row for each combination.',
      syntax: 'df.groupby(["a", "b"], as_index=False).agg(rows=("id", "size"), total=("x", "sum"), avg=("x", "mean"))',
    },
    {
      kind: 'task',
      id: 'py-groupby-distributor-years',
      title: 'Each distributor, each year',
      question: 'For each distributor_id and order year (the year of order_date), how many shipments, how many units and what net_amount? Show distributor_id, year, shipments, units and net_amount, by distributor_id, then year.',
      ordered: true,
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
      id: 'py-groupby-promo-share-years',
      title: 'Promotion lines by year',
      question: 'For each year of week_start: how many sellout lines (lines), how many of them have a promo_id (promo_lines), and what percentage is that (promo_pct, 1 decimal)? Show year, lines, promo_lines and promo_pct, the oldest year first.',
      ordered: true,
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
      id: 'py-groupby-fast-products',
      title: 'Products with big lines',
      question: 'Which products had an average above 13 units per sellout line in 2025 (week_start in 2025)? Show product_id, lines and avg_units (1 decimal), the highest average first, then by product_id.',
      ordered: true,
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
