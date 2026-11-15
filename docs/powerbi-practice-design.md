# Power BI practice (`#practice=powerbi`): design

Status: approved by the owner 2026-11-15 (hub on Opus). Build in passes; pass 1 = foundation (below).

## Why
Power BI is in most BI job ads; the trainer cannot reach BI level 2 by itself. SQL and Python practice pages work for the owner as 10–20 minute daily drills. Same rhythm for Power BI, without a cloud sandbox: what the browser can check runs in Lab, what needs real Power BI Desktop goes out as a zip with step pages and comes back as a number.

## Shape
A practice page like SQL and Python (`src/ui/PracticeBook.tsx` shell: sections, warm-up from earlier sections, "Where was it?", hints, gate "taught in this or an earlier section"). Not part of the build-by-hand page: the build is one guided case, this is a ladder of short drills.

Data: one Kaiyo star, the same tables the Power BI bridge exports (`src/core/powerBi.ts`): `fact_sales` (3000 rows, returns as units < 0), `dim_customer` (144), `dim_product` (47), dates 2024-01-01..2026-06-29. No new datasets.

Every section has two layers:
- **Layer A, in Lab (2–3 min each, works on a phone):** understanding tasks checked in the browser. Kinds: `predict` (what number does this measure return under this filter; Lab computes the truth with DuckDB SQL equivalent, never runs DAX), `pick` (which relationship, cardinality, filter direction; which visual for this question), `order` (Power Query steps), `spot` (what is wrong: column instead of measure, wrong table, date hierarchy on the axis).
- **Layer B, in Power BI Desktop (10–15 min):** a drill. Download zip = CSVs + `steps.html` (same look as the bridge's steps page, v2 lessons included: Month is a column not a measure, date hierarchy, Display units, chain_name vs customer_name) + `start/` state notes. Steps open through Hint, then Show steps. The learner types the number from their card; Lab checks it.

Drills stack: each continues the learner's own .pbix from the previous drill, but each zip also says how to start from scratch in 2 minutes (load these CSVs, make these links), so a missed day does not block.

A day = warm-up from an earlier section + 1–2 layer A tasks + 1 layer B drill.

## Sections (ladder)
1. Get data and types (Power Query: load three CSVs, types, decimal and date locale)
2. Clean in Power Query (trim, split, replace, unpivot, merge; M steps named like Lab's Clean)
3. Model and links (star, many-to-one, single direction, why not both)
4. Basic measures (SUM, DIVIDE, COUNTROWS; measure vs calculated column)
5. CALCULATE and filter context
6. Date table and last year (CALENDAR/marking, SAMEPERIODLASTYEAR, YTD)
7. Share and top N (ALL / REMOVEFILTERS, RANKX, TOPN)
8. Visuals and a page for a manager's question (card, line, bar, slicer, interactions, Display units)

Out of scope, said so on the page: RLS, publishing to the Service, gateways, performance tuning.

## Number check (edge cases)
- Accept `1234.56`, `1 234,56`, `1,234.56`, `1.234,56`, `1.23K`/`1.23M` (Display units!), percent with or without `%`. Normalise, compare with tolerance 0.005 relative to the shown precision; when the learner typed a rounded Display-units value, say "matches at this precision; switch Display units to None to see the full number".
- Empty input: no check. Negative where positive expected: hint "returns are units < 0; did you filter them?"
- A number that matches a known trap (e.g. sum with returns, customer_name instead of chain_name) gets its own message, like the build's [Error] cards.
- localStorage unavailable: progress lives in memory, page still works.

## Credit
Key `practice:powerbi` after 70% of sections (as `practice:sql`). Trainer side (what level it counts for, BI 2 proposed) decided with the owner later; not in pass 1.

## Pass 1 (foundation, one Sonnet session)
- Route `#practice=powerbi`, entry from the Practice menu next to SQL and Python, page title "Power BI practice".
- Sections 1, 3, 4 complete (layer A: 3–4 tasks each; layer B: one drill each with zip, steps page, number check). Sections 2, 5–8 listed with "coming next".
- Expected numbers computed in tests from the same CSVs (DuckDB), not typed by hand.
- Tests: number normaliser (all formats above), each drill's expected number, zip contents.
