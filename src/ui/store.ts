import { create } from 'zustand'
import type { Table } from 'apache-arrow'
import { cancelQuery, checkpoint, getEngine, inTransaction, insertArrow, isCancelled, onDatabaseMoved, query, queryCancellable, queryLimited, rollback, setTransactionOpen, type EngineProgress } from '../db/engine'
import { updateLosesTables, type MemoryReason } from '../core/dbLock'
import { applyUpdate } from '../pwa/register'
import { ROW_LIMIT } from '../core/rowLimit'
import { loadCatalog, type TableInfo } from '../db/catalog'
import { closeSource, createTable, openSource, type ImportSource } from '../db/importer'
import { dialectHints, sqlNameHint, type DialectHint } from '../core/dialect'
import { qualifiedName, quoteIdent, sqlName, uniqueName } from '../core/sql'
import { looksLikeTable } from '../core/editorFiles'
import { DEMO_SCHEMA, DEMO_SQL, DEMO_TABLES, SEARCH_PATH_SQL, WELCOME_SQL } from '../data/demo'
import { prepareDemoSchema } from '../db/demo'
import { ddlDataFromHash, decodeDdl, hashWithoutDdl } from '../core/ddlLink'
import { planDdl, starterSql, type DdlNote, type DdlPlan } from '../core/ddlPlan'
import { applyPlan, type Existing } from '../db/ddl'
import { clearFill } from '../db/fill'
import { DATASETS, datasetById, datasetFromHash, hashWithoutDataset, type Dataset } from '../data/datasets'
import { loadDataset, removeDataset, type DatasetProgress } from '../db/datasets'
import { splitCells } from '../core/pyCells'
import {
  DM_CYCLE_OPEN_KEY,
  PHONE_BREAKPOINT_PX,
  buildExampleCellInsertion,
  parseDmCycleOpen,
  resolveInitialPythonPanels,
  resolveResizePythonPanels,
  resolveTogglePythonPanel,
  type PythonPanelId,
} from '../core/dmCycle'
import { activeCursorPos, activeSelection, replaceActiveAndFocusCursor } from './SqlEditor'
import { MAX_AI_SQL_ROWS, SQL_DIALECT_NAMES, buildSqlAiContext, replaceCurrentStatement, type SqlAiDialect, type SqlAiResult, type SqlAiTranslation } from '../core/aiSqlContext'
import type { Walkthrough } from '../data/walkthroughs'
import { createSchema, listSchemas, moveTables, renameSchema } from '../db/ownDatasets'
import { catalogSchemaState, datasetName, isOwnSchema, linkedTables } from '../core/ownDatasets'
import { DATASET_AT, choiceKey, qualifyDrops, qualifyReferences, scriptDatabase, suggestDatasetName, tablesCreated } from '../core/scriptDataset'
import { schemaForModel, showAsModel } from '../db/modelExport'
import { planGeneration, type GenPlan, type GenTable } from '../core/generate'
import { runGeneration, type GenOutcome } from '../db/generate'
import { runOrder } from '../core/pdScript'
import { identitySyncSql } from '../core/identitySync'
import { settleTransaction, TRANSACTION_OPEN_NOTE, type Settled } from '../core/transaction'
import { hashWithPractice, hashWithoutPractice, practiceFromHash, readableError, type PracticeKind } from '../core/sqlPractice'
import { buildFromHash, hashWithBuild, hashWithoutBuild } from '../core/build'
import { lessonFromHash } from '../core/lesson'
import { hashWithPipeline, hashWithoutPipeline, pipelineFromHash } from '../core/pipeline'
import { BOOK_TABLES } from '../data/pyPractice/tables'
import { duckdbScript, translateTsql, type TranslatedStatement, type TranslatorProgress } from '../dialects/tsql'
import { copyToPostgres, explainPostgres, getPostgres, postgresCatalog, runPostgres } from '../dialects/postgres'
import { copyTitle, dialectSwitch, findMatchingTab, rememberClosed } from '../core/tabs'
import { labName, pythonNotebookForTable, pythonStarter, pythonTableStarter } from '../core/pyStarter'
import {
  COPY_CONTEXT_TOAST,
  buildAiContext,
  type AiContextCellRun,
  type AiContextSampleRows,
  type AiContextTable,
  type BuiltAiContext,
} from '../core/aiContext'
import {
  AI_CHAT_KEY_PREFIX,
  AI_SEND_NOTEBOOK_KEY,
  appendDecision,
  formatRequestPreview,
  parseChat,
  parseSendNotebook,
  pushFeedExchange,
  normalizeFeed,
  normalizeHistory,
  type AiChatMessage,
} from '../core/aiChat'
import {
  AI_API_KEY_STORAGE,
  AI_CONSENT_KEY,
  AI_SETTINGS_KEY,
  DEFAULT_AI_MODELS,
  buildProviderRequest,
  buildTutorSystemPrompt,
  classifyFetchError,
  findQuickAction,
  insertCodeAtCursor,
  insertCodeCellBelow,
  parseAiConsent,
  hasAiConsent,
  normalizeBaseUrl,
  type NormalizedBaseUrl,
  parseAiSettings,
  parseProviderReply,
  replaceCurrentCodeCell,
  type AiConsent,
  type AiProvider,
  type AiQuickAction,
  type AiSettings,
} from '../core/aiProvider'
import { backupFileName } from '../core/backup'
import { backupDatabase, restoreDatabase } from '../db/backup'
import { download, exportTablesCsv, pickFolder, resultRows } from '../db/export'
import { compareResults, type Verdict } from '../core/check'
import { hashWithoutTask, taskById, taskFromHash, taskStarter, type PracticeExample, type PracticeTask } from '../data/practice'
import { decodeShare, hashWithoutShare, shareDataFromHash } from '../core/shareLink'
import { historyTabTitle, parseHistory, remember, type HistoryEntry } from '../core/history'
import { explainStatement, lastStatement, parseDuckPlan, parsePgPlan, readsOnly, type Plan } from '../core/plan'
import { onKernelState, runBookCell, runCell, startKernel, stopKernel, STOPPED_PY, type KernelState, type ShownFrame } from '../python/kernel'
import type { CellRun, Output } from '../core/ipynb'

/** What a tab speaks: DuckDB itself, T-SQL translated to DuckDB, PostgreSQL (PGlite) (stage 4), or Python (stage 7). */
export type Dialect = 'duckdb' | 'tsql' | 'postgres' | 'python'

/** The SQL dialects (the ones a share link and Explain know). */
export const isSqlDialect = (d: Dialect): d is Exclude<Dialect, 'python'> => d !== 'python'

export interface QueryTab {
  id: string
  title: string
  sql: string
  /** missing in tabs saved before stage 4: DuckDB */
  dialect?: Dialect
  /** a practice task's tab: the task's id (src/data/practice.ts) */
  task?: string
  /** a Python tab: the learner's "Decisions so far" note for the AI helper (kept with the tab, sent with each request, written into the notebook) */
  decisions?: string
}

/** A T-SQL tab's translation to DuckDB: being made, made, or failed. */
export type TranslationState =
  | { status: 'loading'; progress: TranslatorProgress }
  | { status: 'done'; statements: TranslatedStatement[]; ms: number }
  | { status: 'error'; error: string }

type PostgresState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; version: string; persistent: boolean }
  | { status: 'error'; error: string }

export interface TabResult {
  status: 'running' | 'done' | 'error'
  table?: Table
  ms?: number
  error?: string
  hints?: DialectHint[]
  /** the SQL that ran (the selection or the whole tab), for “Show more” */
  sql?: string
  /** the most rows the run brought in (src/core/rowLimit.ts) */
  limit?: number
  /** the result had more rows than `limit`: `table` holds the first `limit` */
  more?: boolean
  /** a Python tab's run: the cells it ran, with their outputs (the grid shows the last DataFrame) */
  cells?: PyCellRun[]
  /** which DataFrame of `cells` is in `table` (the DataFrame view): the last, or one opened from Output */
  tableFrom?: { run: number; at: number }
}

/** One cell of a Python run: where it is in the tab, its number in the session ([3]) and its outputs. */
export interface PyCellRun {
  /** the cell's index in the tab (src/core/pyCells.ts), or -1 for a selection */
  index: number
  line: number
  count: number
  outputs: Output[]
  /** the DataFrames among `outputs`, by their index there (Output shows each inline) */
  frames?: Record<number, ShownFrame>
  running?: boolean
}

/** A tab's query plan (Explain): being made, made, or failed. */
export type PlanState =
  | { status: 'running' }
  | { status: 'done'; plan: Plan; notes: string[] }
  | { status: 'error'; error: string }

export interface LogEntry {
  at: number
  sql: string
  ok: boolean
  text: string
}

/** A model opened from model.quaera.app (`#ddl=`): waiting for the user, or what happened. */
export type DdlState =
  | { phase: 'confirm'; plan: DdlPlan; clashing: Existing[] }
  | { phase: 'running'; plan: DdlPlan }
  | { phase: 'report'; title: string | null; created: string[]; notes: DdlNote[] }
  | { phase: 'error'; message: string }

/** The data generator: choosing tables and counts, running, or what it did. */
export type GenerateState =
  | { phase: 'choose'; tables: GenTable[]; counts: Record<string, number> }
  | { phase: 'running'; plan: GenPlan; step: number }
  | { phase: 'report'; outcomes: GenOutcome[]; problems: GenPlan['problems'] }

/** A script about to make many tables: the dialog asking whether they go into a dataset. */
export interface ScriptDatasetAsk {
  tables: string[]
  name: string
  problem: string | null
}

/** “Move to dataset”: the tables that go (the one chosen and the ones linked to it by keys). */
export interface MoveState {
  schema: string
  table: string
  tables: string[]
  busy: boolean
  error: string | null
  /** the dataset a drag ended on: the dialog opens with it chosen */
  to?: string
}

/** A catalog dataset being loaded (or what went wrong). */
export type DatasetState =
  | { phase: 'loading'; dataset: Dataset; progress: DatasetProgress }
  | { phase: 'error'; dataset: Dataset; message: string }

type EngineState =
  | { status: 'loading'; progress: EngineProgress; withModel: boolean; withDataset: string | null }
  | { status: 'ready'; version: string; persistent: boolean; memoryReason?: MemoryReason }
  | { status: 'error'; error: string }

interface State {
  engine: EngineState
  tables: TableInfo[]
  /** every schema but main, empty ones too: the catalog datasets and the user's own */
  schemas: string[]
  move: MoveState | null
  scriptDataset: ScriptDatasetAsk | null
  tabs: QueryTab[]
  activeTab: string
  results: Record<string, TabResult>
  log: LogEntry[]
  /** queries run from tabs, newest first, kept between visits (src/core/history.ts) */
  history: HistoryEntry[]
  imports: ImportSource[]
  importError: string | null
  theme: 'light' | 'dark'
  ddl: DdlState | null
  dataset: DatasetState | null
  /** the dataset catalog dialog is open */
  catalogOpen: boolean
  generate: GenerateState | null
  /** the welcome screen (what's where, how to start) is open */
  welcomeOpen: boolean
  /** the practice page on Kaiyo that is open (`#practice=sql`, `#practice=python`, src/ui/PracticeBook.tsx) */
  practiceBook: PracticeKind | null
  /** the data pipeline page that is open (`#pipeline=kaiyo-sellout`, src/ui/PipelinePage.tsx) */
  pipeline: string | null
  /** the build page that is open (`#build=kaiyo-sales`, src/ui/build/BuildPage.tsx) */
  build: string | null
  /** the dialect comparison (src/ui/Compare.tsx) is open */
  compareOpen: boolean
  /** per tab, for T-SQL tabs */
  translations: Record<string, TranslationState>
  postgres: PostgresState
  pgTables: TableInfo[]
  /** what the result pane shows */
  /** `table` only in Python tabs: the last DataFrame on the whole pane ('result' is the cells' output there) */
  resultView: 'result' | 'table' | 'chart' | 'plan' | 'translation' | 'messages' | 'history'
  /** per tab, its last Explain */
  plans: Record<string, PlanState>
  /** a copy to PostgreSQL in progress: the table being copied */
  pgCopy: string | null
  /** tabs closed this visit, newest last (the tab menu's “Reopen closed tab”) */
  closedTabs: QueryTab[]
  /** a database backup or restore in progress */
  backup: 'saving' | 'restoring' | null
  /** “Export all tables as CSV” in progress: the dataset, the table being written, how many are done */
  csvExport: { schema: string; table: string; done: number; total: number } | null
  /** the Share dialog is open */
  shareOpen: boolean
  /** the table tree as a sheet (a phone has no sidebar) */
  tablesOpen: boolean
  /** About & licences: closed, or the tab it shows (src/ui/AboutDialog.tsx) */
  aboutOpen: AboutTab | false
  /** a passing message that is not an error (what a shared link opened) */
  notice: string | null
  /** this tab gave the saved database to another Lab tab ("Use this tab" there): nothing runs here now */
  dbMoved: boolean
  /** Save on a Python tab with no file yet: the .py / .ipynb choice is open (src/ui/sqlFiles.ts) */
  saveKind: { saveAs: boolean } | null
  /** the demo shop's tables are kept but left out of the tree (Sample datasets shows them again) */
  demoHidden: boolean
  /** the practice dialog (examples and tasks on the demo shop) is open */
  practiceOpen: boolean
  /** a sample dataset's guide (src/ui/Guide.tsx): its id, or null when closed */
  guide: string | null
  practice: PracticeProgress
  /** per tab, a practice task's last Check */
  checks: Record<string, CheckState>
  /** the Python session of Python tabs (stage 7) */
  python: KernelState
  /** per Python tab, each cell's last run, by its source (for Download as notebook) */
  cellRuns: Record<string, Record<string, CellRun>>
  /** the Data analysis cycle cheat sheet panel in Python tabs is expanded */
  dmCycleOpen: boolean
  /** which Python panel (`dmCycle` | `aiHelper`) was opened most recently, for narrow viewports */
  pythonLastPanel: PythonPanelId | null
  /** fallback modal text when clipboard access fails for "Copy context for AI" */
  copyContextFallback: string | null
  /** whether localStorage is writable for AI settings/keys; false keeps them in memory only */
  aiStorageAvailable: boolean
  /** optional bring-your-own-key AI helper settings (OFF by default, never stores API keys) */
  aiSettings: AiSettings
  /** per-provider consent confirmation for sending schema/summary context */
  aiConsent: AiConsent
  /** API keys loaded solely from AI_API_KEY_STORAGE[provider], never saved inside aiSettings */
  aiKeys: Record<AiProvider, string>
  aiSettingsOpen: boolean
  aiConsentPrompt: AiConsentPrompt | null
  aiPanelOpen: boolean
  aiRequest: AiRequestState
  /** per Python tab, the last messages of the AI conversation (memory, and localStorage per tab); never in backups, links or notebooks */
  aiChats: Record<string, AiChatMessage[]>
  /** send the code of the cells above the cursor with each request (default on) */
  aiSendNotebook: boolean
}

