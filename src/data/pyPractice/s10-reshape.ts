import type { PracticeSection } from '../practiceBook'

export const RESHAPE: PracticeSection = {
  id: 'reshape',
  n: 10,
  title: 'Reshape',
  blocks: [
    {
      kind: 'note',
      text: '`pivot_table` turns the values of one column into columns: rows come from `index`, columns from `columns`, and one `aggfunc` fills each cell. Afterwards `reset_index()` makes the row labels a column, and `rename_axis(columns=None)` removes the name above the new columns.',
      syntax: 'df.pivot_table(index="a", columns="b", values="x", aggfunc="sum", fill_value=0).reset_index().rename_axis(columns=None)',
      trap: 'The default `aggfunc` is the mean, not the sum, and a pair with no rows stays NaN unless `fill_value` is set.',
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
      id: 'py-reshape-category-channel',
      title: 'Categories across channels',
      question: 'In 2026 (week_start in 2026), how many units did each product category sell in each customer channel? One row for each category, one column for each channel, 0 where nothing was sold. Show category, then the channels, with the categories and the channels in alphabetical order.',
      ordered: true,
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
      kind: 'task',
      id: 'py-reshape-outlets-tier',
      title: 'Outlets by channel and region tier',
      question: 'How many outlets (customers outside the distributor channel) are there in each channel and region tier? One row for each channel, one column for each tier (1, 2 and 3). Show channel, then the three tiers, the channels in alphabetical order.',
      ordered: true,
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
      id: 'py-reshape-stock-long',
      title: 'Stock in two forms, month by month',
      question: 'For each month_start from 2026-01-01, what is the total of units_on_hand and of units_in_transit in stock (all distributors and products)? Show it long: month_start, measure (the name of the column) and units, by month_start, then measure.',
      ordered: true,
      hints: ['Keep the months from 2026-01-01, and melt the two columns into rows.', 'melt(id_vars=["month_start"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units")', 'Then groupby(["month_start", "measure"], as_index=False)["units"].sum().sort_values(["month_start", "measure"]).'],
      solution: `s = stock[stock["month_start"] >= "2026-01-01"]
long = s.melt(id_vars=["month_start"], value_vars=["units_on_hand", "units_in_transit"], var_name="measure", value_name="units")
long.groupby(["month_start", "measure"], as_index=False)["units"].sum().sort_values(["month_start", "measure"])`,
    },
  ],
}
