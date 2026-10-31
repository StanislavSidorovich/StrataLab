import type { PracticeSection } from '../practiceBook'

export const RESHAPE: PracticeSection = {
  id: 'reshape',
  n: 10,
  title: 'Reshape',
  blocks: [
    {
      kind: 'note',
      text: '`pivot_table` turns the values of one column into columns, so two dimensions read as a grid: rows come from `index`, columns from `columns`, and one `aggfunc` fills each cell. `fill_value` replaces the cells where no row exists.',
      syntax: 'df.pivot_table(index="a", columns="b", values="x", aggfunc="sum", fill_value=0)',
      trap: 'The default `aggfunc` is the mean, not the sum, and a pair with no rows stays NaN unless `fill_value` is set.',
    },
    {
      kind: 'task',
      id: 'py-reshape-price-grid',
      title: 'Average price in a grid',
      question: 'What is the average list_price of the products of each category in each division? One row for each category, one column for each division, 0 where a category has no products in that division.',
      ordered: false,
      skills: ['pivot'],
      hints: ['One table, products: the category goes down, the division across.', 'pivot_table(index="category", columns="division", values="list_price", ...)', 'products.pivot_table(index="category", columns="division", values="list_price", aggfunc="mean", fill_value=0)'],
      solution: `products.pivot_table(index="category", columns="division", values="list_price", aggfunc="mean", fill_value=0)`,
    },
    {
      kind: 'note',
      text: 'To use a pivot as an ordinary table, `reset_index()` makes the row labels a column, and `rename_axis(columns=None)` removes the name above the new columns.',
      syntax: 'p.reset_index().rename_axis(columns=None)',
    },
    {
      kind: 'example',
      id: 'py-reshape-division-channel',
      title: 'Revenue of each division in each channel',
      code: `m = sellout.merge(products[["product_id", "division"]], on="product_id").merge(customers[["customer_id", "channel"]], on="customer_id")
p = m.pivot_table(index="division", columns="channel", values="revenue", aggfunc="sum", fill_value=0)
p.reset_index().rename_axis(columns=None)`,
    },
    {
      kind: 'task',
      id: 'py-reshape-shipments-year',
      title: 'Shipments of each product by year',
      question: 'What was the net_amount shipped of each product in each year (by order_date)? One row for each product_id, one column for each year, 0 where nothing was shipped. Show product_id, then the years.',
      ordered: false,
      skills: ['pivot', 'add-column', 'date-part', 'name-counts'],
      hints: ['sellin has the order_date and the net_amount; the year has to become a column first.', 'sellin.assign(year=...) with the year of order_date, then pivot_table with index="product_id" and columns="year".', 's.pivot_table(index="product_id", columns="year", values="net_amount", aggfunc="sum", fill_value=0).reset_index().rename_axis(columns=None)'],
      solution: `s = sellin.assign(year=sellin["order_date"].dt.year)
s.pivot_table(index="product_id", columns="year", values="net_amount", aggfunc="sum", fill_value=0).reset_index().rename_axis(columns=None)`,
    },
    {
      kind: 'task',
      id: 'py-reshape-category-channel',
      title: 'Categories across channels',
      question: 'In 2026 (week_start in 2026), how many units did each product category sell in each customer channel? One row for each category, one column for each channel, 0 where nothing was sold. Show category, then the channels, with the categories and the channels in alphabetical order.',
      ordered: true,
      skills: ['pivot', 'merge', 'date-part', 'name-counts', 'sort'],
      hints: ['Units are in sellout; the category is in products and the channel in customers.', 'Merge both in, then pivot_table(index="category", columns="channel", values="units", ...).', 'Set aggfunc="sum" and fill_value=0, then .reset_index().rename_axis(columns=None).'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
m = y.merge(products[["product_id", "category"]], on="product_id").merge(customers[["customer_id", "channel"]], on="customer_id")
m.pivot_table(index="category", columns="channel", values="units", aggfunc="sum", fill_value=0).reset_index().rename_axis(columns=None).sort_values("category")`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
m = y.merge(products[["product_id", "category"]], on="product_id").merge(customers[["customer_id", "channel"]], on="customer_id")
m.pivot_table(index="category", columns="channel", values="units", fill_value=0).reset_index().rename_axis(columns=None)`,
          says: 'Without `aggfunc` the cells hold the mean units of a line, not the total. Say `aggfunc="sum"`.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`crosstab` counts the rows for each pair of values of two columns, which is a pivot of counts. It reads the row and column names from the two series you give it.',
      syntax: 'pd.crosstab(df["channel"], df["tier"]).reset_index().rename_axis(columns=None)',
    },
    {
      kind: 'example',
      id: 'py-reshape-crosstab-channel-tier',
      title: 'Customers by channel and customer type',
      code: `pd.crosstab(customers["channel"], customers["customer_type"]).reset_index().rename_axis(columns=None)`,
    },
    {
      kind: 'task',
      id: 'py-reshape-opened-years',
      title: 'Customers opened each year',
      question: 'How many customers of each channel were opened (opened_date) in each year? One row for each channel, one column for each year. Show channel, then the years.',
      ordered: false,
      skills: ['crosstab', 'date-part', 'name-counts'],
      hints: ['It is a count of customers for each pair of channel and year.', 'crosstab takes two series: the channel, and the year of opened_date.', 'pd.crosstab(customers["channel"], customers["opened_date"].dt.year).reset_index().rename_axis(columns=None)'],
      solution: `pd.crosstab(customers["channel"], customers["opened_date"].dt.year).reset_index().rename_axis(columns=None)`,
    },
    {
      kind: 'task',
      id: 'py-reshape-outlets-tier',
      title: 'Outlets by channel and region tier',
      question: 'How many outlets (customers outside the distributor channel) are there in each channel and region tier? One row for each channel, one column for each tier (1, 2 and 3). Show channel, then the three tiers, the channels in alphabetical order.',
      ordered: true,
      skills: ['crosstab', 'merge', 'filter', 'name-counts', 'sort'],
      hints: ['The tier is a column of regions; customers have the region_id.', 'Keep the customers whose channel is not distributor, and merge regions[["region_id", "tier"]] on region_id.', 'pd.crosstab(o["channel"], o["tier"]).reset_index().rename_axis(columns=None)'],
      solution: `o = customers[customers["channel"] != "distributor"].merge(regions[["region_id", "tier"]], on="region_id", validate="m:1")
pd.crosstab(o["channel"], o["tier"]).reset_index().rename_axis(columns=None).sort_values("channel")`,
    },
    {
      kind: 'note',
      text: '`melt` goes the other way: columns become rows, with the old column name in `var_name` and the value in `value_name`. Use it when two columns are really one measure in two forms.',
      syntax: 'df.melt(id_vars=["month_start"], value_vars=["a", "b"], var_name="measure", value_name="units")',
    },
    {
      kind: 'example',
      id: 'py-reshape-melt-stock',
      title: 'Stock columns as rows',
      code: `stock.melt(id_vars=["month_start", "distributor_id", "product_id"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units").head()`,
    },
    {
      kind: 'task',
      id: 'py-reshape-stock-one-distributor',
      title: 'One distributor’s stock in long form',
      question: 'For distributor 1 in the month starting 2026-06-01, show the stock in long form: product_id, measure (the name of the column) and units, for units_on_hand and units_in_transit. Order by product_id, then measure.',
      ordered: true,
      skills: ['melt', 'filter', 'filter-and', 'sort'],
      hints: ['Keep the rows of distributor 1 and of that month in stock.', 'melt(id_vars=["product_id"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units")', 'Then sort_values(["product_id", "measure"]).'],
      solution: `s = stock[(stock["distributor_id"] == 1) & (stock["month_start"] == "2026-06-01")]
s.melt(id_vars=["product_id"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units").sort_values(["product_id", "measure"])`,
    },
    {
      kind: 'task',
      id: 'py-reshape-stock-long',
      title: 'Stock in two forms, month by month',
      question: 'For each month_start from 2026-01-01, what is the total of units_on_hand and of units_in_transit in stock (all distributors and products)? Show it long: month_start, measure (the name of the column) and units, by month_start, then measure.',
      ordered: true,
      skills: ['melt', 'filter', 'group-total', 'sort'],
      hints: ['Keep the months from 2026-01-01, and melt the two columns into rows.', 'melt(id_vars=["month_start"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units")', 'Then groupby(["month_start", "measure"], as_index=False)["units"].sum().sort_values(["month_start", "measure"]).'],
      solution: `s = stock[stock["month_start"] >= "2026-01-01"]
long = s.melt(id_vars=["month_start"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units")
long.groupby(["month_start", "measure"], as_index=False)["units"].sum().sort_values(["month_start", "measure"])`,
    },
  ],
}