export interface AiAskOptions {
  action?: AiQuickAction
  question?: string
  includeSampleRows?: boolean
  errorOverride?: string
}

export interface AiConsentPrompt {
  provider: AiProvider
  /** OpenAI-compatible server this consent is for, as saved when the prompt opened */
  baseUrl?: string
  pendingEnable: boolean
  pendingAsk?: AiAskOptions
}

export type AiRequestState =
  | { status: 'idle' }
  | { status: 'loading'; promptLabel: string; tabId?: string }
  | { status: 'done'; text: string; truncated: boolean; provider: AiProvider; model: string; promptLabel: string; tabId: string }
  | { status: 'error'; kind: string; message: string; promptLabel: string; tabId?: string }

export interface PracticeProgress {
  solved: string[]
  /** hints shown so far, per task */
  hints: Record<string, number>
}

export type CheckState = { status: 'running' } | { status: 'done'; verdict: Verdict } | { status: 'error'; message: string }

const TABS_KEY = 'stratalab.tabs.v1'
const WELCOME_KEY = 'stratalab.welcome-seen'
const THEME_KEY = 'stratalab.theme'
const DEMO_HIDDEN_KEY = 'stratalab.demo-hidden'
const PRACTICE_KEY = 'stratalab.practice.v1'
const HISTORY_KEY = 'stratalab.history.v1'

function loadHistory(): HistoryEntry[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY))
  } catch {
    return []
  }
}

function loadPractice(): PracticeProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? 'null')
    if (Array.isArray(saved?.solved)) return { solved: saved.solved, hints: saved.hints ?? {} }
  } catch {
    /* ignore */
  }
  return { solved: [], hints: {} }
}

function loadTabs(): { tabs: QueryTab[]; activeTab: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null')
    if (saved?.tabs?.length) return saved
  } catch {
    /* first visit or blocked storage */
  }
  return { tabs: [{ id: 't1', title: 'Query 1', sql: WELCOME_SQL }], activeTab: 't1' }
}

/** First visit, and not arriving with a model or a dataset link (those came for that). */
function firstVisit(): boolean {
  if (ddlDataFromHash(location.hash) !== null || datasetFromHash(location.hash) || shareDataFromHash(location.hash)) return false
  try {
    return localStorage.getItem(WELCOME_KEY) !== '1'
  } catch {
    return false
  }
}

function initialDemoHidden(): boolean {
  try {
    return localStorage.getItem(DEMO_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

function initialDmCycleOpen(): boolean {
  try {
    return parseDmCycleOpen(localStorage.getItem(DM_CYCLE_OPEN_KEY))
  } catch {
    return false
  }
}

const viewportWidth = () =>
  typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : PHONE_BREAKPOINT_PX

const initialPanels = resolveInitialPythonPanels(initialDmCycleOpen(), false, viewportWidth())

function detectAiStorageAvailable(): boolean {
  try {
    const probe = 'stratalab.ai.__probe__'
    localStorage.setItem(probe, '1')
    const ok = localStorage.getItem(probe) === '1'
    localStorage.removeItem(probe)
    return ok
  } catch {
    return false
  }
}

function loadAiSettings(): AiSettings {
  try {
    return parseAiSettings(localStorage.getItem(AI_SETTINGS_KEY))
  } catch {
    return parseAiSettings(null)
  }
}

function loadSendNotebook(): boolean {
  try {
    return parseSendNotebook(localStorage.getItem(AI_SEND_NOTEBOOK_KEY))
  } catch {
    return true
  }
}

function loadAiConsent(): AiConsent {
  try {
    return parseAiConsent(localStorage.getItem(AI_CONSENT_KEY))
  } catch {
    return parseAiConsent(null)
  }
}

function loadAiKeys(): Record<AiProvider, string> {
  const readKey = (provider: AiProvider): string => {
    try {
      return localStorage.getItem(AI_API_KEY_STORAGE[provider]) ?? ''
    } catch {
      return ''
    }
  }
  return {
    gemini: readKey('gemini'),
    claude: readKey('claude'),
    openai: readKey('openai'),
  }
}

function initialTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useLab = create<State>(() => ({
  engine: {
    status: 'loading',
    progress: { step: 'download', percent: null },
    withModel: ddlDataFromHash(location.hash) !== null,
    withDataset: datasetById(datasetFromHash(location.hash) ?? '')?.title ?? null,
  },
  tables: [],
  schemas: [],
  move: null,
  scriptDataset: null,
  ...loadTabs(),
  results: {},
  log: [],
  history: loadHistory(),
  imports: [],
  importError: null,
  theme: initialTheme(),
  ddl: null,
  dataset: null,
  catalogOpen: false,
  generate: null,
  welcomeOpen: !lessonFromHash(location.hash) && !practiceFromHash(location.hash) && !pipelineFromHash(location.hash) && !buildFromHash(location.hash) && firstVisit(),
  practiceBook: practiceFromHash(location.hash)?.kind ?? null,
  pipeline: practiceFromHash(location.hash) ? null : pipelineFromHash(location.hash),
  build: practiceFromHash(location.hash) || pipelineFromHash(location.hash) ? null : buildFromHash(location.hash),
  compareOpen: false,
  translations: {},
  postgres: { status: 'off' },
  pgTables: [],
  resultView: 'result',
  plans: {},
  pgCopy: null,
  closedTabs: [],
  backup: null,
  csvExport: null,
  shareOpen: false,
  tablesOpen: false,
  aboutOpen: false,
  notice: null,
  dbMoved: false,
  saveKind: null,
  demoHidden: initialDemoHidden(),
  practiceOpen: false,
  guide: null,
  practice: loadPractice(),
  checks: {},
  python: { status: 'off' },
  cellRuns: {},
  dmCycleOpen: initialPanels.dmCycleOpen,
  pythonLastPanel: initialPanels.lastOpened,
  copyContextFallback: null,
  aiStorageAvailable: detectAiStorageAvailable(),
  aiSettings: loadAiSettings(),
  aiConsent: loadAiConsent(),
  aiKeys: loadAiKeys(),
  aiSettingsOpen: false,
  aiConsentPrompt: null,
  aiPanelOpen: false,
  aiRequest: { status: 'idle' },
  aiChats: {},
  aiSendNotebook: loadSendNotebook(),
}))

/** The user's own tables and views (schema main), without the catalog datasets. */
export const ownTables = (tables: TableInfo[]) => tables.filter((t) => t.schema === 'main')

/** The tables and views of one schema. */
export const tablesIn = (tables: TableInfo[], schema: string) => tables.filter((t) => t.schema === schema)

export const CATALOG_IDS = DATASETS.map((d) => d.id)
/** Schema names that are never a dataset of the user's: the catalog's and the demo shop's. */
export const RESERVED_IDS = [...CATALOG_IDS, DEMO_SCHEMA]

/** The user's own datasets: schemas they made, not the catalog's. */
export const ownDatasets = (schemas: string[]) => schemas.filter((s) => isOwnSchema(s, RESERVED_IDS))

/** “My tables” for main, the schema's name for a dataset. */
export const schemaLabel = (schema: string) => (schema === 'main' ? 'My tables' : schema)

const set = useLab.setState
const get = useLab.getState

useLab.subscribe((s, prev) => {
  if (s.tabs !== prev.tabs || s.activeTab !== prev.activeTab) {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: s.tabs, activeTab: s.activeTab }))
    } catch {
      /* ignore */
    }
  }
  if (s.practice !== prev.practice) {
    try {
      localStorage.setItem(PRACTICE_KEY, JSON.stringify(s.practice))
    } catch {
      /* ignore */
    }
  }
  if (s.demoHidden !== prev.demoHidden) {
    try {
      if (s.demoHidden) localStorage.setItem(DEMO_HIDDEN_KEY, '1')
      else localStorage.removeItem(DEMO_HIDDEN_KEY)
    } catch {
      /* ignore */
    }
  }
  if (s.history !== prev.history) {
    // Full storage: keep the newer half rather than nothing.
    for (const list of [s.history, s.history.slice(0, s.history.length >> 1)])
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
        break
      } catch {
        /* try the shorter list */
      }
  }
  if (s.theme !== prev.theme) {
    try {
      localStorage.setItem(THEME_KEY, s.theme)
    } catch {
      /* ignore */
    }
  }
  if (s.aiSettings !== prev.aiSettings) {
    try {
      const safeSettings: AiSettings = {
        enabled: s.aiSettings.enabled,
        provider: s.aiSettings.provider,
        models: s.aiSettings.models,
        baseUrl: s.aiSettings.baseUrl,
      }
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(safeSettings))
    } catch {
      /* ignore */
    }
  }
  if (s.aiConsent !== prev.aiConsent) {
    try {
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify(s.aiConsent))
    } catch {
      /* ignore */
    }
  }
})

function addLog(entry: Omit<LogEntry, 'at'>) {
  set((s) => ({ log: [{ ...entry, at: Date.now() }, ...s.log].slice(0, 200) }))
}

/** A query run from a tab: to Messages, and to the history. */
function logRun(tabId: string, entry: Omit<LogEntry, 'at'>) {
  addLog(entry)
  const tab = get().tabs.find((t) => t.id === tabId)
  set((s) => ({ history: remember(s.history, { sql: entry.sql, dialect: tabDialect(tab), at: Date.now(), ok: entry.ok, text: entry.text, tab: tab?.title ?? '' }) }))
}

export function clearHistory() {
  set({ history: [] })
}

/** A query from the history, in a new tab of its dialect (not run). */
export function openFromHistory(e: HistoryEntry) {
  const dialect = (['duckdb', 'tsql', 'postgres', 'python'] as const).find((d) => d === e.dialect)
  addTab(e.sql, historyTabTitle(e), dialect)
  set({ resultView: 'result' })
}

export async function initEngine() {
  try {
    const e = await getEngine((progress) =>
      set((s) => (s.engine.status === 'loading' ? { engine: { ...s.engine, progress } } : {})),
    )
    set({ engine: { status: 'ready', version: e.version, persistent: e.persistent, memoryReason: e.memoryReason } })
    onDatabaseMoved(() => set({ dbMoved: true }))
    const moved = await prepareDemoSchema()
    await refreshCatalog()
    if (moved) addLog({ sql: '-- demo shop', ok: true, text: moved })
    // Tabs kept from the last visit that speak PostgreSQL: start it now rather than on the first run.
    if (get().tabs.some((t) => t.dialect === 'postgres')) void startPostgres()
    const fromModel = await openDdlFromHash()
    const fromLink = await openDatasetFromHash()
    const fromTask = await openTaskFromHash()
    const fromShare = await openShareFromHash()
    window.addEventListener('hashchange', () => {
      if (lessonFromHash(location.hash)) set({ practiceBook: null, pipeline: null, build: null })
      else if (practiceFromHash(location.hash)) set({ practiceBook: practiceFromHash(location.hash)!.kind, pipeline: null, build: null })
      else if (pipelineFromHash(location.hash)) set({ pipeline: pipelineFromHash(location.hash), practiceBook: null, build: null })
      else if (buildFromHash(location.hash)) set({ build: buildFromHash(location.hash), practiceBook: null, pipeline: null })
      void openDdlFromHash()
      void openDatasetFromHash()
      void openTaskFromHash()
      void openShareFromHash()
    })
    // First visit: an empty database gets the demo shop, so the welcome query works.
    // A user who dropped the demo tables in a saved database does not get them back.
    let offered = false
    try {
      offered = localStorage.getItem('stratalab.demo-offered') === '1'
      localStorage.setItem('stratalab.demo-offered', '1')
    } catch {
      /* ignore */
    }
    // Someone arriving with a model came for that model, not for the demo shop.
    if (!fromModel && !fromLink && !fromTask && !fromShare && !lessonFromHash(location.hash) && !get().practiceBook && !get().pipeline && !get().build && ownTables(get().tables).length === 0 && (!e.persistent || !offered)) await loadDemo()
  } catch (e) {
    set({ engine: { status: 'error', error: String(e instanceof Error ? e.message : e) } })
  }
}

export async function refreshCatalog() {
  const [tables, schemas] = await Promise.all([loadCatalog(), listSchemas()])
  // The demo shop has its own group in the tree, not a place among the datasets.
  set({ tables, schemas: schemas.filter((x) => x !== DEMO_SCHEMA) })
}

/** The tree's Refresh: reads both databases again (changes made from another tab, say). */
export async function refreshTree() {
  await refreshCatalog()
  if (get().postgres.status === 'ready') await refreshPgCatalog()
}

const WRITES = /\b(create|drop|alter|insert|update|delete|copy|attach|detach|import|truncate|merge)\b/i

export const tabDialect = (tab: QueryTab | undefined): Dialect => tab?.dialect ?? 'duckdb'

/** The rows line of a run in Messages and History: “10,000+ rows (first 10,000 shown)” when cut. */
const rowsText = (rows: number, more: boolean) => (more ? `${rows.toLocaleString()}+ rows (first ${rows.toLocaleString()} shown)` : `${rows.toLocaleString()} rows`)

/** A higher row limit for a tab's next Run (“Show more” on a script that changes data, so not run again by itself). */
const nextRowLimit = new Map<string, number>()
export const setNextRowLimit = (tabId: string, limit: number) => nextRowLimit.set(tabId, limit)

/** Runs a tab's SQL (or its selection). At most `limit` rows of the result come into the page. */
/** The share link's "Nothing has run yet" note is out of date once something runs. */
const NOT_RUN_YET = 'Nothing has run yet: read the query, then press Run.'
function dropNotRunYet() {
  if (get().notice?.includes(NOT_RUN_YET)) set({ notice: null })
}

