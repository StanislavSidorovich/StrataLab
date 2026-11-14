# Clean as a canvas (Power Query shape) and links by drag

Hub design, 2026-11-14. Owner's review of Clean v0.39.0: a long vertical feed of cards with the working panel below reads nothing like the tools the learner will meet (Power Query in Power BI and Excel, Tableau Prep, Celonis data model). Goal: the same gesture as those tools, compact, so the learner carries it over:

**see the problem in the column profile → click the column → press the transform → a step appears in Applied steps → Check.**

Bloom: spotting in the profile is *analyze*, pressing the transform is *apply*, Check and the diagnosis are *evaluate*.

Reference: owner's screenshots in `22. Quaera/research/lab-cleaning/` (Power Query Editor, Tableau data source, Celonis). Take the shape (ribbon, queries list, grid with column quality, applied steps, status bar). Do not copy their look, icons or wording beyond generic terms (Applied steps, Remove duplicates, Change type).

Nothing in the engine changes: `src/core/buildSteps.ts` (step kinds, `addSpec`, `chainSql`), `src/db/buildRun.ts` checks P1–P8, saved work and `WORK_VERSION` stay as they are. This is a re-layout of `src/ui/build/CleanScreen.tsx` and `StepsPanel.tsx`.

## 1. Layout (≥ 1100 px)

```
┌ TASK BAR ───────────────────────────────────────────────────────────────────────────┐
│ P2 · Sales · Duplicate rows from two exports     2 of 5 problems left   [Check] [?] │
│ Do: remove the rows that came twice, keep the latest export.                         │
├ RIBBON ─────────────────────────────────────────────────────────────────────────────┤
│ Rows: Remove duplicates · Keep latest │ Column: Trim · UPPERCASE · Replace values ·  │
│ Extract number · Change type ▾ · Dates │ Advanced: SQL                               │
├ QUERIES ──┬ SQL OF THIS STEP ────────────────────────────────────────┬ APPLIED STEPS ┤
│ ● Sales 2 │ SELECT DISTINCT * FROM step_2                             │ 1 Given       │
│   Customers│──────────────────────────────────────────────────────────│ 2 Trim name   │
│ ● Products1│ sale_date ▾ │ customer_name ▾ │ sku_code ▾ │ units ▾    │ 3 Remove dup ◀│
│   Regions │ ■■■■■■■□ 97% │ ■■■■■■■■ 100%   │ ■■■■■□□□  │ ■■■■■■■■  │   (click = see│
│           │ 21 error     │ 312 distinct    │ 9 distinct │           │    table here)│
│           │ 0 empty      │                 │ 3 spellings│           │               │
│           │ 2025-01-06 … │ Sakura Mart …   │ KT-001 …   │ 12        │ [×] last step │
│           │ …  (first 50 rows, sticky header)                        │               │
├───────────┴───────────────────────────────────────────────────────────┴───────────────┤
│ Columns 7 · Rows 1 204 → 1 196 · profile on all rows                                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Task bar** (replaces the column of cards W, P1–P8). One line: id, source, title, "N of M problems left", Check, a `?` that opens "If you're stuck" (existing hint levels). Second line: the existing `action` text. Done problems collapse into chips on the left of the bar (click to reopen, as `clean-reopen-*` does now). The diagnosis after Check (`build-verdict`, AffectedRows) opens as a panel under the task bar, pushing the ribbon down, closable. W (Watch) stays as the first task with its own body in the centre in place of the grid.
2. **Ribbon.** The existing toolbar buttons regrouped: *Rows* (Remove duplicates, Keep latest) and *Column* (Trim, UPPERCASE, Replace values, Extract number, Change type ▾ Date / Whole number / Decimal, Dates), *Advanced: SQL* (the P2 blank and the P5 format, shown in the centre over the grid, like an advanced editor). Column buttons act on the selected column; with none selected the button stays enabled and says "Pick a column first: click its header" next to the ribbon. A button that does not apply to this source is hidden, not disabled.
3. **Queries pane.** The four sources; a dot with the count of open problems in that source. Click switches the grid. The Model step's "go fix this in Clean" (`first source`) selects the source and the column.
4. **Grid.** The clean table at the selected step (default: last). Header: type mark (text / number / date), column name, then the **column quality strip**: valid / error / empty as a three-part bar and %, distinct count, and for text one hint line when it applies (`3 spellings` = values equal after trim+upper but different raw, `leading spaces`, `digits inside text`). Error = the value becomes NULL at a typing step (existing `stepErrorsSql` logic). Click header = select column (accent outline, `aria-pressed`). Cells with an error are tinted (`errors.css` already has the tint). 50 rows, sticky header, the grid scrolls inside its own box; the page does not scroll sideways.
5. **SQL of this step** above the grid, read-only, one line wrapping (`shownSql`). This is our formula bar: the learner sees that every button writes SQL (Power Query shows M there).
6. **Applied steps** (existing list). Click a step = the grid and profile show the table after that step (PQ does exactly this). Remove only the last added step (as now).
7. **Status bar:** columns, rows before → after the current step (`rowsChange`), "profile on all rows".

Hints and teaching level 2 may *point at* the column ("look at the sku_code profile") but never select it for the learner.

## 2. Narrow screens

1100–1365: Queries become tabs over the grid; Applied steps narrower (labels wrap). Below 1100: the existing "Open on a laptop" message of the build page applies as now; phones are not supported for the build.

## 3. Column profile: SQL

One query per (source, step) over the table after that step, cached by the step chain's SQL text, re-run only on change:

```sql
SELECT '<col>' AS col, count(*) AS n, count(<col>) AS non_null,
       count(DISTINCT <col>) AS distinct_n,
       count(DISTINCT upper(trim(<col>))) AS distinct_norm,     -- text only
       sum(CASE WHEN <col> <> trim(<col>) THEN 1 ELSE 0 END) AS padded  -- text only
