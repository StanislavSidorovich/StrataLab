# Writing the SQL practice page

The page is for someone who has learnt SQL before and needs to get it back: look, remember, solve. It does not teach from zero; quaera.app's SQL track does. Copy `s07-inner-join.ts` as the pattern.

## A section

- The rhythm is: note, example, task, note, example, task. Two to four tasks, one or two examples.
- A note is at most two sentences, plus one line of syntax and one line of trap when they earn it. If it needs a third sentence, it is a lesson: leave it to the track.
- The trap is a mistake people really make with this topic, not a general warning.
- The last task of a section is its hardest: "Test me" jumps there.
- No story, no characters, no praise. English; no long dashes.

## T-SQL only

Every query is valid T-SQL for Fabric Warehouse:

- `SELECT TOP (n)`, never `LIMIT`. `CAST(x AS type)`, never `::`. `ON a.x = b.x`, never `USING`.
- `GROUP BY` and `HAVING` repeat the expression; only `ORDER BY` may use a name given in SELECT.
- Dividing whole numbers: `1.0 * a / b`. AVG of a whole-number column: `AVG(1.0 * units)`. Lab's DuckDB would forgive both, Fabric would not.
- Text comparisons match the case the data has: `'Pharma'`, not `'pharma'`. A Fabric Warehouse is case-sensitive by default (`Latin1_General_100_BIN2_UTF8`), as Lab is; a warehouse made with another collation is not.
- Not in the first version: `TOP … WITH TIES` and `CROSS APPLY` with an outer `TOP` (the translator cannot run them).
- Tables always with their schema: `quaera.fact_sellout`.

`fabricNotes` (`src/core/sqlPractice.ts`) must find nothing in any query; the test fails otherwise.

## In PostgreSQL

A task gets `pg` (its full solution in PostgreSQL, shown under the task after Solution) only where the T-SQL fails or gives a different result there: `TOP` to `LIMIT`, `YEAR(d)` to `EXTRACT(YEAR FROM d)`, `DATETRUNC`, `DATEDIFF`, `DATEADD`, `ISNULL`, `TRY_CAST`, and `ROUND` of a DOUBLE column (cast to `numeric`). Keep the tables as `quaera.…`; change only the dialect. The test runs every `pg` on PostgreSQL (PGlite) over the same rows and compares it with the T-SQL answer, and runs the tasks without `pg` as written: a new task that fails there needs a `pg`.

## A task

- `question` is what a manager would ask, and it names the columns and the order wanted. Check compares results, so a question that leaves them open fails right answers.
- `ordered: true` only when the question states an order, and the order must be fully decided: add a second sort key when two rows can tie, or a right answer can fail by luck.
- At most 1,000 rows in the answer. Revenue may stay unrounded: Check compares to 2 decimals.
- Three hints, from where to look to almost the code. The third may be code.
- `traps`: a wrong query people really write, and what is wrong with it, about 10 on the whole page. The test requires its result to differ from the answer's.
- Never the same question as a task in quaera.app's SQL track (`quaera/src/content/packs/sql-core.en.json`): the same data, a different question.
- Ids stay stable once published: they hold the learner's progress.

## Data facts to get right

- Sell-out (`fact_sellout`) is outlets to shoppers, weekly; sell-in (`fact_sellin`) is Kaiyo to distributors. `fact_sellin.distributor_id` is a `dim_customer.customer_id`.
- `dim_customer` has outlets and 12 distributors (`channel = 'distributor'`); those 12 have no `rep_id`, no sell-out rows.
- `promo_id` is NULL on sales outside promotions (about 80% of the rows).
- Data runs from 2024-01-01 to the week of 2026-06-29. Say which period a question means when it matters.
- Read `querium-promo-data-limits` in memory before writing promo or price tasks.

## Checking

`npx vitest run tests/sqlPractice.test.ts` translates and runs every example, answer and trap on the real parquet files.