export async function runSql(tabId: string, sql: string, limit?: number) {
  if (!sql.trim()) return
  dropNotRunYet()
  limit ??= nextRowLimit.get(tabId) ?? ROW_LIMIT
  nextRowLimit.delete(tabId)
  const dialect = tabDialect(get().tabs.find((t) => t.id === tabId))
  if (dialect === 'python') return runPython(tabId, [{ code: sql, line: 1, index: -1 }])
  stopped.delete(tabId)
  const before = get().results[tabId]
  set((s) => ({ results: { ...s.results, [tabId]: { ...s.results[tabId], status: 'running' } } }))
  if (dialect === 'postgres') return runOnPostgres(tabId, sql, limit)
  let toRun = sql
  let statements: string[] = [sql]
  let database: string | undefined
  let syncIdentity: string[] = []
  if (dialect === 'tsql') {
    const translated = await translate(tabId, sql)
    if (!translated) return
    const bad = translated.find((st) => st.error)
    if (bad) {
      const n = translated.indexOf(bad) + 1
      set((s) => ({ resultView: 'translation', results: { ...s.results, [tabId]: { status: 'error', error: `Translation Error: statement ${n} could not be read as T-SQL: ${bad.error}` } } }))
      logRun(tabId, { sql, ok: false, text: `T-SQL statement ${n}: ${bad.error}` })
      return
    }
    toRun = duckdbScript(translated)
    // One at a time, so the result shown is the last one that returns rows (as in PostgreSQL
    // tabs), and Stop can end any of them.
    statements = runOrder(translated)
    database = scriptDatabase(translated)
    syncIdentity = identitySyncSql(translated)
    if (!statements.length) {
      // Only CREATE DATABASE / USE / comments: nothing for DuckDB to run.
      const note = translated.flatMap((st) => st.notes)[0]
      set((s) => {
        const results = { ...s.results }
        if (before) results[tabId] = before
        else delete results[tabId]
        return { results, notice: note ?? 'Nothing to run in this script.' }
      })
      return
    }
  }
  // Many new tables: into a dataset of their own rather than My tables (asked once per script and tab).
  const made = tablesCreated(toRun)
  let into: string | null = null
  if (made.length >= DATASET_AT) {
    const answer = await chooseDataset(tabId, made, database)
    if (answer === 'cancel') {
      set((s) => {
        const results = { ...s.results }
        if (before) results[tabId] = before
        else delete results[tabId]
        return { results }
      })
      return
    }
    into = answer
    if (into) statements = statements.map((st) => qualifyReferences(qualifyDrops(st, into!), into!))
  }
  const t0 = performance.now()
  const isStopped = () => stopped.has(tabId)
  // The statement that is running (1-based; 'unknown' when the script goes to DuckDB in one piece), for the transaction note.
  let failedAt: number | 'unknown' | null = null
  try {
    if (into) {
      if (!get().schemas.includes(into)) await createSchema(into)
      // Tables made without a schema go to the first of the path (DuckDB keeps main on it too, which is why
      // the script's DROPs are given the dataset's name above).
      await query(`SET search_path = '${into}'`)
    }
    failedAt = statements.length > 1 ? 1 : 'unknown'
    let { table, more } = await queryLimited(statements[0], tabId, isStopped, limit)
    for (const [i, st] of statements.slice(1).entries()) {
      failedAt = i + 2
      const next = await queryLimited(st, tabId, isStopped, limit)
      if (next.table.numCols > 0) ({ table, more } = next)
    }
    failedAt = null
    // IDENTITY columns loaded with their own ids: the next INSERT without an id goes on after the highest one.
    for (const st of syncIdentity) {
      try {
        await query(st)
      } catch {
        /* a sequence that is not where it was expected stays as it is */
      }
    }
    const ms = performance.now() - t0
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'done', table, ms, sql, limit, more } } }))
    logRun(tabId, { sql, ok: true, text: `${rowsText(table.numRows, more)} · ${ms.toFixed(0)} ms${dialect === 'tsql' ? ' · T-SQL translated to DuckDB' : ''}${into ? ` · ${made.length} tables in the dataset ${into}` : ''}` })
    // A transaction the script left open stays open for the next Run: no CHECKPOINT inside it (src/core/transaction.ts).
    const settled = await settleRun(sql, null)
    // Always: the saved database must hold every change (src/db/engine.ts empties the WAL on
    // start), and a CHECKPOINT with nothing to write costs next to nothing.
    await checkpoint()
    if (WRITES.test(toRun)) await refreshCatalog()
    if (settled.note) addLog({ sql: '-- transaction', ok: true, text: settled.note })
  } catch (e) {
    if (isCancelled(e)) {
      const ms = performance.now() - t0
      set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error: STOPPED, ms } } }))
      logRun(tabId, { sql, ok: false, text: `Stopped after ${(ms / 1000).toFixed(1)} s` })
      await settleRun(sql, failedAt)
      // Statements of a script that ran before the stop may have changed tables.
      await checkpoint()
      if (WRITES.test(toRun)) await refreshCatalog()
      return
    }
    const raw = String(e instanceof Error ? e.message : e)
    const nameHint = sqlNameHint(raw, get().tables)
    const rolledBack = (await settleRun(sql, failedAt)).note
    const error = [raw, nameHint, rolledBack].filter(Boolean).join('\n')
    // In a T-SQL tab the hints are what the translation is for; they'd only repeat it.
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error, hints: dialect === 'tsql' ? [] : dialectHints(sql), ms: performance.now() - t0 } } }))
    logRun(tabId, { sql, ok: false, text: raw.split('\n')[0] })
    if (rolledBack) addLog({ sql: '-- rollback', ok: true, text: rolledBack })
  } finally {
    if (into) {
      try {
        await query(SEARCH_PATH_SQL)
      } catch {
        /* the next run sets it again */
      }
      await refreshCatalog()
    }
  }
}

/** Whether an earlier Run left a transaction open (src/core/transaction.ts has the rule). */
let transactionLeftOpen = false
async function settleRun(sql: string, failed: number | 'unknown' | null): Promise<Settled> {
  const r = await settleTransaction(sql, failed, transactionLeftOpen, { inTransaction, rollback })
  transactionLeftOpen = r.open
  setTransactionOpen(r.open)
  if (r.open) set({ notice: TRANSACTION_OPEN_NOTE })
  else set((s) => (s.notice === TRANSACTION_OPEN_NOTE ? { notice: null } : {}))
  return r
}

/** The answers given for a script in a tab: a dataset's name, or null for My tables. */
const datasetChoices = new Map<string, string | null>()
let answerDataset: ((a: string | null | 'cancel') => void) | null = null

/** The dataset a script's tables go into (null: My tables), asking the first time; 'cancel' when the user backed out. */
async function chooseDataset(tabId: string, tables: string[], database?: string): Promise<string | null | 'cancel'> {
  const key = choiceKey(tabId, tables)
  if (datasetChoices.has(key)) {
    const chosen = datasetChoices.get(key)!
    // A dataset that was removed since is asked about again.
    if (chosen === null || get().schemas.includes(chosen)) return chosen
  }
  const title = get().tabs.find((t) => t.id === tabId)?.title ?? ''
  set({ scriptDataset: { tables, name: suggestDatasetName(title, get().schemas, RESERVED_IDS, database), problem: null } })
  const answer = await new Promise<string | null | 'cancel'>((resolve) => {
    answerDataset = resolve
  })
  if (answer !== 'cancel') datasetChoices.set(key, answer)
  return answer
}

/** The dialog's buttons: a dataset name (made when it is new), My tables, or cancel. */
export function answerScriptDataset(choice: { dataset: string } | 'main' | 'cancel') {
  if (!answerDataset) return set({ scriptDataset: null })
  if (typeof choice === 'object') {
    const raw = choice.dataset
    const own = ownDatasets(get().schemas).find((n) => n.toLowerCase() === raw.trim().toLowerCase())
    const r = own ? { name: own } : datasetName(raw, get().schemas, RESERVED_IDS)
    if ('problem' in r) return set((s) => ({ scriptDataset: s.scriptDataset && { ...s.scriptDataset, name: raw, problem: r.problem } }))
    resolveDataset(r.name)
  } else resolveDataset(choice === 'main' ? null : 'cancel')
}

function resolveDataset(a: string | null | 'cancel') {
  const done = answerDataset
  answerDataset = null
  set({ scriptDataset: null })
  done?.(a)
}

export const STOPPED = 'Stopped: the query was cancelled before it finished.'

/** Tabs whose run was stopped: a T-SQL script checks this between its statements. */
const stopped = new Set<string>()

/** The Stop button (Esc in the editor): cancels the tab's DuckDB query or Explain. PostgreSQL tabs can't be stopped. */
export async function stopQuery(tabId: string) {
  if (get().results[tabId]?.status !== 'running' && get().plans[tabId]?.status !== 'running') return
  if (tabDialect(get().tabs.find((t) => t.id === tabId)) === 'python') return restartPython()
  stopped.add(tabId)
  await cancelQuery(tabId)
}

/**
 * The Explain button: the plan of the tab's last statement (or the selection's), shown under the
 * editor. A query that only reads is run (EXPLAIN ANALYZE: real rows and times); one that could
 * change data is only planned, so Explain never changes a table. A T-SQL tab explains its DuckDB
 * translation.
 */
export async function explainSql(tabId: string, sql: string) {
  if (!sql.trim() || get().plans[tabId]?.status === 'running') return
  const dialect = tabDialect(get().tabs.find((t) => t.id === tabId))
  if (dialect === 'python') return
  const put = (p: PlanState) => set((s) => ({ plans: { ...s.plans, [tabId]: p } }))
  stopped.delete(tabId)
  set({ resultView: 'plan' })
  put({ status: 'running' })
  const notes: string[] = []
  try {
    let script = sql
    if (dialect === 'tsql') {
      const translated = await translate(tabId, sql)
      if (!translated) throw new Error('the T-SQL could not be translated to DuckDB (see T-SQL → DuckDB)')
      const bad = translated.findIndex((st) => st.error)
      if (bad >= 0) throw new Error(`statement ${bad + 1} could not be read as T-SQL: ${translated[bad].error}`)
      script = translated.map((st) => st.target).join(';\n')
      notes.push('This is the plan of the DuckDB translation, which is what runs here. SQL Server makes its own plan for the T-SQL (in SSMS: Include Actual Execution Plan, Ctrl+M).')
    }
    const { statement, count } = lastStatement(script)
    if (!statement) throw new Error('there is no statement to explain')
    if (count > 1) notes.push(`Only the last of the ${count} statements is explained; the ones before it were not run.`)
    const analyze = readsOnly(statement)
    if (!analyze) notes.push('Not run: this statement could change data, so the plan shows the estimated rows, not real rows and times. Explain never changes your tables.')
    const explain = explainStatement(statement, analyze)
    let plan: Plan
    if (dialect === 'postgres') {
      await startPostgres()
      plan = parsePgPlan(await explainPostgres(explain), analyze)
    } else {
      const table = await queryCancellable(explain, tabId, () => stopped.has(tabId))
      // DuckDB: one row, the plan's JSON in the last column (explain_value / analyzed_plan).
      plan = parseDuckPlan(String(table.getChildAt(table.numCols - 1)?.get(0) ?? ''), analyze)
    }
    put({ status: 'done', plan, notes })
  } catch (e) {
    const error = isCancelled(e) ? STOPPED : dialect === 'postgres' ? pgError(e) : String(e instanceof Error ? e.message : e)
    put({ status: 'error', error })
  }
}

/** Translates a T-SQL tab's script to DuckDB (loading Python the first time); null if that failed. */
export async function translate(tabId: string, sql: string): Promise<TranslatedStatement[] | null> {
  const t0 = performance.now()
  const put = (t: TranslationState) => set((s) => ({ translations: { ...s.translations, [tabId]: t } }))
  put({ status: 'loading', progress: 'download' })
  try {
    const statements = await translateTsql(sql, (progress) => put({ status: 'loading', progress }))
    put({ status: 'done', statements, ms: performance.now() - t0 })
    return statements
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e)
    put({ status: 'error', error })
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error: `Translation Error: ${error}` } } }))
    return null
  }
}

/** The “Translate” button: the side-by-side view without running anything. */
export async function showTranslation(tabId: string, sql: string) {
  set({ resultView: 'translation' })
  if (sql.trim()) await translate(tabId, sql)
}

export function setResultView(view: State['resultView']) {
  set({ resultView: view })
}

export function setTabDialect(id: string, dialect: Dialect) {
  const view = (v: State['resultView']) => (v === 'translation' && dialect !== 'tsql') || (v === 'plan' && dialect === 'python') || (v === 'table' && dialect !== 'python') ? 'result' : v
  const before = tabDialect(get().tabs.find((t) => t.id === id))
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dialect } : t)), resultView: view(s.resultView) }))
  // A conversation that goes on across a dialect change says so in its feed (every request also names the dialect).
  if (before !== dialect && before !== 'python' && dialect !== 'python') {
    const chat = getAiChat(id)
    if (chat.length) setAiChat(id, normalizeFeed([...chat, { role: 'note', text: `Dialect changed to ${SQL_DIALECT_NAMES[dialect]}` }]))
  }
  if (dialect === 'postgres') void startPostgres()
  if (dialect === 'python') void startPython()
}

/**
 * The tab's dialect switch (the buttons above the editor). A tab with text doesn't turn from SQL into
 * Python or back: that text would only fail. A new tab of the chosen kind opens beside it (Python with
 * an example over the tables that are loaded) and the first one stays as it was.
 */
export function switchTabDialect(id: string, dialect: Dialect) {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab || dialectSwitch(tabDialect(tab), dialect, tab.sql) === 'in-place') return setTabDialect(id, dialect)
  if (dialect === 'python') newPythonTab()
  else addTab('', undefined, dialect)
}

/** A new Python tab with an example that reads a table which is really loaded. */
export function newPythonTab() {
  return addTab(currentPythonStarter(), `Python ${get().tabs.filter((t) => t.dialect === 'python').length + 1}`, 'python')
}

/** "New Python notebook" on a table: a Python tab that reads it (`name` as lab.table takes it). */
export function newPythonNotebookOn(name: string, title = name) {
  return addTab(pythonTableStarter(name, title), `${title} · Python`, 'python')
}

