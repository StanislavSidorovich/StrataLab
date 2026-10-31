import type { PracticeSection } from '../practiceBook'

export const MERGE: PracticeSection = {
  id: 'merge',
  n: 9,
  title: 'Merge tables',
  blocks: [
    {
      kind: 'note',
      text: '`merge` puts side by side the rows of two tables that share a key value, so a fact table can borrow a column from a dimension. Use `on` for a key with the same name in both tables.',
      syntax: 'a.merge(b, on="product_id")',
      trap: 'A column found in both tables besides the key comes back as `_x` and `_y`: pick the columns you need from the second table first.',
    },
    {
      kind: 'example',
      id: 'py-merge-brand',
      title: 'The brand of each sales line',
      code: `sellout.merge(products[["product_id", "brand"]], on="product_id").head()`,
    },
    {
      kind: 'task',
      id: 'py-merge-rep-region',
      title: 'Reps with their region',
      question: 'Which region does each rep cover? Show rep_name and region_name for every rep.',
      ordered: false,
      skills: ['merge'],
      hints: ['The rep is in reps, the region name in regions, and both have region_id.', 'Merge the two tables on region_id.', 'reps[["rep_name", "region_id"]].merge(regions[["region_id", "region_name"]], on="region_id")'],
      solution: `reps[["rep_name", "region_id"]].merge(regions[["region_id", "region_name"]], on="region_id")[["rep_name", "region_name"]]`,
    },
    {
      kind: 'task',
      id: 'py-merge-brand-units',
      title: 'Units of each brand',
      question: 'How many units did each brand sell in sell-out over the whole period? Show brand and units.',
      ordered: false,
      skills: ['merge', 'group-total'],
      hints: ['Units are in sellout and the brand is in products.', 'Merge on product_id, then group by brand.', 'sellout.merge(products[["product_id", "brand"]], on="product_id").groupby("brand", as_index=False)["units"].sum()'],
      solution: `sellout.merge(products[["product_id", "brand"]], on="product_id").groupby("brand", as_index=False)["units"].sum()`,
    },
    {
      kind: 'task',
      id: 'py-merge-brand-revenue',
      title: 'Revenue of each brand',
      question: 'What was the sell-out revenue of each brand in 2026 (week_start in 2026)? Show brand and revenue, the highest first.',
      ordered: true,
      skills: ['merge', 'date-part', 'group-total', 'sort'],
      hints: ['Revenue is in sellout and the brand is in products: they share product_id.', 'Filter the weeks of 2026, merge on product_id, then group by brand.', 'merge(products[["product_id", "brand"]], on="product_id").groupby("brand", as_index=False)["revenue"].sum().sort_values("revenue", ascending=False)'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
y.merge(products[["product_id", "brand"]], on="product_id").groupby("brand", as_index=False)["revenue"].sum().sort_values("revenue", ascending=False)`,
    },
    {
      kind: 'note',
      text: 'When the key has a different name in each table, give `left_on` for the left table and `right_on` for the right one. A shipment’s distributor is a customer, so `sellin.distributor_id` matches `customers.customer_id`.',
      syntax: 'a.merge(b, left_on="distributor_id", right_on="customer_id")',
    },
    {
      kind: 'example',
      id: 'py-merge-distributor-names',
      title: 'The name of each shipment’s distributor',
      code: `sellin.merge(customers[["customer_id", "customer_name"]], left_on="distributor_id", right_on="customer_id").head()`,
    },
    {
      kind: 'task',
      id: 'py-merge-distributor-net',
      title: 'Net amount of each distributor',
      question: 'What was the total net_amount shipped to each distributor over the whole period? Show customer_name and net_amount, the highest first.',
      ordered: true,
      skills: ['merge', 'merge-other-names', 'group-total', 'sort'],
      hints: ['sellin has only the distributor_id; the name is in customers.', 'The keys have different names: left_on="distributor_id", right_on="customer_id".', 'groupby("customer_name", as_index=False)["net_amount"].sum().sort_values("net_amount", ascending=False)'],
      solution: `d = sellin.merge(customers[["customer_id", "customer_name"]], left_on="distributor_id", right_on="customer_id")
d.groupby("customer_name", as_index=False)["net_amount"].sum().sort_values("net_amount", ascending=False)`,
    },
    {
      kind: 'note',
      text: '`how="left"` keeps every row of the left table, with NaN where nothing matched. The default `how="inner"` drops the rows that have no match.',
      syntax: 'a.merge(b, on="k", how="left")',
    },
    {
      kind: 'task',
      id: 'py-merge-customer-rep',
      title: 'Every customer with its rep',
      question: 'List every customer with the name of its rep: customer_id, customer_name and rep_name. Distributors have no rep and stay in the list, with an empty rep_name.',
      ordered: false,
      skills: ['merge', 'merge-left'],
      hints: ['The rep_id is on the customer row; the name is in reps.', 'Merge on rep_id, and keep the customers that find no rep.', 'customers[["customer_id", "customer_name", "rep_id"]].merge(reps[["rep_id", "rep_name"]], on="rep_id", how="left")'],
      solution: `customers[["customer_id", "customer_name", "rep_id"]].merge(reps[["rep_id", "rep_name"]], on="rep_id", how="left")[["customer_id", "customer_name", "rep_name"]]`,
      traps: [
        {
          code: `customers[["customer_id", "customer_name", "rep_id"]].merge(reps[["rep_id", "rep_name"]], on="rep_id")[["customer_id", "customer_name", "rep_name"]]`,
          says: 'The default merge keeps only the rows with a match, so the 12 distributors, which have no rep_id, disappear from the list.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`indicator=True` adds a `_merge` column that says where each row was found. After a left merge, `left_only` marks the rows with no match, which answers "which ones never happened".',
      syntax: 'a.merge(b, on="k", how="left", indicator=True)   # _merge: both, left_only, right_only',
    },
    {
      kind: 'task',
      id: 'py-merge-unordered-products',
      title: 'Products a distributor did not order',
      question: 'Which products did distributor 1 not order in 2026 (by order_date)? Show product_id and product_name, by product_id.',
      ordered: true,
      skills: ['merge', 'merge-left', 'no-match', 'date-part', 'drop-duplicates', 'sort'],
      hints: ['Make the list of products distributor 1 ordered in 2026, then look for the products missing from it.', 'products.merge(o, on="product_id", how="left", indicator=True), then keep _merge == "left_only".', 'o = sellin[(sellin["distributor_id"] == 1) & (sellin["order_date"].dt.year == 2026)][["product_id"]].drop_duplicates()'],
      solution: `o = sellin[(sellin["distributor_id"] == 1) & (sellin["order_date"].dt.year == 2026)][["product_id"]].drop_duplicates()
m = products[["product_id", "product_name"]].merge(o, on="product_id", how="left", indicator=True)
m[m["_merge"] == "left_only"][["product_id", "product_name"]].sort_values("product_id")`,
    },
    {
      kind: 'note',
      text: '`validate="m:1"` stops with an error if a key repeats in the right table, so a dimension that is not unique cannot multiply the rows. Use it on every merge with a dimension.',
      syntax: 'a.merge(b, on="k", validate="m:1")',
    },
    {
      kind: 'example',
      id: 'py-merge-row-count',
      title: 'Same rows before and after',
      code: `named = sellin.merge(customers[["customer_id", "customer_name"]], left_on="distributor_id", right_on="customer_id", validate="m:1")
pd.Series({"before": len(sellin), "after": len(named)})`,
    },
    {
      kind: 'task',
      id: 'py-merge-channel-units',
      title: 'Units of each channel in 2026',
      question: 'How many units did each customer channel sell in 2026 (week_start in 2026)? Show channel and units.',
      ordered: false,
      skills: ['merge', 'merge-validate', 'date-part', 'group-total'],
      hints: ['The channel is a column of customers; sellout has the customer_id.', 'Merge with validate="m:1" so the lines cannot be repeated, then group by channel.', 'y.merge(customers[["customer_id", "channel"]], on="customer_id", validate="m:1").groupby("channel", as_index=False)["units"].sum()'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
y.merge(customers[["customer_id", "channel"]], on="customer_id", validate="m:1").groupby("channel", as_index=False)["units"].sum()`,
    },
    {
      kind: 'task',
      id: 'py-merge-distributor-region',
      title: 'Shipments by the distributor’s macro region',
      question: 'What was the net_amount of the shipments ordered in 2025, for each macro_region of the distributor? A distributor’s region is the region_id on its own row in customers. Show macro_region and net_amount, the highest first.',
      ordered: true,
      skills: ['merge', 'merge-other-names', 'merge-validate', 'date-part', 'group-total', 'sort'],
      hints: ['sellin has the distributor_id, customers has the distributor as a row, regions names the macro region.', 'First merge with left_on="distributor_id", right_on="customer_id", then merge regions on region_id.', 'Add validate="m:1" to both merges, then groupby("macro_region", as_index=False)["net_amount"].sum().sort_values("net_amount", ascending=False).'],
      solution: `s = sellin[sellin["order_date"].dt.year == 2025]
d = s.merge(customers[["customer_id", "region_id"]], left_on="distributor_id", right_on="customer_id", validate="m:1")
d = d.merge(regions[["region_id", "macro_region"]], on="region_id", validate="m:1")
d.groupby("macro_region", as_index=False)["net_amount"].sum().sort_values("net_amount", ascending=False)`,
      traps: [
        {
          code: `s = sellin[sellin["order_date"].dt.year == 2025]
d = s.merge(customers[["served_by_distributor_id", "region_id"]], left_on="distributor_id", right_on="served_by_distributor_id")
d = d.merge(regions[["region_id", "macro_region"]], on="region_id")
d.groupby("macro_region", as_index=False)["net_amount"].sum().sort_values("net_amount", ascending=False)`,
          says: '`served_by_distributor_id` belongs to the outlets, and a distributor has many of them. Each shipment was repeated once for every outlet, with the outlet’s region, so the amounts are far too large.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-merge-delisted',
      title: 'Pairs that stopped shipping',
      question: 'Which distributor and product pairs received shipments in 2024 and none in 2026 (by order_date)? Show distributor_id, product_id and product_name, by distributor_id, then product_id.',
      ordered: true,
      skills: ['merge', 'merge-left', 'no-match', 'date-part', 'drop-duplicates', 'sort'],
      hints: ['Make the list of distinct pairs of each year, then find the pairs of 2024 that have no match in 2026.', 'a.merge(b, on=["distributor_id", "product_id"], how="left", indicator=True) and keep _merge == "left_only".', 'Merge products for product_name, then sort_values(["distributor_id", "product_id"]).'],
      solution: `year = sellin["order_date"].dt.year
a = sellin[year == 2024][["distributor_id", "product_id"]].drop_duplicates()
b = sellin[year == 2026][["distributor_id", "product_id"]].drop_duplicates()
m = a.merge(b, on=["distributor_id", "product_id"], how="left", indicator=True)
gone = m[m["_merge"] == "left_only"].merge(products[["product_id", "product_name"]], on="product_id")
gone[["distributor_id", "product_id", "product_name"]].sort_values(["distributor_id", "product_id"])`,
      traps: [
        {
          code: `year = sellin["order_date"].dt.year
a = sellin[year == 2024][["distributor_id", "product_id"]].drop_duplicates()
b = sellin[year == 2026][["distributor_id", "product_id"]].drop_duplicates()
m = b.merge(a, on=["distributor_id", "product_id"], how="left", indicator=True)
gone = m[m["_merge"] == "left_only"].merge(products[["product_id", "product_name"]], on="product_id")
gone[["distributor_id", "product_id", "product_name"]].sort_values(["distributor_id", "product_id"])`,
          says: 'With 2026 on the left, `left_only` lists the pairs that are new in 2026. The pairs that stopped are the 2024 ones with no match, so 2024 goes on the left.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'If a key repeats in the right table, every left row is repeated once for each match, and the totals grow. Check `len` before and after, and merge at the grain you mean.',
      syntax: 'len(a), len(a.merge(b, on="k"))',
      trap: 'Two tables that merely share a column, such as `region_id` in customers and reps, match every pair in that region.',
    },
    {
      kind: 'task',
      id: 'py-merge-rep-units',
      title: 'The reps whose outlets sold most',
      question: 'Which 5 reps’ outlets sold the most units in 2026 (week_start in 2026)? An outlet’s rep is the rep_id on its row in customers. Show rep_id, rep_name and units, the most units first, then by rep_id.',
      ordered: true,
      skills: ['merge', 'merge-validate', 'date-part', 'group-total', 'sort'],
      hints: ['Path: sellout, customers (customer_id gives rep_id), reps (rep_id gives rep_name).', 'Merge on customer_id, then on rep_id, not on region_id: the region is shared by many reps.', 'groupby(["rep_id", "rep_name"], as_index=False)["units"].sum().sort_values(["units", "rep_id"], ascending=[False, True]).head(5)'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
m = y.merge(customers[["customer_id", "rep_id"]], on="customer_id", validate="m:1")
m = m.merge(reps[["rep_id", "rep_name"]], on="rep_id", validate="m:1")
m.groupby(["rep_id", "rep_name"], as_index=False)["units"].sum().sort_values(["units", "rep_id"], ascending=[False, True]).head(5)`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
m = y.merge(customers[["customer_id", "region_id"]], on="customer_id")
m = m.merge(reps[["rep_id", "rep_name", "region_id"]], on="region_id")
m.groupby(["rep_id", "rep_name"], as_index=False)["units"].sum().sort_values(["units", "rep_id"], ascending=[False, True]).head(5)`,
          says: 'Matching on `region_id` gives every line to all the reps of its region, so the lines are repeated and no rep’s units are their own. An outlet’s rep is `rep_id` in customers.',
        },
      ],
    },
  ],
}
