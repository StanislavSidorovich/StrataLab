# Pipeline MVP: `#pipeline=kaiyo-sellout`

Spec for the first data pipeline in Lab, written before any code (2026-11-04, Opus). Code is written by two Sonnet sessions from this file; the hub session decides and pushes. Source of the idea: "Task B" in `quaera/docs/bi-interactive-design-2026-11.md` (B1 to B4) and the IMS Ignite feedback "less text, more moving and connecting modules, like in Fabric". New positioning: try working with data before choosing a role.

Owner's decisions (2026-11-04), not to be reopened in the code sessions:

- Build the MVP now, before the user interviews.
- Data quality and reconciliation stay inside the analytics engineer lane; a separate steward lane is phase 2.
- Phone: an honest "open on a laptop" plus a button that sends the link to yourself. No list view.
- Return to Quaera is a mark on trust (`#lab-done=`), no fingerprint.
- No free canvas: fixed lanes and slots. The learner fills slots from a palette and sets each block's settings.

All numbers in this file were computed with DuckDB CLI 1.5.6 on `lab/public/datasets/quaera/*.parquet`, with the exact SQL below and the 30 files written as described in section 2.2. Section 5 says which of them must be re-checked in DuckDB-WASM first.

---

## 1. Scenario

**Business question (Head of Sales):** "Which retail chain sold the most from January to June 2026, and how much?"

**What the analyst delivers:** a card with the top chain and its sell-out revenue, plus the five chains as bars:

| chain_name | revenue |
|---|---|
| **Minori** | **90,829.50** |
| Nagisa | 87,647.48 |
| Ichiba | 55,108.64 |
| Kaigan | 49,607.59 |
| Prima | 30,649.92 |

**The trap in the data (already in Kaiyo, nothing to plant):** `staging_raw_sellout` (3,110 rows, 30 monthly exports `export_2024-01.csv` … `export_2026-06.csv`) holds **110 sales sent twice**: two lines in the same file, same date, store, SKU, units and revenue, consecutive `raw_id`. Without removing them **the leader flips**: Nagisa 95,406.98 ahead of Minori 91,942.74. Nagisa gets 11 extra rows (+7,759.50) in 2026 H1, Ichiba 9 (+7,216.26), Minori 2 (+1,113.24), Kaigan 1 (+609.45). So the duplicate is not cosmetic: it changes the answer to the question.