/** "New Python notebook for this table": opens or focuses a 4-stage notebook tailored to `t`. */
export function newPythonNotebookForTable(t: TableInfo) {
  const code = pythonNotebookForTable(t)
  return addOrFocusTab(code, `${t.name} · Python`, 'python')
}

/** The example for a Python tab, over what is loaded now. */
export const currentPythonStarter = () => pythonStarter(get().tables, hasDemoTables(get().tables))

// ------------------------------------------------------------------ Python tabs (stage 7)

onKernelState((python) => set({ python }))

/** Starts the Python session (a download the first time); errors show in the bar above the editor. */
export function startPython() {
  startKernel().catch(() => {})
}

/** Restart Python (and Stop of a Python run): the session's variables are gone. */
export function restartPython() {
  stopKernel()
  set((s) => {
    const results = { ...s.results }
    for (const [id, r] of Object.entries(results))
      if (r.status === 'running') results[id] = { ...r, status: 'error', error: STOPPED_PY, cells: r.cells?.filter((c) => !c.running) }
    return { results }
  })
}

/** Retry after a failed start (a download manager took a file, the network dropped): a new session. */
export function retryPython() {
  stopKernel()
  startPython()
}

/** The tables and views Python's lab.tables() lists: `name` in My tables, `schema.name` elsewhere. */
const pythonNames = () => get().tables.map((t) => (t.schema === 'main' ? t.name : `${t.schema}.${t.name}`))

/**
 * Runs cells of a Python tab in order (all of them, one, or a selection as one cell), stopping at
 * the first that fails, as Jupyter's Run All does. Each cell's outputs show as it ends; the grid
 * shows the last DataFrame a cell showed; lab.save calls are written to DuckDB after their cell.
 */
export async function runPython(tabId: string, cells: { code: string; line: number; index: number; source?: string }[]) {
  const todo = cells.filter((c) => c.code.trim())
  if (!todo.length || get().results[tabId]?.status === 'running') return
  dropNotRunYet()
  const t0 = performance.now()
  const runs: PyCellRun[] = []
  let table: Table | undefined
  let more = false
  let tableFrom: TabResult['tableFrom']
  const put = (status: TabResult['status'], extra: Partial<TabResult> = {}) =>
    set((s) => ({ results: { ...s.results, [tabId]: { status, cells: [...runs], table, more, tableFrom, limit: ROW_LIMIT, ms: performance.now() - t0, ...extra } } }))
  set({ resultView: 'result' })
  put('running')
  const what = todo.length === 1 ? (todo[0].index >= 0 ? `cell ${todo[0].index + 1}` : 'selection') : `${todo.length} cells`
  const sql = todo.map((c) => c.code).join('\n\n')
  try {
    for (const c of todo) {
      runs.push({ index: c.index, line: c.line, count: 0, outputs: [], running: true })
      put('running')
      const r = await runCell(c.code, c.line, pythonNames())
      runs[runs.length - 1] = { index: c.index, line: c.line, count: r.count, outputs: r.result.outputs, frames: Object.fromEntries(r.frames.map((f) => [f.at, f])) }
      const last = r.frames[r.frames.length - 1]
      if (last) {
        table = last.table
        more = last.total > last.table.numRows
        tableFrom = { run: runs.length - 1, at: last.at }
      }
      if (c.source != null)
        set((s) => ({ cellRuns: { ...s.cellRuns, [tabId]: { ...s.cellRuns[tabId], [c.source!]: { count: r.count, outputs: r.result.outputs } } } }))
      for (const sv of r.saves) {
        const error = await writeTable(sv.table, sv.name)
        const last = runs[runs.length - 1]
        runs[runs.length - 1] = { ...last, outputs: [...last.outputs] }
        runs[runs.length - 1].outputs.push(
          error
            ? { output_type: 'stream', name: 'stderr', text: `lab.save: could not save ${sv.name}: ${error}\n` }
            : { output_type: 'stream', name: 'stdout', text: `lab.save: ${sv.table.numRows.toLocaleString()} rows saved as table ${sv.name}\n` },
        )
      }
      put('running')
      const failed = r.result.outputs.find((o) => o.output_type === 'error')
      if (failed) {
        put('done')
        logRun(tabId, { sql, ok: false, text: `${failed.ename}: ${failed.evalue}`.split('\n')[0] })
        return
      }
    }
    put('done')
    logRun(tabId, { sql, ok: true, text: `Python, ${what} · ${((performance.now() - t0) / 1000).toFixed(1)} s${table ? ` · ${rowsText(table.numRows, more)}` : ''}` })
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e)
    put('error', { error: error === STOPPED_PY ? error : `Python Error: ${error}`, cells: runs.filter((c) => !c.running) })
    logRun(tabId, { sql, ok: false, text: error.split('\n')[0] })
  }
}

/** "Open in DataFrame view" on a DataFrame in Output: that one goes to the DataFrame view, which opens. */
export function openFrame(tabId: string, run: number, at: number) {
  const r = get().results[tabId]
  const f = r?.cells?.[run]?.frames?.[at]
  if (!r || !f) return
  set((s) => ({ results: { ...s.results, [tabId]: { ...r, table: f.table, more: f.total > f.table.numRows, tableFrom: { run, at } } }, resultView: 'table' }))
}

/** A DataFrame from lab.save into My tables, replacing a table of that name; the error, if any. */
async function writeTable(table: Table, name: string): Promise<string | null> {
  const same = ownTables(get().tables).find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (same?.kind === 'view') return `${same.name} is a view`
  const target = quoteIdent(name)
  const tmp = `__save_${Date.now()}`
  try {
    await insertArrow(table, tmp)
    await query(`DROP TABLE IF EXISTS ${target}`)
    await query(`ALTER TABLE ${quoteIdent(tmp)} RENAME TO ${target}`)
    await checkpoint()
    await refreshCatalog()
    return null
  } catch (e) {
    await query(`DROP TABLE IF EXISTS ${quoteIdent(tmp)}`).catch(() => {})
    return String(e instanceof Error ? e.message : e)
  }
}

// ------------------------------------------------------------------ PostgreSQL mode (stage 4)

export async function startPostgres() {
  if (get().postgres.status === 'ready' || get().postgres.status === 'loading') return
  set({ postgres: { status: 'loading' } })
  try {
    const pg = await getPostgres()
    set({ postgres: { status: 'ready', version: pg.version, persistent: pg.persistent } })
    await refreshPgCatalog()
  } catch (e) {
    set({ postgres: { status: 'error', error: String(e instanceof Error ? e.message : e) } })
  }
}

export async function refreshPgCatalog() {
  if (get().postgres.status !== 'ready') return
  set({ pgTables: await postgresCatalog() })
}

async function runOnPostgres(tabId: string, sql: string, limit: number) {
  const t0 = performance.now()
  try {
    await startPostgres()
    // PGlite hands over the whole result at once: only the grid is spared the rows past the limit.
    const all = await runPostgres(sql)
    const more = all.numRows > limit
    const table = more ? all.slice(0, limit) : all
    const ms = performance.now() - t0
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'done', table, ms, sql, limit, more } } }))
    logRun(tabId, { sql, ok: true, text: `${rowsText(table.numRows, more)} · ${ms.toFixed(0)} ms · PostgreSQL` })
    if (WRITES.test(sql)) await refreshPgCatalog()
  } catch (e) {
    const error = pgError(e)
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error, ms: performance.now() - t0 } } }))
    logRun(tabId, { sql, ok: false, text: error.split('\n')[0] })
  }
}

/** PostgreSQL's message as “PostgreSQL Error: …”, with its hint when it gives one. */
function pgError(e: unknown): string {
  const err = e as { message?: string; hint?: string; position?: string }
  let text = `PostgreSQL Error: ${err.message ?? String(e)}`
  if (err.position) text += ` (at character ${err.position})`
  if (err.hint) text += `\nHint: ${err.hint}`
  return text
}

/** “Copy to PostgreSQL”: one DuckDB schema (or some of its tables) into the PostgreSQL database. */
export async function copySchemaToPostgres(duckSchema: string, only?: string[]) {
  if (get().pgCopy) return
  const label = only?.length === 1 ? only[0] : duckSchema === 'main' ? 'my tables' : datasetById(duckSchema)?.title ?? duckSchema
  set({ pgCopy: label })
  try {
    await startPostgres()
    const r = await copyToPostgres(duckSchema, only, (table) => set({ pgCopy: table }))
    await refreshPgCatalog()
    const rows = r.copied.reduce((n, t) => n + t.rows, 0)
    addLog({
      sql: `-- copy ${label} to PostgreSQL`,
      ok: true,
      text: `${r.copied.length} table(s), ${rows.toLocaleString()} rows copied to PostgreSQL (schema ${r.schema})` + (r.notes.length ? `\n${r.notes.join('\n')}` : ''),
    })
    const first = r.copied[0]?.name
    if (first) {
      const name = r.schema === 'public' ? sqlName(first) : `${sqlName(r.schema)}.${sqlName(first)}`
      const id = addTab(`-- ${r.copied.length} table(s) copied from DuckDB to PostgreSQL${r.notes.length ? ' (notes in Messages)' : ''}\nSELECT * FROM ${name} LIMIT 100;\n`, `${label} · PostgreSQL`, 'postgres')
      void runSql(id, `SELECT * FROM ${name} LIMIT 100;`)
    }
  } catch (e) {
    addLog({ sql: `-- copy ${label} to PostgreSQL`, ok: false, text: pgError(e) })
    set({ importError: `Could not copy to PostgreSQL: ${String(e instanceof Error ? e.message : e)}` })
  } finally {
    set({ pgCopy: null })
  }
}

export async function dropPgObject(t: TableInfo) {
  const name = `${quoteIdent(t.schema)}.${quoteIdent(t.name)}`
  await runPostgres(`DROP ${t.kind === 'view' ? 'VIEW' : 'TABLE'} ${name}`)
  await refreshPgCatalog()
  addLog({ sql: `DROP ${t.kind.toUpperCase()} ${name}`, ok: true, text: `${name} dropped from PostgreSQL` })
}

let tabCounter = Date.now()

export function addTab(sql = '', title?: string, dialect?: Dialect) {
  const id = `t${++tabCounter}`
  set((s) => {
    const n = s.tabs.length + 1
    return { tabs: [...s.tabs, { id, title: title ?? `Query ${n}`, sql, ...(dialect && dialect !== 'duckdb' ? { dialect } : {}) }], activeTab: id }
  })
  if (dialect === 'postgres') void startPostgres()
  if (dialect === 'python') startPython()
  return id
}

/**
 * Opens a tab, or focuses the one already open with the same title, text and dialect (a dataset's
 * starter query opened again, a guide example): keyed by content, in memory, so it needs no storage.
 */
export function addOrFocusTab(sql: string, title: string, dialect?: Dialect) {
  const same = findMatchingTab(get().tabs, sql, title, dialect ?? 'duckdb')
  if (same) {
    set({ activeTab: same.id })
    return same.id
  }
  return addTab(sql, title, dialect)
}

export function closeTab(id: string) {
  closeTabs([id])
}

/** Closes tabs (the tab menu's “Close others”, “Close tabs to the right”); “Reopen closed tab” brings them back. */
export function closeTabs(ids: string[]) {
  const gone = new Set(ids)
  set((s) => {
    const tabs = s.tabs.filter((t) => !gone.has(t.id))
    if (!tabs.length) tabs.push({ id: `t${++tabCounter}`, title: 'Query 1', sql: '' })
    // The active tab closed: the nearest open tab on its left takes over.
    const idx = s.tabs.findIndex((t) => t.id === s.activeTab)
    const left = s.tabs.slice(0, idx).reverse().find((t) => !gone.has(t.id))
    const activeTab = gone.has(s.activeTab) ? (left ?? tabs[0]).id : s.activeTab
    const results = { ...s.results }
    const translations = { ...s.translations }
    const aiChats = { ...s.aiChats }
    for (const id of ids) {
      delete results[id]
      delete translations[id]
      delete aiChats[id]
      try {
        localStorage.removeItem(AI_CHAT_KEY_PREFIX + id)
      } catch {
        /* no storage */
      }
    }
    return { tabs, activeTab, results, translations, aiChats, closedTabs: rememberClosed(s.closedTabs, s.tabs.filter((t) => gone.has(t.id))) }
  })
}

/** The last closed tab, back where tabs open (at the end), with its SQL and dialect. */
export function reopenClosedTab() {
  const tab = get().closedTabs.at(-1)
  if (!tab) return
  set((s) => ({ closedTabs: s.closedTabs.slice(0, -1) }))
  const id = addTab(tab.sql, tab.title, tab.dialect)
  if (tab.decisions) setTabDecisions(id, tab.decisions)
}

/** A copy of a tab next to it: same SQL and dialect, “(copy)” in its title. */
export function duplicateTab(id: string) {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab) return
  const copy: QueryTab = { ...tab, id: `t${++tabCounter}`, title: copyTitle(tab.title, get().tabs.map((t) => t.title)) }
  set((s) => {
    const tabs = [...s.tabs]
    tabs.splice(tabs.indexOf(tab) + 1, 0, copy)
    return { tabs, activeTab: copy.id }
  })
}

export function setTabSql(id: string, sql: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)) }))
}

export function setTabDecisions(id: string, decisions: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, decisions: decisions || undefined } : t)) }))
}

export function renameTab(id: string, title: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)) }))
}

/** Opens a new tab with the query and runs it (used by the object tree). */
export function openAndRun(sql: string, title: string, dialect?: Dialect) {
  const id = addTab(sql, title, dialect)
  void runSql(id, sql)
}

/**
 * The Update button. A tab in memory with tables of its own loses them on the reload, so it asks
 * first (src/core/dbLock.ts); the demo shop comes back by itself and is not counted.
 */
export function updateNow() {
  const { engine, tables, schemas } = get()
  if (engine.status === 'ready' && !engine.persistent) {
    const names = [...ownTables(tables).map((t) => t.name), ...schemas]
    if (names.length && !confirm(updateLosesTables(names))) return
  }
  applyUpdate()
}

/** Loads the demo shop again (fresh rows) and shows it in the tree. */
export async function loadDemo() {
  await query(DEMO_SQL)
  await checkpoint()
  await refreshCatalog()
  set({ demoHidden: false })
  addLog({ sql: '-- demo shop', ok: true, text: 'Demo shop loaded: demo.customers, demo.products, demo.orders, demo.order_items' })
}

