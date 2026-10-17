# StrataLab

**Practise SQL in the browser on your own CSV and Excel files.** Drop a file, write a JOIN. No install, no account, no server: your data never leaves the browser.

Part of [Quaera](https://quaera.app) — together with [model.quaera.app](https://model.quaera.app) (data modeling) and [flow.quaera.app](https://flow.quaera.app) (processes).

## Why

SQL Server Management Studio is a ~2 GB install plus a database server, a licence or a student setup. To practise a `JOIN` on two spreadsheets you need none of that. StrataLab runs [DuckDB](https://duckdb.org) compiled to WebAssembly right in the page.

## What it does

- **Import** CSV, Excel (any sheet, header row below a title is found), Parquet and JSON — by drag-and-drop. Files saved by a Russian or Portuguese Excel just work: Windows-1251, `;` separators, decimal commas, `31.12.2026` dates.
- **Query** in tabs with SQL completion; `Ctrl+Enter` or `F5` runs the selection or the whole tab.
- **See** results in a fast grid with column types; copy into Excel, export CSV / Excel, export whole tables as CSV / Parquet (for pandas).
- **Keep** your tables between visits (stored in the browser's private file system).
- **Learn** the dialect: coming from SQL Server? `TOP`, `[brackets]`, `ISNULL`, `GETDATE()` get a "use this instead" hint.
- A **demo shop** dataset is loaded on the first visit.

## Run locally

```bash
npm install
npm run dev
```

`npm test` runs the unit tests, `npm run build` makes the static site in `dist/`.

## Stack

Vite · React · TypeScript · Tailwind CSS · DuckDB-WASM · CodeMirror 6 · TanStack Virtual · SheetJS CE · Zustand. All MIT / Apache-2.0.

## Licence

Code: [Apache-2.0](LICENSE).
