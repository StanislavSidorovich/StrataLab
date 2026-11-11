# Build by hand: `#build=kaiyo-sales`

Spec Б1 for the build-by-hand page (2026-11-08, Opus). No code here: the code is written by Sonnet sessions from this file, in the slices of section 9. Format follows `docs/pipeline-mvp-spec.md`. Source of the idea: `research/celonis-case-study-2026-11/NOTES.md`, section 5 (one folder up from `lab/`). The page frame (five steps, lock, localStorage, the address) is already in `src/core/build.ts` and `src/ui/build/BuildPage.tsx` (commit `070d17d`); this spec fills the steps.

Hub decisions (2026-11-07/08), not to be reopened in the code sessions:

- A new page `#build=kaiyo-sales`, not a mode of `#pipeline=kaiyo-sellout`. The engine is shared: `SqlPort` / `enginePort` (`src/db/pipelinePort.ts`), `exportText` (`src/db/pipelineRun.ts`), `compareResults` (`src/core/check.ts`), `checkBlank` (`src/core/pipeline.ts`), the Watch → Now you pattern of `storesByRegion.ts` + `PipelineTutorial.tsx`, `#lab-done=`.
- Kaiyo's own data: sales (the 30 monthly exports cut from `staging_raw_sellout`), customers, products, regions. The three reference files are spoiled by SQL at load time; the trainer's dataset does not change.
- Cleaning is buttons and SQL with a blank, mixed. Every button shows the SQL it generated, and the steps done pile up as a list, like Applied steps in Power Query.
- Keys are linked inside Lab on an SVG schema; Model is only an "Open as a model" bonus at the end.
- First version: Connect → one watched example → clean the duplicate and 1 to 2 more problems → a dashboard with a KPI tile and a line (plus a table, if cheap). The filter and the linking screen come later.

All numbers in this file were computed with DuckDB 1.5.6 (the Python package, same core as the CLI 1.5.6) on `lab/public/datasets/quaera/*.parquet`, with the exact SQL below and the files written as described in 2.3. The script is reproduced in short in section 8. Section 8.2 lists what must be re-checked in DuckDB-WASM.

---

## 1. Scenario

**Business question (Head of Sales):** "How are we selling this year, and which chain is carrying it?" Three answers on the last screen: H1 2026 revenue, the best month of 2025, the top chain in H1 2026.

**What the learner does, in the order of the five steps of the frame:**

1. **Connect**: four sources on the desk (a folder of 30 sales exports and three single files), each read into a bronze table; a preview and the row count.
2. **Clean**: one watched example on `regions.csv`, then three problems: wrong SKUs in `products.csv` (buttons), sales sent twice (SQL with a blank), stale customer rows (a button with settings). Each fix adds an applied step; each problem has a check.
3. **Model**: in v1 the star is built for the learner and shown with its numbers (two links, every sale found). The linking screen is later (section 4.2).
4. **Dashboard**: a KPI tile and a line, each SQL with one blank, and a table of chains (given SQL).
5. **Answer**: three questions, numbers typed by the learner, checked against the reference.

**Why these problems matter (all checked in section 7):** each one changes a number on the dashboard if left in.

- 110 sales sent twice put Nagisa first (95,406.98) instead of Minori (90,829.50), as in the MVP; the H1 KPI becomes 331,604.58 instead of 314,906.13.
- 4 stale customer rows (two Nagisa stores, one Kaigan, one Prima) fan the join out: the fact grows from 3,000 to 3,385 rows, the KPI becomes 371,314.73, and the chain table shows **Nagisa 181,702.88, Kaigan 103,939.96, Minori 90,829.50**. The stale stores' sales are counted twice in the fact and twice again when the table joins the dimension.
- 6 spoiled SKUs leave 714 of the 3,000 sales without a product: the brand view (later: the filter) loses 28,609.05 of Fruvia's 100,004.67 in H1 2026.

---

## 2. Engine and files

### 2.1 Schema and preparation

- Everything lives in schema `build_kaiyo` of the user's Lab database (visible in the tree, as `pipe_kaiyo` is). ✱
- **Preparation, once per page open** (as `prepare` in `pipelineRun.ts`, shared promise per port):
  1. `CREATE SCHEMA IF NOT EXISTS build_kaiyo`.
  2. Source tables from Lab's parquet (`port.parquet('quaera', …)`): `src_raw_sellout` ← `staging_raw_sellout.parquet`, `src_customer` ← `dim_customer.parquet`, `src_product` ← `dim_product.parquet`, `src_region` ← `dim_region.parquet`.
  3. Reference clean tables `ref_*` (2.4), then the file tables `file_*` (2.2).
  4. The file texts (2.3), registered with `port.registerText`.
- Work tables (dropped by "Start from scratch", `src_*`, `ref_*`, `file_*` kept): `bronze_sales`, `bronze_customers`, `bronze_products`, `bronze_regions`, `clean_sales`, `clean_customers`, `clean_products`, `clean_regions`, `gold_dim_customer`, `gold_dim_product`, `gold_fact_sales`, `tile_kpi`, `tile_line`, `tile_chains`.
- State kept in localStorage under the frame's `BUILD_KEY` (`stratalab.build.kaiyo-sales`): the done steps (frame), and per source its applied steps (2.6), the blanks typed, the tile blanks, the answers. Tables are rebuilt from the saved steps when the page opens (the chain is cheap: well under a second for 3,110 rows).

### 2.2 The four sources

| # | Source on the desk | Registered as | From | Grain | Key | Rows in the file | Rows clean |
|---|---|---|---|---|---|---|---|
| 1 | `sales/` folder, 30 files `export_2024-01.csv` … `export_2026-06.csv` | `build_kaiyo/sales/<source_file>` | `staging_raw_sellout`, cut by `source_file` (as the pipeline does) | one line of a distributor export | `raw_id` (line number); a sale is `sale_date + customer_name + sku_code` | 3,110 | 3,000 |
| 2 | `customers.csv` | `build_kaiyo/customers.csv` | `dim_customer` + 4 stale rows | one customer (store or distributor) | `customer_id`; the sales refer to it by `customer_name` | 148 | 144 |
| 3 | `products.csv` | `build_kaiyo/products.csv` | `dim_product`, 6 SKUs spoiled | one SKU | `product_id`; the sales refer to it by `sku_code` | 47 | 47 |
| 4 | `regions.csv` | `build_kaiyo/regions.csv` | `dim_region`, one row twice, id as text | one prefecture | `region_id` (text `R-03` in the file, integer in customers) | 17 | 16 |

Sales are one source on the desk (a folder), read with the explicit list of 30 names, never a glob (as the MVP). ✱ Of the 144 customers 45 appear in the sales (the 12 distributors and most traditional stores have none); of the 47 products 29 do (Pyrexan, Gastrivo, Vitanor, Rhinolar are not in sell-out). Both are normal and the Model step says so, not an error.

**Columns of each file** (header line, in this order):

- sales: `raw_id;sale_date;customer_name;sku_code;units;revenue` (delimiter `;`, as the MVP exports)
- customers: `customer_id,customer_name,customer_type,chain_name,region_id,city,is_active,updated_at`
- products: `product_id,sku_code,product_name,brand,category,list_price`
- regions: `region_id,region_name,macro_region`

The three reference files use `,`: they come from another system than the distributor portal. ✱

**The file tables, exact SQL** (run in this order after the `ref_*` tables of 2.4):

```sql
-- customers.csv: four stores were moved in the CRM and their old row was never deleted.
-- The old row has the old city and region and an updated_at 400 days earlier.
CREATE OR REPLACE TABLE build_kaiyo.file_customers AS
WITH stale(customer_id, old_city, old_region_id) AS (
  VALUES (45, 'Fukuoka', 11), (52, 'Kawasaki', 2), (17, 'Shizuoka', 13), (25, 'Osaka', 3)
)
SELECT * FROM (
  SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active, updated_at
  FROM build_kaiyo.ref_customers
  UNION ALL
  SELECT r.customer_id, r.customer_name, r.customer_type, r.chain_name, s.old_region_id, s.old_city, r.is_active, r.updated_at - 400
  FROM build_kaiyo.ref_customers r JOIN stale s USING (customer_id)
) ORDER BY customer_id, updated_at;

-- products.csv: six SKUs typed by hand, lower case or with spaces at the edges.
CREATE OR REPLACE TABLE build_kaiyo.file_products AS
WITH bad(product_id, sku) AS (
  VALUES (2, 'aqua002'), (8, 'FRUV002 '), (13, ' KROS001'), (20, 'nett002'), (24, 'MILV001  '), (27, ' milv004')
)
SELECT p.product_id, coalesce(b.sku, p.sku_code) AS sku_code, p.product_name, p.brand, p.category, p.list_price
FROM build_kaiyo.ref_products p LEFT JOIN bad b USING (product_id)
ORDER BY p.product_id;

-- regions.csv: ids written as R-01 … R-16 (text), and Osaka sent twice, identical.
CREATE OR REPLACE TABLE build_kaiyo.file_regions AS
SELECT * FROM (
  SELECT 'R-' || lpad(CAST(region_id AS VARCHAR), 2, '0') AS region_id, region_name, macro_region FROM build_kaiyo.ref_regions
  UNION ALL
  SELECT 'R-03', region_name, macro_region FROM build_kaiyo.ref_regions WHERE region_id = 3
) ORDER BY region_id;
```

The four stale stores in `customers.csv` (current row last):

| customer_id | customer_name | old row: region_id, city, updated_at | current row: region_id, city, updated_at |
|---|---|---|---|
| 17 | Kaigan #1017 | 13, Shizuoka, 2025-02-20 | 5, Nagoya, 2026-03-27 |
| 25 | Prima #1025 | 3, Osaka, 2024-12-18 | 7, Uji, 2026-01-22 |
| 45 | Nagisa #1045 | 11, Fukuoka, 2025-01-07 | 16, Okinawa, 2026-02-11 |
| 52 | Nagisa #1052 | 2, Kawasaki, 2024-09-28 | 1, Tokyo, 2025-11-02 |

`is_active` is 1 in both rows on purpose: only `updated_at` tells which row is current, so "keep the active one" is not a way out. ✱

### 2.3 Writing the files as text

