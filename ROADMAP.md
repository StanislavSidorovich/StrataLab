# StrataLab — Roadmap

Stages follow SPEC §6. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. MVP workbench | ✅ done (2026-10-17, v0.1.0) · not deployed yet | Drop a CSV/Excel file, see a preview with types, create a table, JOIN it with another, export the result; tables survive a reload |
| 2. Ecosystem hops | ⏳ next | model.quaera.app → “Open in StrataLab” creates the tables; StrataLab → “Show as model” opens the schema in model.quaera.app; fill a modelled table from Excel with key checks |
| 3. Dataset catalog | ⬜ | Chinook, Northwind, AdventureWorks, Sakila and Quaera's own dataset load in one click (Parquet on our CDN) |
| 4. Dialects | ⬜ | PostgreSQL mode (PGlite) and T-SQL → DuckDB translation (sqlglot) with a side-by-side diff |
| 5. Share and practise | ⬜ | Share link (data + query, DB Fiddle style); tasks with automatic result check, linked from quaera.app |
| 6. Polish | ⬜ | PWA (offline), query history and snippets, EXPLAIN as a tree, charts on results, RU/PT interface |

**Overall progress: stage 1 of 6.** The full application = all six stages.

## Where we are (2026-10-17, v0.1.0)

The MVP works locally (dev and production build checked in the browser): DuckDB 1.5.4 in a Web Worker, tables kept in the browser (OPFS), import of CSV / Excel / Parquet / JSON with automatic detection of Russian and Portuguese Excel habits, editor with completion, virtualised results, exports, T-SQL hints. Next: name and subdomain, GitHub repo + Pages + Cloudflare DNS, then stage 2.

## Decisions

- ✱ **Engine: DuckDB-WASM** (MIT) rather than SQLite (too weak) or PGlite (kept for stage 4 as a dialect). Reads CSV/Parquet/JSON natively, fast on millions of rows.
- ✱ **No server.** Static site on GitHub Pages; the user's data never leaves the browser (no GDPR question, zero hosting cost).
- ✱ **OPFS registered by hand** (`src/db/engine.ts`): DuckDB-WASM 1.33's own `opfs://` path never registers a new, empty database file (it checks `getSize()`), so everything silently stayed in memory while the UI said “saved”. We create both files (`.duckdb`, `.wal`) and register them under plain names. A second tab cannot lock the same file, so it falls back to an in-memory database and the badge says so.
- ✱ **Excel via SheetJS CE 0.20.3** from cdn.sheetjs.com (the npm `xlsx` package is stuck on a vulnerable 0.18). Sheets are written to CSV with ISO dates, then DuckDB sniffs the types, so CSV and Excel go through one path.
- ✱ **Detection before DuckDB's sniffer** (`src/core/sniff.ts`): Windows-1251 fallback when the file is not valid UTF-8, `;` delimiter, decimal comma, `dd.mm.yyyy` dates. DuckDB can't do encodings and needs `decimal_separator` / `dateformat` to be told.
- ✱ **F5 runs the query** (SSMS habit) anywhere on the page, instead of reloading it.
- ✱ **T-SQL hints, not silent rewriting** (`src/core/dialect.ts`): when a query fails, SQL Server habits (`TOP`, `[brackets]`, `ISNULL`, `GETDATE()`, `GO`…) get a “use this instead” note. Seeing the difference is part of learning.
- ✱ **English UI**, like StrataSQL and StrataFlow (international students); RU/PT in stage 6.
- ✱ **Demo shop on first visit** (4 tables, fixed seed) so the welcome query works before any file is dropped.
- Name **StrataLab**, subdomain **lab.quaera.app** (owner, 2026-10-17), in line with StrataSQL and StrataFlow.

## Next steps (by priority)

1. ✅ **Name + subdomain**: StrataLab · lab.quaera.app (owner, 2026-10-17)
2. **Publish**: GitHub repo, Pages via Actions (`deploy.yml` ready), custom domain + CNAME record on Cloudflare, Cloudflare Web Analytics only on the live host.
3. **Stage 2a — from model.quaera.app**: StrataSQL gets an “Open in StrataLab” button that packs the generated DDL (Postgres flavour) into `#ddl=` (compressed, like its share links); StrataLab reads the hash, runs the DDL, shows the empty tables. Different subdomains are different origins: no shared localStorage.
4. **Stage 2b — fill a table from Excel**: drop a file onto an existing table → map file columns to table columns → type / NOT NULL / FK / UNIQUE check with a row-by-row report (“row 47: customer_id 999 not in customers”) → INSERT.
5. **Stage 2c — to model.quaera.app**: “Show as model” sends the current tables' DDL to StrataSQL's SQL → model import (its roadmap #32).
6. **Data generator** for empty modelled tables (respects FKs).
7. Lazy-load DuckDB's JS and CodeMirror to cut the 285 kB (gzip) first chunk; the .wasm (~8 MB gzip) is already fetched in parallel.

## Known gaps

- Numbers with a space as thousands separator (`1 234,50`) stay text: DuckDB has no thousands option. Could be cleaned before import.
- A query result is held in memory in full; `SELECT *` on tens of millions of rows will be slow. A row cap with “show more” is a candidate.
- Multi-statement scripts show only the last statement's result.
- Not tried yet on Safari / Firefox (OPFS sync access handles are supported there, but untested).
- Mobile: usable to look, not to work (sidebar hidden below 768 px).
