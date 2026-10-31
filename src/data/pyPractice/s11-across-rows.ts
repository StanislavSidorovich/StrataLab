import type { PracticeSection } from '../practiceBook'

export const ACROSS_ROWS: PracticeSection = {
  id: 'across-rows',
  n: 11,
  title: 'Across rows',
  blocks: [
    {
      kind: 'note',
      text: '`transform` gives a result as long as the table, so a group’s total can sit beside each of its rows. Divide by it for a share inside the group.',
      syntax: 'df["units"] / df.groupby("brand")["units"].transform("sum")',
      trap: 'Dividing by `df["units"].sum()` gives the share of the whole table, not of the group.',
    },
    {
      kind: 'example',
      id: 'py-across-rows-shipment-share',
      title: 'A shipment as a share of its distributor',
      code: `s = sellin.assign(share=sellin["units"] / sellin.groupby("distributor_id")["units"].transform("sum"))
s[["sellin_id", "distributor_id", "units", "share"]].head()`,
    },
    {
      kind: 'task',
      id: 'py-across-rows-product-split',
      title: 'Where a product is shipped',
      question: 'What share of each product’s shipped units (all of sellin) went to each distributor? Show product_id, distributor_id, units and share_pct (1 decimal), by product_id and then distributor_id.',
      ordered: true,
      skills: ['share-of-group'],
      hints: ['Total the units for each pair of product_id and distributor_id first.', 'The product’s total next to each row is groupby("product_id")["units"].transform("sum").', 'Divide, multiply by 100 and round, then sort_values(["product_id", "distributor_id"]).'],
      solution: `t = sellin.groupby(["product_id", "distributor_id"], as_index=False)["units"].sum()
t["share_pct"] = (t["units"] / t.groupby("product_id")["units"].transform("sum") * 100).round(1)
t.sort_values(["product_id", "distributor_id"])`,
    },
    {
      kind: 'task',
      id: 'py-across-rows-brand-share',
      title: 'A product’s share of its brand',
      question: 'In 2026 (week_start in 2026), what share of its brand’s sell-out units did each product sell? Show product_name, brand, units and share_pct (1 decimal), by brand, then the most units first, then product_id.',
      ordered: true,
      skills: ['share-of-group', 'date-part', 'group-total', 'merge', 'pick-columns', 'sort'],
      hints: ['Total the units of each product first, then add its brand.', 'The brand total next to each product row is groupby("brand")["units"].transform("sum").', 'Sort by ["brand", "units", "product_id"] with ascending=[True, False, True] and show the four columns.'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
u = y.groupby("product_id", as_index=False)["units"].sum().merge(products[["product_id", "product_name", "brand"]], on="product_id")
u["share_pct"] = (u["units"] / u.groupby("brand")["units"].transform("sum") * 100).round(1)
u.sort_values(["brand", "units", "product_id"], ascending=[True, False, True])[["product_name", "brand", "units", "share_pct"]]`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
u = y.groupby("product_id", as_index=False)["units"].sum().merge(products[["product_id", "product_name", "brand"]], on="product_id")
u["share_pct"] = (u["units"] / u["units"].sum() * 100).round(1)
u.sort_values(["brand", "units", "product_id"], ascending=[True, False, True])[["product_name", "brand", "units", "share_pct"]]`,
          says: 'Dividing by the sum of the whole column gives each product’s share of all units, so the shares of one brand add up to far less than 100. Use `groupby("brand")` with `transform`.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`pct_change()` is the change of each row against the row before it, as a fraction, so it answers "how much did this grow". Sort by the time column first, because the row before is the row above.',
      syntax: 'df["x"].pct_change()   (df["x"].pct_change() * 100).round(1)',
      trap: 'On unsorted rows the row above is not the previous month.',
    },
    {
      kind: 'example',
      id: 'py-across-rows-month-change',
      title: 'Total net amount, month on month',
      code: `m = sellin.groupby("month_start", as_index=False)["net_amount"].sum().sort_values("month_start")
m.assign(change_pct=(m["net_amount"].pct_change() * 100).round(1)).tail()`,
    },
    {
      kind: 'task',
      id: 'py-across-rows-weekly-change',
      title: 'Sell-out week on week',
      question: 'By how much did total sell-out units change from one week to the next? Show week_start, units and change_pct (1 decimal) for the last 8 weeks of data, in week order.',
      ordered: true,
      skills: ['change'],
      hints: ['Total the units of all outlets for each week.', 'pct_change on the units column, times 100, rounded to 1 decimal.', 'Sort by week_start, and end with .tail(8).'],
      solution: `w = sellout.groupby("week_start", as_index=False)["units"].sum().sort_values("week_start")
w["change_pct"] = (w["units"].pct_change() * 100).round(1)
w.tail(8)`,
    },
    {
      kind: 'note',
      text: 'To compare each distributor with itself, call `pct_change` on a `groupby`, so that its first row has nothing to compare with instead of borrowing from the distributor above.',
      syntax: 'df.groupby("distributor_id")["net_amount"].pct_change()',
    },
    {
      kind: 'task',
      id: 'py-across-rows-biggest-drops',
      title: 'The biggest monthly drops',
      question: 'Which 5 distributor-months had the biggest drop in net_amount against the same distributor’s previous month? Show distributor_id, month_start, net_amount and change_pct (1 decimal), the biggest drop first, then by distributor_id and month_start.',
      ordered: true,
      skills: ['change', 'group-total', 'sort'],
      hints: ['Total net_amount for each distributor and month, sorted by distributor and month.', 'Within each distributor, pct_change compares a month with the one before: groupby("distributor_id")["net_amount"].pct_change().', 'Multiply by 100 and round, then sort_values(["change_pct", "distributor_id", "month_start"]).head(5): the first month of each distributor is NaN and sorts last.'],
      solution: `d = sellin.groupby(["distributor_id", "month_start"], as_index=False)["net_amount"].sum().sort_values(["distributor_id", "month_start"])
d["change_pct"] = (d.groupby("distributor_id")["net_amount"].pct_change() * 100).round(1)
d.sort_values(["change_pct", "distributor_id", "month_start"]).head(5)`,
      traps: [
        {
          code: `d = sellin.groupby(["distributor_id", "month_start"], as_index=False)["net_amount"].sum().sort_values(["distributor_id", "month_start"])
d["change_pct"] = (d["net_amount"].pct_change() * 100).round(1)
d.sort_values(["change_pct", "distributor_id", "month_start"]).head(5)`,
          says: 'Without `groupby`, the first month of each distributor is compared with the last month of the distributor above it. Those rows show drops that never happened.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`rolling(4).mean()` smooths a noisy series: it averages a row with the three before it, and is NaN until there are four rows.',
      syntax: 'df["units"].rolling(4).mean()',
      trap: 'Filter after the window, not before: a table cut to 2026 has no earlier weeks for the first rows to look back on.',
    },
    {
      kind: 'task',
      id: 'py-across-rows-smooth-shipments',
      title: 'Three-month average of shipments',
      question: 'What is the average net_amount of each month and the 2 months before it, for all distributors together? Show month_start, net_amount and avg_3m (0 decimals), for the last 6 months, in month order.',
      ordered: true,
      skills: ['rolling'],
      hints: ['Total net_amount for each month, in month order.', 'rolling(3).mean() on that column, rounded to 0 decimals.', 'End with .tail(6).'],
      solution: `m = sellin.groupby("month_start", as_index=False)["net_amount"].sum().sort_values("month_start")
m["avg_3m"] = m["net_amount"].rolling(3).mean().round(0)
m.tail(6)`,
    },
    {
      kind: 'task',
      id: 'py-across-rows-rolling-product',
      title: 'A four-week average for one product',
      question: 'For product 7, what were the weekly sell-out units (all outlets together) in 2026, and the average of the week and the 3 weeks before it? The first weeks of 2026 use the weeks of 2025. Show week_start, units and avg_4w (1 decimal), in week order.',
      ordered: true,
      skills: ['rolling', 'filter', 'group-total', 'sort'],
      hints: ['Total the units of product 7 for each week, in week order, over all the weeks of data.', 'rolling(4).mean() on that column, rounded to 1 decimal.', 'Only then keep the weeks from 2026-01-01.'],
      solution: `w = sellout[sellout["product_id"] == 7].groupby("week_start", as_index=False)["units"].sum().sort_values("week_start")
w["avg_4w"] = w["units"].rolling(4).mean().round(1)
w[w["week_start"] >= "2026-01-01"]`,
    },
    {
      kind: 'note',
      text: '`cumsum()` is the running total: each row holds the sum of itself and every row above it. It means something only on rows in an order that matters, and on a `groupby` it starts again for each group.',
      syntax: 'df["units"].cumsum()   df.groupby("distributor_id")["units"].cumsum()',
    },
    {
      kind: 'task',
      id: 'py-across-rows-shipped-so-far',
      title: 'Units shipped so far',
      question: 'How many units had been shipped to distributors in total by the end of each month? Show month_start, units and cum_units, in month order.',
      ordered: true,
      skills: ['running-total'],
      hints: ['Total the units of each month, in month order.', 'cumsum() on that column gives the total so far.', 'm["cum_units"] = m["units"].cumsum()'],
      solution: `m = sellin.groupby("month_start", as_index=False)["units"].sum().sort_values("month_start")
m["cum_units"] = m["units"].cumsum()
m`,
    },
    {
      kind: 'task',
      id: 'py-across-rows-distributor-cumulative',
      title: 'Each distributor’s year to date',
      question: 'For each distributor, how much net_amount had been shipped by the end of each month of 2026 (month_start in 2026)? Show distributor_id, month_start, net_amount and cum_net, by distributor_id and then month_start.',
      ordered: true,
      skills: ['running-total', 'date-part', 'group-total', 'sort'],
      hints: ['Keep 2026 and total net_amount for each distributor and month.', 'Sort by distributor and month, then take the running total inside each distributor.', 'd.groupby("distributor_id")["net_amount"].cumsum()'],
      solution: `y = sellin[sellin["month_start"].dt.year == 2026]
d = y.groupby(["distributor_id", "month_start"], as_index=False)["net_amount"].sum().sort_values(["distributor_id", "month_start"])
d["cum_net"] = d.groupby("distributor_id")["net_amount"].cumsum()
d`,
      traps: [
        {
          code: `y = sellin[sellin["month_start"].dt.year == 2026]
d = y.groupby(["distributor_id", "month_start"], as_index=False)["net_amount"].sum().sort_values(["distributor_id", "month_start"])
d["cum_net"] = d["net_amount"].cumsum()
d`,
          says: 'Without `groupby` the total runs on through all distributors, so each one starts from where the one above ended. Take the `cumsum` inside `groupby("distributor_id")`.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`rank` numbers the rows by a column, and `method="first"` gives tied rows different numbers in the order they stand. It is the way to say "number one, number two" in a table.',
      syntax: 'df["units"].rank(ascending=False, method="first")',
    },
    {
      kind: 'task',
      id: 'py-across-rows-price-rank',
      title: 'Products by price',
      question: 'Rank the products by list_price, the highest first (ties by product_id). Show product_name, list_price and rank, by rank.',
      ordered: true,
      skills: ['rank'],
      hints: ['One row per product already, so no grouping is needed.', 'Sort by list_price from the highest, then product_id, and rank the sorted column.', 'p["rank"] = p["list_price"].rank(ascending=False, method="first")'],
      solution: `p = products.sort_values(["list_price", "product_id"], ascending=[False, True])
p["rank"] = p["list_price"].rank(ascending=False, method="first")
p[["product_name", "list_price", "rank"]]`,
    },
    {
      kind: 'note',
      text: 'A running share is `cumsum()` divided by the total, and only means something on rows sorted by size. The share before a row is the running total minus the row, over the total.',
      syntax: 'df["units"].cumsum() / df["units"].sum()',
    },
    {
      kind: 'task',
      id: 'py-across-rows-half-of-units',
      title: 'The products that make half of the units',
      question: 'Which products are needed to reach half of the 2026 sell-out units (week_start in 2026)? Rank the products by units, the most first (ties by product_id), and keep a product while the running share before it is under 50%. Show rank, product_name, units and cum_pct (the running share including the product, 1 decimal), by rank.',
      ordered: true,
      skills: ['rank', 'running-total', 'date-part', 'group-total', 'merge', 'pick-columns', 'sort'],
      hints: ['Total the units of each product in 2026, add product_name, and sort by units from the highest, then product_id.', 'Rank with rank(ascending=False, method="first"); the running units are the cumsum() of the sorted column.', 'The share before a product is (cumsum - units) / total: keep the rows where it is under 0.5, and cum_pct is cumsum / total * 100.'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
u = y.groupby("product_id", as_index=False)["units"].sum().merge(products[["product_id", "product_name"]], on="product_id")
u = u.sort_values(["units", "product_id"], ascending=[False, True])
u["rank"] = u["units"].rank(ascending=False, method="first").astype(int)
u["cum_units"] = u["units"].cumsum()
u["cum_pct"] = (u["cum_units"] / u["units"].sum() * 100).round(1)
u[(u["cum_units"] - u["units"]) / u["units"].sum() < 0.5][["rank", "product_name", "units", "cum_pct"]]`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
u = y.groupby("product_id", as_index=False)["units"].sum().merge(products[["product_id", "product_name"]], on="product_id")
u["rank"] = u["units"].rank(ascending=False, method="first").astype(int)
u["cum_units"] = u["units"].cumsum()
u["cum_pct"] = (u["cum_units"] / u["units"].sum() * 100).round(1)
u[(u["cum_units"] - u["units"]) / u["units"].sum() < 0.5][["rank", "product_name", "units", "cum_pct"]]`,
          says: 'The table is in product_id order, so `cumsum` adds the products in that order and the running share means nothing. Sort by units from the highest before the running total.',
        },
      ],
    },
  ],
}
