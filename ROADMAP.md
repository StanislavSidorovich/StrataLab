# StrataLab — Roadmap

Stages follow SPEC §6. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. MVP workbench | ✅ done (2026-10-17, v0.1.0) · deployed to GitHub Pages; live at https://lab.quaera.app once the Cloudflare CNAME is added | Drop a CSV/Excel file, see a preview with types, create a table, JOIN it with another, export the result; tables survive a reload |
| 2. Ecosystem hops | ⏳ in progress · 2a ✅ (2026-10-17) | model.quaera.app → “Open in StrataLab” creates the tables; StrataLab → “Show as model” opens the schema in model.quaera.app; fill a modelled table from Excel with key checks |
| 3. Dataset catalog | ⬜ | Chinook, Northwind, AdventureWorks, Sakila and Quaera's own dataset load in one click (Parquet on our CDN) |
| 4. Dialects | ⬜ | PostgreSQL mode (PGlite) and T-SQL → DuckDB translation (sqlglot) with a side-by-side diff |
| 5. Share and practise | ⬜ | Share link (data + query, DB Fiddle style); tasks with automatic result check, linked from quaera.app |
| 6. Polish | ⬜ | PWA (offline), query history and snippets, EXPLAIN as a tree, charts on results, RU/PT interface |

**Overall progress: stage 1 of 6, stage 2 under way (2a done).** The full application = all six stages.

## Where we are (2026-10-17, stage 2a)

**Stage 2a done: a model from model.quaera.app opens as empty tables.** StrataSQL's SQL tab has **Open in StrataLab ↗**; it sends its PostgreSQL DDL in `#ddl=` (deflate-raw + base64url, like its share links). On load, or when the hash changes in an open tab, StrataLab decodes it (`src/core/ddlLink.ts`), clears the hash, turns the script into a DuckDB plan (`src/core/ddlPlan.ts`), asks before replacing tables that already exist (replace / keep and create the rest / cancel), creates the tables (`src/db/ddl.ts`), refreshes the tree and opens a tab with one `SELECT` per table. Anything DuckDB can't take is listed per statement in a dialog. Checked end to end with Playwright on both dev servers (and the production build): the Quaera model's 12 tables, 12 PKs, 7 UNIQUEs and 16 FKs arrive; `INSERT` with a missing `rep_id` fails with DuckDB's foreign-key error; a second click reuses the StrataLab tab and asks before replacing. All 9 StrataSQL models (8 cases + Quaera) decode byte for byte and create with no notes. 31 unit tests green.

Next: stage 2b (fill a modelled table from Excel with key checks).

### Earlier (2026-10-17, v0.1.0)

The MVP works locally (dev and production build checked in the browser): DuckDB 1.5.4 in a Web Worker, tables kept in the browser (OPFS), import of CSV / Excel / Parquet / JSON with automatic detection of Russian and Portuguese Excel habits, editor with completion, virtualised results, exports, T-SQL hints. Repo https://github.com/StanislavSidorovich/StrataLab, Pages deploy green, custom domain lab.quaera.app set on the GitHub side. Waiting for the owner's Cloudflare DNS record, then stage 2.

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
- ✱ **`#ddl=` packing = StrataSQL's share links** (UTF-8 → deflate-raw → base64url, no padding), via the browser's own CompressionStream: no library, and one format across the Quaera apps. A link that inflates past 5 MB is refused (read chunk by chunk, so a crafted link can't fill the memory).
- ✱ **Foreign keys folded into CREATE TABLE** (`src/core/ddlPlan.ts`): StrataSQL (like pg_dump) adds FKs with `ALTER TABLE … ADD CONSTRAINT`, which DuckDB doesn't support. The plan moves each FK into its table and orders tables so referenced ones come first; a circle of tables loses the FK that closes it, with a note. Self-references are kept.
- ✱ **Translate what is safe, report the rest**: `public.` dropped, `serial` → integer NOT NULL, `GENERATED … AS IDENTITY`, `ON DELETE CASCADE / SET NULL`, `DEFERRABLE` and storage options left out with a note; names that are keywords only in DuckDB (`at`, `map`, `pivot`…) quoted; `DROP TABLE` never run (we ask instead). If DuckDB still rejects a table, it is retried without its FKs, then without its CHECKs, and the dialog says which.
- ✱ **Ask before replacing**: replace all / keep the existing ones and create the rest / cancel. Drops go in reverse creation order; a table another (non-model) table still refers to is kept, with a note.
- ✱ **No demo shop when arriving with a model**: whoever came from model.quaera.app came for that model, and the demo's `customers` / `orders` could clash with it.
- ✱ **One StrataLab tab**: StrataSQL's link opens a named window (`stratalab`), and StrataLab also reads `#ddl=` on `hashchange`, so a second click lands in the same tab (a second tab could not lock the saved database and would fall back to memory).
- Name **StrataLab**, subdomain **lab.quaera.app** (owner, 2026-10-17), in line with StrataSQL and StrataFlow.

## Next steps (by priority)

1. ✅ **Name + subdomain**: StrataLab · lab.quaera.app (owner, 2026-10-17)
2. **Publish**: ✅ GitHub repo, ✅ Pages via Actions, ✅ custom domain on GitHub · ⏳ owner: Cloudflare DNS `CNAME lab → stanislavsidorovich.github.io`, proxy off (DNS only, like `model`), then tick “Enforce HTTPS” · ⏳ Cloudflare Web Analytics token (beacon only on lab.quaera.app, like StrataSQL)
3. ✅ **Stage 2a — from model.quaera.app** (2026-10-17): “Open in StrataLab ↗” in StrataSQL's SQL tab → `#ddl=` → empty tables with PK / UNIQUE / CHECK / FK, a starter SELECT tab, a note per statement DuckDB couldn't take. Goes live once both sites deploy (lab.quaera.app needs the owner's Cloudflare record first).
4. **Stage 2b — fill a table from Excel**: drop a file onto an existing table → map file columns to table columns → type / NOT NULL / FK / UNIQUE check with a row-by-row report (“row 47: customer_id 999 not in customers”) → INSERT.
5. **Stage 2c — to model.quaera.app**: “Show as model” sends the current tables' DDL to StrataSQL's SQL → model import (its roadmap #32).
6. **Data generator** for empty modelled tables (respects FKs).
7. Lazy-load DuckDB's JS and CodeMirror to cut the 285 kB (gzip) first chunk; the .wasm (~8 MB gzip) is already fetched in parallel.

## Known gaps

- Numbers with a space as thousands separator (`1 234,50`) stay text: DuckDB has no thousands option. Could be cleaned before import.
- A query result is held in memory in full; `SELECT *` on tens of millions of rows will be slow. A row cap with “show more” is a candidate.
- Multi-statement scripts show only the last statement's result.
- Not tried yet on Safari / Firefox (OPFS sync access handles are supported there, but untested).
- `#ddl=` opened while StrataLab is already open in a tab **not** started from StrataSQL's link (typed address, bookmark) opens a second tab, which gets an in-memory database (the badge says so).
- DuckDB foreign keys only block: `ON DELETE CASCADE / SET NULL` from a model are left out (noted in the dialog).
- Mobile: usable to look, not to work (sidebar hidden below 768 px).
