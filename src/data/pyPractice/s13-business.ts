import type { PracticeSection } from '../practiceBook'

export const BUSINESS: PracticeSection = {
  id: 'business',
  n: 13,
  title: 'Business questions',
  blocks: [
    {
      kind: 'note',
      text: 'Pareto asks how few items make most of a total: sort from the largest, take the running share, and count until it passes the line.',
      syntax: 'share = s.sort_values(ascending=False).cumsum() / s.sum()',
    },
    {
      kind: 'example',
      id: 'py-business-pareto-brands',
      title: 'Brands by running share of revenue',
      code: `by_brand = sellout.merge(products[["product_id", "brand"]], on="product_id").groupby("brand")["revenue"].sum().sort_values(ascending=False)
(100 * by_brand.cumsum() / by_brand.sum()).round(1).rename("running_share_pct")`,
    },
    {
      kind: 'task',
      id: 'py-business-pareto-outlets',
      title: 'How few outlets carry the business',
      question: 'Taking all of sellout, how many outlets, counted from the largest, does it take to reach 80% of revenue? Give the number: the first outlet at or above 80% counts.',
      ordered: false,
      hints: ['Total revenue by customer_id, largest first.', 'The running share is cumsum() / sum().', 'Count the outlets below 0.8, then add 1 for the one that crosses it: len(share[share < 0.8]) + 1.'],
      solution: `by_outlet = sellout.groupby("customer_id")["revenue"].sum().sort_values(ascending=False)
share = by_outlet.cumsum() / by_outlet.sum()
len(share[share < 0.8]) + 1`,
      traps: [
        {
          code: `by_outlet = sellout.groupby("customer_id")["revenue"].sum()
share = by_outlet.cumsum() / by_outlet.sum()
len(share[share < 0.8]) + 1`,
          says: 'Without sorting first, this counts outlets in order of their id, not from the largest.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'Compare like with like. The data ends in June 2026, so a whole 2025 against 2026 so far says nothing: put the same months of each year side by side.',
      trap: 'A year-on-year fall of 50% for every brand means the periods differ, not that the business halved.',
    },
    {
      kind: 'task',
      id: 'py-business-brand-h1',
      title: 'Which brand is falling',
      question: 'Compare sell-out units in January to June of 2025 and of 2026 for each brand. Show brand, units_2025, units_2026 and change_pct rounded to 1 decimal, the biggest fall first.',
      ordered: true,
      hints: ['Keep the months up to June, in the two years, and bring in brand.', 'pivot_table with index="brand", columns="year", values="units", aggfunc="sum", then name the columns.', 'change_pct = 100 * (units_2026 - units_2025) / units_2025, then sort_values("change_pct").'],
      solution: `sold = sellout[sellout["week_start"].dt.month <= 6].merge(products[["product_id", "brand"]], on="product_id")
sold = sold.assign(year=sold["week_start"].dt.year)
table = sold[sold["year"].isin([2025, 2026])].pivot_table(index="brand", columns="year", values="units", aggfunc="sum").reset_index()
table.columns = ["brand", "units_2025", "units_2026"]
table["change_pct"] = (100 * (table["units_2026"] - table["units_2025"]) / table["units_2025"]).round(1)
table.sort_values("change_pct")`,
      traps: [
        {
          code: `sold = sellout.merge(products[["product_id", "brand"]], on="product_id")
sold = sold.assign(year=sold["week_start"].dt.year)
table = sold[sold["year"].isin([2025, 2026])].pivot_table(index="brand", columns="year", values="units", aggfunc="sum").reset_index()
table.columns = ["brand", "units_2025", "units_2026"]
table["change_pct"] = (100 * (table["units_2026"] - table["units_2025"]) / table["units_2025"]).round(1)
table.sort_values("change_pct")`,
          says: 'This sets all of 2025 against half of 2026, and every brand seems to halve. Keep January to June in both years.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'What a promotion gave away is the list value of the units minus the revenue received. `prices` holds the list price of each month, so merge on the month as well as the product, and do not use its `promo_price`.',
      syntax: 'sold.merge(prices[["month_start", "product_id", "list_price"]], on=["month_start", "product_id"])',
    },
    {
      kind: 'task',
      id: 'py-business-discount-given',
      title: 'The discount given away',
      question: 'In 2025, how much did each brand give away on sales with a promotion: units at list price minus revenue? Show brand and discount_given rounded to whole numbers, the most first.',
      ordered: true,
      hints: ['Keep rows with a promo_id in 2025, and make month_start from week_start.', 'Merge with prices on month and product, and with products for brand.', 'Add units * list_price - revenue as a column, then total by brand and sort.'],
      solution: `sold = sellout[sellout["promo_id"].notna() & (sellout["week_start"].dt.year == 2025)]
sold = sold.assign(month_start=sold["week_start"].dt.to_period("M").dt.to_timestamp())
sold = sold.merge(prices[["month_start", "product_id", "list_price"]], on=["month_start", "product_id"]).merge(products[["product_id", "brand"]], on="product_id")
sold["discount_given"] = sold["units"] * sold["list_price"] - sold["revenue"]
sold.groupby("brand", as_index=False)["discount_given"].sum().round(0).sort_values("discount_given", ascending=False)`,
    },
    {
      kind: 'note',
      text: 'Plans exist by rep and division, and sales by outlet and product, so neither table can answer alone. Bring sales up to the plan’s grain before merging: a merge at the wrong grain repeats the plan on every sale.',
    },
    {
      kind: 'task',
      id: 'py-business-reps-plan',
      title: 'Reps furthest behind plan',
      question: 'In 2025, which 5 pairs of rep and division are furthest behind their plan in units? Show rep_name, division, target_units, units and pct_of_plan rounded to 1 decimal, the lowest first.',
      ordered: true,
      hints: ['Sales: bring in rep_id from customers and division from products, keep 2025, total by rep_id and division.', 'Plan: keep 2025 in targets and total target_units by the same two columns.', 'Merge the two, then reps for the name; sort_values("pct_of_plan").head(5).'],
      solution: `sold = sellout[sellout["week_start"].dt.year == 2025].merge(customers[["customer_id", "rep_id"]], on="customer_id").merge(products[["product_id", "division"]], on="product_id")
actual = sold.groupby(["rep_id", "division"], as_index=False)["units"].sum()
plan = targets[targets["month_start"].dt.year == 2025].groupby(["rep_id", "division"], as_index=False)["target_units"].sum()
table = plan.merge(actual, on=["rep_id", "division"]).merge(reps[["rep_id", "rep_name"]], on="rep_id")
table["pct_of_plan"] = (100 * table["units"] / table["target_units"]).round(1)
table[["rep_name", "division", "target_units", "units", "pct_of_plan"]].sort_values("pct_of_plan").head(5)`,
      traps: [
        {
          code: `sold = sellout[sellout["week_start"].dt.year == 2025].merge(customers[["customer_id", "rep_id"]], on="customer_id").merge(products[["product_id", "division"]], on="product_id")
actual = sold.groupby(["rep_id", "division"], as_index=False)["units"].sum()
plan = targets.groupby(["rep_id", "division"], as_index=False)["target_units"].sum()
table = plan.merge(actual, on=["rep_id", "division"]).merge(reps[["rep_id", "rep_name"]], on="rep_id")
table["pct_of_plan"] = (100 * table["units"] / table["target_units"]).round(1)
table[["rep_name", "division", "target_units", "units", "pct_of_plan"]].sort_values("pct_of_plan").head(5)`,
          says: 'The plan here covers all 30 months against one year of sales: keep 2025 in `targets` as well.',
        },
      ],
    },
  ],
}
