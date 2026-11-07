import type { PracticeSection } from '../practiceBook'

export const NEW_COLUMNS: PracticeSection = {
  id: 'new-columns',
  n: 4,
  part: 'Preprocess',
  title: 'New columns',
  blocks: [
    {
      kind: 'note',
      topic: 'a new column',
      text: 'A new column is computed for every row at once, with no loop. `assign` returns a copy of the table with the column added, and `products["name"] = ...` adds it to the table itself.',
      trap: '`assign` does not change `products`: keep its result in a variable, or the new column is gone after the cell.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-assign',
      title: 'Prices with a 20% tax',
      code: `products.assign(price_with_tax=products["list_price"] * 1.2)[["product_name", "list_price", "price_with_tax"]].head()`,
      sees: 'A new last column: each row has its list_price times 1.2, for example 38.0 becomes 45.6. The other columns are as they were.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-sale-price',
      title: 'A sale price',
      question: 'Add a column sale_price to products: the list_price less 15%. Show the whole table.',
      ordered: false,
      skills: ['add-column'],
      hints: ['One new column, computed from list_price.', 'assign takes the new name and the values: sale_price=...', 'products.assign(sale_price=products["list_price"] * 0.85)'],
      solution: `products.assign(sale_price=products["list_price"] * 0.85)`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-above-min',
      title: 'Distance from the cheapest',
      question: 'Add a column above_min to products: how much more each product costs than the cheapest product of the whole catalogue (its list_price minus the smallest list_price). For Pharma products show product_name, list_price and above_min.',
      ordered: false,
      skills: ['add-column', 'filter', 'pick-columns', 'one-number'],
      hints: ['The smallest price is one number, taken from all the products.', 'A column minus a number is computed for every row: products["above_min"] = ...', 'Add the column to products first, then filter the Pharma rows and pick the three columns.'],
      solution: `products["above_min"] = products["list_price"] - products["list_price"].min()
products[products["division"] == "Pharma"][["product_name", "list_price", "above_min"]]`,
      traps: [
        {
          code: `ph = products[products["division"] == "Pharma"]
ph.assign(above_min=ph["list_price"] - ph["list_price"].min())[["product_name", "list_price", "above_min"]]`,
          says: 'The smallest price is taken after the filter, so it is the cheapest Pharma product and not the cheapest of the catalogue. Add the column before you filter.',
        },
      ],
    },
    {
      kind: 'note',
      topic: 'a column that chooses between two values',
      text: '`np.where` takes a condition, a value for the rows where it is true and a value for the rest. It returns one value for every row, so it fits inside `assign`.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-pharma-group',
      title: 'Cheap or dear',
      code: `products.assign(price_class=np.where(products["list_price"] > 100, "dear", "cheap"))[["product_name", "list_price", "price_class"]].head(6)`,
      sees: 'Prices over 100 are labelled dear and the rest cheap, row by row: 128.0 is dear, 79.0 is cheap.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-tier',
      title: 'Premium or standard',
      question: 'Add a column tier to products: premium when list_price is over 500, otherwise standard. Show the whole table.',
      ordered: false,
      skills: ['if-column', 'add-column'],
      hints: ['A choice between two labels for every product.', 'np.where(condition, value if true, value if false) gives the whole column.', 'products.assign(tier=np.where(products["list_price"] > 500, "premium", "standard"))'],
      solution: `products.assign(tier=np.where(products["list_price"] > 500, "premium", "standard"))`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-bulk-lines',
      title: 'Bulk lines in 2026',
      question: 'In 2026 (week_start in 2026), how many sellout lines were bulk lines, with 10 or more units, and how many were regular lines, with fewer? Show kind and lines.',
      ordered: false,
      skills: ['if-column', 'add-column', 'count-values', 'date-part'],
      hints: ['Keep the lines of 2026, then label each line bulk or regular.', 'np.where(y["units"] >= 10, "bulk", "regular") as a new column named kind.', 'y.assign(kind=np.where(...))["kind"].value_counts()'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2026]
y.assign(kind=np.where(y["units"] >= 10, "bulk", "regular"))["kind"].value_counts()`,
      traps: [
        {
          code: `y = sellout[sellout["week_start"].dt.year == 2026]
y.assign(kind=np.where(y["units"] > 10, "bulk", "regular"))["kind"].value_counts()`,
          says: '`> 10` leaves the lines of exactly 10 units in regular. "10 or more" is `>= 10`.',
        },
      ],
    },
    {
      kind: 'note',
      topic: 'more than two outcomes',
      text: '`np.select` takes a list of conditions and a list of values, and uses the value of the first condition that is true. A row that meets none gets the `default`.',
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
      sees: 'Three labels with their number of lines: most are regular, 94,600. Order matters: a promo line of 10 units or more meets the first condition and gets "big promo line", not the second.',
    },
    {
      kind: 'note',
      topic: 'bands of numbers',
      text: '`pd.cut` puts numbers into bands, which turns a price or a size into a label to count by. Give it the column, the edges of the bands (`np.inf` is an open end) and a label for each band.',
      trap: '`pd.cut` bands include their upper edge: with edges 0, 2 and 5, the number 2 is in the first band.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-cut',
      title: 'Three price bands',
      code: `products.assign(band=pd.cut(products["list_price"], [0, 50, 200, np.inf], labels=["cheap", "regular", "dear"]))[["product_name", "list_price", "band"]].head(8)`,
      sees: '38.0 is in the first band (0 to 50) and 62.0 in the second (50 to 200). Three edges after the first make three bands, so three labels.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-price-bands',
      title: 'Price bands',
      question: 'Add a column price_band to products: low up to 100, mid over 100 up to 300, high over 300. Show the whole table.',
      ordered: false,
      skills: ['bands', 'add-column'],
      hints: ['Three bands of list_price.', 'pd.cut(values, edges, labels=...) with the edges 0, 100, 300 and np.inf.', 'products.assign(price_band=pd.cut(products["list_price"], [0, 100, 300, np.inf], labels=["low", "mid", "high"]))'],
      solution: `products.assign(price_band=pd.cut(products["list_price"], [0, 100, 300, np.inf], labels=["low", "mid", "high"]))`,
    },
    {
      kind: 'note',
      topic: 'a counts table with your own column names',
      text: '`value_counts` sorts by how often a value comes, and `sort_index` puts the values back in their own order. `rename_axis` names the column of values and `reset_index(name=...)` names the column of counts.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-unit-counts',
      title: 'Products per unit, in alphabetical order',
      code: `products["unit"].value_counts().sort_index().rename_axis("unit").reset_index(name="products")`,
      sees: 'A table with the columns unit and products, sorted by unit: L has 13 products, caps 2, g 12, ml 10, sachet 1, tab 9.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-category-counts',
      title: 'Products per category',
      question: 'How many products does each category have? Show category and products, in alphabetical order of category.',
      ordered: true,
      skills: ['count-values', 'name-counts'],
      hints: ['Count the values of category.', 'value_counts, then sort_index to put the categories in their own order.', 'products["category"].value_counts().sort_index().rename_axis("category").reset_index(name="products")'],
      solution: `products["category"].value_counts().sort_index().rename_axis("category").reset_index(name="products")`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-price-band-counts',
      title: 'Products per price band',
      question: 'How many products fall in each price band: low up to 100, mid over 100 up to 300, high over 300? Show band and products, in the order low, mid, high.',
      ordered: true,
      skills: ['bands', 'count-values', 'name-counts'],
      hints: ['Cut list_price into the three bands, then count them.', 'sort_index keeps the band order, because the labels were given in that order.', 'pd.cut(...).value_counts().sort_index().rename_axis("band").reset_index(name="products")'],
      solution: `pd.cut(products["list_price"], [0, 100, 300, np.inf], labels=["low", "mid", "high"]).value_counts().sort_index().rename_axis("band").reset_index(name="products")`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-size-bands',
      title: 'Sell-out lines by size',
      question: 'In 2026 (week_start in 2026), how many sellout lines fall in each size band of units: 1-2, 3-5, 6-9 and 10 or more? Show band and lines, in the band order just listed.',
      ordered: true,
      skills: ['date-part', 'bands', 'count-values', 'name-counts'],
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
      topic: 'recoding values with a dict',
      text: '`map` with a dict recodes a column: each value is replaced by what the dict says for it. A value that is not a key of the dict becomes NaN, with no error.',
      trap: '`value_counts` and `groupby` drop NaN, so a forgotten key makes rows vanish from the totals.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-division-map',
      title: 'Divisions under new names',
      code: `products["division"].map({"FMCG": "Consumer", "Pharma": "Health"}).value_counts()`,
      sees: 'The two divisions under their new names, with 29 and 18 products. Both values had a key, so nothing is lost.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-pack-type',
      title: 'Liquid, solid or dose',
      question: 'Add a column pack_type to products from unit: L and ml are liquid, g is solid, tab, caps and sachet are dose. Show the whole table.',
      ordered: false,
      skills: ['map-values', 'add-column'],
      hints: ['Recode the unit column, one key for each unit.', 'products["unit"].map({...}) has six keys: L, ml, g, tab, caps, sachet.', 'products.assign(pack_type=products["unit"].map({"L": "liquid", "ml": "liquid", ...}))'],
      solution: `products.assign(pack_type=products["unit"].map({"L": "liquid", "ml": "liquid", "g": "solid", "tab": "dose", "caps": "dose", "sachet": "dose"}))`,
      traps: [
        {
          code: `products.assign(pack_type=products["unit"].map({"L": "liquid", "ml": "liquid", "g": "solid", "tab": "dose", "caps": "dose"}))`,
          says: 'Sachet is missing from the dict, so Pyrexan Powder got NaN instead of dose. Every unit needs a key.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-new-columns-departments',
      title: 'Products by department',
      question: 'Group the categories into departments: Beverages is Drinks; Snacks and Dairy are Food; Home care is Home; OTC is Health. How many products does each department have? Show department and products, the most first, then by department.',
      ordered: true,
      skills: ['map-values', 'count-values', 'name-counts', 'sort'],
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
      topic: 'cutting text into parts',
      text: '`.str` runs text methods on a whole column. `split(" ")` cuts each text at the spaces into a list of words, and `.str[1]` takes the second word, because counting starts at 0.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-split',
      title: 'The second word of a name',
      code: `products.assign(word2=products["product_name"].str.split(" ").str[1])[["product_name", "word2"]].head()`,
      sees: '"Aqualis Still 0.5 L" gives Still, and "Aqualis Sparkling 0.5 L" gives Sparkling: one word per row, in a new column.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-aqualis-variants',
      title: 'Aqualis variants',
      question: 'Which variants do the Aqualis products come in? The variant is the second word of product_name. List each variant once.',
      ordered: false,
      skills: ['text-parts', 'filter', 'distinct'],
      hints: ['Keep the Aqualis products, then cut the name into words.', 'products[...]["product_name"].str.split(" ").str[1] is the second word.', 'Finish with .unique().'],
      solution: `products[products["brand"] == "Aqualis"]["product_name"].str.split(" ").str[1].unique()`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-fruvia-variants',
      title: 'Fruvia variants',
      question: 'How many Fruvia products does each variant have? The variant is the second word of product_name. Show variant and products, the most first, then by variant.',
      ordered: true,
      skills: ['text-parts', 'filter', 'count-values', 'name-counts', 'sort'],
      hints: ['Keep the Fruvia products and take the second word of the name.', 'Count the words with value_counts, as a table with rename_axis and reset_index(name=...).', 'Finish with .sort_values(["products", "variant"], ascending=[False, True]).'],
      solution: `f = products[products["brand"] == "Fruvia"]
f["product_name"].str.split(" ").str[1].value_counts().rename_axis("variant").reset_index(name="products").sort_values(["products", "variant"], ascending=[False, True])`,
    },
    {
      kind: 'note',
      topic: 'changing the type of a column',
      text: 'Use `astype` to change the type of a column: numbers to text, so they can be glued to a label, or text to numbers, so they can be added up. `astype(str)` makes text and `astype(float)` makes numbers.',
      trap: '`astype(int)` fails on a column that has NaN: use `float`.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-astype',
      title: 'A brand and its price in one text',
      code: `(products["brand"] + " " + products["list_price"].astype(str)).head(3)`,
      sees: 'list_price is a number, and a number cannot be added to text. After `astype(str)` it is text and joins the brand: Aqualis 38.0.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-product-code',
      title: 'A short code',
      question: 'Add a column code to products: the letter P followed by product_id, like P7. Show product_name and code.',
      ordered: false,
      skills: ['to-type', 'add-column', 'pick-columns'],
      hints: ['Text and a number cannot be joined as they are.', 'Make product_id text with astype(str), then add it to "P".', 'products.assign(code="P" + products["product_id"].astype(str))[["product_name", "code"]]'],
      solution: `products.assign(code="P" + products["product_id"].astype(str))[["product_name", "code"]]`,
    },
    {
      kind: 'note',
      topic: 'pulling a number out of text',
      text: '`extract` keeps the part of the text that matches a pattern in round brackets, and a row without a match gives NaN. The pattern `x(\\d+)$` means: an x, then digits, at the very end. The result is still text.',
      trap: '`extract` returns the first match only: anchor the pattern when a name holds several numbers.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-extract',
      title: 'Tablets in a Pyrexan pack',
      code: `pyrexan = products[products["brand"] == "Pyrexan"]
pyrexan.assign(pieces=pyrexan["product_name"].str.extract(r" x(\\d+)$")[0])[["product_name", "pieces"]]`,
      sees: '"Pyrexan 500 mg x10" gives 10 and "Pyrexan Powder x5" gives 5, but the syrup has no x number at the end, so it gets NaN.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-average-pieces',
      title: 'The average pack count',
      question: 'On average, how many pieces are in the packs of the products sold by the piece? Those have a name ending in " x" and a number, like "Gastrivo x20". Give it rounded to 1 decimal.',
      ordered: false,
      skills: ['text-parts', 'to-type', 'one-number'],
      hints: ['Pull the number out of the name; the other products give NaN.', 'str.extract(r" x(\\d+)$")[0] is text: astype(float) makes it a number.', 'An average skips NaN, so round(....mean(), 1) is the answer.'],
      solution: `round(products["product_name"].str.extract(r" x(\\d+)$")[0].astype(float).mean(), 1)`,
    },
    {
      kind: 'note',
      topic: 'dropping rows with a gap',
      text: '`dropna(subset=[...])` removes the rows where one of the listed columns is missing, so only the rows that have a value stay.',
      trap: 'Without `subset`, `dropna()` removes a row for a gap in any column.',
    },
    {
      kind: 'example',
      id: 'py-new-columns-dropna',
      title: 'Rows with a promo_id, counted',
      code: `print(len(sellout))
len(sellout.dropna(subset=["promo_id"]))`,
      sees: 'Of 118,449 rows only 23,849 have a promo_id, about a fifth. The rest were dropped.',
    },
    {
      kind: 'task',
      id: 'py-new-columns-promo-lines',
      title: 'Promotion lines in 2026',
      question: 'In 2026 (week_start in 2026), how many sellout lines were sold under a promotion, that is, have a promo_id? Give the number.',
      ordered: false,
      skills: ['drop-missing', 'size', 'date-part'],
      hints: ['Keep the lines of 2026, then the lines that have a promo_id.', 'dropna(subset=["promo_id"]) removes the lines without one.', 'len(sellout[sellout["week_start"].dt.year == 2026].dropna(subset=["promo_id"]))'],
      solution: `len(sellout[sellout["week_start"].dt.year == 2026].dropna(subset=["promo_id"]))`,
    },
    {
      kind: 'task',
      id: 'py-new-columns-counted-packs',
      title: 'Products sold by the piece',
      question: 'Which products have a name ending in " x" and a number, like "Gastrivo x20"? Show product_name and pieces (the number after the x), the most pieces first, then by product_name.',
      ordered: true,
      skills: ['add-column', 'text-parts', 'to-type', 'drop-missing', 'pick-columns', 'sort'],
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