The dataset is not changed (the trainer's tasks rely on its 3,110 rows). The "files" are cut from `staging_raw_sellout` by `source_file` at run time (2.2).

Other mess in the raw rows, handled by the given part of the SQL step (not the learner's job in the MVP): dates in six spellings (`2024-5-20`, `11.03.2024`, `19/02/2024` …, the slash form is day/month), decimal commas in `units` and `revenue`, NULLs (84 units, 179 revenue), negative units (returns, kept), spaces around store names, lower-case SKUs, and the chain Ichiba also spelled `Itiba` (261 rows, which would find no customer in the dimension). The Itiba fix is visible in the template with a comment; it is the steward lane's story in phase 2.

**Story order (who speaks, session 2 adds the lines):** Head of Sales asks → Data engineer loads the distributor files into bronze → Analytics engineer types, de-duplicates, builds the star → Analyst answers. In session 2 the first pass is built without de-duplication, the card says Nagisa, the Head of Sales replies "my file from the distributor portal says Minori, 90,829.50", and the learner walks back (section 6, session 2).

---

## 2. Screen and engine

### 2.1 Lanes, slots, run order

Three horizontal lanes, top to bottom, each with a role colour from the data map and a label:

| Lane id | Label | Layer | Slots |
|---|---|---|---|
| `engineer` | Data engineer | files → bronze | 4 |
| `ae` | Analytics engineer | bronze → silver → gold, quality checks | 8 |
| `analyst` | Analyst | gold → answer | 3 |

15 slots, 12 blocks in the palette, a correct pipeline uses 6 to 10 of them. There are always more slots than blocks needed and empty slots are normal, so the slots do not give the order away.

- A block can go only into its own lane, and each block is used once. Tap a block in the palette, then tap a slot (also drag with a mouse, optional). Tap a placed block to open its settings; "Remove" puts it back.
- **Run order:** filled slots left to right in `engineer`, then `ae`, then `analyst`. Empty slots are skipped. Lanes are in data order on purpose: the path through the roles is what the screen shows.
- **Dependency:** every block except the first one in run order has the setting **Runs when the previous step: Succeeded / Completed**. There is no default: it shows `?` until chosen. "Previous step" is the block just before it in run order.
- **Status rule** for a block B after previous step P:
  - P Succeeded → B runs.
  - P Failed → B runs only if B is "Completed", else B is Skipped.
  - P Skipped → B is Skipped.
- Run is disabled while any setting is unset; its tooltip names the first block with a missing setting ("Copy files: choose the write mode").

### 2.2 Engine (DuckDB, schema `pipe_kaiyo`)

- Everything lives in schema `pipe_kaiyo` of the user's Lab database (shown in the tree like a dataset, so the learner can query bronze and silver in a normal tab). Nothing else is touched.
- **Preparation (once per page open):** load `staging_raw_sellout`, `dim_customer`, `dim_product` from `/datasets/quaera/*.parquet` (the way the catalog loads Kaiyo) into `pipe_kaiyo.src_raw_sellout`, `pipe_kaiyo.src_customer`, `pipe_kaiyo.src_product` (tables, not views, so the page works offline after the first load and does not depend on the user having opened the Kaiyo dataset).
- **The 30 files:** built in JS from `src_raw_sellout` grouped by `source_file`, ordered by `raw_id`, columns `raw_id;sale_date;customer_name;sku_code;units;revenue`, delimiter `;`, header line, `\n`, NULL as empty field, fields with spaces quoted (`"  Minori #1014 "`). Register each with `db.registerFileText('pipe_kaiyo/<source_file>', text)`. Use `src/core/csvWrite.ts` if it fits. **Acceptance:** reading them back as in `copy-files` (correct settings) gives a table equal to `staging_raw_sellout` minus `source_file`, compared with `EXCEPT ALL` both ways = 0 rows (true in the CLI).
- Pass the **explicit list** of file names to `read_csv` / `read_blob`, not a glob (globbing registered files in WASM is not something to rely on).
- One block = one SQL script, run in order. Each step records status, duration, rows (2.4) and the error text (through `readableError`).
- **Run** executes once on the current state (no reset): pressing it twice with Append shows the doubling on real rows. **Start from scratch** drops and recreates the `pipe_kaiyo` work tables (keeps `src_*`). **Check my pipeline** runs the proofs (section 4).
- Layout, settings and the blank are saved in localStorage `stratalab.pipeline.kaiyo-sellout` (try/catch, a broken value starts afresh).

### 2.3 Address

`lab.quaera.app/#pipeline=kaiyo-sellout` opens the page, by analogy with `#practice=sql` (`src/core/sqlPractice.ts`): `pipelineFromHash`, `hashWithoutPipeline`, other parts of the hash left alone. Unknown id → the workbench, as now. Also reachable from Help and the Practice menu: "Data pipeline on Kaiyo Trading".

### 2.4 Journal

Under the lanes, one row per step of the last run: `#`, block, status chip (Queued / In progress / Succeeded / Failed / Skipped, same chip look as the trainer's planned `RunLogFigure`), duration, **rows**, short message. "Rows" means: for loads and SQL the rows in the table after the step; for Clear the rows removed; for checks the number of violations; for the card the chain and revenue.

---

## 3. Block vocabulary

Table names: `bronze_sellout_raw`, `silver_sellout`, `gold_dim_customer`, `gold_dim_product`, `gold_fact_sellout`, `report_top_chain`, `report_row_count`, all in `pipe_kaiyo`. `<files>` is the list of 30 registered file names, or only `pipe_kaiyo/export_2026-06.csv`.

| id | Lane | Label | Settings (besides "Runs when…") | Role in a correct pipeline |
|---|---|---|---|---|
| `copy-files` | engineer | Copy distributor files | Files: All 30 monthly files (default) / Latest file only · Format: Delimited text / Binary · Delimiter: `;` / `,` (only for text) · First row is the header: Yes / No · Write mode: Replace / Append | required |
| `clear-bronze` | engineer | Clear bronze table | none | needed with Append, harmless with Replace if before Copy |
| `notify-team` | engineer | Post "load finished" to the team chat | none | neutral distractor |
| `sql-silver` | ae | SQL step: silver sales | the blank (section 3.1) | required |
| `check-unique` | ae | Check: one row per sale | none | optional, after `sql-silver` |
| `check-rows` | ae | Check: silver is not empty | none | optional, after `sql-silver` |
| `check-keys` | ae | Check: every sale finds its store and product | none | optional, after `fact-sellout` |
| `dim-customer` | ae | Dimension: stores | none | required, before `fact-sellout` |
| `dim-product` | ae | Dimension: products | none | required, before `fact-sellout` |
| `fact-sellout` | ae | Fact: sell-out | none | required |
| `card-top-chain` | analyst | Card: top chain, Jan to Jun 2026 | Measure: Sum of revenue / Sum of revenue over distinct rows | required |
| `card-row-count` | analyst | Card: number of sales, Jan to Jun 2026 | none | neutral distractor (useful for diagnosis: 595 when right) |

No Wait block, no Schedule, no Encoding setting (the Kaiyo files are plain ASCII, the setting would do nothing).

SQL each block executes:

```sql
-- copy-files, Delimited text, Replace (header / delimiter from the settings)
CREATE OR REPLACE TABLE pipe_kaiyo.bronze_sellout_raw AS
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(<files>, delim = ';', header = true, all_varchar = true, filename = true);

-- copy-files, Delimited text, Append: create empty if missing, then add
CREATE TABLE IF NOT EXISTS pipe_kaiyo.bronze_sellout_raw AS
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(<files>, delim = ';', header = true, all_varchar = true, filename = true) LIMIT 0;
INSERT INTO pipe_kaiyo.bronze_sellout_raw BY NAME
SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file
FROM read_csv(<files>, delim = ';', header = true, all_varchar = true, filename = true);

-- copy-files, Binary (Replace; Append the same pattern as above)
CREATE OR REPLACE TABLE pipe_kaiyo.bronze_sellout_raw AS
SELECT parse_filename(filename) AS source_file, content FROM read_blob(<files>);

-- clear-bronze: if the table does not exist, Succeeded with 0 rows removed, no SQL
DELETE FROM pipe_kaiyo.bronze_sellout_raw;

-- notify-team: no SQL, Succeeded, message "Posted: load finished"

-- sql-silver: section 3.1

-- check-unique: violations = rows - distinct keys; Failed when > 0
SELECT count(*) - count(DISTINCT (sale_date, customer_name, sku_code)) FROM pipe_kaiyo.silver_sellout;

-- check-rows: Failed when 0
SELECT count(*) FROM pipe_kaiyo.silver_sellout;

-- check-keys: Failed when > 0
SELECT count(*) FROM pipe_kaiyo.gold_fact_sellout WHERE customer_id IS NULL OR product_id IS NULL;

-- dim-customer
CREATE OR REPLACE TABLE pipe_kaiyo.gold_dim_customer AS
SELECT customer_id, customer_name, chain_name, customer_type, region_id FROM pipe_kaiyo.src_customer;

-- dim-product
CREATE OR REPLACE TABLE pipe_kaiyo.gold_dim_product AS
SELECT product_id, sku_code, product_name, brand, category FROM pipe_kaiyo.src_product;

-- fact-sellout (LEFT JOIN: a sale with no match keeps a NULL key, so check-keys and proof 3 can see it)
CREATE OR REPLACE TABLE pipe_kaiyo.gold_fact_sellout AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM pipe_kaiyo.silver_sellout s
LEFT JOIN pipe_kaiyo.gold_dim_customer c ON c.customer_name = s.customer_name
LEFT JOIN pipe_kaiyo.gold_dim_product p ON p.sku_code = s.sku_code;

-- card-top-chain, Sum of revenue ("over distinct rows": FROM (SELECT DISTINCT * FROM pipe_kaiyo.gold_fact_sellout) f)
CREATE OR REPLACE TABLE pipe_kaiyo.report_top_chain AS
SELECT c.chain_name, SUM(f.revenue) AS revenue
FROM pipe_kaiyo.gold_fact_sellout f
JOIN pipe_kaiyo.gold_dim_customer c ON c.customer_id = f.customer_id
WHERE f.sale_date >= DATE '2026-01-01' AND f.sale_date < DATE '2026-07-01'
  AND c.chain_name IS NOT NULL
GROUP BY c.chain_name
ORDER BY revenue DESC;

-- card-row-count
CREATE OR REPLACE TABLE pipe_kaiyo.report_row_count AS
SELECT count(*) AS sales FROM pipe_kaiyo.gold_fact_sellout
WHERE sale_date >= DATE '2026-01-01' AND sale_date < DATE '2026-07-01';
```

The card shows `report_top_chain`: the first row large ("Minori, 90,829.50"), the five rows as bars.

### 3.1 The SQL step with one blank

Shown in a small CodeMirror editor (Lab's), read-only except the blank. Written in the CTE + `ROW_NUMBER` form rather than `QUALIFY`, so the same pattern works in a Fabric Warehouse (T-SQL has no `QUALIFY`).

```sql
CREATE OR REPLACE TABLE pipe_kaiyo.silver_sellout AS
WITH typed AS (
  SELECT
    CAST(raw_id AS INTEGER) AS raw_id,
    source_file,
    CAST(CASE
      WHEN sale_date LIKE '%.%' THEN strptime(sale_date, '%d.%m.%Y')
      WHEN sale_date LIKE '%/%' THEN strptime(sale_date, '%d/%m/%Y')
      ELSE strptime(sale_date, '%Y-%m-%d')
    END AS DATE) AS sale_date,
    replace(trim(customer_name), 'Itiba', 'Ichiba') AS customer_name,  -- one chain, two spellings
    upper(trim(sku_code)) AS sku_code,
    CAST(CAST(replace(units, ',', '.') AS DOUBLE) AS INTEGER) AS units,
    CAST(replace(revenue, ',', '.') AS DECIMAL(12, 2)) AS revenue
  FROM pipe_kaiyo.bronze_sellout_raw
),
numbered AS (
  SELECT typed.*,
         ROW_NUMBER() OVER (PARTITION BY ____ ORDER BY raw_id) AS copy_no  -- 1 = first copy of a sale
  FROM typed
)
SELECT raw_id, source_file, sale_date, customer_name, sku_code, units, revenue
FROM numbered
WHERE copy_no = 1;
```

**Prompt (one line above the editor):** "Some sales arrived twice. Keep one row per sale: what makes two rows the same sale?"

**Blank rules:** non-empty, at most 200 characters, no `;`, no `--` or `/*`, brackets balanced. Otherwise inserted as typed (it is the learner's own database).

**Correct answers (judged by result, never by text):** the step is right when `silver_sellout` equals the reference silver, compared with `EXCEPT ALL` both ways on all seven columns (0 rows each way). Because `ORDER BY raw_id` is given, every right key keeps the same rows. Examples that pass, all giving 3,000 rows:

- `sale_date, customer_name, sku_code` (any order, any case)
- `source_file, sale_date, customer_name, sku_code`
- `sale_date, customer_name, sku_code, units, revenue`

Examples that fail (rows in silver from 3,110 in bronze): `raw_id` 3,110 · `customer_name, sku_code` 660 · `sale_date, sku_code` 2,049 · `sale_date, customer_name` 2,350 · a typo → Failed with DuckDB's message (through `readableError`), plus the list of columns `typed` has.

**Hints (two, by button, as in the practice pages):**
1. "Two copies of one sale share the date, the store and the SKU. Only raw_id differs."
2. "List those columns, separated by commas."

**Reference silver** (for the comparison): the same SQL with the key `sale_date, customer_name, sku_code`, run by the engine into `pipe_kaiyo.ref_silver_sellout` from `src_raw_sellout` directly (not from the learner's bronze), once per page open.

---

## 4. Proofs ("Check my pipeline")

Behaviour, not shape: any pipeline that behaves right passes. Steps:

1. Drop the work tables (keep `src_*` and `ref_*`).
2. Run the pipeline: **run 1**. Snapshot: row count of every `pipe_kaiyo` work table.
3. Run it again unchanged: **run 2**. Snapshot again.
4. Evaluate on the state after run 2:

| # | Proof | Passes when | Shown as |
|---|---|---|---|
| 1 | **The answer is right** | `report_top_chain` exists and equals the reference table (section 1), ordered, compared with `compareResults` from `src/core/check.ts` | "Answer: Minori, 90,829.50" |
| 2 | **Safe to run again** | every work table has the same row count after run 1 and run 2 | small table: table, run 1, run 2, the changed row in red |
| 3 | **Gold is clean** | `gold_fact_sellout` has > 0 rows, 0 rows with a NULL `customer_id` or `product_id`, 0 duplicate `(sale_date, customer_id, product_id)` groups | "3,000 sales, every one with its store and product, none twice" |

All three ✓ → solved (saved in localStorage; session 2 adds the return link). Each ✗ shows one diagnosis line (4.1) and a **Why?** button with two or three sentences (session 2 writes the Why texts; session 1 ships the diagnosis lines).

Not a proof in the MVP, a soft note only: a load step or a step after a check set to "Completed" (B2 rule 4). Shown as a grey note, does not block.

Reference table for proof 1 is computed by the engine from `ref_silver_sellout` joined to `src_customer` with the `card-top-chain` SQL, and the test (section 6) asserts it equals the five numbers in section 1.

### 4.1 Diagnoses (EN, short, shown in this priority, first match wins)

Facts the engine collects: per-step status and error, bronze columns, row counts per table after run 1 and run 2, the blank's result, the card's measure setting.

| Cause (how it is detected) | Line shown |
|---|---|
| `copy-files` Failed with delimiter `,` | "The files are split by semicolons. Read with a comma, every line is one long field." |
| `copy-files` Binary (bronze has a `content` column) | "Binary copies each file as one blob: 30 rows, no columns. Read the files as delimited text." |
| header = No (bronze has `column0`…) | "The first line of each file holds the column names. Without a header row it became data, and silver can't find `sale_date`." |
| bronze grew from run 1 to run 2 | "The second run added the same {n} rows again: bronze went {a} → {b}. Append needs Clear before it, or use Replace." |
| Files = Latest only | "Only export_2026-06.csv was loaded: {n} rows, one month. The question needs January to June." |
| bronze empty after a run in which Copy succeeded (Clear after Copy) | "Clear ran after Copy and emptied bronze: nothing reached silver." |
| a step failed with a missing table (block placed before the block that builds it) | "{block} reads {table}, which isn't built yet at this point. Move it after {builder}." |
| blank key is `raw_id` (silver = bronze rows, key contains raw_id) | "raw_id numbers the lines of an export, so each copy has its own. Partition by what makes a sale one sale." |
| silver has more rows than reference, card says Nagisa | "110 sales arrived twice in the files. They put Nagisa first: 95,406.98 instead of 87,647.48." |
| silver has fewer rows than reference | "The key is too short: different sales were merged, silver kept {n} of 3,000." |
| proof 1 ✓ but proof 3 ✗ (distinct-rows measure over a doubled fact) | "The card is right, but gold still holds {n} doubled sales and every other report reads them. Fix it in silver, not in the measure." |
| a check Failed and the next step was "Completed" | "The check failed, but the next steps ran anyway (after Completed). Gold was built from rows the check rejected." |
| no `card-top-chain` ran | "No answer reached the Head of Sales: the analyst lane needs the Top chain card." |

A positive note when a check stops the run as designed (check Failed, next step "Succeeded" → Skipped): "The check stopped the run before bad rows reached gold. That's its job."

Error texts from DuckDB are shown under the line, shortened to the first sentence. Numbers in `{}` come from the run, never from text.

---

## 5. Reference numbers

Rows after each step, two runs each (run 2 = the same pipeline again without reset). Columns: bronze, silver, dim stores, dim products, fact, fact rows with no key, duplicate key groups in fact, card. Correct pipeline = `copy-files` (All, Delimited, `;`, header Yes, Replace) → `sql-silver` (right key) → `dim-customer` → `dim-product` → `fact-sellout` → `card-top-chain` (Sum).

| Case | Run | bronze | silver | dimC | dimP | fact | no key | dup groups | Card (top, revenue) | Proofs 1 / 2 / 3 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Correct** (Replace) | 1, 2 | 3,110 | 3,000 | 144 | 47 | 3,000 | 0 | 0 | Minori 90,829.50 | ✓ ✓ ✓ |
| Correct with Clear → Copy (Append) | 1, 2 | 3,110 | 3,000 | 144 | 47 | 3,000 | 0 | 0 | Minori 90,829.50 | ✓ ✓ ✓ |
| Append without Clear, right key | 1 | 3,110 | 3,000 | 144 | 47 | 3,000 | 0 | 0 | Minori 90,829.50 | |
| | 2 | **6,220** | 3,000 | 144 | 47 | 3,000 | 0 | 0 | Minori 90,829.50 | ✓ ✗ ✓ |
| No de-duplication (session 2 first pass), Replace | 1, 2 | 3,110 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | **Nagisa 95,406.98** | ✗ ✓ ✗ |
| No de-duplication, Append | 1 | 3,110 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | Nagisa 95,406.98 | |
| | 2 | 6,220 | 6,220 | 144 | 47 | 6,220 | 0 | 3,000 | **Nagisa 190,813.96** | ✗ ✗ ✗ |
| Key `raw_id`, Replace | 1, 2 | 3,110 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | Nagisa 95,406.98 | ✗ ✓ ✗ |
| Key `raw_id`, Append | 2 | 6,220 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | Nagisa 95,406.98 | ✗ ✗ ✗ |
| Key `customer_name, sku_code` | 1, 2 | 3,110 | 660 | 144 | 47 | 660 | 0 | 0 | Minori 1,751.29 | ✗ ✓ ✓ |
| Key `sale_date, sku_code` | 1, 2 | 3,110 | 2,049 | 144 | 47 | 2,049 | 0 | 0 | Minori 66,139.23 | ✗ ✓ ✓ |
| Key `sale_date, customer_name` | 1, 2 | 3,110 | 2,350 | 144 | 47 | 2,350 | 0 | 0 | Minori 67,007.60 | ✗ ✓ ✓ |
| Distinct-rows measure, no dedup, Replace | 1, 2 | 3,110 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | Minori 90,829.50 | ✓ ✓ ✗ |
| Distinct-rows measure, no dedup, Append | 2 | 6,220 | 3,110 | 144 | 47 | 3,110 | 0 | 110 | Minori 90,829.50 | ✓ ✗ ✗ |
| Latest file only, Replace | 1, 2 | 116 | 110 | 144 | 47 | 110 | 0 | 0 | Nagisa 23,160.07 | ✗ ✓ ✓ |
| Latest file only, Append | 2 | 232 | 110 | 144 | 47 | 110 | 0 | 0 | Nagisa 23,160.07 | ✗ ✗ ✓ |
| Copy → Clear | 1, 2 | 0 | 0 | 144 | 47 | 0 | 0 | 0 | no rows | ✗ ✓ ✗ |
| Header = No | 1 | 3,140 (`column0`…`column5`) | Failed | | | | | | none | ✗ |
| Binary | 1 | 30 (`source_file`, `content`) | Failed | | | | | | none | ✗ |
| Delimiter `,` | 1 | Copy Failed (CSV sniffer cannot parse) | Skipped / Failed | | | | | | none | ✗ |
| Fact before dimensions (clean run) | 1 | 3,110 | 3,000 | | | Failed: `gold_dim_customer` does not exist | | | none | ✗ |

Notes on the numbers:

- `card-row-count`: 595 sales in 2026 H1 when right, 618 without de-duplication, 1,236 with Append twice and no de-duplication.
- Silver revenue, all months: 1,473,843.82 right, 1,530,784.50 with the 110 duplicates (units 16,528 vs 17,163).
- 2026 H1 without de-duplication: Nagisa 95,406.98, Minori 91,942.74, Ichiba 62,324.90, Kaigan 50,217.04, Prima 30,649.92.
- Traditional stores (no chain) hold 1,063.00 in 2026 H1; the card leaves them out (`chain_name IS NOT NULL`).
- `check-unique` violations: 0 right, 110 without de-duplication, 3,220 with Append twice and no de-duplication. `check-keys`: 0 in every case that builds a fact (the Itiba fix is in the template).
- With "Copy → Clear", on run 1 of a clean schema Clear finds the table that Copy just made and empties it; the result is the same in both runs.

**To re-check first in the implementation (computed in the CLI, not yet in DuckDB-WASM 1.33.1-dev57 that Lab ships):**

1. Every number above, by the test in section 6 (`duckdb-node-blocking`, as `tests/sqlPractice.test.ts` does). Expect them equal; DuckDB core versions differ.
2. The exact Failed messages for header = No (the CLI says "Column raw_id referenced that exists in the SELECT clause…", confusing, hence the diagnosis line) and delimiter `,` (sniffer error). Only the status matters for the logic; the line shown comes from 4.1.
3. `read_blob` and `read_csv(…, filename = true)` over files registered with `registerFileText`: that `parse_filename` gives `export_2024-01.csv`, and Binary gives 30 rows.
4. `strptime` accepting one-digit months and days (`2024-5-20`) under `%Y-%m-%d`: true in the CLI (0 NULL dates), confirm in WASM.

---

## 6. Two sessions

### Session 1 (Lab only): engine, journal, proofs

**Done when:**

- `#pipeline=kaiyo-sellout` opens the page; Help and the Practice menu link to it; other hash parts survive (`#ds=…`).
- Three lanes, 15 slots, the 12 blocks; tap block → tap slot; settings per block; Run disabled with a named reason while a setting is unset.
- Run executes in DuckDB in `pipe_kaiyo` and fills the journal (status, duration, rows, message); Run again; Start from scratch; the tables are visible in the tree.
- The SQL step with the blank, its two hints, its result verdict (3.1).
- Check my pipeline: two runs, proofs 1 to 3, the diagnosis lines of 4.1, the card with bars.
- Below 768 px: no lanes. One screen: "The pipeline needs a laptop: it's built by placing blocks side by side." Buttons: **Send me the link** (`navigator.share` with the URL; without it `mailto:?subject=Quaera Lab pipeline&body=<url>`) and **Copy link**.
- `tests/pipeline.test.ts` runs every case of the table in section 5 on the real parquet files in `duckdb-node-blocking` through the same block SQL the page uses, and asserts the numbers; plus unit tests of the pure rules (run order, status propagation, missing settings, blank validation, hash, diagnosis choice).
- `npm test` and `npm run build` green; checked in the production preview (`lab-preview`, 5181): the correct pipeline, Append twice (6,220 visible after Run again), the blank `raw_id`, and the phone screen at 375 px.
- ROADMAP.md "Where we are" + a Decisions entry for the ✱ choices below; version bump (minor).

**Files:**

- `src/core/pipeline.ts` (new, pure, Vitest): types (Lane, Slot, Block, Settings), `runOrder`, `nextStatus`, `missingSetting`, `checkBlank`, `pipelineFromHash` / `hashWithoutPipeline`, `diagnose(facts)`, `proofs(snapshots, report, reference)`.
- `src/data/pipelines/kaiyoSellout.ts` (new): lanes, slots, blocks, labels, settings, the SQL of section 3 as functions of the settings, the reference, the diagnosis texts.
- `src/db/pipelineRun.ts` (new): preparation (src tables, the 30 registered files, ref silver), run a step, snapshots, reset.
- `src/ui/PipelinePage.tsx` (new) and its styles in the existing stylesheet; `src/ui/store.ts` (`pipeline: string | null`, `openPipeline`), `src/ui/App.tsx` (render the page like `PracticeBookPage`, menu entries).
- `tests/pipeline.test.ts` (new).
- `ROADMAP.md`, `package.json` version.

### Session 2 (presentation and the return): lines, twist, `#lab-done=`

**Order of commits (root rule: push the receiving side first):**

1. **Quaera commit A** (Russian message, quaera rules): accept `#lab-done=pipeline:kaiyo-sellout`. **Pushed first.**
2. **Lab commit**: lines, Why, twist, "Back to Quaera" link.
3. **Quaera commit B**, after Lab is live: links into the pipeline.

**Lab, done when:**

- Each lane has one persona line ≤ 140 characters, shown when the run reaches that lane; the task is said by the line, not by a paragraph. Use the trainer's story character names if they exist (check `quaera/src/content` story files); otherwise role names. No voice in the MVP.
- **Why?** under each failed proof: two or three sentences per diagnosis.
- **Twist "the number doesn't match"** as the first path through the page: phase `first-pass`: `sql-silver` shows the template without `numbered` and the filter (types only, no blank). The correct-looking pipeline runs green, the card says **Nagisa, 95,406.98**. Head of Sales: "My file from the distributor portal says Minori leads with 90,829.50. Which one is right?" Phase `fix`: the learner can add `check-unique` (it fails: 110 sales twice) or open the SQL step, where the de-duplication part and the blank now appear. Rerun → Minori 90,829.50 → "Now it matches." Proofs only pass in phase `fix`. The phase is saved; "Start from scratch" does not reset it, a small "Replay the story" does.
- After all proofs pass: **Back to Quaera** → `https://quaera.app/#lab-done=pipeline:kaiyo-sellout` (new tab).
- Tests for the phase rules; checked in the production preview.

**Quaera commit A, done when:**

- On load and on `hashchange`, `#lab-done=pipeline:<id>` (id `[a-z0-9-]+`) is read, stored in localStorage `quaera.labDone` as `{ "pipeline:kaiyo-sellout": "<ISO date>" }` (try/catch, merging with what is there), and removed from the address with `history.replaceState`, keeping the rest of the hash and the query.
- Read it before anything that looks at the hash: `StartGuide.tsx` treats any hash as a deep link (`DEEP_LINK`), which is right for this one too. Supabase sign-in runs with `flowType: 'pkce'` (`src/sync/client.ts`), so it uses `?code=` and not the hash; check that `detectSessionInUrl` ignores a `#lab-done=` hash.
- A toast or quiet note: "Pipeline built in Lab." The mark shows on the pipeline card of the data map (`PipelinePreview.tsx`) as "Built in Lab ✓".
- Unit test for the parser; `npm run verify` green.

**Quaera commit B, done when:**

- `LAB_PIPELINE = 'https://lab.quaera.app/#pipeline=kaiyo-sellout'` in `src/links.ts`, opened through `openFamilyLink` like the other Lab links.
- The "In plans: pipeline in Lab" card on `?roles=map` (`PipelinePreview.tsx`) becomes a link to the live pipeline; a "Build it in Lab" button under mdl-082 (where its feedback is shown).
- **Hub:** add two rows to the transitions table of the root `CLAUDE.md`: Trainer → Lab `#pipeline=kaiyo-sellout` (quaera `src/links.ts` ↔ lab `src/core/pipeline.ts`), Lab → Trainer `#lab-done=pipeline:<id>` (lab `src/ui/PipelinePage.tsx` ↔ quaera parser file).

**Files (session 2):** Lab: `src/data/pipelines/kaiyoSellout.ts`, `src/core/pipeline.ts` (phase), `src/ui/PipelinePage.tsx`, `tests/pipeline.test.ts`, `ROADMAP.md`. Quaera A: a new `src/labDone.ts`, `src/App.tsx` (hook), `src/ui/PipelinePreview.tsx` (mark), i18n RU/EN strings, a test. Quaera B: `src/links.ts`, `src/ui/PipelinePreview.tsx`, the mdl-082 place in the UI.

---

## 7. Choices made in this spec (✱, for the hub to confirm)

- ✱ The question is the 2026 H1 top chain, because the 110 real duplicates flip its answer (Nagisa → Minori); a total or a single-chain number would only drift by a few per cent.
- ✱ "Runs when the previous step" has no default: one click per block, and the setting is learned instead of left as found.
- ✱ Data cleaning (dates, decimal commas, Itiba) is given in the template; the learner fills only the key. One blank, as decided in B4.
- ✱ Dedup in silver also absorbs Append doubling, so an Append-twice pipeline with the right key gives the right card; proof 2 checks every table, bronze included, so it still fails. This is the honest lesson: a downstream fix hides a broken load.
- ✱ Proof 3 also checks "> 0 rows in the fact", so an empty pipeline cannot pass it.
- ✱ The pipeline tables live in the user's own database (`pipe_kaiyo`), visible in the tree, so the learner can open bronze and silver in a normal tab.

## 8. Not in the MVP

Free canvas (`@xyflow/react`), steward and BI developer as separate lanes (the Itiba story belongs to the steward), the phone list view, the learner's own files, Schedule, Wait, Encoding, voice, a fingerprint in `#lab-done=`, other pipelines than `kaiyo-sellout`.
