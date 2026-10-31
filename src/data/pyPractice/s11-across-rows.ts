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
      id: 'py-across-rows-brand-share',
      title: 'A product’s share of its brand',
      question: 'In 2026 (week_start in 2026), what share of its brand’s sell-out units did each product sell? Show product_name, brand, units and share_pct (1 decimal), by brand, then the most units first, then product_id.',
      ordered: true,
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
      text: '`shift()` moves a column down one row, so each row can see the one before it, and `pct_change()` is the change against that row. Sort by the time column first, and use `groupby` so that a group does not borrow from the group above it.',
      syntax: 'df = df.sort_values(["k", "month_start"])   df.groupby("k")["x"].pct_change()',
      trap: 'On unsorted rows `shift` returns the previous row of the table, which is not the previous month.',
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
      id: 'py-across-rows-biggest-drops',
      title: 'The biggest monthly drops',
      question: 'Which 5 distributor-months had the biggest drop in net_amount against the same distributor’s previous month? Show distributor_id, month_start, net_amount and change_pct (1 decimal), the biggest drop first, then by distributor_id and month_start.',
      ordered: true,
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
      text: '`rolling(4).mean()` averages a row with the three before it, and is NaN until there are four rows. `cumsum()` is the running total.',
      syntax: 'df["units"].rolling(4).mean()   df["units"].cumsum()',
      trap: 'Filter after the window, not before: a table cut to 2026 has no earlier weeks for the first rows to look back on.',
    },
    {
      kind: 'task',
      id: 'py-across-rows-rolling-product',
      title: 'A four-week average for one product',
      question: 'For product 7, what were the weekly sell-out units (all outlets together) in 2026, and the average of the week and the 3 weeks before it? The first weeks of 2026 use the weeks of 2025. Show week_start, units and avg_4w (1 decimal), in week order.',
      ordered: true,
      hints: ['Total the units of product 7 for each week, in week order, over all the weeks of data.', 'rolling(4).mean() on that column, rounded to 1 decimal.', 'Only then keep the weeks from 2026-01-01.'],
      solution: `w = sellout[sellout["product_id"] == 7].groupby("week_start", as_index=False)["units"].sum().sort_values("week_start")
w["avg_4w"] = w["units"].rolling(4).mean().round(1)
w[w["week_start"] >= "2026-01-01"]`,
    },
    {
      kind: 'note',
      text: '`rank` numbers the rows by a column, and `method="first"` gives tied rows different numbers in the order they stand. A running share is `cumsum()` divided by the total, and only means something on rows sorted by size.',
      syntax: 'df["units"].rank(ascending=False, method="first")   df["units"].cumsum() / df["units"].sum()',
    },
    {
      kind: 'task',
      id: 'py-across-rows-half-of-units',
      title: 'The products that make half of the units',
      question: 'Which products are needed to reach half of the 2026 sell-out units (week_start in 2026)? Rank the products by units, the most first (ties by product_id), and keep a product while the running share before it is under 50%. Show rank, product_name, units and cum_pct (the running share including the product, 1 decimal), by rank.',
      ordered: true,
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
