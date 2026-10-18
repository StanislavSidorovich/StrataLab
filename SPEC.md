# StrataLab — Specification

## 1. Purpose

A light SQL workbench in the browser for learners and analysts: practise SQL on your own CSV / Excel files or on prepared datasets, without installing SQL Server Management Studio (~2 GB, licence or student setup) or configuring a database server. From opening the page to the first JOIN on own data: under a minute.

Part of the Quaera ecosystem: quaera.app (trainer), model.quaera.app (StrataSQL, data modeling), flow.quaera.app (StrataFlow, processes), pandas.quaera.app.

## 2. Principles

- No server, no account. Static site; everything runs in the browser; files never leave the device.
- Free and open: code Apache-2.0; every dependency under a permissive licence; datasets only with licences that allow redistribution.
- Interface ideas from SSMS, DBeaver, pgAdmin, Azure Data Studio, DB Fiddle (patterns only, no code or branding).

## 3. Architecture

```
Static site (Vite + React + TypeScript), GitHub Pages, custom domain via Cloudflare DNS
 ├─ DuckDB-WASM in a Web Worker         src/db/engine.ts
 │    └─ database file in OPFS (falls back to memory)
 ├─ importer: CSV / Excel / Parquet / JSON   src/db/importer.ts
 │    ├─ sniffing (encoding, delimiter, decimal comma, dates)   src/core/sniff.ts
 │    └─ Excel via SheetJS → CSV with ISO dates                 src/core/csvWrite.ts
 ├─ fill an existing table from a file (stage 2b)  src/core/fill.ts (rules → SQL), src/db/fill.ts
 ├─ show as model (stage 2c)  src/core/modelLink.ts (catalog → DDL → #sql= link), src/db/modelExport.ts
 ├─ data generator (stage 2)  src/core/generate.ts (keys + CHECKs → SQL), src/db/generate.ts
 ├─ dataset catalog (stage 3): Parquet in public/datasets/<id>/, one schema per dataset
 │    src/data/datasets.ts (+ datasets.json from scripts/build-datasets.py), src/db/datasets.ts
 ├─ the user's own datasets: schemas made in the tree, tables moved / renamed by copying
 │    src/core/ownDatasets.ts, src/db/ownDatasets.ts
 ├─ dialects (stage 4), per query tab: DuckDB · SQLite (Quaera) · T-SQL · PostgreSQL
 │    ├─ T-SQL → DuckDB: sqlglot in Pyodide, in a Web Worker   src/dialects/translate.py, sqlglotWorker.ts, tsql.ts
 │    │    side-by-side word diff                                src/core/diff.ts
 │    ├─ SQLite (Quaera) → DuckDB: the same translator (read="sqlite"), the trainer's dataset on the
 │    │    search path, SQLite's integer division                src/core/sqliteDialect.ts
 │    │    coverage on the trainer's own queries                 scripts/sqlite-coverage.py
 │    └─ PostgreSQL: PGlite (IndexedDB), results as Arrow       src/dialects/postgres.ts, pgResult.ts
 │         copy DuckDB tables in (keys, CHECKs, rows by CSV)    src/core/pgCopy.ts
 ├─ catalog (tables, views, columns of every schema)    src/db/catalog.ts
 ├─ exports (CSV, Excel, Parquet)       src/db/export.ts
 ├─ Python (stage 7): pandas, matplotlib, seaborn in Pyodide, in its own Web Worker
 │    src/python/kernel.ts (page side), pythonWorker.ts, lab.py (the `lab` module)
 │    cells, transfer of columns, outputs, .ipynb   src/core/pyCells.ts, pyTransfer.ts, ipynb.ts
 └─ UI: object tree, query tabs (CodeMirror 6), results grid (virtualised), import dialog
```

`src/core/` is pure TypeScript (no React, no DuckDB) and covered by Vitest.

## 4. MVP features (stage 1)

- Object tree: tables and views, columns with types, row counts; actions: first 100 rows, count, profile (SUMMARIZE), script SELECT, export CSV / Parquet, rename, drop.
- Query tabs: several, renamable, kept in localStorage; Ctrl+Enter / F5 runs the selection or the whole tab; completion of table and column names.
- Results: virtualised grid with types in the header, NULL shown as NULL, row count and time; copy (paste into Excel), export CSV (UTF-8 with BOM) and Excel; Messages log.
- Import: drag-and-drop anywhere or a button; preview of 50 rows with detected types and total rows; options: table name, separator, date format, decimal comma, header; Excel: sheet, header row.
- Errors: DuckDB message split into kind and text; T-SQL habits explained.
- Demo shop dataset (customers, products, orders, order_items) on first visit.
- Light / dark theme; the editor and panel backgrounds can be tinted (Aa, as in StrataSQL).

## 5. Data exchange between Quaera apps

Subdomains are separate origins, so data moves in the URL fragment (never sent to a server):

