import type { PracticeSection } from '../practiceBook'

export const CHARTS: PracticeSection = {
  id: 'charts',
  n: 12,
  part: 'Analyse',
  title: 'Charts',
  blocks: [
    {
      kind: 'note',
      text: 'A chart is a table first: build the table, plot it, and end the cell with the table. Check compares the table, and you judge the chart by eye.',
      syntax: 'import matplotlib.pyplot as plt\ndf.plot(x="month_start", y="revenue", title="…")',
    },
    {
      kind: 'example',
      id: 'py-charts-monthly',
      title: 'Sell-out revenue by month',
      code: `import matplotlib.pyplot as plt

monthly = sellout.assign(month_start=sellout["week_start"].dt.to_period("M").dt.to_timestamp()).groupby("month_start", as_index=False)["revenue"].sum()
monthly.plot(x="month_start", y="revenue", legend=False, title="Sell-out revenue by month")
plt.ylabel("revenue")
monthly`,
    },
    {
      kind: 'task',
      id: 'py-charts-brand-bars',
      title: 'Brands as a bar chart',
      question: 'Draw a horizontal bar chart of each brand’s sell-out revenue in 2025, with the biggest brand on top. End the cell with the table behind it: brand and revenue, the highest first.',
      ordered: true,
      hints: ['Merge sellout with products to get brand, keep 2025, and total by brand.', 'Sort from the highest for the table; barh draws its first row at the bottom.', 'table.iloc[::-1].plot.barh(x="brand", y="revenue", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

sold = sellout[sellout["week_start"].dt.year == 2025].merge(products[["product_id", "brand"]], on="product_id")
table = sold.groupby("brand", as_index=False)["revenue"].sum().sort_values("revenue", ascending=False)
table.iloc[::-1].plot.barh(x="brand", y="revenue", legend=False, title="Sell-out revenue by brand, 2025")
plt.xlabel("revenue")
table`,
    },
    {
      kind: 'note',
      text: 'Two lines on one chart need one table per chart: a column for each line, or `ax=` to draw the second on the axes of the first. When the lines are on different scales, a shared axis flattens the smaller one, so check before you read a gap.',
      syntax: 'ax = a.plot(x="m", y="units", label="a")\nb.plot(x="m", y="units", label="b", ax=ax)',
    },
    {
      kind: 'task',
      id: 'py-charts-shipped-sold',
      title: 'Shipped against sold',
      question: 'Draw two lines by month for 2025: units shipped to distributors and units sold by outlets. Use month_start for shipments and the month of week_start for sales. End with the table: month_start, shipped and sold, in calendar order.',
      ordered: true,
      hints: ['Total each fact by month on its own, then merge on the month.', 'to_period("M").dt.to_timestamp() makes the sales’ month; keep 2025 in both.', 'table.plot(x="month_start", y=["shipped", "sold"]), then end with table.'],
      solution: `import matplotlib.pyplot as plt

shipped = sellin[sellin["month_start"].dt.year == 2025].groupby("month_start", as_index=False)["units"].sum().rename(columns={"units": "shipped"})
sales = sellout[sellout["week_start"].dt.year == 2025]
sold = sales.assign(month_start=sales["week_start"].dt.to_period("M").dt.to_timestamp()).groupby("month_start", as_index=False)["units"].sum().rename(columns={"units": "sold"})
table = shipped.merge(sold, on="month_start").sort_values("month_start")
table.plot(x="month_start", y=["shipped", "sold"], title="Shipped and sold, 2025")
table`,
    },
    {
      kind: 'task',
      id: 'py-charts-channel-mix',
      title: 'The channel mix by year',
      question: 'Draw stacked bars of each channel’s share of sell-out revenue, for 2024 and 2025. End with the table: year, channel and share_pct rounded to 1 decimal, by year and then by channel.',
      ordered: true,
      hints: ['Merge with customers for channel, and keep the two full years.', 'A share within a year: revenue divided by groupby("year")["revenue"].transform("sum").', 'For the chart, table.pivot(index="year", columns="channel", values="share_pct").plot.bar(stacked=True).'],
      solution: `import matplotlib.pyplot as plt

sold = sellout.merge(customers[["customer_id", "channel"]], on="customer_id")
sold = sold.assign(year=sold["week_start"].dt.year)
sold = sold[sold["year"].isin([2024, 2025])]
table = sold.groupby(["year", "channel"], as_index=False)["revenue"].sum()
table["share_pct"] = (100 * table["revenue"] / table.groupby("year")["revenue"].transform("sum")).round(1)
table = table[["year", "channel", "share_pct"]].sort_values(["year", "channel"])
table.pivot(index="year", columns="channel", values="share_pct").plot.bar(stacked=True, title="Channel share of sell-out")
table`,
      traps: [
        {
          code: `sold = sellout.merge(customers[["customer_id", "channel"]], on="customer_id")
sold = sold.assign(year=sold["week_start"].dt.year)
sold = sold[sold["year"].isin([2024, 2025])]
table = sold.groupby(["year", "channel"], as_index=False)["revenue"].sum()
table["share_pct"] = (100 * table["revenue"] / table["revenue"].sum()).round(1)
table[["year", "channel", "share_pct"]].sort_values(["year", "channel"])`,
          says: 'This is a share of both years together, so a year’s channels do not add up to 100. Divide by the year’s total with `transform`.',
        },
      ],
    },
  ],
}
