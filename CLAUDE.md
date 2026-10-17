# StrataLab

Browser SQL workbench (SSMS-lite) on DuckDB-WASM: drop CSV / Excel files, query them with SQL, nothing to install. Part of Quaera (quaera.app); sister apps StrataSQL (model.quaera.app) and StrataFlow (flow.quaera.app). Full spec: `SPEC.md`. Progress, decisions and next steps: `ROADMAP.md`.

- Work stage by stage (SPEC §6); a stage is done only when its acceptance criteria pass. Record choices made on the owner's behalf with ✱ under "Decisions" in ROADMAP.md, and update "Where we are" after each piece of work.
- `src/core/` is pure TypeScript (no React, no DuckDB) and every rule there gets a Vitest test. `src/db/` talks to DuckDB; `src/ui/` is React + Zustand.
- No server: user data never leaves the browser. Dependencies must be permissively licensed; datasets must allow redistribution.
- Check UI changes in the browser (`.claude/launch.json`: `stratalab` = dev on 5180, `stratalab-build` = production preview on 5181). The production build matters: DuckDB's worker and .wasm paths only break there.
- DuckDB-WASM OPFS: we register the database files ourselves (see the decision in ROADMAP.md); don't switch back to `opfs://` paths without checking that the file in OPFS actually grows.
- Local test files go in `data-local/` (git-ignored).
- Code Apache-2.0. Deployed by GitHub Actions to GitHub Pages on push to main; DNS on Cloudflare.
