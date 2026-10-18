# StrataLab

**Practise SQL in the browser on your own CSV and Excel files.** Drop a file, write a JOIN. No install, no account, no server: your data never leaves the browser.

Part of [Quaera](https://quaera.app), together with [model.quaera.app](https://model.quaera.app) (data modeling) and [flow.quaera.app](https://flow.quaera.app) (processes).

## Why

SQL Server Management Studio is a ~2 GB install plus a database server, a licence or a student setup. To practise a `JOIN` on two spreadsheets you need none of that. StrataLab runs [DuckDB](https://duckdb.org) compiled to WebAssembly right in the page.

## What it does

- **Import** CSV, Excel (any sheet, header row below a title is found), Parquet and JSON, by drag-and-drop. Files saved by a Russian or Portuguese Excel just work: Windows-1251, `;` separators, decimal commas, `31.12.2026` dates.
- **Query** in tabs with SQL completion; `Ctrl+Enter` or `F5` runs the selection or the whole tab.
- **See** results in a fast grid with column types; copy into Excel, export CSV / Excel, export whole tables as CSV / Parquet (for pandas).
- **Fill** an existing table from a file (drop it onto the table): columns are matched by name, and every row is checked against the table's types, NOT NULL, keys, foreign keys and CHECKs before anything is written: "row 47: customer_id = 999 is not in customers". Insert the good rows, fix the rest.
- **Sample datasets** in one click, each in its own schema: Chinook, Northwind, AdventureWorks LT, Sakila and Quaera's Kaiyo Trading. A link like `lab.quaera.app/#ds=northwind` opens one directly.
- **Generate** sample rows for empty tables (a model you just drew, or your own CREATE TABLE): foreign keys point at existing rows, keys don't repeat, CHECKs hold.
- **Show as model**: one click opens your tables (or a dataset) as an entity-relationship model in [model.quaera.app](https://model.quaera.app); its “Open in StrataLab” brings a model back as empty tables with their keys.
- **Keep** your tables between visits (stored in the browser's private file system).
- **Four dialects** per tab: DuckDB, for your own data and analysis; **SQLite (Quaera)**, to re-run a task from the [Quaera trainer](https://quaera.app) with the same result (its tables by their bare names, SQLite's division, dates and LIKE); **SQL Server (T-SQL)**, translated to DuckDB by [sqlglot](https://github.com/tobymao/sqlglot) before it runs, with the T-SQL and the DuckDB SQL side by side and what changed highlighted (SQLite tabs get the same view); and **PostgreSQL**, a real PostgreSQL 18 ([PGlite](https://pglite.dev)) in the page. Copy your tables or a dataset into it, keys included, from the tree.
- **Learn** the dialect: in a DuckDB tab, SQL Server habits (`TOP`, `[brackets]`, `ISNULL`, `GETDATE()`) get a "use this instead" hint and a button to run the tab as T-SQL.
- A **welcome screen** (the ? button) says where things are; a **demo shop** dataset is loaded on the first visit.

## Run locally

```bash
npm install
npm run dev
```

`npm test` runs the unit tests, `npm run build` makes the static site in `dist/`.

## Stack

Vite · React · TypeScript · Tailwind CSS · DuckDB-WASM · PGlite · Pyodide + sqlglot · CodeMirror 6 · TanStack Virtual · SheetJS CE · Zustand. MIT / Apache-2.0, Pyodide MPL-2.0 (served unmodified).

## Licence

Code: [Apache-2.0](LICENSE). Sample datasets keep their own licences (MIT, BSD-2-Clause, CC BY-NC-SA 4.0): see [public/datasets/NOTICE.md](public/datasets/NOTICE.md). `scripts/build-datasets.py` rebuilds them from their sources. The dialect engines: [public/sqlglot/NOTICE.md](public/sqlglot/NOTICE.md).
