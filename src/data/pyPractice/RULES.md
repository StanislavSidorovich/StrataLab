# Writing the Python practice page

The page is for someone who wants pandas in hand: look, remember, solve, from a first look at the data to a business answer. It does not teach from zero; quaera.app's pandas track and the pandas notebook do. Copy `s02-filter.ts` as the pattern.

## Shape of the page

Four parts, the way an analysis really goes. A section carries `part` only when it opens one.

- **Explore**: what is in the data, before changing anything.
- **Preprocess**: new columns, missing values, dates, a messy export.
- **Process**: groups, merges, reshaping, values across rows.
- **Analyse**: charts, business questions, free tasks.

Tables come in slowly. Sections 1 to 3 use `sellout` and `products`; each later section names the one or two tables it adds. There are 13 tables, and a task uses no more than it needs. Part 3's merges are where the star schema pays off: the fan-out trap, distributors stored in `customers`.

## A section

- The rhythm is: note, example, task, note, example, task. Two to four tasks, one or two examples.
- A note is at most two sentences, plus one line of syntax and one line of trap when they earn it. If it needs a third sentence, it is a lesson: leave it to the track.
- The trap is a mistake people really make with this topic, not a general warning.
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
- `ordered: true` only when the question states an order, and the order must be fully decided: add a second sort key when two rows can tie. Sort with `sort_values(..., kind="stable")` only if ties cannot be broken by a column.
- Months are real dates: ask for `month_start`, made with `dt.to_period("M").dt.to_timestamp()`. A Period and a Timestamp print differently, so the question says which one.
- At most 1,000 rows in the answer. Numbers compare to at most 2 decimals, by the answer's own decimals.
- Three hints, from where to look to almost the code. The third may be code.
- `traps`: a wrong cell people really write, and what is wrong with it. About 10 on the whole page. The test requires its result to differ from the answer's.
- Never the same question as a task in quaera.app's pandas track (`quaera/src/content/packs/`), nor one on the SQL practice page's wording: the same data, a different question. A task may say "the same as task N of the SQL page" only as a deliberate pair.
- Ids stay stable once published: they hold the learner's progress.

## Data facts to get right

- Sell-out (`sellout`) is outlets to shoppers, weekly; sell-in (`sellin`) is Kaiyo to distributors. `sellin.distributor_id` is a `customers.customer_id`.
- `customers` has outlets and 12 distributors (`channel == "distributor"`); those 12 have no `rep_id` and no sell-out rows.
- `promo_id` is missing on sales outside promotions (about 80% of the rows). It is `Int32` with `pd.NA`, so `==` on it gives `NA`, and `.isna()` is the test.
- Data runs from 2024-01-01 to the week of 2026-06-29. Say which period a question means when it matters.
- `raw` is the unclean export: dates in four forms (`2024-02-19`, `2024-5-20`, `11.03.2024`, `11/03/2024`), SKU codes in mixed case with spaces, `units` and `revenue` as text with missing values and decimal commas, exact duplicate rows (3,110 rows, 3,000 after dropping them). It does not reconcile row by row with `sellout`.
- `prices.promo_price` is meaningless noise: never use it. Read `querium-promo-data-limits` in memory before writing promo or price tasks. There is no cannibalisation, no post-promo dip, and depth does not explain lift in this data.
- Plan (`targets`) is by rep and division, not by brand.

## Checking

`npx vitest run tests/pyPractice.test.ts` runs every example, answer and trap in real pandas on the real parquet files.