- **Sales**: exactly `exportText` from `pipelineRun.ts` (`;`, header line, `\n`, NULL as an empty field, a field with whitespace, `;` or `"` quoted). The 30 texts are the pipeline's texts byte for byte; only the registered names differ.
- **Customers, products, regions**: a small pure writer `csvText(columns, rows, delim = ',')` (new, in `src/core/`; reuse `src/core/csvWrite.ts` if it already does this): header line, `\n` after every line, NULL as an empty field, a field quoted when it contains the delimiter, `"`, a newline, or starts or ends with whitespace (`"FRUV002 "`, `" KROS001"`). Numbers as JavaScript prints them (`38`, not `38.0`), dates as `YYYY-MM-DD`.
- **Acceptance (true in the CLI):** each file read back with the Connect SQL of 2.5 equals its `file_*` table, `EXCEPT ALL` both ways = 0 rows; sales read back equal `src_raw_sellout` (with `raw_id` cast to INTEGER) = 0 rows both ways.

### 2.4 Reference clean versions

The checks compare the learner's clean tables with these, `EXCEPT ALL` both ways on every column.

```sql
-- sales: the MVP's reference silver, from the raw rows (3,000 rows)
-- = the "Changed type" step of 3.1 followed by de-duplication on sale_date, customer_name, sku_code ORDER BY raw_id
CREATE OR REPLACE TABLE build_kaiyo.ref_sales AS ...;   -- columns raw_id, source_file, sale_date, customer_name, sku_code, units, revenue

CREATE OR REPLACE TABLE build_kaiyo.ref_customers AS     -- 144 rows
SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active,
       DATE '2025-07-01' + CAST((customer_id * 37) % 360 AS INTEGER) AS updated_at
FROM build_kaiyo.src_customer;

CREATE OR REPLACE TABLE build_kaiyo.ref_products AS      -- 47 rows
SELECT product_id, sku_code, product_name, brand, category, list_price FROM build_kaiyo.src_product;

CREATE OR REPLACE TABLE build_kaiyo.ref_regions AS       -- 16 rows, region_id INTEGER
SELECT region_id, region_name, macro_region FROM build_kaiyo.src_region;
```

`updated_at` is not in `dim_customer`: it is made up here, deterministic, between 2025-07-01 and 2026-06-26 (2024-09-28 for the oldest stale row). The comparison is by value, so INTEGER in the reference against BIGINT in the learner's table is fine (true in the CLI).

**In v1 the reference for regions is the deduplicated text version** (16 rows, `region_id` still `R-01` …): the type fix belongs to the linking screen (problem P7). The check for regions in v1 is only "one row per region_id".

### 2.5 Connect

One card per source: name, size in rows, a 10-row preview, and **Connect**. Connect runs:

```sql
-- sales: everything as text, like the MVP bronze
CREATE OR REPLACE TABLE build_kaiyo.bronze_sales AS
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(<30 names>, delim = ';', header = true, all_varchar = true, filename = true);

-- customers / products / regions: types detected, as Power Query's Get Data does
CREATE OR REPLACE TABLE build_kaiyo.bronze_customers AS
SELECT * FROM read_csv(['build_kaiyo/customers.csv'], delim = ',', header = true);
-- same for products and regions
```

Detected types in the CLI (the card shows them under each column name, as icons or short words):

| bronze table | rows | columns and types |
|---|---|---|
| `bronze_sales` | 3,110 | all VARCHAR: raw_id, sale_date, customer_name, sku_code, units, revenue, source_file |
| `bronze_customers` | 148 | customer_id BIGINT, customer_name VARCHAR, customer_type VARCHAR, chain_name VARCHAR, region_id BIGINT, city VARCHAR, is_active BIGINT, updated_at DATE |
| `bronze_products` | 47 | product_id BIGINT, sku_code VARCHAR, product_name VARCHAR, brand VARCHAR, category VARCHAR, list_price BIGINT (every price is whole) |
| `bronze_regions` | 17 | region_id VARCHAR (`R-03`), region_name VARCHAR, macro_region VARCHAR |

Why sales are read as text and the others are detected: the sniffer reads the first file of a list to choose types, and the revenue of a later month written with a comma would then fail the whole load (not tested, a known sniffer limit); "bronze is text" is also the MVP's lesson. ✱ No setting traps on Connect in v1 (delimiter, header and Append are the pipeline's lesson). **Connect is done** when the four bronze tables exist with the row counts above.

When sales are connected, the page adds the given first step **Changed type** to sales (3.1), as Power Query adds "Changed Type" after a load, so `clean_sales` exists from here on.

### 2.6 Applied steps

Each source has a list of applied steps. A step is `{ id, label, kind, params, sql }`, where `sql` is a SELECT that reads `{prev}`. The clean table is always rebuilt from bronze through the whole list:

```sql
CREATE OR REPLACE TABLE build_kaiyo.clean_<source> AS
WITH bronze AS (SELECT * FROM build_kaiyo.bronze_<source>),
     step1 AS (<sql of step 1 with {prev} = bronze>),
     step2 AS (<sql of step 2 with {prev} = step1>)
SELECT * FROM step2;
```

- So steps can be removed (✕ on any step; the chain is rebuilt), and running twice changes nothing: "safe to run again" holds by construction. ✱ No step reads `clean_<source>` itself.
- Each step shows its label ("Trimmed sku_code") and, folded, its SQL with `{prev}` replaced by the name of the step before. **View full SQL** shows the whole `CREATE OR REPLACE TABLE … WITH …` statement, with **Open in a tab** (a normal Lab tab, so the learner can run it).
- Steps given by the page (Changed type) are marked "given" and cannot be removed in v1.
- Buttons write the full column list in their SQL, not `* REPLACE (…)`: it reads plainly and the same SELECT works in T-SQL. ✱

**Button vocabulary.** `<cols>` is the column list of the step before, in order; the button changes only its column.

| Button | Settings | SQL it generates (and shows) | v1 |
|---|---|---|---|
| Remove duplicates | none (whole rows) | `SELECT DISTINCT * FROM {prev}` | ✓ |
| Keep latest row per key | key column; order column; Newest / Oldest | `SELECT <cols> FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY <key> ORDER BY <order> DESC) AS row_no FROM {prev}) WHERE row_no = 1` (`ASC` for Oldest) | ✓ |
| Trim | column | `SELECT …, trim(<col>) AS <col>, … FROM {prev}` | ✓ |
| Uppercase | column | `SELECT …, upper(<col>) AS <col>, … FROM {prev}` | ✓ |
| Replace values | column, find, replace with | `… replace(<col>, '<find>', '<with>') AS <col> …` (strings quoted with `quoteString`) | later |
| Change type | column, type (Whole number, Decimal, Date), "decimal comma" tick | `… try_cast(<col> AS <type>) AS <col> …`; with the tick `try_cast(replace(<col>, ',', '.') AS DECIMAL(12, 2))` | later |
| Extract number | column | `… CAST(regexp_extract(<col>, '[0-9]+') AS INTEGER) AS <col> …` | later |

The buttons sit in one toolbar above the preview of the source's current clean table, for every problem, also where the problem is meant for SQL: the learner chooses, and the check judges the table, not the tool.

---

## 3. Clean

### 3.0 The dirty places

Ordered as shown. "Mode" is the way the card offers first; the check is by result, so another way that gives the reference table also passes.

| # | Source | Dirty place | Mode | Why this mode | Version |
|---|---|---|---|---|---|
| W | regions | Osaka sent twice, identical rows (17 rows, 16 prefectures) | button, **watched** | The simplest case: shows the loop find → fix → check and the applied steps list before the learner touches anything | **v1** |
| P1 | products | 6 SKUs lower case or with edge spaces; 6 sold SKUs not found, 714 of 3,000 sales without a product | buttons (Trim, Uppercase) | First own fix: two clicks, effect visible at once; teaches that a key must match to the character | **v1** |
| P2 | sales | 110 sales sent twice (3,110 → 3,000) | SQL with one blank (`PARTITION BY ____`) | The decision is the key of a sale: a choice to think through, not a click. Same blank as the pipeline, so a learner coming from there meets it again | **v1** |
| P3 | customers | 4 stores twice, old and current row (148 → 144) | button with settings (Keep latest row per key) | Comes right after P2: the button writes the same `ROW_NUMBER` the learner just wrote by hand ("you wrote this in P2"). Remove duplicates (from W) fails here, which is the lesson: rows that differ are not duplicates, someone has to pick the current one | **v1** |
| P4 | sales | 919 names with edge spaces; `Itiba` for `Ichiba` (261 rows). Raw names find no customer in 1,102 rows; trimmed, still 261 (on the 3,000 rows after P2: 889 spaces, 1,062 unmatched, 248 after Trim) | buttons (Trim, Replace values) | Found by the Model coverage check, which sends the learner here | **v0.33.0**, section 3.6 |
| P5 | sales | dates in six spellings; 1,567 do not cast to DATE (1,510 of the 3,000 rows after P2); slash dates are day first | button first (Change type fails, the rows are [Error]), then SQL with a blank (the slash format) | The button failing on real rows is the point; the format needs a decision | **v0.33.0**, section 3.6 |
| P6 | sales | decimal commas: 1,465 revenues, 113 units (1,412 and 112 after P2) | button first (Change type fails), then the same button with Decimal separator: comma | Mechanical once seen; the error shows what to set | **v0.33.0**, section 3.6 |
| P7 | regions | `region_id` is text `R-03`, integer in customers | button (Extract number) | Shows up only when linking (4.2): the type check fails there and sends the learner back | later (with the linking screen) |
| P8 | sales | 174 sales without revenue, 82 without units, 106 negative units (returns) in clean sales | info card, nothing to fix | "Not every odd value is an error": leave NULL, keep returns | **v0.36.0**, section 3.7 |

In v1 (up to v0.32.0) P4 to P6 were done by the given step **Changed type** (3.1): its SQL was the MVP's `typed` CTE, shown with one comment per fix. Since v0.33.0 the given step only types `raw_id` and the learner does P5, P6 and P4 (section 3.6); the files did not change, so the numbers of this spec stay. ✱ Work saved by v0.32.0 keeps the first given step and counts P4 to P6 as done (3.6).

Clean is done when W, P1, P2, P3, P5 and P6 all pass; P4 and P7 are extra cards the Model step asks for. The cards open one after the other (the next card unlocks when the previous passes), but every source's preview and toolbar stay usable.

### 3.1 The given step on sales: Changed type

Since v0.33.0 (what a loader does, nothing more):

```sql
SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    sale_date,
    customer_name,
    upper(trim(sku_code)) AS sku_code,   -- nett005 and NETT005 are one SKU
    units,
    revenue
FROM {prev}
```

