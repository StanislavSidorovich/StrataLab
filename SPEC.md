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
 ├─ dialects (stage 4), per query tab: DuckDB · T-SQL · PostgreSQL
 │    ├─ T-SQL → DuckDB: sqlglot in Pyodide, in a Web Worker   src/dialects/translate.py, sqlglotWorker.ts, tsql.ts
 │    │    side-by-side word diff                                src/core/diff.ts
 │    └─ PostgreSQL: PGlite (IndexedDB), results as Arrow       src/dialects/postgres.ts, pgResult.ts
 │         copy DuckDB tables in (keys, CHECKs, rows by CSV)    src/core/pgCopy.ts
 ├─ catalog (tables, views, columns of every schema)    src/db/catalog.ts
 ├─ exports (CSV, Excel, Parquet)       src/db/export.ts
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
- Light / dark theme.

## 5. Data exchange between Quaera apps

Subdomains are separate origins, so data moves in the URL fragment (never sent to a server):

- `#ddl=<deflate+base64url>` — CREATE TABLE statements to run on open (from model.quaera.app).
- `#ds=<dataset id>` — open a catalog dataset (stage 3).
- To model.quaera.app: `https://model.quaera.app/#sql=<deflate+base64url>&name=<label>` — CREATE TABLE statements of one schema, opened there as a conceptual model (“Show as model”, stage 2c).
- `#s=<…>` — shared lab: datasets by id + queries (stage 5). Own files can't be shared by link (they stay local); the share dialog says so.

Exports to pandas: Parquet (keeps types).

## 6. Stages

1. MVP workbench — section 4.
2. Ecosystem hops — open DDL from model.quaera.app; fill modelled tables from Excel with type and key checks; send tables back as DDL to model.quaera.app; data generator.
3. Dataset catalog — Chinook (MIT), Northwind and AdventureWorks (Microsoft sql-server-samples, MIT), Sakila / Pagila (BSD), NYC Taxi sample, Quaera's dataset; Parquet files served with the site or from a CDN with CORS.
4. Dialects — PostgreSQL mode via PGlite; T-SQL → DuckDB via sqlglot (Pyodide) with a diff. Pyodide, sqlglot and PGlite are served with the site and downloaded only when a tab switches dialect.
5. Share and practise — share links; tasks with result comparison; links from quaera.app lessons.
6. Polish — PWA, history, snippets, EXPLAIN tree, charts, RU / PT interface.

## 7. Out of scope (for now)

- Real SQL Server / T-SQL engine (no WASM build exists; a server sandbox means hosting cost and licence questions).
- Direct Kaggle download (API needs the user's token and blocks browser requests) — download the file and drop it.
- BigQuery connection (needs Google sign-in and the user's billing project) — export a CSV from the console and drop it.
