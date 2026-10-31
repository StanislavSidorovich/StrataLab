import type { PracticeSection } from '../practiceBook'

export const FREE: PracticeSection = {
  id: 'free',
  n: 14,
  title: 'Free tasks',
  blocks: [
    {
      kind: 'note',
      text: 'No topic is named here: decide which tables and which steps each question takes. Look at the data first, and check the row count after every merge.',
    },
    {
      kind: 'task',
      id: 'py-free-revenue-per-person',
      title: 'Where sales are strongest for the population',
      question: 'Which 5 regions had the highest sell-out revenue per 1,000 people in 2025? Show region_name, revenue and revenue_per_1000 rounded to 1 decimal, the highest first.',
      ordered: true,
      hints: ['Three tables: sales to outlet, outlet to region.', 'Total revenue by region after merging, and only then bring in population.', 'revenue / population * 1000; sort_values, head(5).'],
      solution: `sold = sellout[sellout["week_start"].dt.year == 2025].merge(customers[["customer_id", "region_id"]], on="customer_id")
table = sold.groupby("region_id", as_index=False)["revenue"].sum().merge(regions[["region_id", "region_name", "population"]], on="region_id")
table["revenue_per_1000"] = (table["revenue"] / table["population"] * 1000).round(1)
table[["region_name", "revenue", "revenue_per_1000"]].sort_values("revenue_per_1000", ascending=False).head(5)`,
    },
    {
      kind: 'task',
      id: 'py-free-stock-cover',
      title: 'Distributors holding too much',
      question: 'At the end of June 2026, how many months of shipments does each distributor hold on hand, taking its average monthly units shipped over April to June 2026? Show customer_name and months_cover rounded to 1 decimal, the highest first, then by customer_name.',
      ordered: true,
      hints: ['Two facts, each brought to one row per distributor first.', 'Stock: month_start == "2026-06-01", total units_on_hand. Shipments: months from April to June, total units divided by 3.', 'Merge on distributor_id, then customers on customer_id for the name.'],
      solution: `on_hand = stock[stock["month_start"] == "2026-06-01"].groupby("distributor_id", as_index=False)["units_on_hand"].sum()
shipped = sellin[sellin["month_start"].between("2026-04-01", "2026-06-01")].groupby("distributor_id", as_index=False)["units"].sum()
shipped["monthly_units"] = shipped["units"] / 3
table = on_hand.merge(shipped, on="distributor_id").merge(customers[["customer_id", "customer_name"]], left_on="distributor_id", right_on="customer_id")
table["months_cover"] = (table["units_on_hand"] / table["monthly_units"]).round(1)
table[["customer_name", "months_cover"]].sort_values(["months_cover", "customer_name"], ascending=[False, True])`,
    },
    {
      kind: 'note',
      text: 'The last task is a whole small project: a director asks whether FMCG met its 2025 plan, and if not, when it fell behind. Read the answer after you have it: the point is what the numbers allow you to say.',
    },
    {
      kind: 'task',
      id: 'py-free-plan-case',
      title: 'Did FMCG meet its 2025 plan?',
      question: 'For each month of 2025, compare FMCG units sold by outlets with the plan. Show month_start, target_units, units and pct_of_plan rounded to 1 decimal, the weakest month first.',
      ordered: true,
      hints: ['Sales: bring in division, keep FMCG and 2025, and make month_start from week_start.', 'Plan: keep FMCG and 2025 in targets; both totals are by month_start.', 'Merge on month_start, divide, sort_values("pct_of_plan").'],
      solution: `sold = sellout[sellout["week_start"].dt.year == 2025].merge(products[["product_id", "division"]], on="product_id")
sold = sold[sold["division"] == "FMCG"]
actual = sold.assign(month_start=sold["week_start"].dt.to_period("M").dt.to_timestamp()).groupby("month_start", as_index=False)["units"].sum()
plan = targets[(targets["division"] == "FMCG") & (targets["month_start"].dt.year == 2025)].groupby("month_start", as_index=False)["target_units"].sum()
table = plan.merge(actual, on="month_start")
table["pct_of_plan"] = (100 * table["units"] / table["target_units"]).round(1)
table[["month_start", "target_units", "units", "pct_of_plan"]].sort_values("pct_of_plan")`,
    },
    {
      kind: 'note',
      text: 'FMCG ended 2025 at 95.6% of plan, and the months stay close together, so no single month explains the gap. A good answer says so, rather than naming a culprit the data does not show.',
    },
  ],
}