Label: "Changed type (given): raw_id and source_file". 3,110 rows; `sale_date`, `customer_name`, `units`, `revenue` arrive as text. One line above it: "Lab only typed raw_id and tidied the SKU codes. Dates, numbers and names are as the distributors sent them: they are yours." ✱ The SKU codes are tidied here although the hub's text said raw_id and source_file only: 1,091 raw SKUs of the sales have case or edge spaces, and P1 (products) can only pass if the sales side is already clean; sales SKUs are not a problem of the learner.

The first version's step (**v0.32.0 and before**, `GIVEN_FULL_SQL`) did everything:

```sql
SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    CAST(CASE
      WHEN sale_date LIKE '%.%' THEN strptime(sale_date, '%d.%m.%Y')
      WHEN sale_date LIKE '%/%' THEN strptime(sale_date, '%d/%m/%Y')   -- 19/02/2024: day first
      ELSE strptime(sale_date, '%Y-%m-%d')
    END AS DATE) AS sale_date,
    replace(trim(customer_name), 'Itiba', 'Ichiba') AS customer_name,  -- spaces; one chain, two spellings
    upper(trim(sku_code)) AS sku_code,                                 -- nett005 and NETT005 are one SKU
    CAST(CAST(replace(units, ',', '.') AS DOUBLE) AS INTEGER) AS units, -- decimal commas
    CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2)) AS revenue
FROM {prev}
```

Label "Changed type (given): dates, numbers, names". The Quick look after Connect still reads the sales through it (the "Nothing done" numbers of section 7 are unchanged), and saved work that has it keeps it (3.6, last part).

### 3.2 W, watched: Osaka twice in regions

Shown like the warm-up's Watch: one step at a time, each with a caption, **Next** to go on, the SQL of each step visible. Then "Now you" opens P1. Nothing to type.

| Step | What is shown | SQL run | Result | Caption |
|---|---|---|---|---|
| 1 | Count | `SELECT count(*) FROM build_kaiyo.bronze_regions` | 17 | "regions.csv has 17 rows. Kaiyo sells in 16 prefectures. One row is too many, or a prefecture is new." |
| 2 | Find | `SELECT region_id, count(*) AS rows FROM build_kaiyo.bronze_regions GROUP BY region_id HAVING count(*) > 1` | `R-03`, 2 | "Group by the key and keep groups with more than one row: R-03 is there twice." |
| 3 | Compare | `SELECT * FROM build_kaiyo.bronze_regions WHERE region_id = 'R-03'` | two identical rows (Osaka, Kansai) | "The two rows match in every column. That is one row sent twice, safe to drop." |
| 4 | Fix | button **Remove duplicates** → step "Removed duplicates", SQL `SELECT DISTINCT * FROM {prev}` | `clean_regions` 16 rows | "The button wrote the SQL for you and added a step to the list. The file itself is never changed: steps run on a copy." |
| 5 | Check | `SELECT count(*) - count(DISTINCT region_id) FROM build_kaiyo.clean_regions` | 0 | "A check is a query that should return 0. Zero rows broken: the fix worked. You'll write checks like this for the next problems." |

Closing line: "Remove duplicates only helps when the rows match in every column. When they differ somewhere, it keeps both: you'll meet that in customers." Then **Now you**.

### 3.3 P1 (v1, buttons): SKUs in products

**Card:** "6 of the 29 SKUs in the sales files can't be found in products.csv as written." Under it, the six values as they are (`aqua002`, `FRUV002␣`, `␣KROS001`, `nett002`, `MILV001␣␣`, `␣milv004`, spaces drawn as a visible mark).

**Expected fix:** Trim `sku_code`, then Uppercase `sku_code` (either order). 47 rows.

**Hints:**
1. "Put AQUA002 from the sales next to aqua002 here. To the computer these are different words, and so are 'FRUV002 ' and 'FRUV002'."
2. "Two buttons on sku_code: Trim, then Uppercase."

**Checks (each 0 = ok):**

```sql
-- c1: SKUs not written the standard way
SELECT count(*) FROM build_kaiyo.clean_products WHERE sku_code <> upper(trim(sku_code));
-- c2: SKUs sold in the files that products can't find
SELECT count(DISTINCT s.sku_code) FROM build_kaiyo.clean_sales s
WHERE NOT EXISTS (SELECT 1 FROM build_kaiyo.clean_products p WHERE p.sku_code = s.sku_code);
-- shown with c2: sales rows without a product
SELECT count(*) FROM build_kaiyo.clean_sales s
WHERE NOT EXISTS (SELECT 1 FROM build_kaiyo.clean_products p WHERE p.sku_code = s.sku_code);
```

Passes when c1 = 0, c2 = 0 and `clean_products` equals `ref_products` both ways.

| State | c1 | c2 | sales rows without product (P2 not done / done) | diff vs ref |
|---|---|---|---|---|
| nothing | 6 | 6 | 746 / 714 | 12 |
| Trim only | 3 | 3 | 385 / 368 | 6 |
| Uppercase only | 4 | 4 | 478 / 458 | 8 |
| Trim + Uppercase (any order) | 0 | 0 | 0 / 0 | 0 |
| Trim on `product_name` | 6 | 6 | 746 / 714 | 12 |

**Diagnoses** (`DIAGNOSIS_TEXT` style, first match wins; values in `{}` come from the run):

```ts
skuCase: (left: string[]) => `Spaces are gone, but ${left.length} SKUs are still lower case: ${left.join(', ')}. Sales write them in capitals.`,
skuSpaces: (left: string[]) => `Capitals are right, but ${left.length} SKUs still have spaces at the edges: ${left.map((s) => `'${s}'`).join(', ')}.`,
skuWrongColumn: (col: string) => `The step changed ${col}. The column that has to match the sales is sku_code.`,
skuMissing: (n: number, rows: number) => `${n} SKUs sold in the files still find no product: ${rows} sales would have no brand or category.`,
```

Lists as in the CLI: case left after Trim only `aqua002, nett002, milv004`; spaces left after Uppercase only `'FRUV002 ', ' KROS001', 'MILV001  ', ' MILV004'`.

### 3.4 P2 (v1, SQL with a blank): sales sent twice

**Card:** "Some sales arrived twice: the same line in the same export. Keep one row per sale: what makes two rows the same sale?" (as the pipeline's prompt). The step is added to sales after Changed type; its SQL is in a small CodeMirror editor, read-only except the blank:

```sql
SELECT raw_id, source_file, sale_date, customer_name, sku_code, units, revenue
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY ____ ORDER BY raw_id) AS copy_no  -- 1 = first copy of a sale
  FROM {prev}
)
WHERE copy_no = 1
```

Blank rules: `checkBlank` from `src/core/pipeline.ts` (non-empty, ≤ 200 characters, no `;`, no comment, brackets balanced). **Apply** adds or replaces the step "Removed sales sent twice".

**Correct answers (by result):** `clean_sales` equals `ref_sales` on the seven columns, `EXCEPT ALL` both ways = 0. Pass, 3,000 rows each: `sale_date, customer_name, sku_code` (any order, any case), `source_file, sale_date, customer_name, sku_code`, `sale_date, customer_name, sku_code, units, revenue`.

**Hints:** 1. "Two copies of one sale share the date, the store and the SKU. Only raw_id differs." 2. "List those columns, separated by commas."

**Check (0 = ok):**

```sql
SELECT count(*) - count(DISTINCT (sale_date, customer_name, sku_code)) FROM build_kaiyo.clean_sales;
```

| Blank | rows | check | diff vs ref (both ways) |
|---|---|---|---|
| (step not added) | 3,110 | 110 | 110 |
| `sale_date, customer_name, sku_code` | 3,000 | 0 | 0 |
| `raw_id` | 3,110 | 110 | 110 |
| `customer_name, sku_code` | 660 | 0 | 2,340 |
| `sale_date, sku_code` | 2,049 | 0 | 951 |
| `sale_date, customer_name` | 2,350 | 0 | 650 |

The check alone passes the too-short keys: the card needs both the check and the reference. ✱

*Since v0.33.0 P2 is done on the names, dates and numbers as they came (they are text until P4 to P6), and is judged by the `raw_id`s that stay, not by the values: `clean_sales` and `ref_sales` agree on the set of `raw_id` (extra + missing = the "diff" column). The rows of the too-short keys then differ from the table above, because raw names with spaces split groups the clean names would merge: `customer_name, sku_code` 1,222 rows (diff 1,778), `sale_date, sku_code` 2,687 (diff 313), `sale_date, customer_name` 2,882 (diff 118). The table above holds when P4 to P6 come first (`tests/buildErrors.test.ts`). The right key gives the same 3,000 rows, check 0, diff 0.*

**Diagnoses:** reuse the pipeline's texts where they fit (import, don't copy):

```ts
rawId: DIAGNOSIS_TEXT.rawId,  // "raw_id numbers the lines of an export, so each copy has its own. Partition by what makes a sale one sale."
twice: (n: number) => `${n} sales are still in twice. Two copies share the date, the store and the SKU.`,
tooShort: (n: number, of: number) => DIAGNOSIS_TEXT.tooShort(n, of),  // "The key is too short: different sales were merged, silver kept {n} of {of}."
syntax: (error: string, cols: string[]) => `${error}. The step reads these columns: ${cols.join(', ')}.`,
```

### 3.5 P3 (v1, button with settings): stale customers

**Card:** "4 stores are in customers.csv twice. Each needs exactly one row, or every sale of theirs will be counted twice."

**Expected fix:** Keep latest row per key, key `customer_id` (or `customer_name`, unique too), order `updated_at`, Newest. 144 rows. The step SQL as generated:

```sql
SELECT customer_id, customer_name, customer_type, chain_name, region_id, city, is_active, updated_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) AS row_no
  FROM {prev}
)
WHERE row_no = 1
```

Under it, one line: "This is the pattern you wrote in sales by hand. Here the order decides which copy stays."

**Hints:** 1. "Look at the two rows of Nagisa #1045: the city differs, and so does updated_at. Which one is the store today?" 2. "Keep latest row per key: key customer_id, order by updated_at, newest."

**Check (0 = ok):** `SELECT count(*) - count(DISTINCT customer_id) FROM build_kaiyo.clean_customers;` Passes when the check is 0 and `clean_customers` equals `ref_customers` both ways.

