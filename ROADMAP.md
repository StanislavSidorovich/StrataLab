# StrataLab — Roadmap

Stages follow SPEC §6. A stage is done only when its acceptance criteria pass.

| Stage | Status | Acceptance |
|---|---|---|
| 1. MVP workbench | ✅ done (2026-10-17, v0.1.0) · live at https://lab.quaera.app | Drop a CSV/Excel file, see a preview with types, create a table, JOIN it with another, export the result; tables survive a reload |
| 2. Ecosystem hops | ⏳ in progress · 2a ✅ 2b ✅ (2026-10-17) · 2c and the data generator left | model.quaera.app → “Open in StrataLab” creates the tables; StrataLab → “Show as model” opens the schema in model.quaera.app; fill a modelled table from Excel with key checks |
| 3. Dataset catalog | ⏳ 4 of 5 datasets (2026-10-17) · AdventureWorks left | Chinook, Northwind, AdventureWorks, Sakila and Quaera's own dataset load in one click (Parquet served with the site) |
| 4. Dialects | ⬜ | PostgreSQL mode (PGlite) and T-SQL → DuckDB translation (sqlglot) with a side-by-side diff |
| 5. Share and practise | ⬜ | Share link (data + query, DB Fiddle style); tasks with automatic result check, linked from quaera.app |
| 6. Polish | ⬜ | PWA (offline), query history and snippets, EXPLAIN as a tree, charts on results, RU/PT interface |

**Overall progress: stage 1 of 6 done; stage 2 half done (2a, 2b); stage 3 nearly done (AdventureWorks left).** Roughly two stages' worth of the six. The full application = all six stages.

## Where we are (2026-10-17, stage 2b + stage 3 without AdventureWorks)

**Stage 2b done: fill an existing table from a file.** Drop a CSV / Excel file onto a table in the tree (or table menu → “Add rows from CSV / Excel…”, or “Put the rows into: an existing table” in the import dialog; a file named like an *empty* table goes there by itself). The dialog matches file columns to table columns by name (case, spaces, underscores and Cyrillic transliteration ignored; by position when no name matches and the counts agree), shows each column's type and PK / UNIQUE / → FK / NOT NULL, and checks **every** row in DuckDB before anything is written: wrong type (5.6 into an INTEGER is reported, not rounded), empty NOT NULL, key repeated in the file (“repeats row 3”), key already in the table, value not in the referenced table (“customer_id = 999 is not in customers”), failed CHECK. Rows are numbered as in the file (Excel's own row numbers, blank rows included). Then “Insert 1 200 rows, skip 3” in one transaction; the problems can be copied into Excel. Checked in the browser on dev and on the production build: CSV with `;` and decimal comma, Excel with a title row and a blank row, drop onto a tree node.

