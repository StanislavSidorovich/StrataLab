# Handoff: Data Mining Workflow Helpers & Optional BYOK AI Helper (`v0.56.0`–`v0.59.1`)

Date: 2026-11-18  
Repository: `StanislavSidorovich/StrataLab` (`lab/`, production app at `https://lab.quaera.app/`)  
Safety tag preserved on `origin`: `pre-dm-helper-2026-11-18` (version tags remain `v0.5.x` per `ROADMAP.md` until stage 6 is done).

## Commits in this series

1. `87c3e58` (`v0.56.0`) — **Data analysis cycle cheat sheet**: `src/ui/DmCyclePanel.tsx`, `src/core/dmCycle.ts`, `src/data/dmCycle.ts`, `tests/dmCycle.test.ts`, linked from `src/ui/Guide.tsx`, `src/ui/WelcomeDialog.tsx`, and `src/ui/DialectBar.tsx`.
2. `9ab4c4a` (`v0.57.0`) — **New Python notebook for this table**: `src/core/tableNotebook.ts`, `tests/tableNotebook.test.ts`, `⋯` table menu action in `src/ui/Sidebar.tsx`.
3. `0b2c33a` (`v0.58.0`) — **Copy context for AI in Python tabs**: `src/core/aiContext.ts`, `tests/aiContext.test.ts`, `src/ui/CopyContextDialog.tsx`, toolbar button in `src/ui/DialectBar.tsx`.
4. `55e4f3e` (`v0.59.0`) — **Optional BYOK AI helper (OFF by default)**: `src/core/aiProvider.ts`, `tests/aiProvider.test.ts`, `src/ui/AiHelper.tsx`, `src/ui/store.ts`, `src/ui/DialectBar.tsx`, `src/ui/PythonOutput.tsx`, `src/ui/AboutDialog.tsx`, `README.md`, `SPEC.md`.
5. `v0.59.1` — **Post-review fixes + voice dictation**:
   - **FIX 1 (`src/core/aiProvider.ts`, `tests/aiProvider.test.ts`)**: Made intentional migration from retired `gemini-2.5-flash` to `gemini-3.8-flash` explicit in comments and unit tests (`"gemini-2.5-flash"` -> `"gemini-3.8-flash"`, `"models/gemini-3.8-flash"` -> `"gemini-3.8-flash"`, custom model ids preserved verbatim); refined `buildTutorSystemPrompt()` for concise step-by-step tutoring.
   - **FIX 2 (`src/core/aiContext.ts`, `tests/aiContext.test.ts`)**: Added `classifyDescribeText()` so full `describe()` DataFrames (numeric `count/mean/std/min/max`, `include='all'`, categorical `count/unique/top/freq`, transposed `.T`, and wrapped chunks) count as aggregate statistics and stay included in `"Summary statistics (describe)"` instead of being dropped as raw rows.
   - **FIX 3 (`src/core/dmCycle.ts`, `tests/dmCycle.test.ts`, `src/ui/store.ts`, `src/ui/App.tsx`)**: Added `PHONE_BREAKPOINT_PX = 768` mutual exclusion between `Data cycle` and `AI helper` on narrow viewports (`resolveInitialPythonPanels`, `resolveTogglePythonPanel`, `resolveResizePythonPanels`), resize handling in `App.tsx`, and lifted toasts (`bottom-[48vh] md:bottom-4`) when `aiBottomDockOpen` is true on phones.
   - **Voice dictation (`src/core/aiProvider.ts`, `src/ui/AiHelper.tsx`)**: Added `Speak` / `Stop` button and `RU` / `EN` language toggle using the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), persisted in `stratalab.ai.speechLang` (`AI_SPEECH_LANG_KEY`).
   - Bumped `package.json` version to `0.59.1`.

## What the AI receives (and what is never sent)

### Context assembly (`src/core/aiContext.ts`)
- Total prompt cap: `12,000` chars (`MAX_AI_CONTEXT_COLS = 60`, `MAX_AI_CELL_CHARS = 4000`, `MAX_AI_SUMMARY_CHARS = 1500`).
- **Included automatically**:
  - Referenced table schemas and row counts.
  - Already-computed `isna().sum()` missingness output and `describe()` aggregate summaries.
  - Current cell code and last non-row execution output / error traceback.