/** All four demo tables are in the database (hidden or not). */
export const hasDemoTables = (tables: TableInfo[]) => DEMO_TABLES.every((n) => tables.some((t) => t.schema === DEMO_SCHEMA && t.name === n))

/** Takes the demo shop out of the tree; its tables stay, so it comes back as it was. */
export function hideDemo() {
  set({ demoHidden: true })
  addLog({ sql: '-- hide demo shop', ok: true, text: 'Demo shop hidden (Sample datasets → Demo shop → Show brings it back)' })
}

/** Shows the demo shop in the tree again, loading it first when its tables are gone. */
export async function showDemo() {
  if (!hasDemoTables(get().tables)) return loadDemo()
  set({ demoHidden: false })
}

/** Tables that point at `list` with a foreign key (and the ones pointing at those): DuckDB will not drop `list` while they exist. */
export async function dependentsOf(list: TableInfo[]): Promise<TableInfo[]> {
  const res = await query(`SELECT schema_name AS schema, table_name AS "table", referenced_table AS "refTable" FROM duckdb_constraints() WHERE database_name = current_database() AND constraint_type = 'FOREIGN KEY'`)
  const fks = res.toArray().map((r) => ({ schema: String(r.schema), table: String(r.table), ref: String(r.refTable) }))
  const all = get().tables
  const found = [...list]
  for (let grew = true; grew; ) {
    grew = false
    for (const fk of fks) {
      const child = all.find((t) => t.schema === fk.schema && t.name === fk.table)
      if (child && !found.includes(child) && found.some((t) => t.schema === fk.schema && t.name === fk.ref)) {
        found.push(child)
        grew = true
      }
    }
  }
  return found.slice(list.length)
}

export async function dropObject(t: TableInfo) {
  await dropObjects([t])
}

/**
 * Drops several tables and views at once. Views go first, and a table another one points to with
 * a foreign key waits until the one pointing at it is gone (DuckDB refuses to drop it before);
 * what still cannot go, because something outside the list depends on it, is reported.
 */
export async function dropObjects(list: TableInfo[]) {
  let rest = [...list].sort((a, b) => Number(b.kind === 'view') - Number(a.kind === 'view'))
  const done: string[] = []
  let why = ''
  while (rest.length) {
    const failed: TableInfo[] = []
    for (const t of rest) {
      const name = qualifiedName(t.schema, t.name)
      try {
        await query(`DROP ${t.kind === 'view' ? 'VIEW' : 'TABLE'} ${name}`)
        done.push(name)
        addLog({ sql: `DROP ${t.kind.toUpperCase()} ${name}`, ok: true, text: `${name} dropped` })
      } catch (e) {
        failed.push(t)
        why = String(e instanceof Error ? e.message : e)
      }
    }
    if (failed.length === rest.length) break
    rest = failed
  }
  if (done.length) await checkpoint()
  await refreshCatalog()
  if (rest.length) {
    const names = rest.map((t) => qualifiedName(t.schema, t.name)).join(', ')
    addLog({ sql: `DROP ${names}`, ok: false, text: why })
    set({ importError: `Could not drop ${names}: ${why.split('\n')[0]}` })
  }
}

export async function renameObject(t: TableInfo, to: string) {
  await query(`ALTER ${t.kind === 'view' ? 'VIEW' : 'TABLE'} ${qualifiedName(t.schema, t.name)} RENAME TO ${quoteIdent(to)}`)
  await checkpoint()
  await refreshCatalog()
}

/**
 * Queues files for the import dialog, for `schema` (My tables, or one of the user's datasets).
 * `target`: add the rows to this table. Without it, a file named like an existing empty table
 * (a model's table waiting for data) goes into that table.
 */
export async function enqueueFiles(files: File[], target?: string, schema = 'main') {
  set({ importError: null })
  for (const f of files) {
    try {
      const src = await openSource(f)
      src.schema = schema
      src.target = target ?? emptyTableNamed(src.tableName, schema)
      const taken = [...tablesIn(get().tables, schema).map((t) => t.name), ...get().imports.filter((i) => i.schema === schema).map((i) => i.tableName)]
      src.tableName = uniqueName(src.tableName, taken)
      set((s) => ({ imports: [...s.imports, src] }))
    } catch (e) {
      set({ importError: String(e instanceof Error ? e.message : e) })
    }
  }
}

/** Cells copied from Excel, Google Sheets or a web page (tab-separated) go through the import dialog. */
export function pasteTable(text: string) {
  return enqueueFiles([new File([text], 'pasted.tsv', { type: 'text/tab-separated-values' })])
}

/** The “Paste a table” button: reads the clipboard (the browser may ask first). */
export async function pasteTableFromClipboard() {
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    set({ importError: 'The browser did not let Quaera Lab read the clipboard. Click outside the editor and press Ctrl+V instead.' })
    return
  }
  if (!looksLikeTable(text)) {
    set({ importError: 'The clipboard holds no table. Select cells in Excel or Google Sheets (with a header row), copy them, then paste here.' })
    return
  }
  await pasteTable(text)
}

/** The name of an existing table of `schema` called `name` that has no rows yet, or null. */
export function emptyTableNamed(name: string, schema = 'main'): string | null {
  const t = tablesIn(get().tables, schema).find((t) => t.kind === 'table' && t.name.toLowerCase() === name.toLowerCase())
  return t && t.rows === 0 ? t.name : null
}

export function updateImport(src: ImportSource) {
  set((s) => ({ imports: s.imports.map((i) => (i.id === src.id ? src : i)) }))
}

export async function confirmImport(src: ImportSource, replace: boolean) {
  await createTable(src, replace)
  await closeSource(src)
  set((s) => ({ imports: s.imports.filter((i) => i.id !== src.id) }))
  await refreshCatalog()
  const info = tablesIn(get().tables, src.schema).find((t) => t.name === src.tableName)
  const name = qualifiedName(src.schema, src.tableName)
  addLog({ sql: `-- import ${src.fileName}`, ok: true, text: `${name}: ${info?.rows?.toLocaleString() ?? '?'} rows from ${src.fileName}` })
}

/** After the rows were inserted into an existing table (stage 2b). */
export async function finishFill(src: ImportSource, added: number, skipped: number) {
  await clearFill()
  await closeSource(src)
  set((s) => ({ imports: s.imports.filter((i) => i.id !== src.id) }))
  await refreshCatalog()
  const table = qualifiedName(src.schema, src.target!)
  addLog({
    sql: `-- fill ${table} from ${src.fileName}`,
    ok: true,
    text: `${table}: ${added.toLocaleString()} rows added from ${src.fileName}${skipped ? `, ${skipped.toLocaleString()} rows with problems skipped` : ''}`,
  })
  openAndRun(`SELECT * FROM ${table} LIMIT 100;`, src.target!)
}

export async function cancelImport(src: ImportSource) {
  await clearFill()
  await closeSource(src)
  set((s) => ({ imports: s.imports.filter((i) => i.id !== src.id) }))
}

export function openWelcome() {
  set({ welcomeOpen: true })
}

export function openCompare(open = true) {
  set({ compareOpen: open })
}

