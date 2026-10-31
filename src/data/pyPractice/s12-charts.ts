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
      id: 'py-charts-shipments-line',
      title: 'Shipments as a line',
      question: 'Draw a line chart of the units shipped to distributors in each month. End with the table behind it: month_start and units, in calendar order.',
      ordered: true,
      skills: ['line-chart'],
      hints: ['Shipments are in sellin, and month_start is already a month.', 'Total units by month_start.', 'table.plot(x="month_start", y="units", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

table = sellin.groupby("month_start", as_index=False)["units"].sum().sort_values("month_start")
table.plot(x="month_start", y="units", legend=False, title="Units shipped by month")
table`,
    },
    {
      kind: 'task',
      id: 'py-charts-product-weeks',
      title: 'One product, week by week',
      question: 'Draw a line chart of the weekly sell-out units of product 12 (all outlets together) in 2025. End with the table: week_start and units, in week order.',
      ordered: true,
      skills: ['line-chart', 'filter', 'date-part', 'filter-and', 'group-total', 'sort'],
      hints: ['Keep the rows of product 12 and of 2025, both conditions at once.', 'Total units by week_start.', 'table.plot(x="week_start", y="units", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

s = sellout[(sellout["product_id"] == 12) & (sellout["week_start"].dt.year == 2025)]
table = s.groupby("week_start", as_index=False)["units"].sum().sort_values("week_start")
table.plot(x="week_start", y="units", legend=False, title="Product 12, weekly units")
table`,
    },
    {
      kind: 'note',
      text: '`plot.bar` draws one vertical bar for each row, and fits categories with short names. Name the column of the labels in `x` and the one with the heights in `y`.',
      syntax: 'df.plot.bar(x="category", y="count", legend=False)',
    },
    {
      kind: 'task',
      id: 'py-charts-category-bars',
      title: 'Categories as bars',
      question: 'Draw a bar chart of how many products each category has. End with the table behind it: category and count, the most products first, then category.',
      ordered: true,
      skills: ['bar-chart'],
      hints: ['One row per product, so count the rows of each category.', 'value_counts, made a table with reset_index().', 'table.plot.bar(x="category", y="count", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

table = products["category"].value_counts().reset_index().sort_values(["count", "category"], ascending=[False, True])
table.plot.bar(x="category", y="count", legend=False, title="Products per category")
table`,
    },
    {
      kind: 'note',
      text: '`plot.barh` draws horizontal bars with the first row at the bottom, so `iloc[::-1]` turns the table over. `plt.xlabel` names the axis.',
      syntax: 'df.iloc[::-1].plot.barh(x="brand", y="revenue", legend=False)   plt.xlabel("revenue")',
    },
    {
      kind: 'task',
      id: 'py-charts-brand-bars',
      title: 'Brands as a bar chart',
      question: 'Draw a horizontal bar chart of each brand’s sell-out revenue in 2025, with the biggest brand on top. End the cell with the table behind it: brand and revenue, the highest first.',
      ordered: true,
      skills: ['bar-chart', 'date-part', 'merge', 'group-total', 'sort', 'pick-columns'],
      hints: ['Merge sellout with products to get brand, keep 2025, and total by brand.', 'Sort from the highest for the table; barh draws its first row at the bottom.', 'table.iloc[::-1].plot.barh(x="brand", y="revenue", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

sold = sellout[sellout["week_start"].dt.year == 2025].merge(products[["product_id", "brand"]], on="product_id")
table = sold.groupby("brand", as_index=False)["revenue"].sum().sort_values("revenue", ascending=False)
table.iloc[::-1].plot.barh(x="brand", y="revenue", legend=False, title="Sell-out revenue by brand, 2025")
plt.xlabel("revenue")
table`,
    },
    {
      kind: 'task',
      id: 'py-charts-top-products',
      title: 'The five biggest products',
      question: 'Draw a horizontal bar chart of the 5 products with the most sell-out units in 2025, the biggest on top. End with the table: product_name and units, the most units first, then product_name.',
      ordered: true,
      skills: ['bar-chart', 'date-part', 'merge', 'group-total', 'sort'],
      hints: ['Total units by product in 2025, then add product_name from products.', 'Sort by units from the highest, then product_name, and keep 5 rows.', 'table.iloc[::-1].plot.barh(x="product_name", y="units", legend=False), then end with table.'],
      solution: `import matplotlib.pyplot as plt

sold = sellout[sellout["week_start"].dt.year == 2025].merge(products[["product_id", "product_name"]], on="product_id")
table = sold.groupby("product_name", as_index=False)["units"].sum().sort_values(["units", "product_name"], ascending=[False, True]).head(5)
table.iloc[::-1].plot.barh(x="product_name", y="units", legend=False, title="Top 5 products, 2025")
plt.xlabel("units")
table`,
    },
    {
      kind: 'note',
      text: 'Two lines on one chart need one table per chart: a column for each line, or `ax=` to draw the second on the axes of the first. When the lines are on different scales, a shared axis flattens the smaller one, so check before you read a gap.',
      syntax: 'ax = a.plot(x="m", y="units", label="a")\nb.plot(x="m", y="units", label="b", ax=ax)\ndf.rename(columns={"units": "shipped"})',
    },
    {
      kind: 'task',
      id: 'py-charts-gross-net',
      title: 'Gross against net',
      question: 'Draw two lines by month: gross_amount and net_amount shipped to distributors. End with the table: month_start, gross_amount and net_amount, in calendar order.',
      ordered: true,
      skills: ['line-chart', 'group-total', 'sort'],
      hints: ['Both columns are in sellin, so one table holds both lines.', 'Total the two columns by month_start.', 'table.plot(x="month_start", y=["gross_amount", "net_amount"]), then end with table.'],
      solution: `import matplotlib.pyplot as plt

table = sellin.groupby("month_start", as_index=False)[["gross_amount", "net_amount"]].sum().sort_values("month_start")
table.plot(x="month_start", y=["gross_amount", "net_amount"], title="Gross and net shipments")
table`,
    },
    {
      kind: 'task',
      id: 'py-charts-shipped-sold',
      title: 'Shipped against sold',
      question: 'Draw two lines by month for 2025: units shipped to distributors and units sold by outlets. Use month_start for shipments and the month of week_start for sales. End with the table: month_start, shipped and sold, in calendar order.',
      ordered: true,
      skills: ['line-chart', 'date-part', 'group-total', 'add-column', 'month-start', 'merge', 'sort'],
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
      kind: 'note',
      text: '`plot.bar(stacked=True)` draws one bar for each row of a wide table, and `pivot` makes that table when each pair of keys has one value.',
      syntax: 'df.pivot(index="year", columns="channel", values="share_pct").plot.bar(stacked=True)',
    },
    {
      kind: 'task',
      id: 'py-charts-channel-mix',
      title: 'The channel mix by year',
      question: 'Draw stacked bars of each channel’s share of sell-out revenue, for 2024 and 2025. End with the table: year, channel and share_pct rounded to 1 decimal, by year and then by channel.',
      ordered: true,
      skills: ['bar-chart', 'merge', 'add-column', 'filter-list', 'group-total', 'share-of-group', 'pick-columns', 'sort'],
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
