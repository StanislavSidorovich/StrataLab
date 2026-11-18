# Project Memory & Handoff: Data Mining Workflow & Optional BYOK AI Helper (2026-11-18)

**Repository:** `d:\docs\2. study\Claude\0. Claude code\22. Quaera\lab` (StrataLab / Quaera Lab)  
**Safety tag pushed to `origin`:** `pre-dm-helper-2026-11-18`  
**Local commits on `main` (4 commits ahead of `origin/main`, none pushed):**
1. `87c3e58` — Feature A (`v0.56.0`): Data analysis cycle cheat sheet in Python tabs and Guide
2. `9ab4c4a` — Feature B (`v0.57.0`): New Python notebook for this table in table menu
3. `0b2c33a` — Feature C (`v0.58.0`): Copy context for AI in Python tabs without raw rows
4. Head commit (`v0.59.0`): Feature D + README/SPEC/ROADMAP/this handoff doc

---

## 1. Status Summary: What Is Done vs. What Is Not Checked Yet

### Done & Unit/Integration Verified
- **Feature A (`v0.56.0`) — "Data analysis cycle" cheat sheet:**
  - Collapsible panel inside Python tabs (`src/ui/DmCyclePanel.tsx`), toggled from **Data cycle** in `src/ui/DialectBar.tsx`, and linked from `src/ui/Guide.tsx` + `src/ui/WelcomeDialog.tsx`.
  - Stages: **Exploration -> Preprocessing -> Processing -> Analysis**, including order rationale, K-means clustering & association rules with one-line "when to use" guidance, and **Run in a new cell** buttons (`buildExampleCellInsertion` in `src/core/dmCycle.ts`).
  - All 16 snippets execute cleanly in real Pyodide pandas/NumPy on Kaiyo parquet data (`tests/dmCycle.test.ts`, 23 tests).
- **Feature B (`v0.57.0`) — "New Python notebook for this table":**
  - Action in every table's `⋯` menu (`src/ui/Sidebar.tsx`).
  - Generates a 4-stage `# %%` notebook from the table's actual DuckDB schema, column types (`classifyDuckType`), nullable/all-null metadata, and row count with `# Question:` learning prompts (`src/core/tableNotebook.ts`, `tests/tableNotebook.test.ts`, 17 tests).
  - Handles edge cases: 0-row tables, 1-column tables, all-NULL columns, missing numeric/categorical columns, wide tables (capped at `25` columns), large tables (`>50,000` rows -> `LIMIT` / `.sample`), spaced/mixed-case/non-ASCII/keyword column names (`df["col"]`), locale decimals (`"12,50"`) & `DD.MM.YYYY` date guidance without silent coercion, and `addOrFocusTab` tab deduplication.
- **Feature C (`v0.58.0`) — "Copy context for AI":**
  - **Copy context for AI** button in the Python toolbar (`src/ui/DialectBar.tsx`), pure prompt builder `src/core/aiContext.ts`, manual fallback dialog `src/ui/CopyContextDialog.tsx` (`tests/aiContext.test.ts`, 11 tests).
  - Builds schema, row counts, already-computed `isna().sum()` / `describe()` summaries (or prompts to run exploration first), current cell text, last error/output, detected stage, and decision-first instruction — **never raw rows**, capped at `12,000` chars (`60` cols, `4,000` cell chars, `1,500` summary chars), toast `"Copied: schema and summary, no rows"`.
- **Feature D (`v0.59.0`) — Optional BYOK AI helper (OFF by default):**
  - Pure adapter `src/core/aiProvider.ts` (`tests/aiProvider.test.ts`, 12 tests) + UI `src/ui/AiHelper.tsx` + store wiring `src/ui/store.ts` + error **Ask AI** chip `src/ui/PythonOutput.tsx` + privacy copy in `src/ui/AboutDialog.tsx`, `README.md`, `SPEC.md`.
  - Settings dialog with Gemini (`gemini-3.8-flash`) / Claude (`claude-sonnet-4-6`), masked `type="password"` key input, **Remove key**, master switch **OFF by default**, plain-word key source notes (`https://aistudio.google.com/apikey`, `https://console.anthropic.com`), and per-provider consent dialog.
  - Direct browser `fetch` ONLY on explicit user click, `AbortController` cancel button, single-flight guard, optional unchecked per-request **"Also send the first 20 rows for this request"** opt-in, **Insert as new cell** (below cursor, never auto-runs) & **Copy** buttons on code blocks, full error handling (401/403, 429, offline/CORS, empty/filtered reply, secret redaction).