export function closeWelcome() {
  set({ welcomeOpen: false })
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function toggleTheme() {
  set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
}

/**
 * `#ddl=` in the address: the tables of a model sent by model.quaera.app. The fragment is
 * cleared at once, so a reload does not create the tables again. True when there was one.
 */
export async function openDdlFromHash(): Promise<boolean> {
  const data = ddlDataFromHash(location.hash)
  if (!data) return false
  history.replaceState(null, '', location.pathname + location.search + hashWithoutDdl(location.hash))
  let plan: DdlPlan
  try {
    plan = planDdl(await decodeDdl(data))
  } catch (e) {
    set({ ddl: { phase: 'error', message: String(e instanceof Error ? e.message : e) } })
    return true
  }
  if (!plan.tables.length) {
    set({ ddl: { phase: 'error', message: 'The link holds no CREATE TABLE statement.' } })
    return true
  }
  const planned = new Set(plan.tables.map((t) => t.name.toLowerCase()))
  const clashing = ownTables(get().tables)
    .filter((t) => planned.has(t.name.toLowerCase()))
    .map((t) => ({ name: t.name, kind: t.kind }))
  if (clashing.length) set({ ddl: { phase: 'confirm', plan, clashing } })
  else await runDdl(plan, false)
  return true
}

/** Creates the planned tables; `replace` drops the existing tables with the same names first. */
export async function runDdl(plan: DdlPlan, replace: boolean) {
  set({ ddl: { phase: 'running', plan } })
  const existing = ownTables(get().tables).map((t) => ({ name: t.name, kind: t.kind }))
  try {
    const { created, notes } = await applyPlan(plan, existing, replace)
    await refreshCatalog()
    if (created.length) addTab(starterSql(plan, created), plan.title ?? 'Model')
    addLog({
      sql: `-- model${plan.title ? ` "${plan.title}"` : ''} from model.quaera.app`,
      ok: created.length > 0,
      text: `${created.length} of ${plan.tables.length} tables created${notes.length ? `, ${notes.length} note(s)` : ''}`,
    })
    set({ ddl: notes.length || !created.length ? { phase: 'report', title: plan.title, created: created.map((t) => t.name), notes } : null })
  } catch (e) {
    await refreshCatalog()
    set({ ddl: { phase: 'error', message: String(e instanceof Error ? e.message : e) } })
  }
}

export function closeDdl() {
  set({ ddl: null })
}

// ------------------------------------------------------------------ data generator (stage 2)

/**
 * Opens the generator over the user's own tables (main, or one of their datasets). With `focus`, that table and the empty tables
 * it needs (its NOT NULL foreign keys, all the way up) are ticked; without, every empty table.
 */
export async function openGenerate(focus?: string, schema = 'main') {
  const rows = new Map(tablesIn(get().tables, schema).map((t) => [t.name, t.rows ?? 0]))
  const tables: GenTable[] = (await schemaForModel(schema)).map((t) => ({ ...t, rows: rows.get(t.name) ?? 0, ...(schema !== 'main' ? { schema } : {}) }))
  const byName = new Map(tables.map((t) => [t.name, t]))
  const chosen = new Set<string>()
  const need = (name: string) => {
    const t = byName.get(name)
    if (!t || chosen.has(name)) return
    chosen.add(name)
    const notNull = new Set(t.columns.filter((c) => c.notNull).map((c) => c.name))
    for (const fk of t.foreignKeys) if (fk.refTable !== name && fk.columns.some((c) => notNull.has(c)) && !byName.get(fk.refTable)?.rows) need(fk.refTable)
  }
  if (focus) need(focus)
  else for (const t of tables) if (!t.rows) chosen.add(t.name)
  set({ generate: { phase: 'choose', tables, counts: Object.fromEntries(tables.map((t) => [t.name, chosen.has(t.name) ? 100 : 0])) } })
}

export function setGenerateCount(table: string, n: number) {
  const g = get().generate
  if (g?.phase !== 'choose') return
  set({ generate: { ...g, counts: { ...g.counts, [table]: Math.max(0, Math.min(100_000, Math.floor(n) || 0)) } } })
}

export function generationPlan(g: Extract<GenerateState, { phase: 'choose' }>): GenPlan {
  return planGeneration(g.tables, new Map(Object.entries(g.counts)))
}

export async function runGenerate() {
  const g = get().generate
  if (g?.phase !== 'choose') return
  const plan = generationPlan(g)
  set({ generate: { phase: 'running', plan, step: 0 } })
  const outcomes = await runGeneration(plan, (step) => set({ generate: { phase: 'running', plan, step } }))
  await refreshCatalog()
  const added = outcomes.reduce((n, o) => n + o.added, 0)
  addLog({
    sql: '-- generate sample rows',
    ok: outcomes.every((o) => !o.error),
    text: outcomes.map((o) => `${o.table}: ${o.error ? o.error : `${o.added} rows`}`).join(' · ') || 'nothing generated',
  })
  const filled = outcomes.filter((o) => o.added > 0)
  if (filled.length) addTab(filled.map((o) => `SELECT * FROM ${qualifiedName(plan.steps.find((s) => s.table === o.table)?.schema ?? 'main', o.table)} LIMIT 100;`).join('\n\n') + '\n', 'Generated rows')
  set({ generate: { phase: 'report', outcomes, problems: plan.problems } })
  if (added && !plan.problems.length && outcomes.every((o) => !o.error && o.added === o.asked)) set({ generate: null })
}

export function closeGenerate() {
  set({ generate: null })
}

// ------------------------------------------------------------------ dataset catalog (stage 3)

export function openCatalog(open = true) {
  set({ catalogOpen: open })
}

/**
 * Loads a catalog dataset into its own schema (again, if it is there) and opens its starter query,
 * or with `lang` 'python' a Python tab over its main table (not run: Python downloads on the first run).
 */
export async function openDataset(d: Dataset, reload = false, lang: 'sql' | 'python' = 'sql') {
  if (get().dataset?.phase === 'loading') return
  set({ catalogOpen: false, guide: null })
  const { state, extra } = catalogState(d)
  if (!reload && state === 'loaded') {
    if (lang === 'python') newPythonNotebookOn(`${d.id}.${d.main}`, d.title)
    else addOrFocusTab(d.starter, d.title)
    return
  }
  // A schema of the user's with the dataset's name: loading would drop their tables.
  if (state === 'foreign' && !confirm(`There is already a schema called ${d.id} with your table${extra.length === 1 ? '' : 's'} ${extra.join(', ')}. Loading ${d.title} replaces it and ${extra.length === 1 ? 'that table is' : 'those tables are'} lost. Load anyway?`)) return
  if (!(await fetchDataset(d))) return
  if (lang === 'python') newPythonNotebookOn(`${d.id}.${d.main}`, d.title)
  else void runSql(addOrFocusTab(d.starter, d.title), d.starter)
}

/** Whether a catalog dataset is in its schema (src/core/ownDatasets.ts). */
export function catalogState(d: Dataset) {
  const { tables, schemas } = get()
  return catalogSchemaState(
    d.tables.map((t) => t.name),
    schemas.includes(d.id) ? tablesIn(tables, d.id).map((t) => t.name) : null,
  )
}

/** Loads a dataset with the progress card; false (and the card shows why) if it failed. */
async function fetchDataset(d: Dataset): Promise<boolean> {
  set({ dataset: { phase: 'loading', dataset: d, progress: { step: 'download', share: 0 } } })
  const t0 = performance.now()
  try {
    await loadDataset(d, (progress) => set((s) => (s.dataset?.phase === 'loading' ? { dataset: { ...s.dataset, progress } } : {})))
    await refreshCatalog()
    set({ dataset: null })
    const rows = d.tables.reduce((n, t) => n + t.rows, 0)
    addLog({ sql: `-- dataset ${d.id}`, ok: true, text: `${d.title}: ${d.tables.length} tables, ${rows.toLocaleString()} rows in schema ${d.id} · ${(performance.now() - t0).toFixed(0)} ms` })
    return true
  } catch (e) {
    await refreshCatalog()
    set({ dataset: { phase: 'error', dataset: d, message: String(e instanceof Error ? e.message : e) } })
    return false
  }
}

export function closeDatasetError() {
  set({ dataset: null })
}

export async function dropDataset(id: string) {
  await removeDataset(id)
  await refreshCatalog()
  addLog({ sql: `DROP SCHEMA ${id} CASCADE`, ok: true, text: `${datasetById(id)?.title ?? id} removed` })
}

// ------------------------------------------------------------------ the user's own datasets

/**
 * “New dataset”: asks for a name (again, with why, when it can't be used) and makes an empty
 * schema; null when the user cancelled. `ask` is window.prompt, passed in for the import dialog.
 */
export async function newDataset(ask: (text: string, value: string) => string | null = (t, v) => prompt(t, v)): Promise<string | null> {
  let text = 'Name of the new dataset (a folder for your tables: sales, hr, project_x)'
  let value = ''
  for (;;) {
    const raw = ask(text, value)
    if (raw === null) return null
    const r = datasetName(raw, get().schemas, RESERVED_IDS)
    if ('problem' in r) {
      text = r.problem
      value = raw
      continue
    }
    try {
      await createSchema(r.name)
    } catch (e) {
      text = String(e instanceof Error ? e.message : e)
      value = raw
      continue
    }
    await refreshCatalog()
    addLog({ sql: `CREATE SCHEMA ${r.name}`, ok: true, text: `Dataset ${r.name} made: add tables to it from its ⋯ menu, by dropping files on it, or in the import dialog` })
    return r.name
  }
}

/** Opens “Move to dataset” for a table: it goes with every table linked to it by keys. */
export async function openMove(t: TableInfo, to?: string) {
  const tables = await schemaForModel(t.schema)
  const linked = t.kind === 'table' ? linkedTables(tables, t.name) : [t.name]
  set({ move: { schema: t.schema, table: t.name, tables: linked.length ? linked : [t.name], busy: false, error: null, to } })
}

export function closeMove() {
  set({ move: null })
}

/** Moves the dialog's tables to `to` (a schema that exists). */
export async function runMove(to: string) {
  const m = get().move
  if (!m || m.busy) return
  set({ move: { ...m, busy: true, error: null } })
  try {
    const r = await moveTables(m.schema, m.tables, to)
    await refreshCatalog()
    set({ move: null })
    addLog({
      sql: `-- move ${r.tables.join(', ')} to ${to}`,
      ok: true,
      text: `${r.tables.join(', ')}: moved from ${schemaLabel(m.schema)} to ${schemaLabel(to)} (${r.rows.toLocaleString()} rows)` + (r.notes.length ? `\n${r.notes.join('\n')}` : ''),
    })
  } catch (e) {
    await refreshCatalog()
    set({ move: { ...m, busy: false, error: String(e instanceof Error ? e.message : e) } })
  }
}

/** Renames one of the user's datasets (asks for the name); the new name, or null. */
export async function renameDataset(from: string): Promise<string | null> {
  let text = `New name for the dataset ${from}`
  let value = from
  for (;;) {
    const raw = prompt(text, value)
    if (raw === null || raw.trim() === from) return null
    const r = datasetName(raw, get().schemas.filter((s) => s !== from), RESERVED_IDS)
    if ('problem' in r) {
      text = r.problem
      value = raw
      continue
    }
    set({ backup: 'saving' })
    try {
      const out = await renameSchema(from, r.name)
      addLog({ sql: `-- rename dataset ${from} to ${r.name}`, ok: true, text: `Dataset ${from} is now ${r.name} (${out.tables.length} tables)` + (out.notes.length ? `\n${out.notes.join('\n')}` : '') })
      return r.name
    } catch (e) {
      addLog({ sql: `-- rename dataset ${from}`, ok: false, text: String(e instanceof Error ? e.message : e) })
      return null
    } finally {
      set({ backup: null })
      await refreshCatalog()
    }
  }
}

/**
 * “Show as model” (stage 2c): the tables of one schema (`main` = the user's own) open as a
 * conceptual model in model.quaera.app. Called straight from the click: it opens the window first.
 */
export function openAsModel(schema: string) {
  const label = schema === 'main' ? 'My tables' : schema === DEMO_SCHEMA ? 'demo shop' : datasetById(schema)?.title ?? schema
  showAsModel(schema, label).then(
    (r) => addLog({ sql: `-- show ${schema} as a model`, ok: true, text: `${label}: ${r.tables} tables sent to model.quaera.app` + (r.notes.length ? `\n${r.notes.join('\n')}` : '') }),
    (e) => addLog({ sql: `-- show ${schema} as a model`, ok: false, text: String(e instanceof Error ? e.message : e) }),
  )
}

/** `#ds=chinook` in the address (a link from quaera.app or a lesson): load and open that dataset. */
export async function openDatasetFromHash(): Promise<boolean> {
  const id = datasetFromHash(location.hash)
  if (!id) return false
  history.replaceState(null, '', location.pathname + location.search + hashWithoutDataset(location.hash))
  const d = datasetById(id)
  if (!d) {
    set({ importError: `The link asks for a dataset called “${id}”, which Quaera Lab doesn't have.` })
    return false
  }
  await openDataset(d)
  return true
}

/**
 * A shared link (`#s=`, stage 5): loads the datasets it names and the demo shop when its queries
 * use it, then opens its queries in new tabs next to the user's own. Nothing runs by itself: a
 * link comes from anyone, and its SQL could change the user's tables.
 */
export async function openShareFromHash(): Promise<boolean> {
  const data = shareDataFromHash(location.hash)
  if (!data) return false
  history.replaceState(null, '', location.pathname + location.search + hashWithoutShare(location.hash))
  let share
  try {
    share = await decodeShare(data)
  } catch (e) {
    set({ importError: String(e instanceof Error ? e.message : e) })
    return false
  }
  const loadedNow: string[] = []
  const blocked: string[] = []
  const unknown = share.datasets.filter((id) => !datasetById(id))
  for (const id of share.datasets) {
    const d = datasetById(id)
    if (!d) continue
    const { state } = catalogState(d)
    // Never drop a schema of the user's for a link: the queries just won't find the dataset.
    if (state === 'loaded') continue
    if (state === 'foreign') {
      blocked.push(d.id)
      continue
    }
    if (await fetchDataset(d)) loadedNow.push(d.title)
  }
  const demoMissing = share.demo && !hasDemoTables(get().tables)
  if (demoMissing) await loadDemo()
  let first: string | null = null
  for (const t of share.tabs) {
    const id = addTab(t.sql, t.title, t.dialect)
    first ??= id
  }
  if (first) set({ activeTab: first })
  const n = share.tabs.length
  const parts = [n === 1 ? 'The shared query opened in a new tab' : `${n} shared queries opened in new tabs`]
  if (loadedNow.length) parts.push(`${loadedNow.join(', ')} loaded`)
  if (demoMissing) parts.push('the demo shop loaded')
  set({ notice: `${parts.join('; ')}. ${NOT_RUN_YET}${unknown.length ? ` This version has no dataset called ${unknown.join(', ')}.` : ''}${blocked.length ? ` Not loaded: ${blocked.join(', ')}, because your own schema has that name (Sample datasets can replace it).` : ''}` })
  addLog({ sql: '-- shared link', ok: true, text: parts.join('; ') })
  return true
}

export type AboutTab = 'about' | 'licences' | 'privacy'

export function openAbout(tab: AboutTab | false = 'about') {
  set({ aboutOpen: tab })
}

export function openTables(open = true) {
  set({ tablesOpen: open })
}

export function openShare(open = true) {
  set({ shareOpen: open })
}

// ------------------------------------------------------------------ result → table, backup

/** Save as table: the result in the grid becomes a table in main (a table of that name is replaced when `replace`). */
export async function saveResultAsTable(table: Table, name: string, replace: boolean) {
  const target = quoteIdent(name)
  const tmp = `__save_${Date.now()}`
  try {
    await insertArrow(table, tmp)
    if (replace) await query(`DROP TABLE IF EXISTS ${target}`)
    await query(`ALTER TABLE ${quoteIdent(tmp)} RENAME TO ${target}`)
    await checkpoint()
    await refreshCatalog()
    addLog({ sql: `-- save result as table ${name}`, ok: true, text: `${table.numRows.toLocaleString()} rows saved as table ${name}` })
  } catch (e) {
    await query(`DROP TABLE IF EXISTS ${quoteIdent(tmp)}`).catch(() => {})
    const error = String(e instanceof Error ? e.message : e)
    addLog({ sql: `-- save result as table ${name}`, ok: false, text: error })
    set({ importError: `Could not save the result as a table: ${error}` })
  }
}

/** Download database: everything in DuckDB as one .duckdb file. */
export async function downloadBackup() {
  if (get().backup) return
  set({ backup: 'saving' })
  try {
    const bytes = await backupDatabase()
    const file = backupFileName(new Date())
    download(bytes as BlobPart, file, 'application/octet-stream')
    addLog({ sql: '-- download database', ok: true, text: `${file} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB): every table, view and dataset` })
  } catch (e) {
    set({ importError: `Could not make the backup: ${String(e instanceof Error ? e.message : e)}` })
  } finally {
    set({ backup: null })
  }
}

/**
 * Export all tables as CSV: every table and view of a dataset, one CSV each, into a folder the
 * user picks (`toFolder`, Chrome and Edge; called from the click, as the picker needs it) or one
 * .zip. A folder the browser won't let us write to falls back to the .zip.
 */
export async function exportDatasetCsv(schema: string, toFolder: boolean) {
  if (get().csvExport) return
  const tables = get().tables.filter((t) => t.schema === schema)
  if (!tables.length) return
  const label = datasetById(schema)?.title ?? schema
  let folder: Awaited<ReturnType<typeof pickFolder>> = null
  if (toFolder)
    try {
      folder = await pickFolder()
      if (!folder) return
    } catch (e) {
      addLog({ sql: `-- export ${label} as CSV`, ok: false, text: `The browser did not let Lab write to that folder (${String(e instanceof Error ? e.message : e)}); downloading a .zip instead.` })
    }
  set({ csvExport: { schema, table: tables[0].name, done: 0, total: tables.length } })
  try {
    const text = await exportTablesCsv(
      tables.map((t) => ({ sqlName: qualifiedName(t.schema, t.name), name: t.name })),
      schema,
      folder,
      (table, done) => set({ csvExport: { schema, table, done, total: tables.length } }),
    )
    addLog({ sql: `-- export ${label} as CSV`, ok: true, text })
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e)
    addLog({ sql: `-- export ${label} as CSV`, ok: false, text: error })
    set({ importError: `Could not export ${label}: ${error}` })
  } finally {
    set({ csvExport: null })
  }
}

/** Restore from a backup: replaces every DuckDB table with the file's (PostgreSQL is not touched). */
export async function restoreBackup(file: File) {
  if (get().backup) return
  set({ backup: 'restoring' })
  try {
    const n = await restoreDatabase(file)
    addLog({ sql: `-- restore ${file.name}`, ok: true, text: `Database restored from ${file.name}: ${n} table${n === 1 ? '' : 's'}` })
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e)
    addLog({ sql: `-- restore ${file.name}`, ok: false, text: error })
    set({ importError: `Could not restore ${file.name}: ${error}. Your tables are as they were.` })
  } finally {
    set({ backup: null })
    await refreshCatalog()
  }
}

// ------------------------------------------------------------------ dataset guides

export function openGuide(id: string | null) {
  set({ guide: id, ...(id ? { catalogOpen: false } : {}) })
}

/**
 * A guide's example in a new tab of its language, run at once (Python: every cell in order). The
 * dataset is loaded first when it isn't; `run: false` only opens the tab.
 */
export async function openGuideCode(d: Dataset, code: string, title: string, lang: 'sql' | 'python', run = true) {
  set({ guide: null })
  const { state, extra } = catalogState(d)
  if (state !== 'loaded') {
    if (state === 'foreign' && !confirm(`There is already a schema called ${d.id} with your table${extra.length === 1 ? '' : 's'} ${extra.join(', ')}. Loading ${d.title} replaces it and ${extra.length === 1 ? 'that table is' : 'those tables are'} lost. Load anyway?`)) return
    if (!(await fetchDataset(d))) return
  }
  const id = addOrFocusTab(code, title, lang === 'python' ? 'python' : undefined)
  if (!run) return
  if (lang === 'sql') return void runSql(id, code)
  const cells = splitCells(code)
  void runPython(id, cells.map((c, index) => ({ c, index })).filter(({ c }) => c.kind === 'code').map(({ c, index }) => ({ code: c.source, line: c.line, index, source: c.source })))
}

/** A walkthrough (src/data/walkthroughs.ts) in a new Python tab, not run: it is read and run cell by cell. */
export async function openWalkthrough(w: Walkthrough) {
  const d = datasetById(w.id)
  if (d) return openGuideCode(d, w.code, `${w.title} walkthrough`, 'python', false)
  set({ guide: null, catalogOpen: false })
  await ensureDemo()
  addTab(w.code, `${w.title} walkthrough`, 'python')
}

// ------------------------------------------------------------------ data analysis cycle cheat sheet