| State | rows | check | rows not in ref / ref rows missing |
|---|---|---|---|
| nothing | 148 | 4 | 4 / 0 |
| Remove duplicates | 148 | 4 | 4 / 0 |
| key `customer_id`, `updated_at`, Newest | 144 | 0 | 0 / 0 |
| key `customer_name`, `updated_at`, Newest | 144 | 0 | 0 / 0 |
| key `customer_id`, `updated_at`, Oldest | 144 | 0 | 4 / 4 |
| key `chain_name` | 13 | 0 | 0 / 131 |
| key `city` | 32 | 0 | 1 / 113 |

**Diagnoses:**

```ts
distinctKeepsBoth: (n: number) => `Remove duplicates kept both rows of ${n} stores: they differ in city, region_id and updated_at. Choose which row is current.`,
keptOldest: (name: string, oldCity: string, city: string, date: string) => `You kept the older row: ${name} is in ${oldCity} in your table, but its latest row (${date}) says ${city}.`,
keyTooWide: (col: string, n: number) => `One row per ${col} left ${n} of 144 customers. The key is what names one customer: customer_id.`,
stillTwice: (n: number) => `${n} customers are still in twice.`,
```

For `keptOldest` the CLI values for the first stale store by id: Kaigan #1017, Shizuoka, Nagoya, 2026-03-27.

---

### 3.6 P4, P5, P6: the typing problems (v0.33.0)

Hub decisions (2026-11-10): the typing of sales is the learner's, and a step that does not fit fails visibly, as `[Error]` cells do in Microsoft Fabric's Dataflow (`docs/build-linking-screen.md` 12.8).

**Where they sit.** Clean cards: W, P1, P2, P3, **P5**, **P6** (in this order; Clean is done when all six pass). **P4** and P7 appear below them when the Model step asks (`work.p4`, `work.p7` = `asked` → `done`). All three act on sales, after P2: the learner's steps are in the order they were added, so the numbers below are on the 3,000 rows of P2; with P2 not done they are on 3,110 (the hub's first figures).

**What an error is.** The steps `try_cast` / `try_strptime`: a value that does not fit becomes NULL instead of stopping the query. A cell is an **[Error]** when the clean table has NULL where the file had a value (compared by `raw_id` with `bronze_sales`; a value empty in the file stays a plain `null`, 174 revenues and 82 units are like that, P8). So:

- the preview of clean sales draws such cells as red `[Error]`; a chip above it reads "Errors: sale_date 1,510" (per column) and **Show error rows** keeps only the rows that have one;
- the applied step that produced the NULLs shows a red mark and "1,510 rows [Error]" (counted step by step: rows where the value before was there and the value after is NULL). Later steps still run on what is valid;
- **the Dashboard stays locked while the clean sales have any [Error] cell, or a column of `sale_date`, `units`, `revenue` that is still text** (a typing step removed after Clean was done); `BuildState.errors` counts both (`salesLock`), is not saved, and the step bar falls back to Clean if the Dashboard was open.

**Buttons added** (sales): *Change type* (column, to Date / Whole number / Decimal, Decimal separator point or comma for the numbers) and *Replace values* (column, find, with). A second Change type on the same column, or P5's SQL on `sale_date`, **takes the place of the failing step in the same position**: the fix replaces, it does not pile on. ✱

```sql
-- Change type to Date                try_cast(sale_date AS DATE)
-- Decimal, separator comma           try_cast(replace(revenue, ',', '.') AS DECIMAL(12, 2))
-- Whole number, separator comma      try_cast(try_cast(replace(units, ',', '.') AS DOUBLE) AS INTEGER)
-- Replace values                     replace(customer_name, 'Itiba', 'Ichiba')
```

#### P5, dates (first, the main one)

**Card:** "sale_date came as text. Turn it into a date: press Change type with Date on sale_date in the sales list below, and see what happens." Nothing else until the learner does. Then the step is added and **fails: 1,567 rows [Error]** (1,510 after P2): a plain cast reads `2024-01-05` only (1,543 of the 3,110 rows); 803 are written `19.02.2024`, 764 `19/02/2024`. The card says so ("The step is added, but it fails: N rows [Error] in the preview … write the step yourself") and shows the SQL with a blank, **Apply and check**:

```sql
SELECT raw_id, source_file,
       CAST(CASE
         WHEN sale_date LIKE '%.%' THEN try_strptime(sale_date, '%d.%m.%Y')
         WHEN sale_date LIKE '%/%' THEN try_strptime(sale_date, '____')   -- 19/02/2024
         ELSE try_strptime(sale_date, '%Y-%m-%d')
       END AS DATE) AS sale_date,
       customer_name, sku_code, units, revenue
FROM {prev}
```

The blank is the format of the slash dates: letters after `%`, `/ . - :` and spaces, 30 characters, no quote (`checkFormat`). Right: `%d/%m/%Y`. The step replaces the failing one. Hints: 1. "Look at the rows in error. A plain Change type reads 2024-01-05 only; the exports also write 19.02.2024 and 19/02/2024." 2. "Write the format of the slash dates. Kaiyo's distributors put the day first: %d/%m/%Y."

**Check:** `sale_date` is a DATE, 0 errors, the dates equal the expected table (rows both have, joined on `raw_id`), and the three spellings are read (chips: "Spellings read 3 of 3").

| State | errors | line |
|---|---|---|
| sale_date still text | – | "sale_date is still text. Press Change type with Date on sale_date in the sales list below." |
| Change type, Date | 1,510 | datePlain: "The step is there, but 1,510 dates are [Error]: a plain Change type reads 2024-01-05 and nothing else. These are written another way: '01.01.2024', …" |
| SQL with `%m/%d/%Y` | 417 (282 more are read as another day) | dateMonthFirst: "… A format with the month first can't read 19/02/2024: there is no month 19. In these files the day comes first." |
| SQL with a format that reads no slash date (`%d/%m/%y`) | all slash dates left | dateStill: "N dates are still [Error], like '19/02/2024'. Compare how they are written with the format in the blank." |
| SQL with `%d/%m/%Y` | 0 | passes |

#### P6, decimal commas

**Card:** "revenue and units are text too. Press Change type on each: Decimal for revenue, Whole number for units." With the separator on point the steps **fail: 1,465 revenues and 113 units [Error]** (1,412 and 112 after P2; the values are written `381,99` and `3,0`). The card says "The step is added, but it fails: N revenues and M units [Error]. Show the error rows below and read one: how is the number written?" **Fix:** Change type again with **Decimal separator: comma** (the same as Replace values `,` → `.` and then the cast). Hints: 1. "Look at the rows in error: 381,99 is written with a comma, and a number with a comma is not a number to the computer." 2. "Change type again, with Decimal separator set to comma, on revenue and on units."

**Check:** both columns are numbers, 0 errors in each, values equal the expected table, the revenue total equals the reference (1,473,843.82 on the 3,000 rows). Lines: still text (`numberText`), both failing (`numberComma`: "1,412 revenues and 112 units are [Error] …"), one left (`numberOne`: "units is fine now …"). Decimal for units is accepted too (the values are the same).

#### P4, names (asked for by the Model step)

Found where the Model step looks: the coverage check of link L1 (sales names that find no customer). With the raw names it reports **1,062 sales** (1,102 on 3,110 rows); the diagnosis now carries the fix **"Fix the names in Clean"** (`Fix` kind `names`, as `region` is for P7), which opens Clean on the sales tab with the card P4 added below (`work.p4 = 'asked'`). Card: "Some store names in the sales find no customer: spaces at the edges, and one chain written two ways. Make the names match to the character, then link again." Buttons: **Trim** on `customer_name` (889 names with edge spaces; **248** sales still find no customer, all `Itiba #…`: 261 on 3,110 rows), then **Replace values** `Itiba` → `Ichiba`. Hints: 1. "Group the sales by customer_name and look at the ones that start or end with a space, and at Itiba against Ichiba." 2. "Trim on customer_name, then Replace values: Itiba with Ichiba."

**Check:** 0 sales whose name finds no customer in `clean_customers`, 0 names with edge spaces, names equal the expected table (joined on `raw_id`). Lines, first match wins: a step on another column (`namesWrongColumn`), spaces left (`namesSpaces`), Itiba left (`namesItiba`, with an unmatched name as the example), anything else unmatched (`namesLeft`). Button **Back to Model**.

#### Saved work from v0.32.0

Work saved without `work.v = 2` that has sales connected had the first given step (3.1), which did all of this. `readWork` puts that step back (a `given` spec with `full: '1'`, kept when saved again), counts P5 and P6 as passed when P3 is, and `passCard` adds P5 and P6 together with P3 for work still in Clean. P4 never appears for it (names already match). Test: `tests/buildErrors.test.ts`, "work saved by v0.32.0".

### 3.7 P8: the info card (v0.36.0)

Under the six cards, once Clean is done, a card "Not every odd value is an error", marked `i`, with nothing to fix. It recounts the clean sales as they are now: "174 sales have no revenue, 82 have no units, and 106 have negative units (returns)", then the line "Not every odd value is an error: an empty revenue stays NULL, a return stays negative." **Got it** marks it read (`work.p8`); it locks nothing and no step waits for it. The numbers are those of the 30 months; with the July file read (5.7) they are 175, 83 and 109 (July has one empty revenue, one empty units and three returns). The card does not appear while units or revenue are still text.

## 4. Model

### 4.1 v1: the star built for the learner

The Model step of the frame shows the star with three boxes and two links, and numbers under each link; **Continue** marks it done. No choice to make in v1. SQL (shown, foldable):

```sql
CREATE OR REPLACE TABLE build_kaiyo.gold_dim_customer AS
SELECT customer_id, customer_name, customer_type, chain_name, region_id, city FROM build_kaiyo.clean_customers;

CREATE OR REPLACE TABLE build_kaiyo.gold_dim_product AS
SELECT product_id, sku_code, product_name, brand, category FROM build_kaiyo.clean_products;

-- the sales carry names and SKUs; the fact carries ids, looked up through the dimensions
CREATE OR REPLACE TABLE build_kaiyo.gold_fact_sales AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM build_kaiyo.clean_sales s
LEFT JOIN build_kaiyo.gold_dim_customer c ON c.customer_name = s.customer_name
LEFT JOIN build_kaiyo.gold_dim_product p ON p.sku_code = s.sku_code;
```

Numbers shown (right state): fact 3,000 rows; dim customers 144, of which 45 have sales; dim products 47, of which 29 have sales; sales without customer 0, without product 0. One line: "Customers and products without sales are normal: a dimension lists everything, the fact only what was sold."