FROM (<chain up to step i>)
-- UNION ALL per column
```
Errors per column come from the existing error query at typing steps; `empty` = NULL or '' that was not caused by a typing step. "3 spellings" shows when `distinct_n > distinct_norm`. Pure SQL builder in `src/core/buildProfile.ts` with vitest on the numbers of each source at the given step and after the solved path (`tests/buildSolved.ts`).

## 4. Links by drag (Model step)

`LinkCanvas.tsx` rows are already pickable by click (many side, then one side) and by keyboard. Add drag on top, keep click and keyboard:
- pointerdown on a row starts a dashed line following the pointer (SVG path in the canvas, the existing `PendingLine` style 'run');
- pointerup on a row of another box = the same as the two picks in order (many = start, one = end; if the learner dragged from the one side, swap, since the check already knows which side is unique);
- drop elsewhere or Esc cancels; a move under 6 px is a click.
The right panel stays for the checks and the pill numbers; its pick lists remain as the keyboard path. Test: unit on the drag→picks mapping; e2e drags one link in Chromium.

## 5. Slices for Sonnet (in order, one session at a time)

- **C1 shell (L).** Task bar, ribbon, queries pane, grid, SQL line, Applied steps with "view at step", status bar, by moving existing pieces; new CSS in `cleanCanvas.css`. Behaviour and checks unchanged: all existing tests green; update `e2e/build.spec.ts` to the new controls and keep it green in three engines.
- **C2 column profile (M).** `buildProfile.ts` + header strip + error tint; vitest.
- **D links by drag (S).** Section 4.
- Version: one minor per slice; ROADMAP entry each.

## 6. Choices made here (hub)

- The task bar replaces the vertical card feed; cards' texts are reused as they are (no rewrite now).
- No new transforms; the ribbon shows only what v1 has. Split column / Fill down / Group by stay out until a problem needs them.
- Profile on all rows, not the first 1 000 (tables are small).