function persistDmCycleOpen(open: boolean) {
  try {
    localStorage.setItem(DM_CYCLE_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function toggleDmCycle(open?: boolean) {
  const s = get()
  const next = resolveTogglePythonPanel(
    { dmCycleOpen: s.dmCycleOpen, aiPanelOpen: s.aiPanelOpen, lastOpened: s.pythonLastPanel },
    'dmCycle',
    open,
    viewportWidth(),
  )
  set({
    dmCycleOpen: next.dmCycleOpen,
    aiPanelOpen: next.aiPanelOpen,
    pythonLastPanel: next.lastOpened,
  })
  persistDmCycleOpen(next.dmCycleOpen)
}

export function syncPythonPanelsForViewport(widthPx: number) {
  const s = get()
  const next = resolveResizePythonPanels(
    { dmCycleOpen: s.dmCycleOpen, aiPanelOpen: s.aiPanelOpen, lastOpened: s.pythonLastPanel },
    widthPx,
  )
  if (
    next.dmCycleOpen !== s.dmCycleOpen ||
    next.aiPanelOpen !== s.aiPanelOpen ||
    next.lastOpened !== s.pythonLastPanel
  ) {
    set({
      dmCycleOpen: next.dmCycleOpen,
      aiPanelOpen: next.aiPanelOpen,
      pythonLastPanel: next.lastOpened,
    })
  }
}

function ensurePythonTab(): string {
  const s = get()
  const active = s.tabs.find((t) => t.id === s.activeTab)
  if (active && tabDialect(active) === 'python') return active.id
  const existing = s.tabs.find((t) => tabDialect(t) === 'python')
  if (existing) {
    set({ activeTab: existing.id })
    return existing.id
  }
  return newPythonTab()
}

export function openDmCycleInPython() {
  ensurePythonTab()
  set({ guide: null })
  closeWelcome()
  toggleDmCycle(true)
}

export async function runDmCycleExample(stageTitle: string, exampleTitle: string, code: string) {
  const tabId = ensurePythonTab()
  try {
    await ensureKaiyo()
  } catch {
    return
  }
  const tab = get().tabs.find((t) => t.id === tabId)
  if (!tab) return
  const cursorPos = get().activeTab === tabId ? activeCursorPos() : tab.sql.length
  const { text, cursor, run } = buildExampleCellInsertion(tab.sql, cursorPos, stageTitle, exampleTitle, code)
  if (!replaceActiveAndFocusCursor(text, cursor)) setTabSql(tabId, text)
  void runPython(tabId, [run])
}

// ------------------------------------------------------------------ Copy context for AI

export function closeCopyContextFallback() {
  set({ copyContextFallback: null })
}

/** A tab's last result as the SQL helper reads it: the first rows come straight from the Arrow table, never the whole of it. */
function sqlResultForAi(tabId: string, withRows: boolean): SqlAiResult | null {
  const r = get().results[tabId]
  if (!r) return null
  if (r.status === 'error') return { status: 'error', error: r.error, stopped: r.error === STOPPED, hints: r.hints }
  if (r.status === 'running' || !r.table) return { status: r.status }
  const t = r.table
  const columns = t.schema.fields.map((f) => ({ name: f.name, type: String(f.type) }))
  const rows =
    withRows && t.numCols > 0 && t.numRows > 0
      ? resultRows(t, MAX_AI_SQL_ROWS).rows.map((row) => row.map((v) => (v == null ? 'NULL' : String(v))))
      : undefined
  return { status: 'done', columns, numRows: t.numRows, more: r.more, rows }
}

function sqlTranslationForAi(tabId: string): SqlAiTranslation | null {
  const t = get().translations[tabId]
  if (!t) return null
  if (t.status === 'error') return { error: t.error }
  if (t.status === 'done') return { statements: t.statements }
  return null
}

export function gatherTabAiContext(
  tabId: string,
  cursorPos: number,
  extra?: { sampleRows?: AiContextSampleRows | null; instruction?: string; sendNotebook?: boolean; includeRows?: boolean },
): BuiltAiContext {
  const s = get()
  const tab = s.tabs.find((t) => t.id === tabId)
  const tabText = tab?.sql ?? ''
  const dialect = tabDialect(tab)
  if (dialect !== 'python') {
    const pg = dialect === 'postgres'
    return buildSqlAiContext({
      dialect: dialect as SqlAiDialect,
      tabTitle: tab?.title ?? 'SQL',
      tabText,
      cursorPos,
      selection: s.activeTab === tabId ? activeSelection() : null,
      tables: (pg ? s.pgTables : s.tables).map((t) => ({ name: labName(t), rows: t.rows, columns: t.columns })),
      result: sqlResultForAi(tabId, !!extra?.includeRows),
      translation: dialect === 'tsql' ? sqlTranslationForAi(tabId) : null,
      includeRows: extra?.includeRows,
      instruction: extra?.instruction,
      sendEarlier: extra?.sendNotebook ?? s.aiSendNotebook,
      decisions: tab?.decisions,
    })
  }
  const tables: AiContextTable[] = s.tables.map((t) => ({
    name: labName(t),
    rows: t.rows,
    columns: t.columns,
  }))
  const cells = splitCells(tabText)
  const runsMap = s.cellRuns[tabId] ?? {}
  const matchedSources = new Set<string>()
  const matchedRuns: AiContextCellRun[] = []
  for (const c of cells) {
    const run = runsMap[c.source]
    if (run) {
      matchedRuns.push({ source: c.source, outputs: run.outputs })
      matchedSources.add(c.source)
    }
  }
  const unmatchedRuns: AiContextCellRun[] = []
  for (const [source, run] of Object.entries(runsMap)) {
    if (!matchedSources.has(source)) unmatchedRuns.push({ source, outputs: run.outputs })
  }
  const cellRuns = [...unmatchedRuns, ...matchedRuns]
  const lastResultCell = s.results[tabId]?.cells?.at(-1)
  const fallbackLastOutputs: readonly Output[] | undefined =
    lastResultCell?.outputs ??
    (s.results[tabId]?.status === 'error' && s.results[tabId]?.error
      ? [{ output_type: 'error', ename: 'Error', evalue: s.results[tabId].error!, traceback: [] }]
      : undefined)

  return buildAiContext({
    tabTitle: tab?.title ?? 'Python',
    tabText,
    cursorPos,
    tables,
    cellRuns,
    fallbackLastOutputs,
    sampleRows: extra?.sampleRows,
    instruction: extra?.instruction,
    sendNotebook: extra?.sendNotebook ?? s.aiSendNotebook,
    decisions: tab?.decisions,
  })
}

export async function copyContextForAi(tabId: string, cursorPos: number) {
  const built = gatherTabAiContext(tabId, cursorPos, { sampleRows: null })
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(built.text)
    set({ notice: COPY_CONTEXT_TOAST })
  } catch {
    set({ copyContextFallback: built.text })
  }
}

// ------------------------------------------------------------------ Optional in-app AI helper (BYOK)

let activeAiController: AbortController | null = null
let activeAiGen = 0

function abortActiveAiRequest() {
  activeAiGen++
  if (activeAiController) {
    activeAiController.abort()
    activeAiController = null
  }
}

export function openAiSettings(open = true) {
  set({ aiSettingsOpen: open })
}

export function toggleAiPanel(open?: boolean) {
  const s = get()
  // A SQL tab has no Data cycle: its panel state is the helper's alone.
  if (tabDialect(s.tabs.find((t) => t.id === s.activeTab)) !== 'python') {
    set({ aiPanelOpen: open ?? !s.aiPanelOpen })
    return
  }
  const next = resolveTogglePythonPanel(
    { dmCycleOpen: s.dmCycleOpen, aiPanelOpen: s.aiPanelOpen, lastOpened: s.pythonLastPanel },
    'aiHelper',
    open,
    viewportWidth(),
  )
  set({
    dmCycleOpen: next.dmCycleOpen,
    aiPanelOpen: next.aiPanelOpen,
    pythonLastPanel: next.lastOpened,
  })
}

export function setAiProvider(provider: AiProvider) {
  abortActiveAiRequest()
  set((s) => ({
    aiSettings: { ...s.aiSettings, provider },
    aiRequest: s.aiRequest.status === 'loading' ? { status: 'idle' } : s.aiRequest,
  }))
}

export function setAiModel(provider: AiProvider, model: string) {
  set((s) => ({
    aiSettings: {
      ...s.aiSettings,
      models: { ...s.aiSettings.models, [provider]: model },
    },
  }))
}

/** Saves a valid Base URL; an empty or odd one is refused and the saved one stays. */
export function setAiBaseUrl(raw: string): NormalizedBaseUrl {
  const res = normalizeBaseUrl(raw)
  if (!res.ok) return res
  if (res.url !== get().aiSettings.baseUrl) {
    abortActiveAiRequest()
    set((s) => ({
      aiSettings: { ...s.aiSettings, baseUrl: res.url },
      aiRequest: s.aiRequest.status === 'loading' ? { status: 'idle' } : s.aiRequest,
    }))
  }
  return res
}

export function setAiApiKey(provider: AiProvider, key: string) {
  try {
    if (key.trim()) localStorage.setItem(AI_API_KEY_STORAGE[provider], key)
    else localStorage.removeItem(AI_API_KEY_STORAGE[provider])
  } catch {
    /* session-only memory fallback when storage is unavailable */
  }
  set((s) => ({ aiKeys: { ...s.aiKeys, [provider]: key } }))
}

export function removeAiApiKey(provider: AiProvider) {
  try {
    localStorage.removeItem(AI_API_KEY_STORAGE[provider])
  } catch {
    /* ignore */
  }
  const active = get().aiSettings.provider === provider
  if (active) abortActiveAiRequest()
  set((s) => ({
    aiKeys: { ...s.aiKeys, [provider]: '' },
    aiRequest: active && s.aiRequest.status === 'loading' ? { status: 'idle' } : s.aiRequest,
  }))
}

export function requestEnableAi(enable: boolean) {
  const s = get()
  if (!enable) {
    abortActiveAiRequest()
    set({
      aiSettings: { ...s.aiSettings, enabled: false },
      aiRequest: s.aiRequest.status === 'loading' ? { status: 'idle' } : s.aiRequest,
    })
    return
  }
  const provider = s.aiSettings.provider
  if (provider === 'openai' && !s.aiSettings.baseUrl) {
    set({ aiSettingsOpen: true, notice: 'Enter the Base URL of your server first.' })
    return
  }
  if (!hasAiConsent(s.aiConsent, s.aiSettings)) {
    set({ aiConsentPrompt: { provider, baseUrl: s.aiSettings.baseUrl, pendingEnable: true } })
    return
  }
  set({ aiSettings: { ...s.aiSettings, enabled: true } })
}

export function confirmAiConsent() {
  const prompt = get().aiConsentPrompt
  if (!prompt) return
  set((s) => ({
    aiConsent: {
      ...s.aiConsent,
      [prompt.provider]: true,
      ...(prompt.provider === 'openai' ? { openaiOrigin: new URL(prompt.baseUrl || s.aiSettings.baseUrl).origin } : {}),
    },
    aiConsentPrompt: null,
    ...(prompt.pendingEnable ? { aiSettings: { ...s.aiSettings, enabled: true } } : {}),
  }))
  if (prompt.pendingAsk) {
    void askAi(prompt.pendingAsk)
  }
}

export function cancelAiConsent() {
  set({ aiConsentPrompt: null })
}

export function cancelAiRequest() {
  abortActiveAiRequest()
  set({ aiRequest: { status: 'idle' } })
}

async function fetchSampleRowsForAi(tableName: string | undefined): Promise<AiContextSampleRows | null> {
  const tables = get().tables
  const target =
    (tableName ? tables.find((t) => labName(t).toLowerCase() === tableName.toLowerCase()) : undefined) ??
    tables[0]
  if (!target) return null
  const sqlRef =
    target.schema === 'main'
      ? quoteIdent(target.name)
      : `${quoteIdent(target.schema)}.${quoteIdent(target.name)}`
  try {
    const arrowTable = await query(`SELECT * FROM ${sqlRef} LIMIT 20`)
    const { header, rows } = resultRows(arrowTable)
    return {
      tableName: labName(target),
      header,
      rows: rows.map((row) => row.map((v) => (v == null ? 'NULL' : String(v)))),
    }
  } catch {
    return null
  }
}

// --- the conversation of a tab (v0.62.0)

/** A tab's messages: memory first, then its own localStorage key (read once, try/catch). */
export function getAiChat(tabId: string): AiChatMessage[] {
  const known = get().aiChats[tabId]
  if (known) return known
  let loaded: AiChatMessage[] = []
  try {
    loaded = parseChat(localStorage.getItem(AI_CHAT_KEY_PREFIX + tabId))
  } catch {
    /* no storage: memory only */
  }
  if (loaded.length) set((s) => ({ aiChats: { ...s.aiChats, [tabId]: loaded } }))
  return loaded
}

function setAiChat(tabId: string, chat: AiChatMessage[]) {
  set((s) => ({ aiChats: { ...s.aiChats, [tabId]: chat } }))
  try {
    if (chat.length) localStorage.setItem(AI_CHAT_KEY_PREFIX + tabId, JSON.stringify(chat))
    else localStorage.removeItem(AI_CHAT_KEY_PREFIX + tabId)
  } catch {
    /* quota or no storage: the conversation lives in memory */
  }
}

/** "New conversation": the tab's messages go; its decisions stay. */
export function clearAiConversation(tabId: string) {
  abortActiveAiRequest()
  set((s) => ({ aiRequest: s.aiRequest.status === 'idle' ? s.aiRequest : { status: 'idle' } }))
  setAiChat(tabId, [])
}

/**
 * What the next request would carry, built the way askAi builds it: for the "Sees" line and
 * "Show exactly what is sent". Works without a key. A question still being typed is the instruction.
 */
export function previewAiRequest(tabId: string, cursorPos: number, question: string, includeRows = false) {
  const built = gatherTabAiContext(tabId, cursorPos, { instruction: question.trim() || '(your question goes here)', includeRows })
  const history = getAiChat(tabId)
  const dialect = tabDialect(get().tabs.find((t) => t.id === tabId))
  return {
    built,
    messages: normalizeHistory(history).length,
    hasSchema: (dialect === 'postgres' ? get().pgTables : get().tables).length > 0,
    text: formatRequestPreview(buildTutorSystemPrompt(dialect), history, built.text),
  }
}

export function setAiSendNotebook(on: boolean) {
  set({ aiSendNotebook: on })
  try {
    localStorage.setItem(AI_SEND_NOTEBOOK_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** "Add to decisions": the reply's `Decision:` line goes into the tab's note (once). */
export function addAiDecision(tabId: string, decision: string) {
  const tab = get().tabs.find((t) => t.id === tabId)
  if (!tab) return
  setTabDecisions(tabId, appendDecision(tab.decisions ?? '', decision))
}

/** Resolves true when a reply was stored (the panel then clears its input); false on any early stop or failure. */
export async function askAi(opts: AiAskOptions): Promise<boolean> {
  if (get().aiRequest.status === 'loading') return false
  const s = get()
  const provider = s.aiSettings.provider

  if (!s.aiSettings.enabled) {
    set({ aiSettingsOpen: true })
    return false
  }

  if (provider === 'openai' && !s.aiSettings.baseUrl) {
    set({
      aiRequest: {
        status: 'error',
        kind: 'bad_url',
        message: 'No Base URL saved. Enter the address of your server in AI helper settings.',
        promptLabel: opts.question?.trim().slice(0, 80) || 'AI helper',
      },
      aiSettingsOpen: true,
    })
    return false
  }
  if (!hasAiConsent(s.aiConsent, s.aiSettings)) {
    set({ aiConsentPrompt: { provider, baseUrl: s.aiSettings.baseUrl, pendingEnable: false, pendingAsk: opts } })
    return false
  }

  const quick = findQuickAction(opts.action)
  const userQuestion = opts.question?.trim() ?? ''
  if (!quick && !userQuestion) return false

  const promptLabel = quick ? quick.label : userQuestion.slice(0, 80)
  const apiKey = s.aiKeys[provider].trim()
  // A local Ollama or LM Studio takes no key; the other providers cannot work without one.
  if (!apiKey && provider !== 'openai') {
    const label = provider === 'gemini' ? 'Gemini' : 'Claude'
    set({
      aiRequest: {
        status: 'error',
        kind: 'auth',
        message: `No ${label} API key stored. Add your key in AI helper settings.`,
        promptLabel,
      },
      aiSettingsOpen: true,
    })
    return false
  }

  const baseInstruction = quick
    ? userQuestion
      ? `${quick.instruction}\n\nLearner question: ${userQuestion}`
      : quick.instruction
    : userQuestion
  const instruction = opts.errorOverride
    ? `${baseInstruction}\n\nError to explain: ${opts.errorOverride}`
    : baseInstruction

  const controller = new AbortController()
  const gen = ++activeAiGen
  activeAiController = controller
  const tabId = s.activeTab
  set({ aiRequest: { status: 'loading', promptLabel, tabId } })

  const cursorPos = activeCursorPos()

  try {
    let sampleRows: AiContextSampleRows | null = null
    const askDialect = tabDialect(get().tabs.find((t) => t.id === tabId))
    if (opts.includeSampleRows && askDialect === 'python') {
      const preContext = gatherTabAiContext(tabId, cursorPos, { sampleRows: null })
      sampleRows = await fetchSampleRowsForAi(preContext.referencedTables[0])
      if (gen !== activeAiGen || !get().aiSettings.enabled) return false
    }

    const built = gatherTabAiContext(tabId, cursorPos, { sampleRows, instruction, includeRows: !!opts.includeSampleRows })
    const history = getAiChat(tabId)
    const currentSettings = get().aiSettings
    const model = currentSettings.models[provider].trim() || DEFAULT_AI_MODELS[provider]
    if (provider === 'openai' && !model) {
      set({
        aiRequest: {
          status: 'error',
          kind: 'no_model',
          message: 'No model name saved. Enter the model your server runs (for Ollama, for example llama3.2) in AI helper settings.',
          promptLabel,
        },
        aiSettingsOpen: true,
      })
      return false
    }
    const req = buildProviderRequest({
      provider,
      apiKey,
      model,
      systemPrompt: buildTutorSystemPrompt(askDialect),
      userPrompt: built.text,
      history,
      baseUrl: currentSettings.baseUrl,
    })

    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    })
    const rawBody = await res.text()
    if (gen !== activeAiGen) return false

    const outcome = parseProviderReply(provider, res.status, rawBody, apiKey ? [apiKey] : [])
    if (outcome.ok) {
      // Only a reply that arrived goes into the history: an error leaves it as it was.
      const learnerText = [quick ? `[${quick.label}]` : '', userQuestion, opts.errorOverride ? `Error: ${opts.errorOverride.slice(0, 400)}` : '']
        .filter(Boolean)
        .join(' ')
      setAiChat(tabId, pushFeedExchange(getAiChat(tabId), learnerText, outcome.text))
      set({
        aiRequest: {
          status: 'done',
          text: outcome.text,
          truncated: outcome.truncated,
          provider,
          model,
          promptLabel,
          tabId,
        },
      })
      return true
    } else {
      set({
        aiRequest: {
          status: 'error',
          kind: outcome.kind,
          message: outcome.message,
          promptLabel,
          tabId,
        },
      })
    }
    return false
  } catch (err) {
    if (gen !== activeAiGen) return false
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true
    const outcome = classifyFetchError(err, online, apiKey ? [apiKey] : [], {
      provider,
      baseUrl: get().aiSettings.baseUrl,
    })
    if (outcome.kind === 'aborted') {
      set({ aiRequest: { status: 'idle' } })
    } else {
      set({
        aiRequest: {
          status: 'error',
          kind: outcome.kind,
          message: outcome.message,
          promptLabel,
          tabId,
        },
      })
    }
    return false
  } finally {
    if (activeAiController === controller) activeAiController = null
  }
}

export function askAiFromError(errorText: string) {
  toggleAiPanel(true)
  const s = get()
  const sql = tabDialect(s.tabs.find((t) => t.id === s.activeTab)) !== 'python'
  void askAi({ action: sql ? 'sql-why-failed' : 'why-failed', errorOverride: errorText })
}

function applyAiCodeEdit(
  code: string,
  transform: (tabText: string, cursorPos: number, code: string) => { text: string; cursor: number },
) {
  const s = get()
  const tab = s.tabs.find((t) => t.id === s.activeTab)
  if (!tab) return
  const cursorPos = activeCursorPos()
  const { text, cursor } = transform(tab.sql, cursorPos, code)
  if (!replaceActiveAndFocusCursor(text, cursor)) setTabSql(tab.id, text)
}

export function insertAiCodeCell(code: string) {
  applyAiCodeEdit(code, insertCodeCellBelow)
}

export function replaceAiCodeCell(code: string) {
  applyAiCodeEdit(code, replaceCurrentCodeCell)
}

export function insertAiCodeAtCursor(code: string) {
  applyAiCodeEdit(code, insertCodeAtCursor)
}

/** SQL tabs: the selection, else the statement under the cursor, becomes the code (Ctrl+Z undoes it). */
export function replaceAiSqlStatement(code: string) {
  applyAiCodeEdit(code, (text, pos, c) => replaceCurrentStatement(text, pos, c, activeSelection()))
}

// ------------------------------------------------------------------ practice pages on Kaiyo

export function openPracticeBook(kind: PracticeKind | null, at: string | null = null) {
  const base = hashWithoutBuild(hashWithoutPipeline(location.hash))
  const hash = kind ? hashWithPractice(base, at, kind) : hashWithoutPractice(base)
  history.replaceState(null, '', location.pathname + location.search + hash)
  set({ practiceBook: kind, ...(kind ? { pipeline: null, build: null } : {}) })
}

// ------------------------------------------------------------------ data pipeline on Kaiyo

export function openPipeline(id: string | null) {
  const base = hashWithoutBuild(hashWithoutPractice(location.hash))
  const hash = id ? hashWithPipeline(base, id) : hashWithoutPipeline(base)
  history.replaceState(null, '', location.pathname + location.search + hash)
  set({ pipeline: id, ...(id ? { practiceBook: null, build: null } : {}) })
}

// ------------------------------------------------------------------ build by hand on Kaiyo sales

export function openBuild(id: string | null) {
  const base = hashWithoutPipeline(hashWithoutPractice(location.hash))
  const hash = id ? hashWithBuild(base, id) : hashWithoutBuild(base)
  history.replaceState(null, '', location.pathname + location.search + hash)
  set({ build: id, ...(id ? { practiceBook: null, pipeline: null } : {}) })
}

/** The dataset the page's queries read; loaded with the usual progress card the first time. */
/** One load at a time: two callers at once (the tables strip and a query on a lesson slide) share it instead of racing; a failed load is tried again by the next caller. */
function once(load: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null
  return () => (running ??= load().finally(() => (running = null)))
}

const ensureKaiyo = once(loadKaiyo)

async function loadKaiyo() {
  await refreshCatalog()
  const d = datasetById('quaera')!
  const { state, extra } = catalogState(d)
  if (state === 'loaded') return
  if (state === 'foreign' && !confirm(`There is already a schema called ${d.id} with your table${extra.length === 1 ? '' : 's'} ${extra.join(', ')}. Loading ${d.title} replaces it and ${extra.length === 1 ? 'that table is' : 'those tables are'} lost. Load anyway?`)) throw new Error(`The practice needs ${d.title}, which was not loaded.`)
  if (!(await fetchDataset(d))) throw new Error(`${d.title} could not be loaded.`)
}

/** Translates T-SQL and runs it on the practice page; throws with the message to show. The last statement with columns is the result. */
export async function runPracticeQuery(sql: string, tag: string, isStopped: () => boolean, onProgress?: (p: TranslatorProgress) => void) {
  // the demo shop plan of lesson mode asks for demo.orders and the like: those need the small demo tables, not the whole Kaiyo dataset
  const demo = /\bdemo\./i.test(sql)
  if (!demo || /\bquaera\./i.test(sql)) await ensureKaiyo()
  if (demo) await ensureDemo()
  const translated = await translateTsql(sql, (p) => onProgress?.(p))
  const bad = translated.find((st) => st.error)
  if (bad) throw new Error(`This could not be read as T-SQL: ${bad.error}`)
  const statements = runOrder(translated)
  if (!statements.length) throw new Error('There is no query to run yet.')
  try {
    let { table, more } = await queryLimited(statements[0], tag, isStopped, ROW_LIMIT)
    for (const st of statements.slice(1)) {
      const next = await queryLimited(st, tag, isStopped, ROW_LIMIT)
      if (next.table.numCols > 0) ({ table, more } = next)
    }
    return { table, more }
  } catch (e) {
    if (isCancelled(e)) throw new Error(STOPPED)
    const raw = readableError(String(e instanceof Error ? e.message : e))
    const hint = sqlNameHint(raw, get().tables)
    throw new Error(hint ? `${raw}\n${hint}` : raw)
  } finally {
    if (WRITES.test(duckdbScript(translated))) {
      await checkpoint()
      await refreshCatalog()
    }
  }
}

/** Runs a cell of the Python practice page: a clean start, with Kaiyo's tables as variables. */
export async function runPracticePython(code: string) {
  await ensureKaiyo()
  return runBookCell(code, BOOK_TABLES, pythonNames())
}

// ------------------------------------------------------------------ practice (stage 5)

export function openPractice(open = true) {
  set({ practiceOpen: open })
}

/** The demo shop's tables must be there for examples and tasks (hidden is fine: queries work). */
const ensureDemo = once(async () => {
  if (!hasDemoTables(get().tables)) await loadDemo()
})

export async function openExample(e: PracticeExample) {
  set({ practiceOpen: false })
  await ensureDemo()
  openAndRun(e.sql, e.title)
}

/** Opens a task in its own tab, or switches to the tab already open on it. */
export async function openTask(t: PracticeTask) {
  set({ practiceOpen: false })
  await ensureDemo()
  const open = get().tabs.find((tab) => tab.task === t.id)
  if (open) return set({ activeTab: open.id })
  const id = addTab(taskStarter(t), t.title)
  set((s) => ({ tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, task: t.id } : tab)) }))
}