Regions are not in the v1 star (P7 is open, the ids don't match yet).

### 4.2 Later: the linking screen (data and checks only; the screen is the hub's)

**Links to make** (one side "1", many side "N"):

| # | N side | 1 side | What it gives | Ready when |
|---|---|---|---|---|
| L1 | `clean_sales.customer_name` | `clean_customers.customer_name` | `customer_id` in the fact | P3, P4 |
| L2 | `clean_sales.sku_code` | `clean_products.sku_code` | `product_id` in the fact | P1 |
| L3 | `clean_customers.region_id` | `clean_regions.region_id` | `gold_dim_region`, region on the customer | W, P7 |

**Checks per chosen pair** (all computed, shown as a row of chips; the pair is accepted when all pass):

```sql
-- types: both sides' data_type from information_schema.columns; must be the same family (text/text, number/number)
-- 1 side is unique (0 = ok)
SELECT count(<one_c>) - count(DISTINCT <one_c>) FROM build_kaiyo.<one_t>;
-- N side rows with no match (0 = ok), and how many distinct values
SELECT count(*), count(DISTINCT m.<many_c>) FROM build_kaiyo.<many_t> m
WHERE m.<many_c> IS NOT NULL AND NOT EXISTS (SELECT 1 FROM build_kaiyo.<one_t> o WHERE o.<one_c> = m.<many_c>);
-- N side NULL keys (shown, 0 here everywhere)
SELECT count(*) FROM build_kaiyo.<many_t> WHERE <many_c> IS NULL;
```

Run the coverage query only when the types match: comparing `R-07` with a number fails with "Conversion Error: Could not convert string 'R-07' to INT64" (CLI), and the type chip explains it instead.

**Reference numbers per pair** (CLI, after W, P1, P2, P3 and the given step):

| Pair (N → 1) | types (1, N) | 1-side duplicates | N rows unmatched | N values unmatched |
|---|---|---|---|---|
| L1 sales.customer_name → customers.customer_name | VARCHAR, VARCHAR | 0 | 0 | 0 |
| L2 sales.sku_code → products.sku_code | VARCHAR, VARCHAR | 0 | 0 | 0 |
| L3 customers.region_id → regions.region_id, before P7 | VARCHAR, BIGINT | 0 | (types differ) | (types differ) |
| L3 after P7 (`CAST(replace(region_id, 'R-', '') AS INTEGER)` or Extract number) | INTEGER, BIGINT | 0 | 0 | 0 |
| reversed: customers.customer_name → sales.customer_name (sales as 1 side) | VARCHAR, VARCHAR | 2,955 | 99 | 99 |
| wrong column: sales.customer_name → customers.chain_name | VARCHAR, VARCHAR | 59 | 3,000 | 45 |
| L1 before P3 (stale rows in) | | 4 | 0 | 0 |
| L1 with raw names (no trim, no Itiba fix; P4 later) | | 0 | 1,102 | |
| L1 trimmed, no Itiba fix | | 0 | 261 | |
| L2 before P1 | | 0 | 714 | 6 |

**Traps to name** (diagnosis lines, EN):

```ts
wrongWay: (one: string, n: number, distinct: number) => `${one} repeats: ${n} rows, only ${distinct} different values. It's the many side; the side with one row per key goes on the other end.`,
typeMismatch: (a: string, ta: string, b: string, tb: string) => `${a} is ${ta} and ${b} is ${tb}: R-03 and 3 can't be compared. Fix the type in Clean first.`,
notUnique: (col: string, n: number) => `${col} isn't unique on the "1" side: ${n} values appear more than once, so every sale of theirs would be counted twice.`,
unmatched: (n: number, values: number) => `${n} rows (${values} different values) find nothing on the other side. A key has to match to the character.`,
textKey: 'Linked by name: it works, but a store renamed tomorrow breaks every report. Bring customer_id into the fact and link by the id.',
```

`textKey` is a note, not a failure: L1 and L2 are links by natural keys, used to *look up* the ids; the star itself links by `customer_id` / `product_id` (the "Build the star" button after L1 to L3 writes the 4.1 SQL plus `gold_dim_region`). Whether the learner links the fact by id on a second pass or the screen does it is the hub's call.

**Open as a model** (bonus, after the star): `showAsModel(schema, 'Kaiyo sales star')` with the gold tables; whether the FKs reach Model needs a test (NOTES 5.6: DuckDB `ALTER TABLE … ADD FOREIGN KEY` not checked; passing DDL text built by the page is the fallback).

---

## 5. Dashboard (v1)

*v0.31.0: the step shows "Your star" (the `gold_*` tables with columns and types, from `information_schema`; folded under 1000 px), and the Answer step shows a read-only copy of the three visuals beside the questions (above them under 1000 px).*

Fixed grid, two columns: the KPI tile and the table on the left, the line across the full width below (or the hub's layout). Each tile has its SQL, **Run**, a result, and its check. The Dashboard step is done when the three tiles pass. All tiles read `gold_*` only.

### 5.1 KPI tile (blank): Revenue, January to June 2026

```sql
CREATE OR REPLACE TABLE build_kaiyo.tile_kpi AS
SELECT ____ AS revenue
FROM build_kaiyo.gold_fact_sales
WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01'
```

Prompt: "One number for the Head of Sales: how much did we sell from January to June 2026?" Right: `SUM(revenue)` → **314,906.13** (shown as "314,906.13", one row). Hints: 1. "Revenue of many sales together is their sum." 2. "SUM(revenue)".

Check: one row, value equals `SELECT SUM(revenue) FROM … ` on the reference star (exact, DECIMAL).

| Blank | Result | Diagnosis |
|---|---|---|
| `SUM(revenue)` | 314,906.13 | |
| `count(*)` | 595 | `"595 is the number of sales, not the money. The tile asks for revenue."` |
| `count(revenue)` | 570 | same as `count(*)` |
| `SUM(units)` | 3,523 | `"3,523 is units sold. The Head of Sales asked for revenue."` |
| `AVG(revenue)` | 552.47 | `"552.47 is the average sale. Revenue for the half-year is all sales added up."` |
| `MAX(revenue)` | 2,989.44 | `"2,989.44 is the biggest single sale."` |

### 5.2 Line tile (blank): revenue by month

```sql
CREATE OR REPLACE TABLE build_kaiyo.tile_line AS
SELECT ____ AS month, SUM(revenue) AS revenue
FROM build_kaiyo.gold_fact_sales
GROUP BY 1
ORDER BY 1
```

Prompt: "A line of revenue month by month, January 2024 to June 2026. What goes on the time axis?" Right: `date_trunc('month', sale_date)` (or `strftime(sale_date, '%Y-%m')`, `make_date(year(sale_date), month(sale_date), 1)`). Hints: 1. "Each point is one month of one year: March 2025 and March 2026 are different points." 2. "date_trunc('month', sale_date) turns every date into the first day of its month."

Check: 30 rows, `month` has 30 distinct values, and the `revenue` column equals the reference column (EXCEPT ALL both ways on revenue). Rendered with `Chart.tsx` as a line (`pickChart`: date + number).

| Blank | Points | Diagnosis |
|---|---|---|
| `date_trunc('month', sale_date)` | 30 | |
| `strftime(sale_date, '%Y-%m')` | 30 | passes (text months, the chart draws them in order) |
| `month(sale_date)` | 12 | `"month() gives 1 to 12, so January 2024, 2025 and 2026 were added together: 12 points instead of 30."` |
| `year(sale_date)` | 3 | `"One point per year: 3 points. The line needs one per month."` |
| `date_trunc('quarter', sale_date)` | 10 | `"One point per quarter: 10 points. The line needs one per month."` |
| `sale_date` | 131 | `"One point per day with sales: 131 points, too jagged to read. Group the days into months."` |

Reference line (CLI, `date_trunc` gives TIMESTAMP, shown as the month):

| Month | Revenue | Month | Revenue | Month | Revenue |
|---|---|---|---|---|---|
| 2024-01 | 37,579.11 | 2025-01 | 40,593.89 | 2026-01 | **79,717.23** (highest) |
| 2024-02 | 40,069.46 | 2025-02 | 48,830.53 | 2026-02 | 32,520.37 |
| 2024-03 | 55,524.31 | 2025-03 | 46,258.21 | 2026-03 | 44,397.83 |
| 2024-04 | 52,762.73 | 2025-04 | 53,037.33 | 2026-04 | 46,097.64 |
| 2024-05 | 41,098.26 | 2025-05 | 45,067.39 | 2026-05 | 43,513.92 |
| 2024-06 | 72,125.20 | 2025-06 | 59,020.40 | 2026-06 | 68,659.14 |
| 2024-07 | 72,996.28 | 2025-07 | 45,071.44 | | |
| 2024-08 | 51,520.00 | 2025-08 | **64,592.75** (best of 2025) | | |
| 2024-09 | 53,540.14 | 2025-09 | 52,319.95 | | |
| 2024-10 | 36,486.24 | 2025-10 | 40,463.76 | | |
| 2024-11 | 33,444.52 | 2025-11 | 31,677.36 (lowest) | | |
| 2024-12 | 47,845.26 | 2025-12 | 37,013.17 | | |

Sum of the 30 months: 1,473,843.82 (= all clean revenue). Years: 2024 594,991.51, 2025 563,946.18, 2026 H1 314,906.13. H1 per year: 2024 299,159.07, 2025 292,807.75, 2026 314,906.13 (+7.5 % on 2025).

### 5.3 Bars tile (blank): revenue by chain, H1 2026

*v0.31.0: the learner reads a plain SELECT; Lab wraps it in `CREATE OR REPLACE TABLE build_kaiyo.tile_chains AS` before running (`tileRunSql`). The tile draws horizontal bars; the table shows only when the result is wrong. Same wrapper for the other two tiles.*

```sql
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM build_kaiyo.gold_fact_sales f
JOIN build_kaiyo.gold_dim_customer c ON c.customer_id = f.____
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'
  AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC
```

Blank: `customer_id` (`f.customer_id` is accepted too), with two hints that point back to the keys linked on the Model step; another column gets a line naming the key. A tile passed before v0.31.0 keeps `customer_id` as its saved blank. Check: equals the reference, ordered (`compareResults(…, true)`).

| chain_name | revenue |
|---|---|
| **Minori** | **90,829.50** |
| Nagisa | 87,647.48 |
| Ichiba | 55,108.64 |
| Kaigan | 49,607.59 |
| Prima | 30,649.92 |

Same five numbers as the pipeline MVP (the clean sales are the same). Stores without a chain (traditional) hold 1,063.00 in H1 2026 and are left out. Minori is 28.8 % of H1 2026 revenue.

### 5.4 Answer

Three questions, one or two fields each. Numbers are parsed leniently: spaces dropped; with both `,` and `.` the comma is a thousands separator; with only `,` and exactly two digits after the last one it is the decimal mark, else a thousands separator. A number passes within ±0.5 of the reference (whole numbers accepted). ✱

| # | Question | Fields | Answer | Wrong answers worth a line |
|---|---|---|---|---|
| A1 | "How much did we sell from January to June 2026?" | number | 314,906.13 | 595 → "That's the number of sales." · 331,604.58 → "That total still has the 110 sales sent twice." |
| A2 | "Which month of 2025 sold the most, and how much?" | month (select, 12 months of 2025), number | August 2025, 64,592.75 | January 2026 / 79,717.23 → "January 2026 is the best month of the whole line; the question asks about 2025." · June 2025 / 59,020.40 → "June is second; look again at August." |
| A3 | "Which chain sold the most from January to June 2026, and how much?" | chain (select of the five), number | Minori, 90,829.50 | Nagisa → "Nagisa is second, 87,647.48." |

When all three pass: the build is solved (frame: Answer done). The return link is Б7 (section 9, open question 2).

### 5.5 Keep going (hub design 2026-11-10; code Sonnet)

Why: after Answer the learner asked "and where now?". The owner's frame: a loop, "stay here and practise, or go back to Quaera"; no separate dashboard page; filters and slicers come later on the same dashboard.

**Where.** Under the "You built it" block on the Answer step, two cards side by side (stacked on narrow):

1. **Keep going here: five more questions from the Head of Sales.** Opens a sixth, optional step **More** in the step bar (after Answer, marked "optional", unlocked when Answer is done; the build stays "5 of 5" without it).
2. **Back to Quaera.** The existing "Count it in Quaera" link, plus one line: "Next there: the SQL track on GROUP BY and JOIN, the same moves you just made." (no new link format).

**The More step.** One question at a time, a list of five on the left (done marks), the work on the right:

- the question and what to type (a number, sometimes a pick);
- a free SQL editor (the Lab editor component, not a blank in given SQL), pre-filled with a comment and `SELECT … FROM gold_fact_sales` skeleton only for K1; empty with a one-line comment for K2–K5;
- the "Your star" panel from the Dashboard step, same component, open by default here;
- Run → result table; a 2-column result (label, number) can be **Pinned to the dashboard** as bars or a line (auto: a date column → line, else bars). Pinned tiles appear on the Dashboard step under the three, as "Your tiles", with a remove ×, and in the Answer copy. Kept in the build's saved state (SQL text only, re-run on open).
- the answer field + Check, with the lenient parser of 5.4; two hints one at a time, then "Show a solution" (shows SQL, the question still counts as done, but marked "with solution").

**The five questions** (numbers: compute in DuckDB on the right state and put them here and in tests; the hub's values from section 6 where given):

| # | Question | What it practises | Answer |
|---|---|---|---|
| K1 | "How many sales did we have from January to June 2026?" | COUNT, the date filter from the KPI tile | **595** (`count(revenue)` gives 570) |
| K2 | "Which brand sold the most from January to June 2026, and how much?" (pick of the 9 brands) | JOIN to `gold_dim_product`, GROUP BY, ORDER BY | **Fruvia, 100,004.67** (Aqualis 80,977.09, Krosti 67,550.59, Milvara 51,896.20, Nettora 14,477.58) |
| K3 | "How many units came back as returns in 2025?" | WHERE on negative units, SUM | **217** units on 43 lines (typed as 217 or -217) |
| K4 | "Which prefecture sold the most from January to June 2026?" (pick of the 16) | JOIN fact → `gold_dim_customer`, GROUP BY `region_name` | **Okinawa, 44,845.38** (Aichi 35,819.43, Hyogo 34,602.95) |
| K5 | "Which single Minori store sold the most in 2025, and how much?" (pick of the 12 stores) | JOIN + two filters + LIMIT 1 | **Minori #1015, 22,383.37** (#1027 19,893.72, #1033 17,083.68) |

K4 needs **one** join, not two: after "Build the star" `gold_dim_customer` already carries `region_name` and `macro_region` (v0.31 star). Only a star built by the first version of the Model step has no region column; then Your star also lists `clean_regions` and a note says to join it on `region_id` (the same answer, checked in `tests/buildMore.test.ts`). In the editor tables are written with the schema, `build_kaiyo.gold_fact_sales`, as in the tiles; only a SELECT runs (`moreSqlProblem`). The wrong 2025 numbers for K3: 43 (return lines), 6,497 (all units of 2025, net of returns), 6,714 (units sold, positives only).

Wrong answers with a line (all in `MORE_QUESTIONS`): K1 618 (sales sent twice), 570 (count of revenue), 314,906.13 (the revenue); K2 Aqualis / 80,977.09; K3 43, 6,497, 6,714; K4 Aichi / 35,819.43; K5 Minori #1027 / 19,893.72.

**Done.** All five: a short block "Five more, all yours." with the same two ways out. No `#lab-done=` for More in this version (the hub decides later whether the trainer counts it).

**Not now:** learner-chosen chart types, saving queries as files.

---

### 5.6 Slicers on the dashboard (v0.35.0)

Two rows of chips above the tiles, Chain and Brand (values from `gold_dim_customer` and `gold_dim_product`), single select, the selected chip clears itself; "Showing: Chain = X · Brand = Y" with Clear. A click on a bar of the chains tile sets Chain.

A slicer is a query. Lab keeps views in schema `slice` (`slice_nochain` for the chains tile) named like the star's tables: the dimensions filtered by `WHERE chain_name = …` / `brand = …`, the fact by `IN (SELECT …)` over those. Before a tile or a pin runs, `build_kaiyo.gold_fact_sales|gold_dim_customer|gold_dim_product` in its SQL is rewritten to `slice.<same>` (any case, quoted or spaced; `src/core/buildSlice.ts`). The tiles name `build_kaiyo.` explicitly, so a `search_path` would not reach them. A pin whose SQL names none of the three tables shows "not sliced". The block "SQL it runs with the slicers" shows the renamed tables and the view definitions. The learner's SQL is never changed on the page.

The chains tile ignores Chain: all bars stay, the picked one is lit, the others fade; Brand acts. The KPI tile shows a "Filtered" tag. Run and check, the Answer step and its copy of the dashboard always read the unfiltered tables. The filter is page state (not saved), cleared by Start over and by switching demo.

**K6** (More, no SQL): "How much did Aqualis sell in Minori stores from January to June 2026?" Set Chain = Minori and Brand = Aqualis, read the revenue tile: **24,519.83** (Minori 90,829.50 and Aqualis 80,977.09 alone are the wrong-answer lines). Minori's brands: Fruvia 27,013.69, Aqualis 24,519.83, Krosti 20,381.93, Milvara 17,712.44, Nettora 1,201.61.

---

### 5.7 Refresh (v0.36.0; hub design 2026-11-11, code Sonnet)

Why: the point of steps written once is that they run on every new file. After Answer a seventh optional chip **Refresh** (after More) puts that to the test: "It is August. The distributor sent `export_2026-07.csv`." Unlocked with Answer, like More; done when R1 is right; the build stays "5 of 5" without it. No `#lab-done=` key.

**The file.** `src/data/build/julyExport.ts` makes it, deterministically (mulberry32, seed 20260703), from the stores and SKUs of `ref_sales` (45 and 29, sorted) and the list prices of `src_product`; `prepare` registers it as `build_kaiyo/sales/export_2026-07.csv` (the 34th text), written by `exportText` like the other 30; `raw_id` continues at 3,111. 104 true sales on distinct (date, store, SKU), units 1 to 10, revenue = units × list price × 0.85 to 1.00; 8 of them sent twice (the copy right after the line), so **112 lines**, ids 3,111 to 3,222. Dirt the learner's steps already handle: the 8 copies (P2), decimal commas (about 45% of revenues and 30% of units, written `3,0`), the three spellings `2026-07-03`, `03.07.2026`, `03/07/2026`. Odd values (P8): one sale without revenue, one without units, three returns. **The one new thing: dates written `2026/07/03`** (23 lines, 21 after the dedup): the learner's step sends every date with a `/` to its day-first branch, `try_strptime('2026/07/03', '%d/%m/%Y')` is NULL, so the step turns them into [Error].

**Moment 1, the list.** The folder card says "31 files" and shows the first lines of July as they came. Under **Connect setting for sales/**: *List of files* (what Connect did: 30 names) or *Every file in the folder* (`read_csv('build_kaiyo/sales/export_*.csv', …)`, `SALES_PATTERN`); the SQL shown follows the choice, with the one-line trade-off "The list is safe: nothing new gets in unseen. The pattern takes new files as they arrive, and whatever is wrong inside them." The setting is `work.refresh.mode` (`list` by default); Connect, `restore` and the Run read it (`CONNECT_SQL(source, names, mode)`); the Connect step shows the pattern SQL once it is set. The setting lives on the Refresh screen only (not on Connect), so the 30-file numbers of the five steps cannot change by accident. Run with the list: bronze_sales stays **3,110 → 3,110**, a *warning* "1 file not read" ("30 of 31 files read: the new file was not read"); everything else runs.

**Moment 2, Run with the journal.** `runRefresh` (`src/db/buildRefresh.ts`) executes, in order: bronze per source (sales, customers, products, regions), clean per source (one line for every applied step, rows in and out from `countsSql`), the star (three lines), the dashboard tiles the learner built (three lines). Columns: **# · Stage · Step · Rows in · Rows out · Status · ms**; Status is ok, warning (a count of files), error (a count of rows [Error], or a message) or not run; a note under the step says what happened ("July: 112 → 104 (−8)", "sale_date in error, like '2026/07/01'"). For a bronze line rows in is the table before the run. `ms` is the time of the query that counted the step (the chain up to it). A click on a step opens it (bronze: Connect; clean: Clean on that source; star: Model; tile: Dashboard). The known dirt is cleaned by the learner's own steps with no new work: "Removed sales sent twice 3,222 → 3,104, July 112 → 104 (−8)", the comma steps run on July's commas. The star and the tiles are **not run** while the sales have [Error] cells or untyped columns (the Dashboard lock of 3.6). The journal of the last run and the last three runs are kept (`work.refresh.journal`, `runs`): "Run 1: 3,110 → 3,000 · a file not read", "Run 2: 3,222 → 3,104 · 21 [Error]", "Run 3: 3,222 → 3,104 · green".

**Moment 3, a step fails.** Run with the pattern: the date step line is red, **error: 21 rows [Error]**, the star and tiles say "Not run", the Dashboard chip does not open. The card "A date format your step has never seen" shows the learner's date SQL with one more blank: a fourth branch `WHEN sale_date LIKE '____/%' THEN try_strptime(sale_date, '____')` that stands before the slash branch (`datesSql(cols, format, format2)`, the step's param `format2`; `makeStep` refuses a format that `checkFormat` refuses). Right: `%Y/%m/%d`. **Apply and run** writes it into the learner's own date step in place and runs again; a wrong format (`%d/%m/%Y`) leaves the line red. Two hints. A learner whose Clean has no SQL date step (work saved by v0.32.0 with the first given step) gets a note to write one; the hard `strptime` of that old given step would stop the Run with the engine's message (known, not handled). P5's card in Clean keeps `format2` when its own format is applied again.

**After a green run.** 22 lines, all ok: bronze_sales 3,222, clean sales 3,104, fact 3,104, tiles 1 / 31 / 5. The line has a new point (July 2026); the number tile stays January to June (its WHERE says so): **314,906.13**. The check **R1**, "How much did we sell in July 2026?", number typed, parsed as in 5.4, ±0.5: **64,508.87**. Wrong ones with a line: 68,594.44 (the lines sent twice counted), 52,779.39 (the 21 sales whose date was [Error] left out of July), 68,659.14 (June), 314,906.13 (the number tile). Done shows "Refreshed."

**Reference numbers (30 months + July, right state).** Run with the list: 22 lines, the first a warning (3,110 → 3,110); dedup 3,110 → 3,000; star 144 / 47 / 3,000; tiles 1 / 30 / 5. Run with the pattern, date step not fixed: bronze 3,110 → 3,222; dedup 3,222 → 3,104 (July 112 → 104); date step 3,104 → 3,104 with **21** [Error]; lock 21. After the fix: all green. July in the clean sales: 104 rows, revenue 64,508.87 (103 with revenue, 103 with units, 590 units, 3 returns). The earlier checks judge the 30 months: the line tile compares the months before 2026-07 with the reference (31 points pass), P2 counts the lines of the 30 files.

**Start over and demo.** Start over, Restart demo and an empty run start with `mode = list`: the tables are rebuilt from 30 files. Work saved by v0.35.0 loads (`readRefresh` gives the defaults). Demo: **Fill this step** at each moment (`{ step: 'refresh', part: 'source' | 'date' | 'answer' }`), and **Fill to here** on the Refresh chip fills every step before it; the Run itself is always pressed by hand.

Tests: `tests/buildRefresh.test.ts` (state and repair, step bar, the file, the fourth spelling, Fill, R1 and the history; on the real engine the list ignoring the file, the pattern reading it, the three runs and their journal lines, the format fix, R1 against the generator, the earlier checks with July in, P8 with and without July).

---

## 6. Later: filter and brands (not in v1, for the hub's design)

Not specified in detail; numbers for the hub. H1 2026 by brand, right state: Fruvia 100,004.67, Aqualis 80,977.09, Krosti 67,550.59 (top three). With P1 not done (714 sales without product): Fruvia 71,395.62, Aqualis 56,163.45, Krosti 53,881.15: a brand filter on Aqualis would silently drop AQUA002. This is where P1 shows on the dashboard. H1 2026 by region after P7, top five: Okinawa 44,845.38, Aichi 35,819.43, Hyogo 34,602.95, Kyoto 24,383.75, Shizuoka 22,763.07 (P3 kept-oldest would move the stale stores' sales to their old prefectures: this is where P3's "oldest" shows).

---

## 7. Reference numbers: whole cases

Gold built with 4.1 from the clean tables in each state; tiles as in section 5 (right blanks). Since v0.33.0 "Given" = the first given step (3.1, dates, numbers and names typed), which in the tests is the steps of P5, P6 and P4 (`tests/buildSolved.ts`) on the new given step; every row holds, with the dedup before or after them. "Right" is then W, P1, P2, P3, P5, P6 and the names of P4.

| Case | clean sales | clean customers | clean products | fact | fact rows without product | KPI H1 2026 | sales H1 2026 | Chain table (top three) |
|---|---|---|---|---|---|---|---|---|
| **Right** (W, P1, P2, P3) | 3,000 | 144 | 47 | 3,000 | 0 | **314,906.13** | 595 | **Minori 90,829.50**, Nagisa 87,647.48, Ichiba 55,108.64 |
| P2 not done (or key `raw_id`) | 3,110 | 144 | 47 | 3,110 | 0 | 331,604.58 | 618 | Nagisa 95,406.98, Minori 91,942.74, Ichiba 62,324.90 |
| P2 key `customer_name, sku_code` | 660 | 144 | 47 | 660 | 0 | 3,057.72 | 6 | Minori 1,751.29, Nagisa 1,085.17, Prima 221.26 |
| P3 not done (or Remove duplicates) | 3,000 | 148 | 47 | 3,385 | 0 | 371,314.73 | 677 | Nagisa 181,702.88, Kaigan 103,939.96, Minori 90,829.50 |
| P3 kept oldest | 3,000 | 144 | 47 | 3,000 | 0 | 314,906.13 | 595 | as Right (4 stores in their old city and region) |
| P1 not done | 3,000 | 144 | 47 | 3,000 | 714 | 314,906.13 | 595 | as Right (the brand view loses 714 sales, section 6) |
| P1 Trim only | 3,000 | 144 | 47 | 3,000 | 368 | 314,906.13 | 595 | as Right |
| P1 Uppercase only | 3,000 | 144 | 47 | 3,000 | 458 | 314,906.13 | 595 | as Right |
| Nothing done (given only) | 3,110 | 148 | 47 | 3,511 | 843 | 391,037.90 | 705 | Nagisa 196,708.19, Kaigan 106,377.76, Minori 91,942.74 |

Notes:

- The table's fan-out (P3 not done) is larger than the fact's: the fact doubles the stale stores' 385 rows (3,000 → 3,385); the table then joins `gold_dim_customer` again on `customer_id`, which has the same 4 ids twice, so those sales count four times in it. H1 2026 of the four stores: Nagisa #1045 21,467.70, Kaigan #1017 18,110.79, Nagisa #1052 9,884.10, Prima #1025 6,946.01.
- Without P2 the best month of 2025 is still August (66,649.45), and the best month overall still January 2026 (84,346.05); without P3 too (74,803.42 and 100,302.27). The line's shape survives the errors, the totals don't.
- Clean sales, all months, right: 3,000 rows, revenue 1,473,843.82, units 16,528; 174 revenues and 82 units NULL; 106 negative units (returns).
- With the July file read (Refresh, 5.7): clean sales 3,104 (July 104), fact 3,104, line 31 points, July 2026 64,508.87; the KPI and the chain table are unchanged (they stop at June).
- In v1 the Dashboard opens only after Clean is done (the frame's lock), so the wrong cases are for the tests, the diagnoses, and a later "peek before cleaning" twist (open question 1).

---

## 8. How the numbers were made, and what to re-check

### 8.1 Script

Python with `duckdb` 1.5.6: the SQL of 2.2 and 2.4 on the parquet files; files written with the rules of 2.3 into a folder (sales by `source_file`); read back with the SQL of 2.5 (all four read-back diffs 0); clean tables built with the chain of 2.6 for every state above; gold with 4.1; tiles with section 5. The script was a scratch file of the Б1 session and is not committed; `tests/build.test.ts` (section 9) is meant to replace it with the same cases run in `duckdb-node-blocking`, as `tests/pipeline.test.ts` does.

### 8.2 To re-check in DuckDB-WASM 1.33.1-dev57 (computed in the CLI only)

1. Every number of sections 3, 5 and 7, by the tests of section 9 (DuckDB core versions differ; expect them equal).
2. `read_csv` type detection over a file registered with `registerText`: the types of 2.5 (customers BIGINT ids, `updated_at` DATE, `list_price` BIGINT, `region_id` VARCHAR). If WASM detects differently, pass `types = {…}` for the three files and keep the shown types; the checks don't depend on BIGINT vs INTEGER.
3. Quoted fields with edge spaces (`"FRUV002 "`, `" KROS001"`) keep their spaces after `read_csv` (true in the CLI).
4. `parse_filename(filename)` on `build_kaiyo/sales/export_2024-01.csv` gives `export_2024-01.csv` (the pipeline checked it on a flat path only).
5. `date_trunc('month', DATE)` returns TIMESTAMP in 1.5.6; check that `pickChart` treats a TIMESTAMP column as the time axis and that the month shows as `2024-01`, not `2024-01-01 00:00:00`.
6. `ROW_NUMBER` ties: P2 orders by `raw_id` (unique), P3 by `updated_at` (unique per customer: 400 days apart), so results are deterministic; no check needed, listed so nobody adds a tie.
7. `DECIMAL(12, 2)` sums come back as text through the port (`pipelineRun` note); the KPI and Answer compare as decimal strings or numbers with two decimals, not floats.

---

## 9. Slices for Sonnet

The frame (`src/core/build.ts`, `src/ui/build/BuildPage.tsx`, `src/ui/build/build.css`, `tests/build.test.ts`) is Б3, done. The slices below add to it; each ends with `npm test` and `npm run build` green, a check in the production preview (`lab-preview`, 5181) and a ROADMAP.md line. Version: minor bump per slice.

### Б2. Files and references (M)

**Files:** `src/data/build/kaiyoSales.ts` (new: `SCHEMA = 'build_kaiyo'`, the four sources of 2.2 with columns, delimiter and registered names, the SQL of 2.2 and 2.4 as constants, `CONNECT_SQL(source, names)`, `WORK_TABLES`), `src/core/csvText.ts` (new, pure, or an export added to `src/core/csvWrite.ts` if it fits: the writer of 2.3), `src/db/buildRun.ts` (new: `prepare(port)` as in `pipelineRun.ts`, one shared promise per port, using `exportText` from `pipelineRun.ts` for sales; `connect(port, source)`; `resetWork(port)`), `tests/buildFiles.test.ts` (new).

**Done when:**

- `prepare` creates `src_*`, `ref_*`, `file_*` and registers 33 texts; a second call reuses the first.
- Tests on the real parquet files in `duckdb-node-blocking` (as `tests/pipeline.test.ts`): row counts 3,110 / 148 / 47 / 17 of the files and 3,000 / 144 / 47 / 16 of the references; read-back diffs 0 (2.3); bronze types of 2.5; the 30 sales texts equal the pipeline's `exportText` output; `csvText` unit tests (NULL, edge spaces, delimiter inside, `"`).
- No UI.

### Б4. Connect, Watch and Clean P1 to P3 (L; can go as Б4a Connect + Watch, Б4b P1 to P3)

**Files:** `src/core/buildSteps.ts` (new, pure: `Step` type, the button SQL generators of 2.6 for the four v1 buttons, `chainSql(source, steps)`, the blank step of P2 (`dedupStep(blank)`), `diagnoseP1/P2/P3(facts)` choosing a line), `src/data/build/kaiyoSales.ts` (texts: cards, hints, Watch captions of 3.2, `BUILD_DIAGNOSIS` with the lines of 3.3 to 3.5), `src/db/buildRun.ts` (`applySteps(port, source, steps)`, `checkP1/P2/P3(port)` returning the counts of the tables above and the diff vs reference), `src/ui/build/ConnectScreen.tsx`, `src/ui/build/WatchRegions.tsx` (Watch, after `PipelineTutorial.tsx`), `src/ui/build/CleanScreen.tsx` (cards, toolbar, applied steps list with ✕ and folded SQL, View full SQL, Open in a tab), `src/core/build.ts` (state: steps per source, blanks; `readBuild` repairs them), `tests/build.test.ts` (extend), `tests/buildClean.test.ts` (new).

**Done when:**

- Connect: four cards, preview, Connect each; Connect done at 3,110 / 148 / 47 / 17; sales get the given Changed type step.
- Watch: the five steps of 3.2 with captions; "Now you" opens P1.
- P1, P2, P3: cards unlock in order; toolbar with the four v1 buttons and their settings; P2's blank in CodeMirror with `checkBlank`; hints by button; check per card; the diagnosis line from the run.
- Applied steps: list per source, ✕ rebuilds the chain, steps survive a reload, the given step can't be removed.
- `tests/buildClean.test.ts` runs every row of the tables in 3.3, 3.4, 3.5 on the real parquet files through the same SQL the page uses and asserts the numbers; unit tests for the generators (column list kept, only the chosen column changed), `chainSql`, the diagnosis choice, state repair.
- Checked in the preview: the right path to Clean done; Remove duplicates on customers shows `distinctKeepsBoth`; the blank `raw_id` shows `rawId`; a reload keeps the steps.

### Б6. Model v1, Dashboard, Answer (M)

**Files:** `src/data/build/kaiyoSales.ts` (gold SQL of 4.1, tile SQL of 5.1 to 5.3, questions of 5.4, diagnosis lines), `src/core/buildDashboard.ts` (new, pure: tile blank validation (reuse `checkBlank`), `diagnoseKpi`, `diagnoseLine`, `parseAnswerNumber`, `checkAnswer`), `src/db/buildRun.ts` (`buildStar(port)`, `runTile(port, id, blank)`, tile checks against the reference star built from `ref_*`), `src/ui/build/ModelScreen.tsx` (v1: boxes, two links, numbers, Continue), `src/ui/build/DashboardScreen.tsx` (grid, three tiles, reusing `Chart.tsx` and the result grid), `src/ui/build/AnswerScreen.tsx`, `tests/buildDashboard.test.ts` (new).

**Done when:**

- Model v1 shows 3,000 / 144 (45 with sales) / 47 (29 with sales) / 0 / 0 and marks done on Continue.
- Three tiles: KPI 314,906.13, line 30 points drawn as a line, table of five chains; each wrong blank of 5.1 and 5.2 shows its line; Dashboard done when the three pass.
- Answer: A1 to A3 with the parser of 5.4; the wrong-answer lines; all three right → frame step done.
- `tests/buildDashboard.test.ts`: every case of section 7 (gold and tiles from the clean states, on the real parquet files), every blank of 5.1 and 5.2, the reference line of 5.2, `parseAnswerNumber` (`314906.13`, `314,906.13`, `314 906,13`, `90829,5`, `64592`).
- Checked in the preview: the line chart reads as months (8.2 item 5), a phone width of 375 px shows the frame's "needs a laptop" screen if the frame has one (else note it for the hub).

Not in these slices: P4 to P8, the linking screen (Б5), the filter, `#lab-done=` and links from Quaera (Б7), Open as a model (Б8).

---

## 10. Choices made in this spec (✱, for the hub to confirm)

- ✱ Schema `build_kaiyo`, visible in the tree, separate from `pipe_kaiyo`.
- ✱ Sales are one source of 30 files, read as text; the three reference files are single files with `,` and detected types.
- ✱ Stale customers have the same `is_active`, so only `updated_at` decides; four stores chosen so the leader flips (two Nagisa) and three chains move.
- ✱ Applied steps rebuild the clean table from bronze each time (Power Query semantics); buttons write explicit column lists.
- ✱ Up to v0.32.0 a given "Changed type" step did dates, decimals, name spaces and Itiba; since v0.33.0 it types `raw_id` and tidies the SKU codes, and P4 to P6 are the learner's (3.6) without changing the files.
- ✱ A failing Change type is a step that makes NULLs, drawn as [Error]; the fix replaces the failing step in place; the Dashboard stays locked while any [Error] cell is left (3.6).
- ✱ P3 is a button with settings, not a blank: it shows the P2 pattern written by a tool, and lets Remove duplicates fail on it.
- ✱ P2 passes by the reference, not by the check alone (the check passes too-short keys).
- ✱ Answer numbers pass within ±0.5 with a lenient parser.

## 11. Open questions for the hub

1. **Lock or twist.** The frame locks the Dashboard until Clean is done, so the learner never sees the wrong numbers of section 7. The pipeline's strongest moment was "the number doesn't match". A "peek" of the KPI and the chain table right after Connect (Nagisa 196,708.19 first, KPI 391,037.90) would give that moment here too. In v1 or later?
2. **Return to Quaera.** `#lab-done=` today takes `pipeline:<id>`; this page needs `build:kaiyo-sales` and the Quaera parser (`src/labDone.ts`) to accept the `build:` prefix (Quaera commit first, per the root rule). Б7.
3. **Linking screen, fact by id.** After L1/L2 (lookups by name and SKU), does the learner link the fact by `customer_id` / `product_id` on a second pass, or does "Build the star" do it? (4.2)
4. **Customers without sales and products without sales** (99 and 18): shown as a calm note in v1 Model. Enough, or a small question ("why are 18 products never sold?" → pharmacy brands sold through sell-in only)?
5. **SQL dialect shown.** Like the MVP, the generated SQL is DuckDB (`strptime`, `date_trunc`, `try_cast`). Fine for v1; a T-SQL view of a step would reuse the dialect translator later.

## 12. Progress and demo (v0.34.0)

The owner shows the build to guests, and wants to keep a finished run, start over, and walk someone through in minutes. Three places in localStorage, all in `src/core/buildProgress.ts`:

| Place | Key | What |
|---|---|---|
| Own run | `stratalab.build.kaiyo-sales` | the learner's work, as before |
| My saved run | `stratalab.build.kaiyo-sales.saved` | one slot: `{ at, state }` (state as the own run) |
| Demo run | `stratalab.build.kaiyo-sales.demo` | its own slot; the own run and the saved run are never written in demo mode |

### 12.1 The Progress menu

One small button **Progress** in the build header (laptop width only), with a menu:

1. **Start over.** Disabled when the own run is empty. Confirms ("Your current run is kept under 'My saved run'"), puts the run in the saved slot, resets the build to step 1 and rebuilds the tables as on a first visit (`resetWork`, then `restore` of the empty run). An empty run never replaces a saved one; a run that already is the saved one keeps its date.
2. **My saved run.** Shows the date of the snapshot; disabled when there is none. Restoring replaces the work on the page; it asks first only when that work is not empty and is not the saved run itself (`restoreNeedsConfirm`, compared by `runKey`: the run without which step is open).
3. **Demo mode.** Opens an empty demo run. In demo mode this item reads **Exit demo**; Start over and My saved run are disabled ("Not in demo mode").

Every switch (Start over, restore, demo in and out) sets the state and rebuilds the tables from it (`resetWork` + `restore`), so a run never meets the tables of another. Old saves load as before (`readBuild`); no saved run or demo is invented.

### 12.2 Demo mode

- A thin banner "Demo: nothing here counts" with **Restart demo** and **Exit**. Exit returns the own run exactly as it was left (half done stays half done).
- `#build=kaiyo-sales&demo=1` opens straight in demo mode (the demo slot, so a reload keeps the demo's progress; the menu always starts an empty one). The `demo=1` part is added and removed with the mode and dropped when the build is closed; a hashchange to such a link in the open page switches mode.
- **Fill this step** on every open Clean card (W, P1 to P6, and the extra P4 and P7), the Model step, every Dashboard tile and every Answer and More question that is not done. **Fill to here** on every step tab but Connect: fills every step before it and opens it. A step is filled by changing the saved state (`src/core/buildFill.ts`, pure) and, when it touches the tables, rebuilding them from it, the same road as opening the page again.
- What a unit puts in: W regions `Removed duplicates`; P1 products Trim and Uppercase on `sku_code`; P2 the blank `sale_date, customer_name, sku_code`; P3 customers Keep latest per `customer_id` by `updated_at`, newest; P5 `%d/%m/%Y`; P6 Decimal and Whole number with the comma; Model: P4 (Trim and Replace `Itiba` with `Ichiba` on `customer_name`) and P7 (Extract number on `region_id`) with it, links L1 to L3 and F1, F2, the star built; tiles `SUM(revenue)`, `date_trunc('month', sale_date)`, `customer_id`; answers and More questions their right answer (More also gets its solution SQL in the editor; it is not marked "with solution"). The sales steps are the same as `tests/buildSolved.ts` (now `src/core/buildSolved.ts`, which the test file re-exports). A learner's own try on the same problem is replaced, not piled up.
- "Count it in Quaera" is hidden everywhere (Answer, More): nothing counts.

### 12.3 Tests

`tests/buildProgress.test.ts`: Start over and the saved run (round trip, empty page, same run, confirm rule), the demo slot never touching the own run or the saved run (both ways), the demo hash, every unit of Fill (one card, no piling up, replacing a try, tile, answer, More, Fill to here), old saved states (before Progress, v0.32.0 with the first given step, garbage), and on the real engine: a filled state restores to the right star and every tile passes; an empty run after `resetWork` leaves no `clean_` or `gold_` table.