### Automated Test & Build Results
- **`npm test` (`vitest run`, `BypassSandbox: true`):** **`72 passed (72)` test files, `961 passed (961)` tests** (0 failures, 0 skipped). *Note: Inside the Windows sandbox (`BypassSandbox: false`), DuckDB-WASM extension tests fail with `EPERM` creating `C:\Users\gl502vs\.duckdb\extensions`.*
- **`npm run build` (`tsc -p . && vite build`):** Passed cleanly on `v0.59.0` (`dist/assets/duckdb-eh-CfdE9-rk.wasm` present, `35,913,747` bytes).
- **`npm run e2e` (`playwright test`):** Not run (`#build=` and `#practice=` flows were untouched).

### Live Browser Verification Status (`http://localhost:5181/`)
- **Verified in IDE webview:**
  1. Initial load at `1366x768`: `HTTP 200`, `Quaera Lab`, 0 initial console errors, Welcome dialog rendered `"Data analysis cycle in Python"` card + `"Open Data analysis cycle cheat sheet"` button.
  2. Production preview re-check with `task-422` running: DuckDB `1.5.4` started (`in memory, not saved` because user tab `browser__1795012459986_2` was simultaneously open and held the DuckDB Web Lock), `demo` shop tables loaded, 0 console errors.
  3. File upload (`data-local/course/student_data.csv`): Import dialog rendered cleanly showing `649 rows · 34 columns · preview shows the first 50` and `Create table` enabled.
- **Blocked / Remaining for Owner Manual Verification:**
  - After clicking `Create table` inside the background IDE `webview_browser` tab (`agent-tab-1`), the AUIT webview bridge timed out at `60s` on subsequent script commands (also observed earlier on `Got it` -> DuckDB startup).
  - **Not verified end-to-end in live browser:** Python tab execution on `student_data.csv` in `5181`, live clicks of **Data cycle** / **Copy context for AI** / **AI helper**, `375x812` mobile overflow check on the new Python panels, dark theme visual check on the new panels, and **real-key Gemini / Claude API calls (Feature D needs a real-key test by the owner)**.

---

## 2. Architecture: How It Works (Especially Gemini / Claude + Python Canvas)

1. **Can you connect to Gemini via API and solve tasks together on the `# %%` Python canvas?**
   - **Yes.** Once you enable the helper and paste your own Gemini API key (`https://aistudio.google.com/apikey`), the browser sends requests directly (`fetch` POST, no backend/proxy) to:
     `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
     using HTTP header `x-goog-api-key: <key>` (never in the URL) and default model `gemini-3.8-flash` (updated after live key test returned 404 on `gemini-2.5-flash` for new users).
   - For Anthropic Claude (`https://console.anthropic.com`), the browser sends directly to `https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true` (default model `claude-sonnet-4-6`).
2. **What context the AI tutor receives (`buildAiContext` + `buildTutorSystemPrompt`):**
   - Automatically gathers only what you approve: referenced table schemas + row counts, computed `isna().sum()` / `describe()` summaries (if you already ran them), the `# %%` cell under your cursor, its last output or error, and the current stage (`Exploration` / `Preprocessing` / `Processing` / `Analysis`).
   - **Raw data rows are NEVER sent** unless you explicitly tick **"Also send the first 20 rows for this request"** (which resets back to unchecked right after sending).
   - The system prompt instructs the model to act as a tutor (explain the analytical decision first, ask a check-in question when helpful) and restrict code suggestions to packages actually installed in browser Pyodide (`pandas`, `numpy`, `matplotlib`, `seaborn` + stdlib; no `scikit-learn`/`mlxtend`) plus Quaera helpers `lab.table(...)`, `lab.sql(...)`, `lab.save(...)`.