export async function openTaskFromHash(): Promise<boolean> {
  // In a lesson address `task=N` is the lesson's own number (src/core/lesson.ts), not a demo-shop task.
  if (lessonFromHash(location.hash)) return false
  const id = taskFromHash(location.hash)
  if (!id) return false
  history.replaceState(null, '', location.pathname + location.search + hashWithoutTask(location.hash))
  const t = taskById(id)
  if (!t) {
    set({ importError: `The link asks for a practice task called “${id}”, which Quaera Lab doesn't have.` })
    return false
  }
  await openTask(t)
  return true
}

/** Shows the task's next hint (they come one at a time). */
export function nextHint(t: PracticeTask) {
  set((s) => {
    const shown = Math.min(t.hints.length, (s.practice.hints[t.id] ?? 0) + 1)
    return { practice: { ...s.practice, hints: { ...s.practice.hints, [t.id]: shown } } }
  })
}

/**
 * Check: runs the tab (as Run does) and the task's reference query on the same tables, and
 * compares the two results. A right answer marks the task solved.
 */
export async function checkTask(tabId: string, sql: string) {
  const tab = get().tabs.find((t) => t.id === tabId)
  const task = tab?.task ? taskById(tab.task) : undefined
  if (!task) return
  const put = (c: CheckState) => set((s) => ({ checks: { ...s.checks, [tabId]: c } }))
  put({ status: 'running' })
  await ensureDemo()
  await runSql(tabId, sql)
  const result = get().results[tabId]
  if (result?.status !== 'done' || !result.table) {
    return put({ status: 'error', message: result?.error === STOPPED ? 'The query was stopped.' : 'Your query did not run: fix the error shown under Result, then Check again.' })
  }
  if (result.table.numCols === 0) return put({ status: 'error', message: 'Your query returned no result: the last statement should be a SELECT.' })
  try {
    const expected = resultRows(await query(task.solution))
    const verdict = compareResults(resultRows(result.table), expected, task.ordered)
    put({ status: 'done', verdict })
    if (verdict.ok && !get().practice.solved.includes(task.id)) set((s) => ({ practice: { ...s.practice, solved: [...s.practice.solved, task.id] } }))
    addLog({ sql: `-- check: ${task.title}`, ok: verdict.ok, text: verdict.ok ? 'Correct' : 'Not yet' })
  } catch (e) {
    put({ status: 'error', message: `The reference answer could not be computed (were the demo tables changed?): ${String(e instanceof Error ? e.message : e).split('\n')[0]}` })
  }
}

/** The helper is on and has what it needs to answer: a key, or for an OpenAI-compatible server its address and model. */
export function aiIsReady(s: Pick<State, 'aiSettings' | 'aiKeys'>): boolean {
  const { provider, enabled, baseUrl, models } = s.aiSettings
  if (!enabled) return false
  if (provider === 'openai') return baseUrl !== '' && (models.openai.trim() || DEFAULT_AI_MODELS.openai) !== ''
  return s.aiKeys[provider].trim().length > 0
}