**Stage 3 (4 of 5): sample datasets in one click.** “Sample datasets…” (sidebar, or the header icon on a phone) lists **Chinook** (MIT), **Northwind** (Microsoft, MIT), **Sakila** (jOOQ, BSD-2) and **Kaiyo Trading** (Quaera's own, CC BY-NC-SA). Each loads into its own schema (`chinook.Track`, `northwind."Order Details"`) with its primary keys, foreign keys and CHECKs, appears as a folder in the tree, completes as `schema.table` in the editor, and opens a starter query. `#ds=northwind` in the address loads one directly (for links from quaera.app). Files: Parquet (zstd) in `public/datasets/`, 2.3 MB for all four, built by `scripts/build-datasets.py` from the original sources; licences in `public/datasets/NOTICE.md`. A load takes 1–1.5 s once DuckDB is up; every table's row count matched the source after load, reload, and remove + load (dev and production build).

**Fixed on the way: saved tables could vanish after a reload.** DuckDB-WASM's CHECKPOINT empties the WAL only in its own bookkeeping; the OPFS file keeps its bytes, and on a later start DuckDB replayed that stale tail (“Table … already exists”), failed to open the file, and the app fell back to an empty in-memory database (the tables were still in the file). Now the WAL is emptied before opening, and every query is followed by a CHECKPOINT (before, only queries that looked like writes were, and `TRUNCATE` was missed). Checked: three rounds of writes + reloads, saved database each time.

44 unit tests green (new: column matching and check SQL, dataset manifest and files, `#ds=` links, qualified names).

### Earlier (2026-10-17, stage 2a + loading progress)

**Publishing finished:** Cloudflare Web Analytics is on (cookieless page views; the script loads only on lab.quaera.app, so local runs aren't counted).

**DuckDB's first load now shows its progress.** The header says “Loading DuckDB 42%”, then “Starting DuckDB…” (just the percentage on a phone), and the result pane shows a card: a progress bar, “Step 1 of 2 · downloading DuckDB” / “Step 2 of 2 · starting the database”, and a line saying the ~8 MB download happens once and files are never uploaded. Arriving from model.quaera.app adds “Your model opens as soon as the engine is ready” (this closes the known gap where the page showed no sign of the model for a few seconds). Before React arrives, `index.html` shows “Loading StrataLab…” instead of a blank page. Checked with Playwright on the production build with the network throttled to 6 MB/s: the bar climbs smoothly 2% → 99% in 6 s, then step 2; time to ready is the same as before the change (8.0 s vs 8.0 s on a first visit, 2.2 s unthrottled). Dev server, dark mode and phone width checked too. 34 unit tests green.

### Stage 2a (2026-10-17)

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
- ✱ **We download DuckDB's .wasm ourselves** (`src/db/engine.ts`) and hand DuckDB a `blob:` URL, counting bytes on the way. DuckDB's own progress callback only fires when chunks arrive more than 20 ms apart, so on a decent connection it stays silent. The file comes gzip-compressed, so Content-Length is useless for a percentage; `vite.config.ts` puts the unpacked sizes of both .wasm builds into the bundle at build time (`__DUCKDB_WASM_BYTES__`). The bar stops at 99% until the engine has started.
- ✱ **Check everything, then insert** (stage 2b, `src/core/fill.ts`): the file is copied into a temp table and each rule is one SQL query over a view that casts every column to the table's type, so a big file is checked by DuckDB, not row by row in JavaScript. The report lists rows by the number the user sees in the file.
- ✱ **Insert the good rows, skip the bad ones** rather than all-or-nothing (SSMS's import fails as a whole): the button says how many go in and how many are left out. Of two rows with the same key, the first is kept.
- ✱ **A file named like an empty table fills it** (a modelled table waiting for data); a table with rows is only filled when chosen (dropped onto, menu, or the dialog's select).
- ✱ **No silent rounding**: a fractional number going into an integer column is a problem. A decimal-comma file whose number column became text (one stray value) is still read with the comma, spaces as thousands separators.
- ✱ **One schema per dataset** (`chinook.Track`): datasets never clash with each other (Chinook and Sakila both have `customer`) or with the user's tables, and `schema.table` reads like SQL Server's `dbo.`. The user's own tables stay in `main`, unqualified.
- ✱ **Datasets served with the site** (GitHub Pages, `public/datasets/`), not a separate CDN: 2.3 MB of Parquet, same origin, no CORS question. **Original table and column names** kept (Chinook's PascalCase, Northwind's `"Order Details"`) so tutorials' queries carry over.
- ✱ **Built offline by `scripts/build-datasets.py`** with the browser's DuckDB version (1.5.4): Northwind from Microsoft's T-SQL script (m/d/yyyy dates → DATE, money → DECIMAL(10,2) checked for lost cents, pictures left out), Chinook / Sakila / Quaera from SQLite (Quaera's ISO-text dates → DATE). Sakila's `store.manager_staff_id` FK is left out: it closes a circle with `staff.store_id`, and DuckDB can't add a key later.
- ✱ **Self-referencing tables load in rounds** (bosses first): DuckDB checks a foreign key against rows already in the table, not rows of the same INSERT.
- ✱ **A dataset load is not one transaction**: after a dataset was dropped from a reopened file, DuckDB 1.5 refuses to commit several CREATE TABLEs with foreign keys together (“subject … has been deleted”). One statement at a time works; a failed load drops its schema again.
- ✱ **WAL emptied on start, CHECKPOINT after every query** (`src/db/engine.ts`), see “Where we are”. A crash between a write and its checkpoint loses that one write; a stale WAL lost the whole database.
- ✱ **AdventureWorks later**: Microsoft ships it as a .bak or as UTF-16 CSVs with custom delimiters (~70 tables in 5 schemas); worth its own step, probably as AdventureWorksLT.
- Name **StrataLab**, subdomain **lab.quaera.app** (owner, 2026-10-17), in line with StrataSQL and StrataFlow.

## Next steps (by priority)

1. ✅ **Name + subdomain**: StrataLab · lab.quaera.app (owner, 2026-10-17)
2. **Publish**: ✅ GitHub repo, ✅ Pages via Actions, ✅ custom domain on GitHub · ✅ Cloudflare DNS `CNAME lab` (live 2026-10-17, http redirects to https) · ✅ Cloudflare Web Analytics (2026-10-17): beacon in `index.html`, loaded only on lab.quaera.app, like StrataSQL
3. ✅ **Stage 2a — from model.quaera.app** (2026-10-17): “Open in StrataLab ↗” in StrataSQL's SQL tab → `#ddl=` → empty tables with PK / UNIQUE / CHECK / FK, a starter SELECT tab, a note per statement DuckDB couldn't take. ✅ Live: checked on model.quaera.app → lab.quaera.app (2026-10-17).
4. ✅ **Stage 2b — fill a table from Excel** (2026-10-17): drop onto a table → match columns → type / NOT NULL / PK / UNIQUE / FK / CHECK report by file row → insert the good rows.
5. ✅ **Stage 3 — catalog with 4 datasets** (2026-10-17): Chinook, Northwind, Sakila, Kaiyo Trading; `#ds=` links. **Owner, after deploy:** try `https://lab.quaera.app/#ds=quaera`; quaera.app's SQL track can link to it.
6. **Stage 2c — to model.quaera.app**: “Show as model” sends the current tables' DDL to StrataSQL's SQL → model import (its roadmap #32).
7. **Data generator** for empty modelled tables (respects FKs): pairs with 2b, generate or fill from Excel.
8. **Stage 3 — AdventureWorks** (LT) in `scripts/build-datasets.py`. Optional: NYC Taxi sample.
9. Lazy-load DuckDB's JS and CodeMirror to cut the 304 kB (gzip) first chunk (stages 2b and 3 added ~14 kB, about 4 kB of it the datasets' CREATE TABLEs, which could load with the catalog). ✅ The .wasm download shows its progress (2026-10-17).

## Known gaps

- Numbers with a space as thousands separator (`1 234,50`) stay text: DuckDB has no thousands option. Could be cleaned before import.
- A query result is held in memory in full; `SELECT *` on tens of millions of rows will be slow. A row cap with “show more” is a candidate.
- Multi-statement scripts show only the last statement's result.
- Not tried yet on Safari / Firefox (OPFS sync access handles are supported there, but untested).
- `#ddl=` opened while StrataLab is already open in a tab **not** started from StrataSQL's link (typed address, bookmark) opens a second tab, which gets an in-memory database (the badge says so).
- DuckDB foreign keys only block: `ON DELETE CASCADE / SET NULL` from a model are left out (noted in the dialog).
- Mobile: usable to look, not to work (sidebar hidden below 768 px; the catalog has a header button).
- Filling works only into the user's own tables (schema `main`), not into a dataset's.
- Filling a table that refers to itself: rows pointing at other rows of the same file pass the check, but DuckDB rejects them in one INSERT; the insert then fails as a whole with DuckDB's message (nothing written).
- Reloading or removing a dataset loses changes made to its tables (the app asks first).