3. **Interactive loop on the Python canvas:**
   - Every Python code block in the AI's reply gets **Insert as new cell** (inserts `# %%` below your cursor — **never runs automatically**) and **Copy**.
   - When a cell throws an error and AI helper is ON, a light **Ask AI** chip appears next to the traceback so you can send the failed cell + error for diagnosis on click.

---

## 3. Where Everything Is Stored (Files & Browser Storage)

### Browser Storage (`localStorage` only; excluded from exports/URLs/logs)
- `stratalab.dm-cycle.open` / `stratalab.dm-cycle.stage` — Data analysis cycle cheat sheet state
- `stratalab.ai.settings.v1` — `{ enabled, provider, models }` (API keys are NOT in this object)
- `stratalab.ai.consent.v1` — `{ gemini: boolean, claude: boolean }`
- `stratalab.ai.key.gemini` / `stratalab.ai.key.claude` — User API keys only (excluded from `src/core/backup.ts`, `#s=` share links, `#ddl=`, `.ipynb` exports, console/errors via `redactSecrets`)

### Workspace Files (`d:\docs\2. study\Claude\0. Claude code\22. Quaera\lab`)
- **Pure Core Logic & Tests (`src/core/`, `src/data/`, `tests/`):**
  - `src/data/dmCycle.ts`, `src/core/dmCycle.ts`, `tests/dmCycle.test.ts` (Feature A)
  - `src/core/tableNotebook.ts`, `src/core/pyStarter.ts`, `src/core/tabs.ts`, `tests/tableNotebook.test.ts` (Feature B)
  - `src/core/aiContext.ts`, `tests/aiContext.test.ts` (Feature C)
  - `src/core/aiProvider.ts`, `tests/aiProvider.test.ts` (Feature D)
- **React UI & Zustand Store (`src/ui/`):**
  - `src/ui/DmCyclePanel.tsx`, `src/ui/CopyContextDialog.tsx`, `src/ui/AiHelper.tsx`
  - `src/ui/DialectBar.tsx`, `src/ui/PythonOutput.tsx`, `src/ui/Sidebar.tsx`, `src/ui/SqlEditor.tsx`
  - `src/ui/Guide.tsx`, `src/ui/WelcomeDialog.tsx`, `src/ui/AboutDialog.tsx`, `src/ui/App.tsx`, `src/ui/store.ts`
- **Project Documentation ("Memory"):**
  - `ROADMAP.md` (Progress summary, `✱` Decisions, `Next steps` ✅ logs)
  - `SPEC.md` (Section 8 updated with Python data-mining cycle & BYOK boundaries)
  - `README.md` (Features & privacy promise)
  - `docs/handoff-data-mining-2026-11-18.md` (This handoff file)

---

## 4. How to Try & Roll Back

- **Run preview locally (if not already running on port `5181`):**
  ```powershell
  npm run build
  npm run preview -- --port 5181 --strictPort
  ```
  Open `http://localhost:5181/` in **one** browser tab (so it owns the DuckDB persistence Web Lock instead of entering `"in memory, not saved"` mode).
- **Quick walkthrough:**
  1. Drop `data-local/course/student_data.csv` onto the page -> **Create table**.
  2. On `student_data`, click `⋯` -> **New Python notebook for this table** (click twice to test focus-existing-tab).
  3. Click **Data cycle** -> inspect Exploration / Preprocessing / Processing / Analysis -> click **Run in a new cell**.
  4. Click **Copy context for AI** -> paste somewhere to verify schema/summary without raw rows.
  5. Click **AI helper** -> **Settings…** -> toggle ON -> accept consent -> paste Gemini/Claude key -> ask a question -> click **Insert as new cell** -> test error **Ask AI** chip -> **Remove key** / toggle OFF -> check **Help -> Privacy**.
  6. Toggle **Aa -> Dark** and test both `1366px` and `375px` mobile widths.
- **Rollback to pre-task state:**
  ```powershell
  git reset --hard pre-dm-helper-2026-11-18
  ```
