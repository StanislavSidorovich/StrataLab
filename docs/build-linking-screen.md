# Build by hand: the linking screen (Model step, Б5)

Design for the Model step of `#build=kaiyo-sales` once the learner links the keys by hand (2026-11-08, Opus). No code here: Sonnet sessions write it from this file, in the slices of section 8. It extends `docs/build-kaiyo-sales-spec.md` (the "spec" below): section 4.2 there has the pairs and the first checks; this file decides the screen, the moves, the states and the texts, and replaces the v1 star of spec 4.1 without breaking the Dashboard.

Sources: spec sections 1, 4, 7, 10, 11; `research/celonis-case-study-2026-11/NOTES.md` 5.4 to 5.6 and the owner's screenshots described there (Celonis foreign-key dialog: "Dimension table (1)" left, "Fact table (N)" right, **Swap tables**, type icons ABC / 123 / DATE). The first version of this file was written before the owner's screenshots arrived; they are now in `research/fabric-screens-2026-11/` and read in section 12. Three points of the design changed after them, each marked "(changed after the screenshots, 12)": line shape and end marks (5.1), Σ on measure columns (5.1), column lists in the panel's slots (5.2). What is said about Power BI's Edit relationship dialog, Autodetect and cross-filter settings is still from general knowledge: no frame of them yet (12.4).

All numbers were computed with DuckDB 1.5.6 (Python) on `lab/public/datasets/quaera/*.parquet`, with the SQL of the spec (2.2, 2.4, 3.1) for the right clean state (W, P1, P2, P3, the given step), plus the spoiled states named in each row. The scratch script is not committed (as in Б1); `tests/buildModel.test.ts` (slice Б5a) replaces it.

---

## 1. What the step teaches, in one paragraph

Sales name the store and the product by text (`customer_name`, `sku_code`); the reference files have ids. A model needs two moves, and the learner makes both: **first link each text column to the table that describes it** (that link is a lookup: it is how the ids reach the sales), **then link the fact to the dimensions by id** (that link is the relationship a dashboard joins on and a Power BI model keeps). On the way the learner meets the three things every relationship dialog asks about and Celonis never checks: which side is "1", whether the types match, whether every row finds its partner.

## 2. Take and don't take (Power BI, Fabric, Celonis)

| Product idea | Verdict | Why |
|---|---|---|
| Celonis: one panel with a "1" slot (dimension) and an "N" slot (fact), **Swap tables** between them, type icons on columns | **Take** | Direction is a choice the learner makes and can get wrong; the Swap button is the cheap repair. This is the core of the screen |
| Power BI Model view: boxes, a right-angle line with boxed `1` and `*` at the ends, Σ on summable columns (seen in `power bi relationships.png`) | **Take**, with `1` and `N` (the words of the spec and the courses) | The learner reads cardinality off the drawing |
| Celonis Data Model canvas: boxes that list only key columns, **Set Identifier** per table, **New foreign key** per box, dashed lines with no cardinality (seen in `celonis (4).jpg`) | **Don't take** the key-only boxes and the bare lines; the explicit identifier is covered by the One side check | Showing only keys hides the choice the learner has to make |
| Power BI's relationship dialog: a few rows of both tables under the column pickers | **Take** as three sample values per chosen column | The quickest way to see `Minori #1001` against `Minori` |
| Power BI refusing "one to one" and warning on "many to many" from the data | **Take** as the uniqueness check | Our check says it in words and with numbers |
| Power BI / Fabric **Autodetect relationships** (on load, by column name) | **Don't take** | It does the lesson for the learner, and here it would link by name silently |
| Cross-filter direction, active / inactive relationships, many-to-many option | **Don't take** | Not needed for one star; each would be a setting with no consequence on this data |
| Free drag of boxes on a canvas | **Don't take** | Fixed positions (8.3): nothing analytic is learned by arranging boxes |
| Celonis "Missing identifiers" warning you can ignore | **Don't take** | Every message here either blocks or is a calm note that says why it is normal |
| Celonis: no check that rows find a partner | **We add** coverage ("N sales found no customer") | The point of doing it in Lab: we have the data |

## 3. The learner's moves

### 3.1 Two passes on one screen

| Pass | Canvas shows | Links to make | Ends with |
|---|---|---|---|
| **1. Lookups** | the four clean tables: `clean_sales`, `clean_customers`, `clean_products`, `clean_regions` | L1 `clean_sales.customer_name` → `clean_customers.customer_name`; L2 `clean_sales.sku_code` → `clean_products.sku_code`; L3 `clean_customers.region_id` → `clean_regions.region_id` | **Build the star** (enabled when L1 to L3 are accepted): shows the SQL made from the three links, runs it, switches the canvas to pass 2 |
| **2. Relationships** | the three gold tables: `gold_fact_sales`, `gold_dim_customer`, `gold_dim_product` | F1 `gold_fact_sales.customer_id` → `gold_dim_customer.customer_id`; F2 `gold_fact_sales.product_id` → `gold_dim_product.product_id` | the star's numbers (as v1) and **Continue**: the Model step is done |

Any order inside a pass. A tab pair above the canvas, **Clean tables** / **Star**, lets the learner look back at pass 1 after the star is built (read-only there: the links of pass 1 can be removed only before Build the star; after it, ✕ on a pass-1 link asks "This removes the star too" and clears pass 2).

### 3.2 Making one link

