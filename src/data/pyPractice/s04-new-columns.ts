import type { PracticeSection } from '../practiceBook'

export const NEW_COLUMNS: PracticeSection = {
  id: 'new-columns',
  n: 4,
  part: 'Preprocess',
  title: 'New columns',
  blocks: [
    {
      kind: 'note',
      text: 'A new column is computed for every row at once, with no loop. `assign` returns a copy with the column added, and `df["name"] = ...` adds it to the table itself.',
      syntax: 'df = df.assign(per_unit=df["revenue"] / df["units"])   df["per_unit"] = df["revenue"] / df["units"]',
      trap: '`assign` does not change `df`: keep its result.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-kind',
      title: 'A label for each line with np.select',
      code: `kind = np.select(
    [sellout["promo_id"].notna() & (sellout["units"] >= 10), sellout["promo_id"].notna()],
    ["big promo line", "promo line"],
    default="regular line",
)
sellout.assign(kind=kind)["kind"].value_counts()`,
    },
    {
      kind: 'note',
      text: '`np.where` picks between two values, `np.select` walks a list of conditions and takes the first that is true, and `pd.cut` puts numbers into bands.',
      syntax: 'np.where(df["units"] >= 10, "bulk", "regular")   pd.cut(df["units"], [0, 2, 5, np.inf], labels=["low", "mid", "high"])',
      trap: '`pd.cut` bands include their upper edge: with edges 0, 2 and 5, the number 2 is in the first band.',
    },
    {
      kind: 'note',
      text: '`value_counts` sorts by how often a value comes, and `sort_index` puts the values back in their own order. `rename_axis` names the values and `reset_index(name=...)` names the count, which gives a table with the columns you want.',
      syntax: 's.value_counts().sort_index().rename_axis("band").reset_index(name="lines")',
    },
    {
      kind: 'task',
      id: 'py-new-columns-size-bands',
      title: 'Sell-out lines by size',
      question: 'In 2026 (week_start in 2026), how many sellout lines fall in each size band of units: 1-2, 3-5, 6-9 and 10 or more? Show band and lines, in the band order just listed.',
      ordered: true,
      hints: ['Keep the weeks of 2026, then cut units into four bands.', 'pd.cut(units, [0, 2, 5, 9, np.inf], labels=[...]): each band includes its upper edge.', 'Count with .value_counts().sort_index() to keep the band order, then .rename_axis("band").reset_index(name="lines").'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
band = pd.cut(y["units"], [0, 2, 5, 9, np.inf], labels=["1-2", "3-5", "6-9", "10+"])
band.value_counts().sort_index().rename_axis("band").reset_index(name="lines")`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
band = pd.cut(y["units"], [0, 3, 6, 10, np.inf], labels=["1-2", "3-5", "6-9", "10+"])
band.value_counts().sort_index().rename_axis("band").reset_index(name="lines")`,
          says: 'Bands from `pd.cut` include the upper edge, so the edges 3, 6 and 10 put those units in the band below. For 1-2, 3-5 and 6-9 the edges are 2, 5 and 9.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`map` with a dict recodes a column. A value that is not a key of the dict becomes NaN, with no error.',
      syntax: 'df["category"].map({"Snacks": "Food", "Dairy": "Food"})',
      trap: '`value_counts` and `groupby` drop NaN, so a forgotten key makes rows vanish from the totals.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-division-map',
      title: 'Divisions under new names',
      code: `products["division"].map({"FMCG": "Consumer", "Pharma": "Health"}).value_counts()`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-departments',
      title: 'Products by department',
      question: 'Group the categories into departments: Beverages is Drinks; Snacks and Dairy are Food; Home care is Home; OTC is Health. How many products does each department have? Show department and products, the most first, then by department.',
      ordered: true,
      hints: ['Recode category into a department with a dict, then count.', 'products["category"].map({...}) needs one key for each of the 5 categories.', 'Count with .value_counts().rename_axis("department").reset_index(name="products"), then sort_values(["products", "department"], ascending=[False, True]).'],
      solution: `dept = products["category"].map({"Beverages": "Drinks", "Snacks": "Food", "Dairy": "Food", "Home care": "Home", "OTC": "Health"})
dept.value_counts().rename_axis("department").reset_index(name="products").sort_values(["products", "department"], ascending=[False, True])`,
      traps: [
        {
          code: `dept = products["category"].map({"Beverages": "Drinks", "Snacks": "Food", "Home care": "Home", "OTC": "Health"})
dept.value_counts().rename_axis("department").reset_index(name="products").sort_values(["products", "department"], ascending=[False, True])`,
          says: 'Dairy is missing from the dict, so its products became NaN and `value_counts` dropped them. Food shows 6 products instead of 12.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`.str` runs text methods on a whole column: `contains`, `split`, `replace`, and `extract`, which pulls out the part of a regex in brackets. A row without a match gives NaN: `dropna` removes it, and `astype(float)` makes numbers of the text.',
      syntax: 'df["name"].str.extract(r" x(\\d+)$")[0]   df["name"].str.split(" ").str[0]   df.dropna(subset=["x"])   df["x"].astype(float)',
      trap: '`extract` returns the first match only: anchor the pattern when a name holds several numbers.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-counted-packs',
      title: 'Products sold by the piece',
      question: 'Which products have a name ending in " x" and a number, like "Gastrivo x20"? Show product_name and pieces (the number after the x), the most pieces first, then by product_name.',
      ordered: true,
      hints: ['Pull the number out of the name, and drop the products where there is none.', 'products["product_name"].str.extract(r" x(\\d+)$")[0] gives NaN when the name does not end like that.', 'Add it as a column with astype(float), dropna(subset=["pieces"]), then sort_values(["pieces", "product_name"], ascending=[False, True]).'],
      solution: `pieces = products["product_name"].str.extract(r" x(\\d+)$")[0].astype(float)
packs = products.assign(pieces=pieces).dropna(subset=["pieces"])
packs[["product_name", "pieces"]].sort_values(["pieces", "product_name"], ascending=[False, True])`,
      traps: [
        {
          code: `pieces = products["product_name"].str.extract(r"(\\d+)")[0].astype(float)
packs = products.assign(pieces=pieces).dropna(subset=["pieces"])
packs[["product_name", "pieces"]].sort_values(["pieces", "product_name"], ascending=[False, True])`,
          says: 'The first number in a name is not the pack count: "Pyrexan 500 mg x10" gives 500, and names like "Aqualis Still 0.5 L" match too. Anchor the pattern on " x" and the end of the name.',
        },
      ],
    },
  ],
}