- **`describe()` handling (`classifyDescribeText`)**:
  - Recognizes numeric DataFrame `describe()` (requires `count, mean, std, min, max`), categorical-only `describe()` (requires `count, unique, top, freq`), `describe(include='all')`, transposed `describe().T`, wrapped column chunks, and single-column Series `describe()`.
  - Prefers the most recent full-table `'dataframe'` `describe()` over a later `'series'` `describe()` so column-level exploration does not overwrite table-wide numeric stats.
  - Over-cap `describe()` output is truncated at `MAX_AI_SUMMARY_CHARS` with a visible truncation note.
- **Strictly omitted by default**:
  - `.head()`, `.tail()`, `.sample()`, raw `df`, and any arbitrary DataFrame lacking `describe()` row labels are omitted (no raw student/table rows are sent or copied).
  - `"Copy context for AI"` confirms `"Copied: schema and summary, no rows"`.
  - Raw rows (first 20 rows) are only included when the user explicitly ticks `"Also send the first 20 rows for this request"` in `AI helper` (resets unchecked for every request).

### BYOK Provider Boundaries & Voice Input (`src/core/aiProvider.ts`, `src/ui/AiHelper.tsx`)
- Master switch is **OFF** by default (`AI_SETTINGS_KEY`).
- Default models: `DEFAULT_AI_MODELS` = `gemini-3.8-flash` (Google) and `claude-sonnet-4-6` (Anthropic). Saved legacy `"gemini-2.5-flash"` migrates automatically to `"gemini-3.8-flash"`.
- Direct browser `fetch` fires **only** on explicit user send:
  - Gemini key sent via `x-goog-api-key` header (never in the URL).
  - Claude key sent via `x-api-key` + `anthropic-dangerous-direct-browser-access: true`.
- Separate storage & redaction: keys live only in `stratalab.ai.key.gemini` and `stratalab.ai.key.claude`, excluded from backups, share links, `.ipynb` exports, and redacted from surfaced errors (`MAX_AI_REPLY_CHARS = 8000`). Per-provider consent is tracked in `stratalab.ai.consent.v1` (`AI_CONSENT_KEY`).
- Voice dictation (`Speak` / `Stop` + `RU` / `EN`) runs strictly client-side via Web Speech API and appends recognized speech into the draft text area (`appendDictatedText`) — it never sends a request to Gemini or Claude automatically.

## Verification Status (`v0.59.1`)

### Automated Suite & Build (Green)
- `npm test`: **`72` test files passed (`72`), `967` tests passed (`967`)**
  - `tests/aiProvider.test.ts`: `13` passed
  - `tests/aiContext.test.ts`: `15` passed
  - `tests/dmCycle.test.ts`: `24` passed (including Pyodide execution of all 16 examples against `quaera` parquet data)
  - `tests/tableNotebook.test.ts`: `17` passed
- `npm run build` (`tsc -p . && vite build`): succeeded cleanly.

### Browser Verification (`http://localhost:5181/`, build `0.59.1`)
- Confirmed build `0.59.1` in `About & licences` (`DuckDB 1.5.4 · saved in this browser`), `0` console errors.
- Checked **1366x768** (desktop) and **375x812** (phone), in both **Light** and **Dark** themes:
  - `demo.orders` -> `New Python notebook for this table` -> `Run all` (11 cells, Python 3.14 pandas, 0 errors) -> `Copy context for AI` toast `"Copied: schema and summary, no rows"`; clipboard verified to contain numeric `describe()` stats (`order_id`, `customer_id`) and zero raw rows.
  - Desktop `1366x768`: both `Data cycle` and `AI helper` stay open side-by-side without horizontal overflow.
  - Phone `375x812`: `Data cycle` and `AI helper` are mutually exclusive; lifted toast clears `AI helper` action buttons.
  - `AI helper`: consent flow, dummy key save + `Remove key` + OFF cleanup, `Speak` button, and `RU`/`EN` language toggle verified in UI.
- `student_data.csv` Import preview (`649 rows · 34 columns`) was verified in `http://localhost:5181/`; live browser upload of `student_data.csv` into a new table hit the automation upload-permission prompt timeout (`UPLOAD_NEEDS_PERMISSION`), so multi-column `describe()` vs single-column `column00` behavior on `student_data` was verified via unit tests in `tests/aiContext.test.ts`.

### Live External Checks
- **Real Gemini API key (`gemini-3.8-flash`)**: Tested and confirmed working by the owner.
- **Real Claude API key (`claude-sonnet-4-6`)**: **NOT tested**.
- **Live microphone hardware recognition (`Speak`)**: **NOT tested** in automated browser (UI toggle and Web Speech API integration verified; browser mic capture depends on user hardware/permission).
