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
| P4 | sales | 919 names with edge spaces; `Itiba` for `Ichiba` (261 rows). Raw names find no customer in 1,102 rows; trimmed, still 261 | buttons (Trim, Replace values) | Found by the Model coverage check or by grouping names | later |
| P5 | sales | dates in six spellings; 1,567 do not cast to DATE; slash dates are day first | button first (Change type fails on 1,567), then SQL with a blank (the slash format) | The button failing on real rows is the point; the format needs a decision | later |
| P6 | sales | decimal commas: 1,465 revenues, 113 units | buttons (Change type with "decimal comma") | Mechanical once seen | later |
| P7 | regions | `region_id` is text `R-03`, integer in customers | button (Extract number) | Shows up only when linking (4.2): the type check fails there and sends the learner back | later (with the linking screen) |
| P8 | sales | 174 sales without revenue, 82 without units, 106 negative units (returns) in clean sales | info card, nothing to fix | "Not every odd value is an error": leave NULL, keep returns | later |

In v1, P4 to P6 are done by the given step **Changed type** (3.1): its SQL is the MVP's `typed` CTE and is shown, with one comment per fix. Later versions take its lines out one by one and turn them into P4 to P6; the files do not change, so the numbers of this spec stay. ✱

Clean is done when W, P1, P2 and P3 all pass. The cards open one after the other (the next card unlocks when the previous passes), but every source's preview and toolbar stay usable.

### 3.1 The given step on sales: Changed type

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

Label: "Changed type (given): dates, numbers, names". 3,110 rows. One line above it: "Lab did the routine part. Open it to see what it fixed; the problems below are yours."

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

### 5.3 Table tile (given SQL): revenue by chain, H1 2026

```sql
CREATE OR REPLACE TABLE build_kaiyo.tile_chains AS
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM build_kaiyo.gold_fact_sales f
JOIN build_kaiyo.gold_dim_customer c ON c.customer_id = f.customer_id
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'
  AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC
```

No blank: **Run** and read it (the cheap tile). Check: equals the reference, ordered (`compareResults(…, true)`).

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

---

## 6. Later: filter and brands (not in v1, for the hub's design)

Not specified in detail; numbers for the hub. H1 2026 by brand, right state: Fruvia 100,004.67, Aqualis 80,977.09, Krosti 67,550.59 (top three). With P1 not done (714 sales without product): Fruvia 71,395.62, Aqualis 56,163.45, Krosti 53,881.15: a brand filter on Aqualis would silently drop AQUA002. This is where P1 shows on the dashboard. H1 2026 by region after P7, top five: Okinawa 44,845.38, Aichi 35,819.43, Hyogo 34,602.95, Kyoto 24,383.75, Shizuoka 22,763.07 (P3 kept-oldest would move the stale stores' sales to their old prefectures: this is where P3's "oldest" shows).

---

## 7. Reference numbers: whole cases

Gold built with 4.1 from the clean tables in each state; tiles as in section 5 (right blanks). "Given" = the Changed type step only.

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
- ✱ In v1 a given "Changed type" step does dates, decimals, name spaces and Itiba; later versions peel P4 to P6 out of it without changing the files.
- ✱ P3 is a button with settings, not a blank: it shows the P2 pattern written by a tool, and lets Remove duplicates fail on it.
- ✱ P2 passes by the reference, not by the check alone (the check passes too-short keys).
- ✱ Answer numbers pass within ±0.5 with a lenient parser.

## 11. Open questions for the hub

1. **Lock or twist.** The frame locks the Dashboard until Clean is done, so the learner never sees the wrong numbers of section 7. The pipeline's strongest moment was "the number doesn't match". A "peek" of the KPI and the chain table right after Connect (Nagisa 196,708.19 first, KPI 391,037.90) would give that moment here too. In v1 or later?
2. **Return to Quaera.** `#lab-done=` today takes `pipeline:<id>`; this page needs `build:kaiyo-sales` and the Quaera parser (`src/labDone.ts`) to accept the `build:` prefix (Quaera commit first, per the root rule). Б7.
3. **Linking screen, fact by id.** After L1/L2 (lookups by name and SKU), does the learner link the fact by `customer_id` / `product_id` on a second pass, or does "Build the star" do it? (4.2)
4. **Customers without sales and products without sales** (99 and 18): shown as a calm note in v1 Model. Enough, or a small question ("why are 18 products never sold?" → pharmacy brands sold through sell-in only)?
5. **SQL dialect shown.** Like the MVP, the generated SQL is DuckDB (`strptime`, `date_trunc`, `try_cast`). Fine for v1; a T-SQL view of a step would reuse the dialect translator later.