- `#ddl=<deflate+base64url>` — CREATE TABLE statements to run on open (from model.quaera.app).
- `#ds=<dataset id>` — open a catalog dataset (stage 3).
- To model.quaera.app: `https://model.quaera.app/#sql=<deflate+base64url>&name=<label>` — CREATE TABLE statements of one schema, opened there as a conceptual model (“Show as model”, stage 2c).
- `#s=<…>` — shared lab: datasets by id + queries (stage 5), each in its dialect (`l`: `tsql`, `postgres`, `sqlite`; none for DuckDB). `sqlite` is SQLite as the trainer (quaera.app) runs it, over its dataset `quaera` with bare table names: the trainer's “Open in Lab” sends `d:["quaera"]` and its task's SQL as such a tab. Own files can't be shared by link (they stay local); the share dialog says so.

Exports to pandas: Parquet (keeps types).

## 6. Stages

1. MVP workbench — section 4.
2. Ecosystem hops — open DDL from model.quaera.app; fill modelled tables from Excel with type and key checks; send tables back as DDL to model.quaera.app; data generator.
3. Dataset catalog — Chinook (MIT), Northwind and AdventureWorks (Microsoft sql-server-samples, MIT), Sakila / Pagila (BSD), NYC Taxi sample, Quaera's dataset; Parquet files served with the site or from a CDN with CORS.
4. Dialects — PostgreSQL mode via PGlite; T-SQL → DuckDB via sqlglot (Pyodide) with a diff; later SQLite (Quaera) → DuckDB the same way, so a trainer task gives the trainer's result. Pyodide, sqlglot and PGlite are served with the site and downloaded only when a tab switches dialect.
5. Share and practise — share links; tasks with result comparison; links from quaera.app lessons.
6. Polish — PWA, history, snippets, EXPLAIN tree, charts, RU / PT interface.
7. Python next to SQL — section 8.

## 7. Out of scope (for now)

- Real SQL Server / T-SQL engine (no WASM build exists; a server sandbox means hosting cost and licence questions).
- Direct Kaggle download (API needs the user's token and blocks browser requests) — download the file and drop it.
- BigQuery connection (needs Google sign-in and the user's billing project) — export a CSV from the console and drop it.
- Python packages beyond pandas, numpy, matplotlib and seaborn; `pip install` from PyPI (stage 7 keeps to what is served with the site).

## 8. Python next to SQL (stage 7)

For students doing homework or practice on a laptop who want SQL and pandas on one dataset without installing anything (today: Colab, which needs a Google account and an upload of the data).

- **A Python tab.** Python is a fourth choice on the tab's language switch (DuckDB · T-SQL · PostgreSQL · Python). The tab is one editor; `# %%` lines split it into cells (the percent format of VS Code, Spyder and Jupytext), `# %% [markdown]` starts a text cell. **Run** (Ctrl+Enter, F5) runs the selection, or every cell in order; **Shift+Enter** runs the cell at the cursor and moves to the next one.
- **The tables.** `lab.table("orders")` and `lab.table("quaera.fact_sellout")` give a pandas DataFrame of a DuckDB table or view (own tables, own datasets, catalog datasets: what the tree shows); `lab.sql("SELECT …")` runs DuckDB SQL and gives its result as a DataFrame; `lab.save(df, "name")` writes a DataFrame back to My tables (replacing a table of that name), so SQL tabs can query it; `lab.tables()` lists the names. DuckDB stays the one database: Python reads copies, it never holds the data itself.
- **Packages.** pandas and numpy load on the first run; matplotlib and seaborn when the code imports them. Nothing else for now (no `pip install`).
- **Output** as in Jupyter, per cell: printed text, the value of the cell's last line, figures (matplotlib / seaborn) as images, errors with the traceback trimmed to the user's code. The last DataFrame shown goes to the result grid, so Chart, Copy, Export and Save as table work on it as on a query result (the row limit applies).
- **One Python session** for all Python tabs of the page: variables stay between runs, as in a notebook, until **Restart Python**. **Stop** restarts it (Python in a worker can't be interrupted without cross-origin isolation, which GitHub Pages can't turn on).
- **Notebooks.** File → **Download as notebook (.ipynb)** writes the tab's cells, with the outputs of their last run, and a first cell that defines `lab` with DuckDB, so the notebook runs in Jupyter or Colab: catalog datasets are read from lab.quaera.app, the user's own tables from `<name>.parquet` next to the notebook (Export → Parquet). **Open** takes an `.ipynb` and makes a Python tab of its code and text cells (that first cell is left out).
- **Offline.** Pyodide and the packages are served with the site, and kept by the service worker after their first use, like DuckDB's extensions.
- **Not in share links** (`#s=`): the link format stays as it is; a Python tab is left out of a shared link, and the dialog says so.

Acceptance: in the production build, `#ds=quaera`, a Python tab runs `lab.table("quaera.fact_sellout").groupby(…).sum()` into the grid and a seaborn chart below it, offline after the first load; a downloaded .ipynb opens in Jupyter and runs there; an .ipynb opened in Lab becomes a Python tab.
