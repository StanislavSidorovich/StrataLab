# Build by hand: the linking screen (Model step, Б5)

Design for the Model step of `#build=kaiyo-sales` once the learner links the keys by hand (2026-11-08, Opus). No code here: Sonnet sessions write it from this file, in the slices of section 8. It extends `docs/build-kaiyo-sales-spec.md` (the "spec" below): section 4.2 there has the pairs and the first checks; this file decides the screen, the moves, the states and the texts, and replaces the v1 star of spec 4.1 without breaking the Dashboard.

Sources: spec sections 1, 4, 7, 10, 11; `research/celonis-case-study-2026-11/NOTES.md` 5.4 to 5.6 and the owner's screenshots described there (Celonis foreign-key dialog: "Dimension table (1)" left, "Fact table (N)" right, **Swap tables**, type icons ABC / 123 / DATE). **No screenshots folder** `research/fabric-screens-2026-11/` existed on 2026-11-08: what is said below about Power BI's Model view and Manage relationships and about Fabric's semantic model is from general knowledge of those products, not from frames, and should be checked against screenshots if the owner adds them.

All numbers were computed with DuckDB 1.5.6 (Python) on `lab/public/datasets/quaera/*.parquet`, with the SQL of the spec (2.2, 2.4, 3.1) for the right clean state (W, P1, P2, P3, the given step), plus the spoiled states named in each row. The scratch script is not committed (as in Б1); `tests/buildModel.test.ts` (slice Б5a) replaces it.

---

## 1. What the step teaches, in one paragraph

Sales name the store and the product by text (`customer_name`, `sku_code`); the reference files have ids. A model needs two moves, and the learner makes both: **first link each text column to the table that describes it** (that link is a lookup: it is how the ids reach the sales), **then link the fact to the dimensions by id** (that link is the relationship a dashboard joins on and a Power BI model keeps). On the way the learner meets the three things every relationship dialog asks about and Celonis never checks: which side is "1", whether the types match, whether every row finds its partner.

## 2. Take and don't take (Power BI, Fabric, Celonis)

| Product idea | Verdict | Why |
|---|---|---|
| Celonis: one panel with a "1" slot (dimension) and an "N" slot (fact), **Swap tables** between them, type icons on columns | **Take** | Direction is a choice the learner makes and can get wrong; the Swap button is the cheap repair. This is the core of the screen |
| Power BI Model view: boxes, a line with `1` and `*` at the ends | **Take**, with `1` and `N` (the words of the spec and the courses) | The learner reads cardinality off the drawing |
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
- **Line:** from the N column row's edge to the 1 column row's edge, a cubic curve; `N` and `1` as small labels at the ends; the label at the midpoint, a pill with the main number. Accepted: solid, `var(--accent)`. Pair in the panel and failing: dashed `var(--danger)` with the failing number ("714 not found", "3,385 rows"). Pair in the panel, still running: dashed `var(--muted)`.
- **Selection:** a picked column row gets the accent outline and the slot letter (N or 1) at its left; column rows are `<g role="button" tabindex="0">` with an `aria-label` ("sales, customer_name, text"), Enter picks.
- Under the canvas: the links list (L1… with ✕) and the action of the pass (**Build the star** / **Continue**) with its lock reason ("Link the three tables first: 2 of 3").

### 5.2 Panel (right of the canvas)

Top to bottom: title "New link"; slot **Many (N)** with "the column that refers" and three sample values; the **⇄ Swap** button; slot **One (1)** with "the column it refers to" and samples; the chips row; the diagnosis line (with Fix in Clean / Back to Clean / Swap as an inline button when the text points to one); notes; **Show the SQL**; **Create link**. Each slot has a table select and a column select under it (the keyboard and narrow-screen way, 7.4), synced with clicks on the canvas.

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
