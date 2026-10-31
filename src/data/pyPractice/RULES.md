# Writing the Python practice page

The page is for someone who wants pandas in hand: look, remember, solve, from a first look at the data to a business answer. People do learn from this page, so each skill is practised alone before tasks combine it. The fast path stays: "I know this" folds a section, "Test me" jumps to its last task. Copy `s02-filter.ts` as the pattern.

## Shape of the page

Four parts, the way an analysis really goes. A section carries `part` only when it opens one.

- **Explore**: what is in the data, before changing anything.
- **Preprocess**: new columns, missing values, dates, a messy export.
- **Process**: groups, merges, reshaping, values across rows.
- **Analyse**: charts, business questions, free tasks.

Tables come in slowly. Sections 1 to 3 use `sellout` and `products`; each later section names the one or two tables it adds. There are 13 tables, and a task uses no more than it needs. Part 3's merges are where the star schema pays off: the fan-out trap, distributors stored in `customers`.

## A section

- The rhythm is: note, example, a task on that one skill. When a section has shown several skills, a task joins them. The last task is the hardest and adds nothing new.
- A section has as many tasks as it needs, usually 6 to 12: one for each skill, plus the joins. Sections with no topic of their own (`business`, `free`, `data`) are not ladders.
- A note is at most three sentences and first says what the thing is for, plus one line of syntax and one line of trap when they earn it.
- `skills` on a task names the moves its solution makes, from `skills.ts`. Helpers such as `round`, `head`, `reset_index` and variables are not skills.
- The first task of a section uses one skill. A task adds at most one skill not yet practised on the page. Skills of earlier sections count as practised. `tests/practiceLadder.test.ts` checks all of this, and that the tags are true.
- The trap is a mistake people really make with this topic, not a general warning.
- Every `.method` or function a solution uses has already appeared in a note or an example above it, on this page. `tests/practiceTaught.test.ts` fails otherwise. Prefer a simpler solution to a new function that only tidies the answer.
- The last task of a section is its hardest: "Test me" jumps there.
- No story, no characters, no praise. English; no long dashes.

## How a cell runs

- Every cell starts clean with `pd`, `np` and the tables of `tables.ts` as variables. Nothing carries over from another cell, so never rely on one. A cell may change its copies freely.
- The value of the last line is the answer, as in Jupyter. It must be a DataFrame, a Series, a number, a text, or an array. An assignment on the last line gives nothing to check.
- `import matplotlib.pyplot as plt` is needed for charts. A plot cell ends with the table behind it: the chart is judged by eye, the table is checked.

## A task

- `question` is what a manager would ask, and it names the columns and the order wanted.
- Check ignores an unnamed index (row labels) and treats a named one as a column. So `groupby("brand")["units"].sum()` and `groupby("brand", as_index=False)["units"].sum()` are the same answer. Do not make a task whose answer lives in an unnamed index, as with `describe()` or `df.loc[...]` labels: say `reset_index` or ask for one value.
- Column names don't matter, only their number and meaning. With a named result column, say the name in the question anyway.
- `ordered: true` only when the question states an order, and the order must be fully decided: add a second sort key when two rows can tie. The test wants a sort in the solution's text, so end a pivot or crosstab with `sort_values` or `sort_index` too.
- Months are real dates: ask for `month_start`, made with `dt.to_period("M").dt.to_timestamp()`. A Period and a Timestamp print differently, so the question says which one.
- At most 1,000 rows in the answer. Numbers compare to at most 2 decimals, by the answer's own decimals.
- Three hints, from where to look to almost the code. The third may be code.
- `traps`: a wrong cell people really write, and what is wrong with it. Only where the wrong cell really gives a different result; about 25 on the whole page. The test requires its result to differ from the answer's.
- Never the same question as a task in quaera.app's pandas track (`quaera/src/content/packs/`), nor one on the SQL practice page's wording: the same data, a different question. A task may say "the same as task N of the SQL page" only as a deliberate pair.
- Ids stay stable once published: they hold the learner's progress.

## Data facts to get right

- Sell-out (`sellout`) is outlets to shoppers, weekly; sell-in (`sellin`) is Kaiyo to distributors. `sellin.distributor_id` is a `customers.customer_id`.
- `customers` has outlets and 12 distributors (`channel == "distributor"`); those 12 have no `rep_id` and no sell-out rows.
- `promo_id` is missing on sales outside promotions (about 80% of the rows). It is `Int32` with `pd.NA`, so `==` on it gives `NA`, and `.isna()` is the test.
- Data runs from 2024-01-01 to the week of 2026-06-29. Say which period a question means when it matters.
- `raw` is the unclean export: dates in four forms (`2024-02-19`, `2024-5-20`, `11.03.2024`, `11/03/2024`), SKU codes in mixed case, spaces in customer names (919 rows, none in SKU codes), `units` and `revenue` as text with missing values and decimal commas, 110 negative units, duplicate rows that show only with `raw_id` left out (3,110 rows, 3,000 after dropping them). It does not reconcile row by row with `sellout`.
- `format="mixed"` misparses `raw` dates, with or without `dayfirst`: it swaps month and day on `2024-5-20`. Bring every form to one first and parse with an explicit format; the result agrees with the month in `source_file` on every row.
- `sellin.month_start` is the order month, not the ship month. Rows are already sorted in time within a series, so a trap based on unsorted rows needs a real shuffle or another sort.
- Pharmacies sell only Pharma and other channels only FMCG, so a category by channel pivot has empty cells. Nettora's delisting (second half of 2025) leaves 12 distributor and product pairs with no 2026 shipments.
- `prices.promo_price` is meaningless noise: never use it. Read `querium-promo-data-limits` in memory before writing promo or price tasks. There is no cannibalisation, no post-promo dip, and depth does not explain lift in this data.
- Plan (`targets`) is by rep and division, not by brand.

## Checking

`npx vitest run tests/pyPractice.test.ts` runs every example, answer and trap in real pandas on the real parquet files.
