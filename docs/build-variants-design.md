# Build by hand: variants by seed

Design for a second and third run of `#build=kaiyo-sales` on different data and a different Head of Sales question (2026-11-17, Opus, for the hub to review with the owner). No code here: Sonnet sessions build it in the phases of section 6. Read first: `docs/build-kaiyo-sales-spec.md` (the build as it is, called "the spec" below) and `docs/build-linking-screen.md`.

Inputs, and what was taken from each:

- Part 2 ("Seed Engine") of `../research/analysis & ignite/quaera-seamless-ux-and-seed-engine-spec.md`: the recipe and the truth computed by DuckDB, the seven invariants, the retry on a tie. Its line numbers and figures came from an older reading; everything below was checked against the code at v0.52.0 and against the parquet files in DuckDB 1.5.6 (Python). Exam mode and the scorecard (its part 3) are out, as the hub decided.
- `../shots/gemini/2026-11-16/dirt-catalogue.md` (20 kinds of dirt): section 1.4 says which are already in, which become new problems, which stay out.
- `../shots/gemini/2026-11-17/build-questions.md` (12 questions): section 1.3 picks four.

Facts from the code and the data that shape the design (checked 2026-11-17):

- The canonical sales are **not generated**: `staging_raw_sellout.parquet` (3,110 lines, dirt baked in by the trainer's dataset script) is read as it is. A variant therefore cannot re-dirty that file; it needs its own clean sample and its own dirt. The clean source is `fact_sellout.parquet` (118,449 rows, 1.2 MB, one row per `week_start`, `customer_id`, `product_id`, unique on that triple; every `week_start` is a Monday, 2024-01-01 to 2026-06-29; no returns, no NULLs; revenue is DOUBLE).
- The **checks are already data-derived**: P1 to P7, L1 to L3, F1, F2 and the tiles compare the learner's tables with `ref_*` tables by `EXCEPT ALL` (`src/db/buildRun.ts`). What is hard-coded is the **answers and the texts**: `ANSWERS`, `MORE_QUESTIONS`, `R1_VALUE`, the option lists (`CHAINS`, `BRANDS`, `PREFECTURES`, `MINORI_STORES`), the A5 lines of `reviewChecks.ts`, and numbers and names inside cards, hints and diagnoses (`3000` in `buildSteps.ts:424` and `buildRun.ts:216`, `144` in `buildSteps.ts:444`, `Itiba` in `buildRun.ts:391`, `buildSolved.ts`, `linkData.ts`; `R-03` and "17 rows" in `WATCH_STEPS`; "6 of the 29 SKUs", "Nagisa #1045" in `CLEAN_CARDS`; the H1 2026 window in `TILE_SQL`, `buildRecon.ts:7`, `buildRun.ts:565`).
- `julyExport.ts` is already a seeded generator (mulberry32, `JULY_SEED`) fed by the stores and SKUs of `ref_sales`: Refresh needs only a seed parameter.
- A first sample (5 random chains of 12 plus the stores without a chain, about 3,000 rows, 40 seeds) gave a gap of at least 100 between first and second place in 199 of 200 rankings: the tie retry is a safety net, not the normal path.
- `(sellout_id * 40503)` overflows INTEGER in DuckDB: every arithmetic on ids in the generator casts to BIGINT first.

---

## 0. What and why

Five people finished the build once; the owner wants them to practise the same chain again without the answers being the ones they already typed. A **variant** is the same seven steps (Connect, Clean P1 to P7, Model and keys, Dashboard, Answer, More K1 to K6, Refresh R1) on another sample of Kaiyo's sell-out, with other dirt in the same places and another Head of Sales question, generated in the browser from a seed; every right answer, wrong-answer line and check is computed by DuckDB from the generated tables, none is typed into the code. The run without a seed stays exactly as today (every number of spec section 7 unchanged).

**Done when:** a learner who finished the build opens "Variant 2" from the Answer step, does the whole chain on data where a different chain or brand wins, gets every check right with the same moves, and `npm test` passes a test that walks 25 seeds through every check with the solved steps and another that makes each check fail on purpose.

---

## 1. What a variant is

### 1.1 The seed and the recipe

- The seed is a whole number 1 to 99,999, in the address: `#build=kaiyo-sales&seed=4817`. No `seed` (or `seed=0`, empty, not a number) is the canonical case, variant 1.
- Variants 2 and 3 are two **pinned seeds** (`VARIANT_SEEDS = [<s2>, <s3>]` in `src/data/build/variants.ts`), chosen in phase 2 by running the gate over seeds 1 to 200 and taking the first two whose headline questions differ from each other and from variant 1. Pinned, so the owner can walk them once and every learner sees the same variant 2. "Another variant" (section 3) draws any seed.
- `recipe(seed, catalog)` in `src/core/buildVariant.ts` is pure TypeScript (no DuckDB): mulberry32 seeded with the seed (the same function as `julyExport.ts`, moved to `src/core/seeded.ts`), and `catalog` is a small input read once from the parquet (chains with their store ids and rows per store, the 47 products, the 16 regions, the stale-able stores). Same seed and same parquet give the same recipe on every machine.

```ts
interface Recipe {
  seed: number            // the seed asked for
  sub: number             // the seed actually used after retries (section 2.4)
  chains: string[]        // 5 chains of the 12 whose stores sell (plus every store without a chain)
  rate: number            // per mille of their fact_sellout rows kept, so the sales have 2,800 to 3,200 rows
  mix: [bigint, bigint]   // the row filter: (sellout_id * mix[0] + mix[1]) % 1000 < rate
  window: Window          // the report window of A1, A3, K1, K2, K4, K6: H1 2026 | H2 2025 | H1 2025
  year: 2024 | 2025       // the year of A2, K3, K5
  headline: HeadlineId    // which question is A3 (1.3)
  headlineBrand?: string  // only for 'chainForBrand'
  dirt: Dirt              // 1.2
}
```

### 1.2 What changes and what stays

| Part | Canonical (variant 1) | In a variant (from the recipe) | Fixed in every variant |
|---|---|---|---|
| Sales sample | `staging_raw_sellout` as it is | `fact_sellout` rows of the recipe's stores, filtered by `mix`/`rate`, 30 monthly files | columns, `;`, 30 files `export_2024-01.csv` … `export_2026-06.csv`, all text on Connect |
| W | Osaka (R-03) twice | one region of the 16, picked | identical rows, one region twice |
| P1 | 6 SKUs spoiled | 6 sold SKUs, picked; for each, edge spaces or lower case or both | only spaces and case (invariant 6) |
| P2 | 110 lines sent twice | 3 to 4% of the lines, picked; copy in the same file, right after | key `sale_date, customer_name, sku_code` |
| P3 | 4 stale stores | 4 stores with sales, picked; old city and region from another store of a different prefecture | `updated_at` 400 days older, `is_active` 1 on both rows |
| P4 | edge spaces; Itiba for Ichiba | edge spaces on about 30% of lines; one of the recipe's chains misspelt (`TYPOS` table: Ichiba/Itiba, Minori/Minory, Nagisa/Nagiza, Kaigan/Kaygan, Prima/Prema, …, one per chain) | Trim plus Replace values solves it |
| P5 | three spellings, slash day first | three spellings; slash dates day first or month first (recipe) | ISO, dotted `DD.MM.YYYY`, slash; at least 20 slash lines with day 13 or more (invariant 3) |
| P6 | decimal commas | about 45% of revenues and 3% of units with a comma | the same button with Decimal separator: comma |
| P7 | `R-03` | prefix `R-`, `REG-` or `JP-` | Extract number solves it |
| P8 (info) | 174 / 82 / 106 | about 6% of revenues NULL, 3% of units NULL, 3% returns (negative units, revenue negative in proportion) | the truth has them, the learner keeps them |
| Refresh | July, seed 20260703, `2026/07/03` | July, seed = `sub`, same rules | 112 lines of 104 sales, the new spelling `%Y/%m/%d` (invariant 4) |
| Answer, More, R1 | the numbers of spec 5 | computed (section 2.3) | the question kinds and the parser |

The steps, cards, buttons, blanks and screens do not change shape: a variant is data plus texts. Only the third tile follows the headline question (1.3).

### 1.3 The headline question (A3)

From the 12 of `build-questions.md`, four fit the star the learner builds, have an answer of one name and one number, and vary between seeds. Each has a **biting dirt**: a problem that, left in, changes this answer (invariant 8 below), so the cleaning matters to this question.

| HeadlineId | Question (window and year from the recipe) | Third tile | Biting dirt | From |
|---|---|---|---|---|
| `chain` | Which chain sold the most from {window}, and how much? | chains, as today | P2 or P3 | canonical |
| `chainForBrand` | Which chain sold the most {brand} in {year}, and how much? | chains, as today; read with the Brand slicer | P1 (the brand loses its spoiled SKU) | question 8 |
| `city` | Which city sold the most from {window}, and how much? | by city (`gold_dim_customer.city`) | P3 (a stale store counts in its old city) | question 5 |
| `brand` | Which brand sold the most in {year}, and how much? | by brand (`gold_dim_product.brand`, join on `product_id`) | P1 | question 1 |

The third tile keeps one blank, the join key (`f.____`): `customer_id` for chain and city, `product_id` for brand. A1 (revenue of the window) and A2 (best month of the year) keep their tiles; only the dates in their SQL and texts change.

Left out: 2 and 10 (category: Beverages wins in every seed tried, nothing to find), 9 (fewest units: brands with no sell-out make "fewest" a trap about zero rows, not about cleaning), 3 (lowest macro-region: a second "lowest" twist, keep for later), 4, 7, 11 (units: gaps of a few units fail the 100 gate and the parser tolerance means little), 6 (same as A2's wrong line), 12 (one product of 47: too many near-ties).

**More K1 to K6** keep their kinds and move with the recipe: K1 count in the window; K2 top of the dimension **not used by the headline** (brand, or chain when the headline is `brand`); K3 units returned in the year; K4 top prefecture in the window; K5 top store of the recipe's second chain in the year; K6 the slicers, the window's revenue of one brand in one chain (the pair with the largest revenue that is neither the chain's nor the brand's total).

### 1.4 The dirt catalogue: in, new, out

| # | Kind | Verdict |
|---|---|---|
| 1 | Mixed date formats | in: P5; variants add month-first slash files |
| 2 | Decimal comma | in: P6 |
| 4 | Spaces and case in codes | in: P1 (products), P4 (names) |
| 6 | Lines sent twice | in: P2 |
| 7 | One customer, two spellings | in: P4 (the typo chain) |
| 8 | Store moved, old row kept | in: P3 |
| 13 | Negative quantities | in: P8, info only |
| 16 | Keys missing in the dimension | in: L1 to L3 coverage on the Model step |
| 18 | Empty, zero, NULL | in part: P8 (empty stays NULL) |
| 19 | One month missing in the folder | in part: Refresh (list against pattern); a missing month is a later Refresh variant |
| 12 | Text placeholders in numbers (`N/A`, `-`) | **new, P9** (phase 5): `try_cast` turns them into [Error]; the fix is Replace values with an empty value, so they become a plain NULL. Fits the existing [Error] rule and button |
| 10 | Subtotal rows in the lines | **new, P10** (phase 5): a `TOTAL` line per file inflates revenue; needs one new button, Remove rows where `<col>` = `<value>`; the check is the reference table |
| 3 | Thousands separators | out for now: `1,234` collides with the decimal comma of P6 in the same column |
| 5 | Leading zeros, scientific notation | out: Kaiyo's codes have letters (`AQUA002`), ids have no leading zeros |
| 9 | Header repeated inside the data | out: the given step's `CAST(raw_id AS INTEGER)` would stop the load; needs its own design |
| 11 | Merged cells as blanks | out: an Excel layout problem, the files are CSV |
| 14, 15 | Units of measure, currency | out: hidden (difficulty 3), only found against a control figure the build does not have |
| 17 | Encoding and BOM | out: `registerText` is UTF-8; nothing real to show |
| 20 | Late corrections | out: needs snapshots |

P9 and P10 are per recipe (a seed may have none, one or both), always after P6 in the card order, and phase 5 is optional: phases 1 to 4 make complete variants without them.

---

## 2. The generator

### 2.1 Where it runs

In the browser, in DuckDB over Lab's own parquet, inside the build's `prepare` (`src/db/buildRun.ts`), into schema `build_kaiyo` as today. For a variant `prepare` additionally loads `fact_sellout.parquet` (`port.parquet(SOURCE_FOLDER, 'fact_sellout.parquet')`) into `src_fact_sellout`; the canonical case does not load it. A `build_kaiyo.variant_meta(seed, sub, version)` table records what was prepared; `prepare` regenerates when the asked seed differs (switching variants), and keeps the tables otherwise.

The SQL is text made by pure functions in `src/data/build/variantSql.ts` from the recipe (like `FILE_SQL` today); `src/core/` stays DuckDB-free and `src/db/` runs it.

### 2.2 The tables, in order (and why this order)

1. `truth_sales`: the clean sample, one row per true sale: `sale_date` (= `week_start`), `customer_name`, `sku_code`, `units`, `revenue` `DECIMAL(12, 2)` (rounded from DOUBLE once, here), then the P8 odd values applied (NULLs, returns). Filter: `customer_id` in the recipe's stores and `(CAST(sellout_id AS BIGINT) * mix0 + mix1) % 1000 < rate`.
2. `truth_text`: each true sale written as the files write it: date spelling, name dirt (edge spaces, the typo chain), SKU case and spaces (the given step cleans these), decimal commas. **All text dirt is applied here, before any copy** (invariants 1 and 2).
3. `src_raw_sellout`: `truth_text` plus the copies (the same text line again, P2), `raw_id` numbered by `source_file`, then a BIGINT mix of the sale id, then copy number. It has exactly the columns of `staging_raw_sellout.parquet`, so Connect, the given step and every later step run unchanged.
4. `ref_sales` (= `truth_sales` with `raw_id` and `source_file` of the first copy), `ref_customers`, `ref_products`, `ref_regions`, then `file_customers`, `file_products`, `file_regions` from the recipe's P3, P1, W and P7 choices: the same SQL shapes as `REF_SQL` and `FILE_SQL`, with the `VALUES` lists and the prefix from the recipe.
5. The reference star and tiles (`REF_TILE_SQL`, its window and third tile from the recipe), then the **truth manifest** (2.3).

Choices made by row (which date spelling, which name gets spaces, which line is copied, which value has a comma) are a deterministic function of `(sub, sale id)` written in SQL with BIGINT arithmetic, never DuckDB's `hash()` (not promised stable across versions, and WASM and the node tests may differ in version).

### 2.3 The truth manifest: every answer from the data

One batch of SELECTs over the `ref_*` tables, `ref_star_fact` and two helper states, read into `Truth` (`src/core/buildTruth.ts` holds the type and the pure checks on it; the SQL is in `variantSql.ts`, `src/db/buildTruth.ts` runs it):

- **Answers** A1 to A3, K1 to K6, R1: `right` (pick, value) by the same SQL as the reference tiles and the K solutions, with the recipe's window, year, chain and brand. Ranked ones also carry the second place (`second`), for the wrong-answer line "X is second, N".
- **Wrong-answer lines** by the mistake they stand for, each a query: A1 count of sales; A1 with copies (on `ref_sales_with_copies`, a helper of `truth_sales` plus the copies, typed); A2 best month outside the year and the second month; K1 with copies and `count(revenue)`; K3 count of return lines, net units, positive units; R1 with copies, without the new-spelling lines, the previous month. A wrong value within 0.5 of the right one is dropped (the parser would accept it anyway).
- **Option lists**: the chains, brands, prefectures, stores of the K5 chain, cities: `SELECT DISTINCT … ORDER BY 1` on the dimensions (not only those with sales, so the pick is a real choice).
- **Facts for the texts**: counts and samples the cards and diagnoses quote: lines in the files and clean (`3,110 / 3,000` today), customers (`148 / 144`), regions (`17 / 16`), the W region and prefix, the six spoiled SKUs as written, sold SKUs, the stale stores with old and current city, the typo pair, rows in error per spelling, P8 counts, the July counts.

**Canonical first:** the same manifest SQL runs on the canonical tables, and a test asserts it gives today's constants (314,906.13; August 2025 64,592.75; Minori 90,829.50; 595; Fruvia 100,004.67; 217; Okinawa 44,845.38; Minori #1015 22,383.37; 24,519.83; 64,508.87; every wrong value in `ANSWERS` and `MORE_QUESTIONS`). Only then are the constants replaced by reads of the manifest (phase 1). The canonical run keeps its constants as the test's fixture, not as the page's source.

### 2.4 The invariants, as code-checkable rules

`checkTruth(recipe, truth): string[]` returns the broken rules (empty = valid). Each rule is a SQL count or a comparison on the manifest:

1. **Names before copies.** Every copy line equals its original in `sale_date`, `customer_name`, `sku_code`, `units`, `revenue`, byte for byte: `count(*)` of copy pairs that differ in any text column = 0.
2. **Dates before copies.** Covered by rule 1 (the same query includes `sale_date`).
3. **The swap shows.** Slash lines with day 13 or more: at least 20 (so the wrong order gives [Error], not silent wrong days); and at least 10 slash lines with day 12 or less (so `dateWrongDay` can happen). Weeks are Mondays, 59% of them fall on day 13 or later: met for any sample of this size.
4. **New spelling apart.** P5 slash dates start with two digits (`LIKE '__/%'`), the July new spelling with four (`LIKE '____/%'`): no line matches both, and no line of the 30 files matches `'____/%'`.
5. **P3 bites.** Each stale old row has `region_id` in 1 to 16, a city and region different from its current row; at least one stale store is among the top two prefectures of K4's window (so Oldest instead of Newest changes K4), and for headline `city` at least one is in the top city.
6. **P1 by Trim and Uppercase only.** `upper(trim(file sku)) = ref sku` for every product; the six spoiled SKUs are sold in the window (else P1 changes nothing).
7. **No near-tie.** First minus second at least 100.00 for A2, A3, K2, K4, K5 and the pair of K6; for A3 and K2 the first place also differs from the dirty state's first place or its value differs by at least 100 (rule 8).
8. **The dirt matters.** The headline answer with its biting dirt left in (1.3: copies kept, stale rows kept, or the spoiled SKUs unmatched) differs from the right one in the pick or by at least 100.
9. **Sizes.** Clean sales 2,800 to 3,200; every month of the 30 has sales; the window has at least 300 sales; every option list has at least 3 entries; K5's chain has at least 3 stores with sales in the year.
10. **No collisions.** Two different true sales never share `sale_date, customer_name, sku_code` after cleaning (true by the uniqueness of `fact_sellout`, checked anyway); the typo name exists in no real store name.

**Retry.** If `checkTruth` is not empty, the generator tries `sub = seed + 1, seed + 2, …` (the recipe is redrawn from `sub`), at most 20 times, deterministically; the page shows the asked seed and keeps `sub` in `variant_meta`. After 20 failures it falls back to variant 1 with a line (section 5). Pinned seeds are tested to pass at `sub = seed`.

### 2.5 Checks P1 to P7, L, F, K, R

Unchanged in mechanism: the learner's tables are compared with the variant's `ref_*` tables. What moves into the manifest is every literal a check or a diagnosis uses: expected row counts (`f.rows === 3000`, `f.rows < 144`), the typo pair (`LIKE '%Itiba%'`), the slash format the blank expects (`%d/%m/%Y` or `%m/%d/%Y`), the prefix, the window in the tiles and in `buildRecon.ts`, the right answers. `buildSolved.ts` and the demo's Fill (`buildFill.ts`) take the solved parameters from the recipe (find/with of P4, the date format) so demo mode works on every variant.

---

## 3. UI

- **Where variants start.** On the Answer step, after "You built it", a third card **Do it again on new data**: "Same steps, other files, another question from the Head of Sales." with **Variant 2** (and **Variant 3** once 2 is finished). It appears only after Answer is done in variant 1: the first pass teaches, the second practises. The Progress menu lists **Variant 1 · 2 · 3** with their marks, and **Another variant** (a random seed, drawn with `crypto.getRandomValues`, Math.random if absent).
- **The seed is visible.** The page header shows "Variant 2" (or "Variant · case 4817" for another), and the address carries `&seed=`, so a learner can share a case or reopen it. The `seed` parameter is kept by `hashWithDemo` and `hashWithBuild` like `demo` (`src/core/build.ts`).
- **Each variant keeps its own work.** localStorage key `stratalab.build.kaiyo-sales` for variant 1 (unchanged, no migration), `stratalab.build.kaiyo-sales@<seed>` for the others; an index `stratalab.build.variants` (seed, label, steps done, last opened) feeds the Progress menu. Start over clears only the open variant.
- **Switching** regenerates the tables (2.1) with a progress line "Making variant 2: sales 3,041 lines…" and the step bar disabled until `prepare` resolves (double clicks do nothing).
- **W in a variant** is shown folded ("Watched in variant 1. Watch again?") and counts as done; everything else is the learner's again.
- **Texts** of cards, hints and diagnoses are functions of the manifest facts (`text(f)`), so "6 of the 29 SKUs", "Look at the two rows of Nagisa #1045" become the variant's numbers and names. The canonical texts must come out word for word as today (test).
- **Return to the trainer (recommendation).** A variant finishing Answer, More or Refresh sends the same keys as variant 1: `build:kaiyo-sales`, `build:kaiyo-sales-more`, `build:kaiyo-sales-refresh`. The trainer writes them idempotently (`Progress.career.labDone`), so a second variant adds nothing there and breaks nothing, and a learner who started on variant 2 still gets the skill counted. No new key, no change in `quaera/`. Lab itself shows "Variants done: 2 of 3" in the Progress menu. Counting repetitions in the trainer is the owner's call (question 2).

---

## 4. The generator as a test

All in Vitest on the real parquet with the node DuckDB the build tests already use (`tests/build*.test.ts`); new files `tests/buildVariant.test.ts` (pure recipe and texts) and `tests/buildVariantRun.test.ts` (engine).

1. **Recipe determinism** (pure): the same seed and catalog give deep-equal recipes; 1,000 seeds give recipes within the ranges of 1.1; `recipe` never reads a clock or `Math.random`.
2. **Canonical manifest** (engine): the manifest on the canonical tables equals today's constants, every answer and wrong value (2.3), and the canonical texts equal today's strings.
3. **N seeds, all checks pass** (engine): seeds `1..25` plus the pinned ones: generate, assert `checkTruth` is empty (after retries, and that pinned seeds need none), write the files, then walk the solved path (Connect, W, P1 to P7 with the recipe's solved steps, links L1 to L3, F1, F2, star, the right tile blanks, the right answers from the manifest, K1 to K6 solutions, Refresh with the pattern and the fourth format) and assert every check passes and every answer is accepted. About 1 s per seed in the node engine; 25 keeps the suite under a minute. A nightly or manual `VARIANT_SEEDS=200` env runs more.
4. **Each check can fail** (engine, on 5 seeds): for every check, the one wrong move that should fail it does, with its diagnosis: P1 Trim only; P2 key `raw_id` and key without the date; P3 Remove duplicates and Oldest; P4 Trim only (typo left); P5 plain Change type and the wrong slash order; P6 point separator; P7 not done (L3 fails); F on the wrong key; tiles with `count(*)` and `month()`; A3 with the second place's pick; K1 with copies; R1 with copies. Also: the manifest's wrong values are each different from the right one.
5. **Invariants are guards, not hopes**: a test feeds `checkTruth` a hand-broken recipe per rule (stale store in the same region, a spoiled SKU that is not sold, a copy with an extra space, a tie) and expects that rule's message.
6. **Files round-trip**: for 5 seeds, the 30 files read back with Connect equal `src_raw_sellout` (`EXCEPT ALL` both ways = 0), as spec 2.3 does for the canonical files.
7. **e2e**: `e2e/build.spec.ts` gets one walk of variant 2 (Chromium only) after the canonical walk.

---

## 5. Edge cases

**Empty.** `seed=` empty, `0`, negative, not a number, more than 99,999: variant 1, address cleaned to `#build=kaiyo-sales`. A sample with a month of no sales or fewer than 2,800 rows: rule 9 fails, retry. A chain of the recipe whose stores have no sales in the window: rule 9 or 7 fails, retry. The empty slice of a slicer is already handled (`tile-kpi-empty`).

**Zero and boundaries.** A gap under 100 or a dirty answer equal to the right one: rules 7 and 8, retry. Window ends are `< first day of next month` everywhere (no `<= June 30`). Returns make negative revenue: the parser already accepts a sign; K3 is `unsigned` as today. 20 failed retries: variant 1 opens with the line "That case could not be made; here is variant 1." Rounding: revenue is rounded to cents once in `truth_sales`, sums are DECIMAL, so the manifest and the learner's tiles agree to the cent (spec 8.2, point 7).

**Duplicates.** Double click on Variant 2 or Another variant: the button is disabled until `prepare` resolves; the second click is ignored. The same seed opened twice: same tables (`variant_meta` matches, nothing regenerated). `#lab-done=` sent again from a variant: idempotent on the trainer's side (by key). Two tabs: the existing Web Lock keeps one tab on the database (`docs` of v0.15.0); the other gets "Use this tab".

**Formats.** Slash dates month first in a variant: the hint says "look at a slash date whose first part is above 12" instead of naming the order; the blank accepts the variant's format only. Answers typed `90 829,5`, `90,829.50`, `90829.5`: the existing `parseAnswerNumber`. A typo name with a character that needs SQL quoting: `TYPOS` holds only ASCII letters; Replace values already quotes with `quoteString`. Seed in the address with spaces or `+`: parsed as an integer by a strict regex `seed=(\d{1,5})`.

**Volume and time.** `fact_sellout.parquet` is 1.2 MB and read only for variants; generation is a few SQL statements over 118k rows (to measure in WASM in phase 2; budget 2 s on a mid laptop, the progress line covers it). The 30 file texts are about 150 KB, as today. Tests: 25 seeds in the default suite, more behind an env variable.

**Failures and access.** `fact_sellout.parquet` not loaded (offline first visit, a blocked fetch, a download manager like IDM catching the request): the variant card says "Variants need one more data file and could not load it. Variant 1 still works." and stays on variant 1; variant 1 needs nothing new. The Parquet extension from a blocked host: the same message as Lab's datasets (`extensions.ts`). localStorage unavailable: the variant runs in memory (the build's state already falls back), the seed in the address still reproduces the data; progress is lost on reload, as for variant 1 today. A saved variant whose generator version changed (`variant_meta.version` or a `v` in the saved work differs): the saved steps are kept and re-run, the checks judge against the new tables, and a line says "This variant was updated; your steps were re-run." The canonical save is never touched.

---

## 6. Phases

Each phase is one commit with a version bump in `package.json` and a ROADMAP entry; `npm test` and the build tests green; the canonical e2e walk unchanged. Versions assume nothing else lands in between.

| # | Phase | Model | Files | Tests | Version |
|---|---|---|---|---|---|
| 1 | **Truth manifest on the canonical case.** `Truth` type and the manifest SQL; answers, options, wrong lines, R1 and the text facts read from it; texts as functions of the facts; constants stay only in tests. Nothing visible changes. | **Opus**: fixes the manifest shape, the fact names and the text functions every later phase uses | `src/core/buildTruth.ts`, `src/data/build/variantSql.ts` (manifest part), `src/db/buildTruth.ts`, edits in `kaiyoSales.ts`, `buildSteps.ts`, `buildRun.ts`, `buildRecon.ts`, `linkData.ts`, `refreshData.ts`, `reviewChecks.ts`, screens that read `ANSWERS` / `MORE_QUESTIONS` | test 2 of section 4; all existing build tests unchanged | v0.53.0 |
| 2 | **Recipe and generator.** `seeded.ts`, `recipe`, catalog read, the SQL of 2.2, `checkTruth` with the ten rules and the retry; choose and pin `VARIANT_SEEDS`; measure generation time in the production preview. | **Opus**: the invariants and the dirt rules are the contract for phases 3 to 5 | `src/core/seeded.ts`, `src/core/buildVariant.ts`, `src/data/build/variantSql.ts`, `src/data/build/variants.ts`, `src/db/buildRun.ts` (`prepare` with a seed) | tests 1, 3 (generation and `checkTruth` only), 5, 6 | v0.54.0 |
| 3 | **Variant through the checks.** The seed in the address, per-variant save, the solved path and the failing moves on variants, the headline's third tile (city, brand), K2 swap, demo Fill per variant. | Sonnet | `src/core/build.ts`, `buildSteps.ts`, `buildSolved.ts`, `buildFill.ts`, `buildDashboard.ts`, `buildMore.ts`, `buildRefresh.ts`, `julyExport.ts` (seed parameter) | tests 3 (full walk) and 4 | v0.55.0 |
| 4 | **UI.** Do it again card, Progress menu list, header label, switching with the progress line, W folded, failure lines of section 5, e2e variant 2 walk. Then the hub walks variant 2 in the production preview. | Sonnet | `src/ui/build/AnswerScreen.tsx`, the Progress menu, `BuildPage.tsx`, `e2e/build.spec.ts` | e2e, unit tests of the index and labels | v0.56.0 |
| 5 | **P9 and P10** (optional, after the owner walked 2 and 3). The two new problems, the Remove rows button, recipe flags, their invariants and tests. | Opus for the card texts and rules (one short design note), Sonnet for the code | `kaiyoSales.ts` cards, `buildSteps.ts`, `variantSql.ts`, `buildVariant.ts` | tests 3 and 4 extended | v0.57.0 |

Phase 1 is the safety net: if the manifest gives today's numbers on the canonical case, the same SQL is trusted on variants. Phases 3 and 4 can be one Sonnet session if phase 2 lands clean.

---

## 7. Questions for the owner

1. **When does variant 2 open: only after variant 1's Answer, or from the start?** Default: after Answer of variant 1 (the first pass teaches with the canonical texts the five people already saw; a fresh learner who starts on a random variant meets numbers no one has checked by hand).
2. **Does the trainer count variants?** Default: no new keys; a variant sends the same `build:kaiyo-sales` keys, Lab shows "Variants done: 2 of 3". If the owner wants "practised 3 times" in the trainer, that is a separate key (`build:kaiyo-sales-v2`, allowed by `KEY_RE`) and a change in `quaera/`, a later commit there first (it receives).
3. **Is month-first slash dates in a variant fair to a beginner?** It reverses the canonical lesson ("Kaiyo's distributors put the day first"). Default: yes, in variant 3 only and in Another variant, with the hint pointing at a date whose first part is above 12; variant 2 keeps day first.