1. **Pick the column that refers.** Click a column row in a box (or choose it in the panel's selects, 7.4). It fills the panel's **Many (N)** slot. Caption above the canvas while nothing is picked: "Click the column that names something, then the column it names. Sales name a store: start there."
2. **Pick the column it refers to.** The second click fills **One (1)**. The order of clicks only decides the first guess: the learner fixes it with **Swap** (`⇄`, between the slots, always enabled when both are filled).
3. **Checks run at once** when both slots are filled and again after every Swap or change (8.1: four small queries, well under 100 ms on 3,000 rows). They show as a row of chips (section 4) and, under the chips, **one diagnosis line**: the first failing check (order in 4.2) or the pass line.
4. **Create link** is enabled only when every chip passes. A drawn but failing pair is shown on the canvas as a dashed line with its number ("714 not found"), so the consequence is on the drawing, not only in the panel.
5. An accepted link is drawn solid, `N` at the many end, `1` at the one end, a label on the line ("3,000 → 144 · every sale found") and a row in the links list under the canvas: name, the two columns, ✕.

Clicking a column already in a slot empties that slot; Esc empties both.

### 3.3 How the learner reaches the surrogate key (answer to spec 11, question 3)

**Recommendation: the learner links the fact by id on a second pass; "Build the star" writes only the lookups.** ✱

- Build the star is a **button with its SQL shown** (section 6), not a blank: writing three LEFT JOINs is a SQL lesson; this step is a modeling lesson. The SQL is generated from the learner's own links, and the `ON` lines are marked "your link L1" etc., so the learner sees where the links went.
- Pass 2 is two short links on the same panel, under a minute. It is worth it for three reasons: it is the Power BI moment (relationships by id in the model view); it is what the Dashboard's chain tile joins on (`ON c.customer_id = f.customer_id`); and it is what Б8 sends to Model as foreign keys. It also carries the best trap of the screen: `product_id → customer_id` passes every data check (4.3, row F-x).
- The `textKey` note of spec 4.2 becomes the bridge line on Build the star: "You linked by name to look the ids up. A store renamed tomorrow would break a link by name, so the star links by id. Your turn: link the fact to its dimensions."
- Cheaper alternative for the hub: Build the star draws F1 and F2 itself and the learner only reads them. Saves about a third of slice Б5b; loses the F-x trap.

### 3.4 Regions: the trap that always happens

The v1 Clean (spec 3.0) leaves `regions.region_id` as text `R-03`; customers have it as a number. So L3 **always** fails the type chip the first time: this is P7 of the spec, found where it shows up, as in Power BI, where a relationship refuses columns of different types and sends you to Power Query.

- The type diagnosis has a button **Fix region_id in Clean**: it opens the Clean step on regions with a new card P7 (8.2) and the **Extract number** button of spec 2.6, promoted from "later" to this version. Clean stays done; P7 is an extra card shown only once Model asked for it.
- P7 passes when `clean_regions.region_id` is a number and `clean_regions` equals `ref_regions` both ways (16 rows, diff 0, CLI). Then **Back to Model**: the slots are kept, the chips run again, L3 passes.
- Region goes **into the customer dimension** (two columns, `region_name`, `macro_region`), not into a fourth gold table: the star stays three boxes and pass 2 stays two links. ✱ Every customer finds a region (144 of 144, CLI).

## 4. The checks

### 4.1 Chips

| Chip | Question it answers | Pass | Fail | Not run |
|---|---|---|---|---|
| **Types** | Can these two columns be compared? | same family: text / number / date (8.1) | families differ | (always runs) |
| **One side** | Does the "1" side have one row per value? | 0 repeated values | some values repeat | (always runs) |
| **Found** | Does every N row find its partner? | 0 N rows without a match | some or all without a match | when Types fails: "needs matching types" (comparing `R-03` with a number is an error in DuckDB, 4.4) |
| **Right pair** | Is this one of the links the model needs? | pair in the expected list (L1 to L3 in pass 1, F1, F2 in pass 2) | data checks pass but the pair isn't expected | until the three data chips pass |

Plus two **notes**, never failures, shown under the pass line: "99 of 144 customers have no sales (18 of 47 products): normal, a dimension lists everything, the fact only what was sold" (the hub's calm note, spec 11 q4), and, on L1 and L2, the lookup note "Linked by name: fine for looking the id up; the star will link by id."

States of a chip: **waiting** (grey, slot empty), **running** (spinner), **pass** (green ✓), **fail** (red ✕), **not run** (grey, with its reason on hover and in the line). Colours from the theme tokens, plus the icon, never colour alone.

### 4.2 Diagnosis order (first match wins)

1. `sameTable`: both columns in one table.
2. `typeMismatch`: families differ.
3. `noMatch`: no N row finds a match (wrong column, almost always).
4. `wrongWay`: the 1 side repeats **and** the N side has one row per value (Swap fixes it).
5. `notUnique`: the 1 side repeats and the N side repeats too.
6. `unmatched`: some N rows find nothing.
7. `notExpected`: all data chips pass, the pair isn't in the list (with the special text `sameByChance` when both columns are ids, F-x).
8. pass.

### 4.3 Reference numbers per pair

Right clean state unless the row says otherwise. Types as the learner's tables have them (bronze types of spec 2.5: customer ids and `region_id` BIGINT, Extract number gives INTEGER). Columns: N rows; 1-side rows / distinct values; N rows (values) without a match; inner-join rows; 1-side values with no N row. Diagnosis = 4.2.

| # | N side → 1 side | N rows | 1 side rows / distinct | unmatched rows (values) | join rows | 1 unused | Diagnosis |
|---|---|---|---|---|---|---|---|
| L1 | sales.customer_name → customers.customer_name | 3,000 | 144 / 144 | 0 (0) | 3,000 | 99 | pass, lookup note, 99 note |
| L2 | sales.sku_code → products.sku_code | 3,000 | 47 / 47 | 0 (0) | 3,000 | 18 | pass, lookup note, 18 note |
| L3 before P7 | customers.region_id → regions.region_id | 144 | 16 / 16 | not run | | | `typeMismatch` (BIGINT / VARCHAR) |
| L3 after P7 | same | 144 | 16 / 16 | 0 (0) | 144 | 0 | pass |
| L1 swapped | customers.customer_name → sales.customer_name | 144 | 3,000 / 45 | 99 (99) | 3,000 | 0 | `wrongWay` |
| L2 swapped | products.sku_code → sales.sku_code | 47 | 3,000 / 29 | 18 (18) | 3,000 | 0 | `wrongWay` |
| L3 swapped (after P7) | regions.region_id → customers.region_id | 16 | 144 / 16 | 0 (0) | 144 | 0 | `wrongWay` |
| L1 wrong column | sales.customer_name → customers.chain_name | 3,000 | 71 non-null / 12 | 3,000 (45) | 0 | 12 | `noMatch` |
| L1 wrong column | sales.customer_name → customers.city | 3,000 | 144 / 31 | 3,000 (45) | 0 | 31 | `noMatch` |
| L2 wrong column | sales.sku_code → products.product_name | 3,000 | 47 / 47 | 3,000 (29) | 0 | 47 | `noMatch` |
| L3 wrong column | customers.region_id → regions.region_name | 144 | 16 / 16 | not run | | | `typeMismatch` (BIGINT / VARCHAR) |
| L3 wrong column | customers.city → regions.region_name | 144 | 16 / 16 | 89 (21) | 55 | 6 | `unmatched` (some cities are also prefecture names, e.g. Tokyo) |
| L1 before P3 | sales.customer_name → customers (stale rows in) | 3,000 | 148 / 144 | 0 (0) | **3,385** | 99 | `notUnique` (4 values twice) |
| L2 before P1 | sales.sku_code → products (spoiled SKUs) | 3,000 | 47 / 47 | **714 (6)**, revenue 392,540.33 (H1 2026: 92,039.13) | 2,286 | 24 | `unmatched` |
| F1 | fact.customer_id → dim_customer.customer_id | 3,000 | 144 / 144 | 0 (0) | 3,000 | 99 | pass, 99 note |
| F2 | fact.product_id → dim_product.product_id | 3,000 | 47 / 47 | 0 (0) | 3,000 | 18 | pass, 18 note |
| F1 swapped | dim_customer.customer_id → fact.customer_id | 144 | 3,000 / 45 | 99 (99) | 3,000 | 0 | `wrongWay` |
| F2 swapped | dim_product.product_id → fact.product_id | 47 | 3,000 / 29 | 18 (18) | 3,000 | 0 | `wrongWay` |
| F-y | fact.customer_id → dim_product.product_id | 3,000 | 47 / 47 | 501 (10), revenue 220,484.87 | 2,499 | 12 | `unmatched` |
| **F-x** | fact.product_id → dim_customer.customer_id | 3,000 | 144 / 144 | **0 (0)** | 3,000 | 115 | **`sameByChance`**: every data chip passes |

F-x is the reason for the **Right pair** chip: product ids run 1 to 47 and customer ids 1 to 144, so every sale "finds a customer". With that link the H1 2026 chain table would read: no chain 180,981.76, Minori 80,039.21, Nagisa 16,967.16, Kaigan 16,137.12, Prima 12,980.72, Ichiba 7,800.16 (instead of Minori 90,829.50 first, spec 5.3). The same trap exists in pass 1 between any two id columns (`products.product_id → customers.customer_id`); the chip catches it there too.

L1 before P3 and L2 before P1 are reachable only if the learner removes a Clean step after Clean is done (the step list keeps ✕): the screen reads the clean tables as they are each time it opens. The diagnosis has **Back to Clean** with the source preselected.

### 4.4 The SQL of each check

Shown under the chips behind **Show the SQL** (folded), with **Open in a tab**, as every generated SQL on this page. `<…>` are the slots; table names are always `build_kaiyo.<table>`. The same statements run for the chips.

```sql
-- Types: the two data types (family decided in TypeScript, 8.1)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'build_kaiyo'
  AND ((table_name = '<many_t>' AND column_name = '<many_c>') OR (table_name = '<one_t>' AND column_name = '<one_c>'));

-- One side: rows, distinct values, values that repeat. 0 repeats = ok.
-- (also run with the N side in place of the 1 side, to tell wrongWay from notUnique)
SELECT count(<one_c>) AS rows, count(DISTINCT <one_c>) AS values,
       (SELECT count(*) FROM (SELECT <one_c> FROM build_kaiyo.<one_t> WHERE <one_c> IS NOT NULL GROUP BY 1 HAVING count(*) > 1)) AS repeated
FROM build_kaiyo.<one_t>;

-- Found: N rows and values with no partner (0 = ok); revenue only when the N side has a revenue column.
-- Not run when the types differ.
SELECT count(*) AS rows, count(DISTINCT m.<many_c>) AS values, sum(m.revenue) AS revenue
FROM build_kaiyo.<many_t> m
WHERE m.<many_c> IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM build_kaiyo.<one_t> o WHERE o.<one_c> = m.<many_c>);

-- for the texts: rows after the join (fan-out), up to three unmatched values, 1-side values never used
SELECT count(*) FROM build_kaiyo.<many_t> m JOIN build_kaiyo.<one_t> o ON o.<one_c> = m.<many_c>;
SELECT DISTINCT m.<many_c> FROM build_kaiyo.<many_t> m
WHERE NOT EXISTS (SELECT 1 FROM build_kaiyo.<one_t> o WHERE o.<one_c> = m.<many_c>) ORDER BY 1 LIMIT 3;
SELECT count(DISTINCT o.<one_c>) FROM build_kaiyo.<one_t> o
WHERE NOT EXISTS (SELECT 1 FROM build_kaiyo.<many_t> m WHERE m.<many_c> = o.<one_c>);
-- three sample values per slot, shown under the slot
SELECT DISTINCT <col> FROM build_kaiyo.<t> WHERE <col> IS NOT NULL ORDER BY 1 LIMIT 3;
```

Running Found across types is a DuckDB error, not a count: `Conversion Error: Could not convert string 'R-09' to INT32 when casting from source column region_id` (CLI, on INTEGER; the learner's BIGINT gives the INT64 form of spec 4.2). That is why it is skipped, and why the type chip explains it instead.

### 4.5 Diagnosis texts (EN)

In `BUILD_DIAGNOSIS.link` (`src/data/build/kaiyoSales.ts`), `{}` from the run. Table names shown without `clean_` / `gold_` prefixes and the schema ("sales.customer_name"); the canvas shows the full names on hover.

```ts
sameTable: () => `Both columns are in one table. A link joins two tables: pick the second column in another box.`,
typeMismatch: (a: string, ta: string, b: string, tb: string, sa: string, sb: string) =>
  `${a} is ${ta} and ${b} is ${tb}: ${sa} and ${sb} can't be compared. Fix the type in Clean first.`,
  // L3: "customers.region_id is a number (BIGINT) and regions.region_id is text (VARCHAR): 3 and R-03 can't be compared. Fix the type in Clean first."
noMatch: (many: string, one: string, sm: string[], so: string[]) =>
  `Not one row of ${many} finds a partner in ${one}: ${sm.map(q).join(', ')} against ${so.map(q).join(', ')}. Is it the right column?`,
  // L1 → chain_name, samples as the first three in order (CLI): "'Ichiba #1026', 'Ichiba #1035', 'Ichiba #1036' against 'Bazario', 'Farmalux', 'Hakobu'"
  // (distributor chains sort first; samples of the 1 side could be taken from the values the N side comes closest to, but plain ORDER BY is enough)
wrongWay: (one: string, rows: number, values: number) =>
  `${one} repeats: ${rows} rows, only ${values} different values. It's the many side; the side with one row per key goes on the other end. Swap them.`,
  // L1 swapped: "sales.customer_name repeats: 3,000 rows, only 45 different values. …"
notUnique: (one: string, repeated: number, rows: number, joined: number) =>
  `${one} isn't unique on the "1" side: ${repeated} values appear more than once, so ${fmt(rows)} sales would become ${fmt(joined)}. Each value needs one row.`,
  // L1 before P3: "customers.customer_name isn't unique on the "1" side: 4 values appear more than once, so 3,000 sales would become 3,385. …"
unmatched: (rows: number, noun: string, values: number, sm: string[], revenue: string | null) =>
  `${fmt(rows)} ${noun} found no partner (${values} different values: ${sm.map(q).join(', ')}${values > sm.length ? ', …' : ''})` +
  (revenue ? `: ${revenue} of revenue would be left out.` : '.') + ` A key has to match to the character.`,
  // L2 before P1: "714 sales found no product (6 different values: 'AQUA002', 'FRUV002', 'KROS001', …): 392,540.33 of revenue would be left out. …"
  // noun from the 1 side: "sales found no customer", "sales found no product", "customers found no region"
notExpected: (many: string, one: string) =>
  `Every check passes, but ${many} and ${one} don't name the same thing. Which table describes ${many}?`,
sameByChance: (many: string, one: string, maxMany: number, maxOne: number) =>
  `Every check passes, but only by chance: ${many} runs 1 to ${maxMany} and ${one} runs 1 to ${maxOne}, so every number finds a partner. Product 2 is not customer 2. Link each id to its own table.`,
  // F-x: "fact_sales.product_id runs 1 to 47 and dim_customer.customer_id runs 1 to 144 …"
pass: (many: string, one: string, rows: number, ones: number) =>
  `One ${one} for each value, and all ${fmt(rows)} rows of ${many} found theirs.`,
  // L1: "One customer for each value, and all 3,000 rows of sales found theirs."
unusedNote: (unused: number, of: number, what: string) =>
  `${unused} of ${of} ${what} have no sales. Normal: a dimension lists everything, the fact only what was sold.`,
lookupNote: 'Linked by name: fine for looking the id up. The star will link by id.',
starBridge: 'You linked by name to look the ids up. A store renamed tomorrow would break a link by name, so the star links by id. Your turn: link the fact to its dimensions.',
```

(`q` quotes a value with edge spaces drawn visibly, as P1's card; `fmt` is the page's number format.) Hints for the panel, one ladder per pass:

- Pass 1: 1. "The sales say which store sold with customer_name. Which table has one row per store?" 2. "Click sales.customer_name, then customers.customer_name. Do the same for sku_code, then link customers to their region."
- Pass 2: 1. "The fact now carries customer_id and product_id. Each one is described by one dimension." 2. "fact_sales.customer_id to dim_customer.customer_id, fact_sales.product_id to dim_product.product_id."

## 5. The view

### 5.1 Canvas (SVG, fixed layout)

- One `<svg>` drawn in React, sized to its container with a `viewBox` and `ResizeObserver` as `Chart.tsx` does (the only SVG in Lab today; `Compare` and `PlanView` are HTML grids and trees, nothing to reuse but the tokens). Fixed box positions per pass in `src/data/build/kaiyoSales.ts`: no layout engine, no drag. ✱
- Pass 1, viewBox 960 × 420: `sales` left (x 20), `customers` centre-top, `products` centre-bottom, `regions` right of customers. Pass 2, 960 × 360: `fact_sales` centre, `dim_customer` left, `dim_product` right (the textbook star).
- **Box:** header with the short name and the row count ("sales · 3,000 rows"), one row per column (22 px) with a type icon (ABC text, 123 number, calendar date; lucide icons with a `<title>`) and the name. Widest box 210 px. `sales` 7 columns: 184 px high. No key icon until a link makes a column the "1" end: drawing keys up front gives the answer away. ✱
- **Measures:** in pass 2 the fact's `units` and `revenue` carry a Σ in place of the 123 icon, as Power BI marks summable columns; ids keep 123. Fixed list in the data file, not guessed from the type. (Changed after the screenshots, 12: it tells keys from measures in the box without giving away which id goes where.)
- **Line:** from the N column row's edge to the 1 column row's edge, drawn with right angles (horizontal, vertical, horizontal), as Power BI's Model view does; at each end, on the box edge, a small boxed mark `N` or `1` (Power BI draws `*` and `1` the same way). No arrow in the middle: Power BI's arrow is the cross-filter direction, which we don't teach (section 2). The label at the midpoint, a pill with the main number. (Changed after the screenshots, 12: was a cubic curve with loose labels; the right-angle line with boxed ends reads like the tool the learner will meet.) Accepted: solid, `var(--accent)`. Pair in the panel and failing: dashed `var(--danger)` with the failing number ("714 not found", "3,385 rows"). Pair in the panel, still running: dashed `var(--muted)`.
- **Selection:** a picked column row gets the accent outline and the slot letter (N or 1) at its left; column rows are `<g role="button" tabindex="0">` with an `aria-label` ("sales, customer_name, text"), Enter picks.
- Under the canvas: the links list (L1… with ✕) and the action of the pass (**Build the star** / **Continue**) with its lock reason ("Link the three tables first: 2 of 3").

### 5.2 Panel (right of the canvas)

Top to bottom: title "New link"; slot **Many (N)** with "the column that refers" and three sample values; the **⇄ Swap** button; slot **One (1)** with "the column it refers to" and samples; the chips row; the diagnosis line (with Fix in Clean / Back to Clean / Swap as an inline button when the text points to one); notes; **Show the SQL**; **Create link**. Each slot has a table select and, under it, **the table's columns as a short list** with type icons (at most 8 rows here, no search needed), as in Celonis's Foreign key settings: a click on a row fills the slot, the chosen column is pinned on top of the list, and a thin line joins the two chosen rows across the panel. The lists are synced with clicks on the canvas and are the keyboard and narrow-window way (5.3). (Changed after the screenshots, 12: was a second select per slot; a list shows the alternatives and their types at once, which is what makes Celonis's dialog easy to read.) The panel keeps our order, Many (N) first and One (1) second, read as "sales.customer_name refers to customers.customer_name"; Celonis puts the dimension (1) on the left, while Power BI's Create / Edit relationship dialog puts the many table first and the one table second, as we do (12.6). Swap is there in both, so the difference costs nothing. Under each slot, next to the samples, one line in Power Query's words: "3,000 rows · 45 distinct" (Column distribution says "701 distinct, 701 unique"), so the "1" side's uniqueness is visible before the chip says it. (Added after the public frames, 12.6.)

### 5.3 What fits

| Width | Layout |
|---|---|
| **1366** (laptop; body ≈ 1366 × 620 under the frame's head, strip and foot) | canvas ≈ 920 px wide (pass 1 viewBox at about 0.95, every box and label readable at 12 px), panel 380 px on the right, links list and action under the canvas; no page scroll at 768 px of height with the panel's SQL folded |
| **1024 to 1365** | same, canvas scales down to ≈ 0.65 (box text ≥ 11 px at 1024; below that it would blur): fine |
| **768 to 1023** | panel moves under the canvas (canvas full width, ≈ 0.8) |
| **under 768** (phone, 375) | no canvas. The panel alone with its selects, then the links list, then the tables as small folded cards (name, rows, columns with type words). A line on top: "The drawing of the model needs a wider screen; you can link here with the lists." ✱ The frame has no "needs a laptop" screen (build.css only narrows the step chips); the pipeline has one (`PipelinePage.tsx`, "Open on a laptop"). The page-wide choice is the hub's (question 3); this step works either way |

## 6. Build the star and the Dashboard

**Build the star** replaces the v1 star of spec 4.1 with the same tables, so the Dashboard (spec 5, slice Б6) is unchanged: tiles read `gold_fact_sales`, `gold_dim_customer` (`chain_name`, `customer_id`), `gold_dim_product`. The SQL is generated from the accepted links (`starSql(links)` in core; only expected links are accepted, so it always equals this text):

```sql
CREATE OR REPLACE TABLE build_kaiyo.gold_dim_customer AS
SELECT c.customer_id, c.customer_name, c.customer_type, c.chain_name, c.region_id, c.city,
       r.region_name, r.macro_region                                       -- new: the region on the customer
FROM build_kaiyo.clean_customers c
LEFT JOIN build_kaiyo.clean_regions r ON r.region_id = c.region_id;     -- your link L3

CREATE OR REPLACE TABLE build_kaiyo.gold_dim_product AS
SELECT product_id, sku_code, product_name, brand, category FROM build_kaiyo.clean_products;

-- the sales carry names and SKUs; the fact carries ids, looked up through your links
CREATE OR REPLACE TABLE build_kaiyo.gold_fact_sales AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM build_kaiyo.clean_sales s
LEFT JOIN build_kaiyo.gold_dim_customer c ON c.customer_name = s.customer_name   -- your link L1
LEFT JOIN build_kaiyo.gold_dim_product p ON p.sku_code = s.sku_code;             -- your link L2
```

The two region columns are added **at the end** of `gold_dim_customer`, so every column the v1 SQL had keeps its place. ✱ Numbers after Build the star, right state: fact 3,000; customers 144 (45 with sales), every one with a region; products 47 (29 with sales); fact rows without customer 0, without product 0 (same as Б6's v1 check, spec 4.1).

**What becomes of v1.** v1's Model screen (`ModelScreen.tsx`, Б6) is replaced, not kept beside it. State:

- `BuildState` gains `links: Link[]` (accepted links, both passes) and `star: boolean` (Build the star ran). `readBuild` drops links that are not in the expected list or whose pass is 2 without `star`.
- **Model done** = F1 and F2 accepted. A state saved by v1 with `model` done (no `links`) keeps it done: the Dashboard stays open, the gold tables are the same numbers. Its Model screen then shows the v1 star drawn read-only, with one line: "New: link the tables yourself." and **Try it**, which clears links and `star` only (not the done flag; the gold tables stay until the next Build the star overwrites them with equal numbers). ✱
- Removing a pass-1 link after Build the star clears pass 2 but not the gold tables or the done flag of Model: the Dashboard keeps working on the star last built. ✱ (A learner who breaks a link should not lose the dashboard; Build the star again is one click.)
- **Start from scratch** (frame) clears links and star too.

## 7. Open as a model (Б8) and DuckDB foreign keys

### 7.1 What DuckDB 1.5.6 does with keys (checked on a small script, Python package, 2026-11-08)

| Statement | Result |
|---|---|
| `ALTER TABLE dim ADD PRIMARY KEY (id)` on a table made by `CREATE TABLE … AS` | **works**; shows in `duckdb_constraints()` (PRIMARY KEY + NOT NULL) |
| same, when `id` has duplicates | `Constraint Error: Data contains duplicates on indexed column(s)` |
| `ALTER TABLE fact ADD FOREIGN KEY (cid) REFERENCES dim(id)` (also with `ADD CONSTRAINT`) | `Not implemented Error: No support for that ALTER TABLE option yet!` |
| `ALTER TABLE … ADD UNIQUE (…)` | same Not implemented |
| `CREATE TABLE … (cid INTEGER REFERENCES dim(id)) AS SELECT …` | Parser Error: no constraints in CTAS |
| `CREATE TABLE fact (cid INTEGER REFERENCES dim(id), …)` then `INSERT … SELECT` | works; FK in `duckdb_constraints()` with `referenced_table`, as `schemaForModel` reads it |
| insert a key the dim doesn't have | `Constraint Error: Violates foreign key constraint because key "id: 3" does not exist…`; NULL keys pass |
| FK to a column with no PK / UNIQUE | `Binder Error: … does not have a primary key or unique constraint on the columns name` |
| `CREATE OR REPLACE TABLE dim AS …` while a fact refers to it | `Dependency Error: Cannot drop entry "dim2" because there are entries that depend on it.` |
| `DROP TABLE dim` while referenced | `Catalog Error: Could not drop the table because this table is main key table of the table "fact2"` |
| `DELETE` a dim row still referenced | Constraint Error; `UPDATE` of a non-key column and `ADD COLUMN` on the dim work |
| `CREATE OR REPLACE` the fact (the child), `DROP SCHEMA … CASCADE` | work |

To re-check in DuckDB-WASM 1.33.1-dev57 with the Б8 tests (same core family, expected the same).

### 7.2 Decision: no keys in the work tables; the page adds them to the DDL it sends ✱

Real FKs in `build_kaiyo` would break the page's own rebuilds: Build the star and every Clean change re-create the dimensions with `CREATE OR REPLACE`, which a referenced table refuses; Start from scratch would have to drop in order; and a fact can only get an FK through an explicit `CREATE TABLE` plus `INSERT`, not `ALTER`. The keys are a fact of the learner's model, not of the data, so they travel in the text:

- New in `src/db/modelExport.ts`: `showTablesAsModel(tables: ModelTable[], label)`, the body of `showAsModel` after `schemaForModel` (`showAsModel` calls it; no change for its callers).
- The page: `schemaForModel('build_kaiyo')` → keep the three gold tables → set `primaryKey` (`customer_id`, `product_id`) on the dimensions and `foreignKeys` on the fact from the accepted F1, F2 → `showTablesAsModel(tables, 'Kaiyo sales star')`. `modelDdl` already writes `PRIMARY KEY (…)` and `FOREIGN KEY (…) REFERENCES …` and orders the dimensions first (`ordered`).
- Not checked: how Model (StrataSQL) draws a table with FKs and no primary key (the fact) and whether it reads the relationship's cardinality from `FOREIGN KEY` alone. Б8 checks it with a fixture in model `tests/fixtures/stratalab/` (another repository: its own commit; per the root rule the receiving side goes first if its parser needs a change).

## 8. Slices for Sonnet

Each ends with `npm test` and `npm run build` green, a check in the production preview (`lab-preview`, 5181) and a ROADMAP.md line; minor version bump per slice. Order: after Б6 (the v1 Model screen and the Dashboard exist), Б5a → Б5b → Б8.

### Б5a. Rules, checks and star SQL, no UI (M)

**Files:**
- `src/core/buildLinks.ts` (new, pure): `Slot = { table, column }`, `Link = { id, many: Slot, one: Slot }`, `typeFamily(duckType)` (8.1), `LinkFacts` (the numbers of 4.4), `diagnoseLink(facts, expected)` returning `{ chips, line, notes }` in the order of 4.2, `matchExpected(pair, pass)`, `starSql(links)` (section 6), `swap(pair)`.
- `src/data/build/kaiyoSales.ts`: `EXPECTED_LINKS` (L1 to L3 pass 1, F1, F2 pass 2), box positions per pass (5.1), `BUILD_DIAGNOSIS.link` (4.5), hints, P7 card texts (8.2).
- `src/db/buildRun.ts`: `linkFacts(port, many, one)` running the SQL of 4.4 (skip Found on a type mismatch; the N-side uniqueness query too), `buildStar(port, links)` replacing v1's `buildStar(port)`.
- `src/core/build.ts`: `links`, `star` in `BuildState`; `readBuild` repair (section 6); `modelDone(state)`.
- `tests/buildLinks.test.ts` (new, unit): `typeFamily`, every row of 4.3 as facts → expected diagnosis, `swap`, `starSql` text, state repair (unknown link dropped, pass-2 link without star dropped, v1 state kept done).
- `tests/buildModel.test.ts` (new, `duckdb-node-blocking` on the real parquet, as `tests/pipeline.test.ts`): every row of 4.3 through `linkFacts` with the clean tables built by the page's own SQL in each state; `starSql` gives the numbers of section 6 and the same tile results as Б6's tests.

**Done when:** the numbers of 4.3 and 6 are asserted; `diagnoseLink` returns the line of 4.2 for each row; no UI change.

### Б5b. The screen and P7 (L)

**Files:** `src/ui/build/ModelScreen.tsx` (replaces v1's body: two passes, tabs Clean tables / Star, links list, Build the star with its SQL, Continue), `src/ui/build/LinkCanvas.tsx` (new, SVG of 5.1), `src/ui/build/LinkPanel.tsx` (new, 5.2), `src/ui/build/build.css`, `src/ui/build/CleanScreen.tsx` (card P7, shown once Model asked; **Extract number** button in the toolbar), `src/core/buildSteps.ts` (the Extract number generator of spec 2.6, `checkP7` facts), `src/db/buildRun.ts` (`checkP7`).

**P7 (new card in Clean, regions):** "region_id is written R-01 … R-16 here and 1 … 16 in customers. Make it a number so the two can be linked." Expected: Extract number on `region_id` → `CAST(regexp_extract(region_id, '[0-9]+') AS INTEGER)` (gives INTEGER 3 for `R-03`, CLI). Passes when the type family is number and `clean_regions` equals `ref_regions` both ways (16 rows, 0). Hints: 1. "The number is inside the text: R-03 is region 3." 2. "Extract number on region_id."

**Done when:**
- The right path in the preview at 1366 × 768: L1, L2, L3 fails on types → Fix in Clean → P7 → back, L3 passes → Build the star (SQL shown) → F1, F2 → Continue → Dashboard tiles still 314,906.13 / 30 points / Minori first.
- Shown live, one each: Swap fixing L1 swapped (`wrongWay`), `noMatch` on chain_name with samples, F-x giving `sameByChance`, a removed P1 step giving `unmatched` 714 with Back to Clean.
- Reload keeps links and star; a v1 state keeps Model done and shows Try it.
- 1024, 800 and 375 px as in 5.3; keyboard: Tab to a column row, Enter picks; both themes (dashed red readable in dark).
- Checked with `quaera-screen-review` before the commit.

### Б8. Open as a model (S)

**Files:** `src/db/modelExport.ts` (`showTablesAsModel`), `src/ui/build/ModelScreen.tsx` (button **Open as a model ↗** after Continue), `tests/modelLink.test.ts` (extend: the star's DDL has two PRIMARY KEY lines, two FOREIGN KEY lines, dimensions first), a DuckDB-WASM or node test of 7.1's rows that matter (ADD FOREIGN KEY not implemented, CREATE OR REPLACE of a referenced table refused) so a DuckDB upgrade that adds them is noticed; in the model repository its own commit with a fixture `tests/fixtures/stratalab/kaiyo-star.sql` and a test that it imports with two relationships.

**Done when:** the button opens model.quaera.app (or the dev Model on 5173) with three entities and two relationships; the two repositories' commits are separate.

### 8.1 Type families (for `typeFamily`)

text: `VARCHAR`, `VARCHAR(n)`; number: `TINYINT`, `SMALLINT`, `INTEGER`, `BIGINT`, `HUGEINT`, the `U…` ones, `DECIMAL(p,s)`, `DOUBLE`, `FLOAT`; date: `DATE`, `TIMESTAMP…`; anything else: other (never matches, line "This type can't be a key here"). INTEGER against BIGINT passes (L3 after P7, F1, F2 when Б2 detects BIGINT). Decimal against whole number passes the chip, but no expected link has it.

### 8.2 Performance

Every chip query is a scan of at most 3,000 rows; run them in one `Promise.all` per change, cancel the stale run's result by a counter (no Stop needed). Expect well under 100 ms in WASM; if not, cache `linkFacts` by the pair while the clean tables don't change.

## 9. Choices made here (✱, for the hub to confirm)

- ✱ Two passes: lookups by name and SKU by hand, Build the star as a shown button, then the id links by hand (3.3).
- ✱ L3 always fails on types and sends the learner to a new Clean card P7 with Extract number; Clean stays done (3.4).
- ✱ Region goes into `gold_dim_customer` (two columns at the end), no `gold_dim_region`; the star keeps three boxes.
- ✱ A **Right pair** chip: links outside the expected five are refused even when the data checks pass (F-x).
- ✱ Create link only when every chip passes; failing pairs are drawn dashed with their number, not created.
- ✱ No key icons until a link is made; fixed box positions; no drag.
- ✱ Under 768 px: lists instead of the drawing.
- ✱ v1 states keep Model done; removing a link doesn't lock the Dashboard.
- ✱ No FKs in DuckDB tables; Model gets them in the DDL text (7.2).

## 10. Questions for the hub

1. **Second pass or not** (3.3): the learner draws F1 and F2 (recommended), or Build the star draws them. The F-x trap exists only in the first case.
2. **P7 in this slice.** It turns a "later" Clean problem into part of Б5b. Alternative: keep P7 out and leave regions out of the star (only L1, L2 in pass 1), the type trap then has no case on this data.
3. **Phone.** The frame has no "Open on a laptop" screen; the pipeline has one. One choice for the whole build page, or per step (this step has its list fallback either way)?
4. **Order with Б6.** This design assumes Б6 ships v1's Model screen first and Б5b replaces it. If Б5 comes before Б6 is written, Б6 can skip `ModelScreen.tsx` and only provide `buildStar` for its tests.
5. **Peek (hub decision 1 of the spec).** The peek after Connect shows the wrong KPI before cleaning. Should the Model step also show the effect of a link on a number (for example the H1 chain table under the panel, recomputed with the pair in the slots: 3,385 rows, Nagisa first)? It would make F-x and `notUnique` visible as money, at the cost of one more query per change.

## 11. Hub decisions (2026-11-08)

1. Second pass: the learner draws F1 and F2 by hand; the F-x trap stays. Linking is the heart of the page.
2. P7 goes into Б5b; regions stay in the star, so the key-type trap has its case.
3. Phone: one "Open on a laptop" screen for the whole build page below 768 px, as on the pipeline page; the list fallback of this step stays for narrow laptop windows.
4. Order: Б6 ships the v1 Model screen first, Б5b replaces it.
5. Yes: the Model step shows the H1 chain table recomputed with the current pair, so F-x and `notUnique` show up as money.

## 12. Reference screenshots (`research/fabric-screens-2026-11/`, read 2026-11-08)

Nine files from the owner. Two of them show the linking screen itself (`power bi relationships.png`, `celonis (1).jpg`); the rest are notes for other steps of the page or for the pipeline page.

### 12.1 The linking screen

| File | What is on it | Take | Don't take |
|---|---|---|---|
| `power bi relationships.png` | Power BI Model view of a bike sales model: the fact `Bike_Data` in the middle (`Business_Segment_ID`, `Category_ID`, `Color_ID`, Σ `Cost`, `Country_ID`, `Customer_ID`, Σ `ListPrice`, `Model_ID`, Σ `OrderQty`, scrolled), seven dimensions around it, each with two columns (a name and an `_ID`), "Collapse" under every box. Lines with right angles; on the box edges a boxed `1` at the dimension end and a boxed `*` at the fact end; a small triangle in the middle of each line (filter direction) | The star with the fact in the middle (our pass 2 already); right-angle lines with boxed end marks (5.1 changed); Σ on measures (5.1 changed); a table icon in the box header | The filter-direction triangle; Collapse and the ⋯ menu per box (our boxes are short); scrolling inside a box (our widest box has 8 columns, all shown); seven dimensions (ours has two, which keeps the star readable) |
| `celonis (1).jpg` | Celonis **Foreign key settings** dialog: left "Dimension table (1)" with a table select, right "Fact table (N)" with a table select, **Swap tables** at the top between them; under each, the chosen key pinned (`CASE_KEY` and `_CASE_KEY`) and joined by a line across the dialog, a Search box, the full column list with type marks ABC / 123 / DATE and a key icon per row; Cancel, Save | Each slot as a list of the table's columns with type marks, the chosen one pinned, the two joined by a line (5.2 changed); a table select per slot; Swap (already) | Save without any check (we run four chips before Create link); a key icon per row (we pick by clicking the row); Search (at most 8 columns here); the 1 slot on the left (we keep N first, 5.2; Swap covers it). Celonis allows several key pairs in one link; ours never needs a composite key |
| `celonis (4).jpg` | Celonis **Data Model** canvas "Pizzeria Mamma Mia": three boxes with machine names (`ub9jfkdu98v1-piz…`), each listing only its key columns (`_CASE_KEY`, `CUSTOMER_ID`), **Set Identifier** and **New foreign key** per box, dashed lines between boxes with no end marks; a yellow banner "Missing Identifiers", said to be optional; Eventlog automerge, Search tables, Add Tables, **Set foreign Keys**; Auto Align and zoom | Nothing new: "1" and "N" are set in the dialog and not seen on the canvas, the weakness our boxed marks fix | Key-only boxes; unmarked dashed lines; a warning that can be ignored (section 2); Auto Align and zoom (fixed layout, 5.1) |

Nothing in these frames goes against the checks of section 4: neither tool shows on the canvas whether rows find a partner or whether the "1" side is unique. Power BI does refuse a "1" side that repeats when the relationship is made, but that dialog is not in the set (12.4).

### 12.2 Other screenshots, for other steps

| File | What is on it | Where it belongs |
|---|---|---|
| `celonis (2).jpg` | Data Models wizard, step 3 of 3 (Tables, Activity Table, Process): the event table with columns mapped to roles by chips (Case ID, Sorting, Timestamp, Activity name; mapped columns green, `AUTOMATION` and `_CELONIS_CHANGE_DATE` grey) | Process mining only; not this page (the direction is Fabric, not process mining, NOTES 5) |
| `celonis (3).jpg` | File upload preview of `Pizza_Event_Pizzeria_Event` with the **Sheet has header row** tick and a 20-row preview, Previous / Next | Connect (spec 2.5): matches the card with a preview; the header tick is a setting trap the spec keeps out of v1 |
| `celonis (5).jpg` | Data Pool overview (a video frame): Input (Connect to Data Source), Data Processing (Schedules; Data Jobs with Extractions 0, Transformations 0, Data Model Loads 0), Output (Objects and Events, Data Models 0), Query Engine; "You don't have any Data Models yet" | The frame's step strip: counters that grow as steps are done (already in NOTES 5.4); not this screen |
| `fabric pipeline.png` | Fabric Data pipeline `PL_IMSALES_LOAD_STG`: three Script activities ("SQL clear sales facts in stg" and others), a Wait "Wait for cleaning", then Copy data "load stg dim client" and Dataflow "DF Load DIM Shipper"; success, failure, skip and completion ports on each block; General tab with Activity state, Timeout `0.12:00:00`, Enable retries | The pipeline page `#pipeline=kaiyo-sellout` (orchestration), not the build page; its "Runs when the previous step: Succeeded / Completed" already copies these ports |
| `fabric tranform.png` | Power Query (Dataflow Gen2) on a shipper table, 6 rows, shippers 1 to 3 each twice; Applied steps Source, Navigation (four), Imported CSV, Promoted headers, Changed column type, **Kept duplicates** (selected, with ✕); the formula bar shows that step's M (`Table.Group(… "Count", Table.RowCount …)`); column headers with type marks (1²3, ABC); status bar "Completed (7.61 s) Columns: 5 Rows: 6"; Data destination Warehouse | Clean and the applied steps: 12.3 |
| `fabric dashboard.jfif` | A Microsoft marketing image of the **OneLake catalog, Govern tab** (Domains 1, Workspaces 21, Items 175; bars of item types; Last refreshed; a donut of description coverage; Recommended actions). Not a sales report | The Dashboard only loosely: 12.3 |

### 12.3 Notes for Clean and Dashboard (the spec is not changed here)

**From `fabric tranform.png` to Clean and the applied steps (spec 2.6):**

- The list already matches ours: step name, ✕ on the selected step, the step's code in a bar above the table. Our folded SQL of a step is that formula bar.
- **A gear per step** to reopen its settings (Power Query has one on every step with settings). Spec 2.6 has only ✕; a gear on button steps (Keep latest row per key, Trim, Uppercase) that reopens the same settings and replaces the step saves a ✕ and a redo. Candidate for Б4 or later.
- **Click a step to see the table as it was after it.** Power Query's main teaching trick: the preview follows the selected step. With our chain of CTEs (spec 2.6) it is `SELECT * FROM step<k> LIMIT 10` under the same WITH: cheap. Candidate, high value.
- **Rows and columns after each step** in a status line ("Columns: 5 Rows: 6"): one line under the preview would show 3,110 to 3,000 at the step that does it.
- **Kept duplicates as a "find" step**: Power Query keeps only the repeated rows to look at them. Our Watch (spec 3.2) finds them with GROUP BY HAVING, the better lesson; a "Show duplicates" view (not a step) could come later.
- Don't take: M; Source and the four Navigation steps (our Connect is one card); the Data destination (the target is always `clean_<source>`); a ribbon of 30 icons (four buttons in v1); kind icons per step beyond a mark for "given".

**From `fabric dashboard.jfif` (and the Celonis View described in NOTES; no frame of it here) to the Dashboard (spec 5):**

- Big plain numbers with a small label (Domains 1, Workspaces 21, Items 175): the KPI tile as a number and its label, no decoration.
- Cards of equal height in a fixed grid, each with a title and one chart: supports the fixed two-column grid of spec 5.
- Don't take: the donut (one share reads better as a number); the Recommended actions cards; the marketing frame. A governance overview says nothing about lines or filters.

### 12.4 Screenshots missing after the first batch (status after 12.5 and 12.6 in brackets)

1. **Power BI New / Edit relationship dialog** [found, public: 12.6].
2. **Power BI Manage relationships list** [found, public: 12.6].
3. **Power Query Column quality, Column distribution, Column profile** [found, public: 12.6].
4. **Power Query: a step's settings dialog open** (Remove duplicates or Changed type) and **a step with an error** (the warning mark on a step) [still missing; Microsoft Learn's "Applied steps" page of Power Query may have the first; the second only from the owner's own Fabric].
5. **A Power BI report page** with a line chart, a bar or table visual and a slicer [still missing as a frame; Microsoft Learn's slicer and line chart articles have them, not opened yet].
6. **A Celonis View with KPI, chart, table, filter bar** [found: the owner's second batch, 12.5].
7. **Fabric semantic model, Model view in the browser** [still missing; only from the owner's own Fabric workspace or Microsoft Learn's "model view in the web" article].

### 12.5 Second batch from the owner (Celonis dashboards, `views.docx`)

| File | What is on it | For which step | Take | Don't take |
|---|---|---|---|---|
| `celonisdashb1.png` | Celonis **Sales Order Dashboard**: three KPI numbers in a row (# Sales Orders 312,436, # Sales Order Items 773,182, Total Net Order Value 542M), a column chart "# Sales Order by Month" (2016-07 to 2017-06, with "Month →" under the axis), a table by customer below with a column picker (Customer); filter bar on the right (Date, Sales Document, Country = Brazil) and the active filter shown as a chip at the top ("Country Brazil") | Dashboard (spec 5) and the later filter (spec 6) | The layout itself: KPI row on top, one time chart, a table under it; the active filter shown as a chip in the header, so a filtered number never looks like the total (answers NOTES 5.8's worry about a "hidden condition") | Short numbers like 542M on a learning page (the Answer step compares exact numbers: 314,906.13); a filter bar with many fields (one filter is enough) |
| `celonisdashb2.png`, `celonisdashb3.png` | "Build Filters in a View" (Academy, The Basics): tabs "Net Order Value 2022 / 2023", KPI row (Net Order Value, # Sales Orders, # Sales Order Items), a horizontal bar "Type of Sales", a line "Net Order Value" by month, a table by customer (Net Order Value, # Sales Order Items, Automation Rate); filter bar Open / Closed, Sales Order (ID, Creation Date, Processing Location), Customer (Name, Country); in edit mode the Settings tab of a Date range filter (Date dimension CreationTime, quick date ranges, calendar Single / Double) and a predefined filter chip "EMEA Customers" | Dashboard, filter | The same shape as our v1 dashboard plus one filter: KPI, line by month, a bar of categories, a table; filters grouped under the table they belong to (Sales Order, Customer), which is a model lesson: a filter on a dimension column narrows the fact through the link | Tabs per year (our line has 30 months in one); date range calendars; predefined filters |
| `celonisdashb.png`, `celonisproces.png` | Celonis Studio, "Introduction to Celonis Studio View": Process Explorer (object-centric, several activity streams with counts) and Variant Explorer (one variant, 19.5K objects, 39% covered); Settings with Eventlog, KPI Groups (Object count, Event count, Throughput Time), a Knowledge panel listing the model's tables and event logs | Process mining | Nothing for this page | Process and variant explorers (not this direction) |
| `celonisdashb4.png` | An empty View "Rejected Sales Orders View" in edit mode with the Components palette: Containers; KPIs (KPI list, KPI card); Process visualizations (Process Explorer, Network Explorer, Case Explorer); Tables; Category charts (video frame) | Dashboard | Already in NOTES ("palette of 5 to 6 cards"): confirms it | Free placement on the grid (fixed grid, spec 5) |
| `views.docx` (Celonis Academy course "Fundamentals of a View", 14 images and the course text) | An example dashboard "Sales Order Details" with five labelled parts (Process Explorer, KPI List, Chart, Table, Filters); a Bar component's Settings (Data: Dimensions "Each bar is a", Metrics "Length of bar shows", Tooltips, Annotation lines, Sorting, Limit); the PQL Editor (tables and columns on the left, the query in the middle, Name / Unit / Format on the right); KPI list settings (KPI 1 "# Customers" = `COUNT ("o_celonis_Customer"."Id")`, KPI 2 "# Countries" = `COUNT (DISTINCT … "Country")`, format "Rounded Number (#,###)"; Trend with a time dimension, Target; Style: label above or below, horizontal tiles or vertical list) | Dashboard | **The tile as "a question in words + one formula"**: Celonis asks "Each bar is a ___" and "Length of bar shows ___", which is our SQL with a blank said in plain words. Worth using as the prompt line of each tile (5.1: "What is one point of the line?"; 5.2 already close). The KPI as name + formula + format: our KPI tile with its blank is the same three things. `COUNT(DISTINCT …)` next to `COUNT(…)` as two KPIs: the same contrast as our wrong blanks `count(*)` and `SUM(revenue)` | PQL (we teach SQL); Trend and Target in v1; Annotation lines; YAML editor; Knowledge Model saving |

None of these change the linking screen: Celonis's views read a Knowledge Model built on the Data Model, and none of the frames shows the link check this design adds.

### 12.6 Public frames found (Microsoft Learn, not copied into the repository)

Opened 2026-11-08. The images are Microsoft's; they are linked here, not saved in `research/`.

| What | Where | What it shows | Effect on this design |
|---|---|---|---|
| **Edit relationship** dialog | learn.microsoft.com/power-bi/transform-model/desktop-create-and-manage-relationships, image `relationships-options-04.png` | Two table selects one above the other: `Sales` first with three preview rows, `ProductKey` column shaded; `Product` second with three rows, `ProductKey` shaded; Cardinality "Many to one (*:1)", Cross filter direction "Single", Make this relationship active, Assume referential integrity, Apply security filter in both directions; OK, Cancel | Confirms the "take" of section 2 about sample rows (ours: three distinct values per slot) and our order, many first (5.2). The same page states the error when neither column is unique: "One of the columns must have unique values"; our `notUnique` says the same with numbers. Its tutorial creates the relationship "the hard way" by hand and then admits Autodetect would have done it by column name: the reason we don't take Autodetect |
| **Create relationship** with Project / ProjName | same page, `candmrel_create_compproj.png` | Many side `ProjectHours.Project`, one side `CompanyProject.ProjName`: different names, same values | A real case for "names differ, link is right"; ours (L1 to L3, F1, F2) all have the same names on both ends, so the Right pair chip doesn't rely on names |
| **Manage relationships** list | same page, `candmrel_managerelactive.png` | Rows "From: Table (Column) → To: Table (Column)" with an Active tick; New, Autodetect, Edit, Delete | Our links list under the canvas: write each row as "sales (customer_name) → customers (customer_name)", the From / To shape of Power BI |
| **Column quality / distribution / profile** | learn.microsoft.com/power-query/data-profiling-tools, `data-preview-tools-enabled-v2.png` and `data-quality.png` | Under each header: Valid / Error / Empty with percentages, a small histogram, "5 distinct, 0 unique"; below the grid Column statistics (Count, Error, Empty, Distinct, Unique, Min, Max, Average) and Value distribution; status bar "12 COLUMNS, 701 ROWS", "Column profiling based on top 1000 rows" | For Clean (spec 3.0, P5 and P6 later): a quality bar under the header would show "1,567 don't cast" before any SQL. For linking: "distinct / unique" is the vocabulary of the One side chip (5.2 line added) |

Other public sources that likely have the remaining frames, not opened: Power Query "Applied steps" article (step settings), Power BI "Slicers" and "Line charts" articles (report page with a slicer), Power BI "Work with Model view in the web" / Fabric "semantic model editing in the service" (the web model view). The Microsoft Learn module "Design a semantic model in Power BI" and its exercise "Model data in Power BI Desktop" show the full star of Adventure Works with relationships, the closest public match to our pass 2.

### 12.7 What only the owner can capture

From the owner's own Fabric workspace (the one in `fabric tranform.png`), each a single screenshot:

1. The **semantic model** of the warehouse in the browser (Model view), with one relationship selected and the Properties pane open.
2. Power Query on the shipper table with **View → Column quality and Column profile** on, and the **Kept duplicates** step's gear dialog open.
3. A step that fails (for example Changed type on a text column that has letters), to see how Fabric marks an error on a step and in the grid.
4. Any report page built on that model with a **slicer** set to one value, to see how Power BI shows that a number is filtered.

### 12.8 The owner's own Fabric, third batch (`research/fabric-screens-2026-11/additional/`, read 2026-11-09)

The owner's course workspace has tables but no data rows yet, so previews and visuals are empty; the frames still answer items 1 to 3 of 12.7 and half of item 4. Files 6 and 7 are the same image (same MD5); 1 and 2 repeat what 3 and 4 show.

| File | What it shows | Effect on this design |
|---|---|---|
| `3. relationship properties.png` | **New relationship** dialog in the web model view: From table `stg_fact_sales` with column tabs `fk_client`, `fk_date`, …; To table `stg_dim_client` with `bk_client` selected; Cardinality "Many to one (*:1)", Cross-filter direction "Single", Make this relationship active (ticked), Assume referential integrity; a note that **Direct Lake tables don't show previews or validate cardinality and cross-filter direction**, which "may need to be changed manually" | Confirms our From (many) above To (one) and the column-as-tab pick. The note is the teaching moment for our screen: Fabric guesses the cardinality from row counts and does not check it; Lab does check, so the result line says it with numbers (shape: "customers: 144 rows, keys unique · sales: N rows found no customer", numbers from the run). Cross-filter and Active are not choices in v1 (one path per pair); show them as fixed read-only text "Single · Active" so the words are met once |
| `4. active rel.png` | Model view with one link `stg_dim_client` → `stg_fact_sales`: "1" at the dimension end, "*" at the fact end, a small arrow on the line pointing from one to many; Properties pane: Table / Column twice, Cardinality, Make this relationship active, Cross-filter direction, Apply changes | Our canvas draws the same three marks: "1", "*", and the filter arrow from the one side to the many side. Our list row stays "sales (customer_name) → customers (customer_name)" (12.6) |
| `5. column quality.png` | Power Query on the shipper CSV with View → Column quality on: under each header Valid / Error / Empty in percent; six rows where rows 4 to 6 repeat 1 to 3; Applied steps Source, Navigation ×5, Imported CSV, Promoted headers, Changed column type; Data destination Warehouse; status bar "Column profiling based on top 1,000 rows" | Duplicates are visible by eye only, Column quality says 100 % valid: a good line for P2 ("quality bars say all valid; duplicates are a different check"). The quality strip under the header is a candidate for Quick look (spec 2.5), not for v1 |
| `6.` = `7. remove duplicates.png` | Same query after Removed duplicates | Nothing new |
| `8. intentional error (text to whole number).png` | Changed column type on `CompanyName` to Int64: every cell shows `[Error]`, the header bar turns red with Error 100 %, the failed step stays last in Applied steps with a spinner; the formula bar shows the M step | The model for a failing step in Clean (P4 to P8 later): keep the step in the list, mark it, show `[Error]` in the cells and "Error 100 %" over the column, so the learner removes or fixes it with ✕. DuckDB fails the whole query instead of per cell, so we get this look with `TRY_CAST` and a count of NULLs it made, not with a raised error |
| `9. vis page slicer card (error).png` | Report page: a slicer on `client_name` as a radio list with "Acme Corporation" chosen, a card "Sum of sales_unit_qty" with "Error fetching data for this visual" (no rows yet); Filters pane "Sum of sales_unit_… is (All)" | How a filtered number looks is still not seen (no data). For the filter (spec 6, hub's design later): slicer as a short radio list; the card must say which filter it obeys, since Power BI's own cue is only in the Filters pane |

Nothing more is needed from the owner for Б5. For the filter design, one frame with data would still help: a card under a slicer set to one value. The owner's click-by-click guide (`stanislavsidorovich.github.io/imsales-fabric-guide`) names the path LH sources → pipeline load to staging → staging warehouse → Dataflow → DW; keep it for the path captions in Б8, not now.
