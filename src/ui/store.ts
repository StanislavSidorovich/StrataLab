import { create } from 'zustand'
import type { Table } from 'apache-arrow'
import { cancelQuery, checkpoint, getEngine, insertArrow, isCancelled, query, queryCancellable, type EngineProgress } from '../db/engine'
import { loadCatalog, type TableInfo } from '../db/catalog'
import { closeSource, createTable, openSource, type ImportSource } from '../db/importer'
import { dialectHints, type DialectHint } from '../core/dialect'
import { qualifiedName, quoteIdent, sqlName, uniqueName } from '../core/sql'
import { looksLikeTable } from '../core/editorFiles'
import { DEMO_SQL, DEMO_TABLES, WELCOME_SQL } from '../data/demo'
import { ddlDataFromHash, decodeDdl, hashWithoutDdl } from '../core/ddlLink'
import { planDdl, starterSql, type DdlNote, type DdlPlan } from '../core/ddlPlan'
import { applyPlan, type Existing } from '../db/ddl'
import { clearFill } from '../db/fill'
import { datasetById, datasetFromHash, hashWithoutDataset, type Dataset } from '../data/datasets'
import { isLoaded, loadDataset, removeDataset, type DatasetProgress } from '../db/datasets'
import { schemaForModel, showAsModel } from '../db/modelExport'
import { planGeneration, type GenPlan, type GenTable } from '../core/generate'
import { runGeneration, type GenOutcome } from '../db/generate'
import { duckdbScript, translateTsql, type TranslatedStatement, type TranslatorProgress } from '../dialects/tsql'
import { copyToPostgres, getPostgres, postgresCatalog, runPostgres } from '../dialects/postgres'
import { copyTitle, rememberClosed } from '../core/tabs'
import { backupFileName } from '../core/backup'
import { backupDatabase, restoreDatabase } from '../db/backup'
import { download, resultRows } from '../db/export'
import { compareResults, type Verdict } from '../core/check'
import { hashWithoutTask, taskById, taskFromHash, taskStarter, type PracticeExample, type PracticeTask } from '../data/practice'

/** What a query tab speaks (stage 4): DuckDB itself, T-SQL translated to DuckDB, or PostgreSQL (PGlite). */
export type Dialect = 'duckdb' | 'tsql' | 'postgres'

export interface QueryTab {
  id: string
  title: string
  sql: string
  /** missing in tabs saved before stage 4: DuckDB */
  dialect?: Dialect
  /** a practice task's tab: the task's id (src/data/practice.ts) */
  task?: string
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
}

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

/** A catalog dataset being loaded (or what went wrong). */
export type DatasetState =
  | { phase: 'loading'; dataset: Dataset; progress: DatasetProgress }
  | { phase: 'error'; dataset: Dataset; message: string }

type EngineState =
  | { status: 'loading'; progress: EngineProgress; withModel: boolean; withDataset: string | null }
  | { status: 'ready'; version: string; persistent: boolean }
  | { status: 'error'; error: string }

interface State {
  engine: EngineState
  tables: TableInfo[]
  tabs: QueryTab[]
  activeTab: string
  results: Record<string, TabResult>
  log: LogEntry[]
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
  /** per tab, for T-SQL tabs */
  translations: Record<string, TranslationState>
  postgres: PostgresState
  pgTables: TableInfo[]
  /** what the result pane shows */
  resultView: 'result' | 'translation' | 'messages'
  /** a copy to PostgreSQL in progress: the table being copied */
  pgCopy: string | null
  /** tabs closed this visit, newest last (the tab menu's “Reopen closed tab”) */
  closedTabs: QueryTab[]
  /** a database backup or restore in progress */
  backup: 'saving' | 'restoring' | null
  /** the demo shop's tables are kept but left out of the tree (Sample datasets shows them again) */
  demoHidden: boolean
  /** the practice dialog (examples and tasks on the demo shop) is open */
  practiceOpen: boolean
  practice: PracticeProgress
  /** per tab, a practice task's last Check */
  checks: Record<string, CheckState>
}

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
  if (ddlDataFromHash(location.hash) !== null || datasetFromHash(location.hash)) return false
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
  ...loadTabs(),
  results: {},
  log: [],
  imports: [],
  importError: null,
  theme: initialTheme(),
  ddl: null,
  dataset: null,
  catalogOpen: false,
  generate: null,
  welcomeOpen: firstVisit(),
  translations: {},
  postgres: { status: 'off' },
  pgTables: [],
  resultView: 'result',
  pgCopy: null,
  closedTabs: [],
  backup: null,
  demoHidden: initialDemoHidden(),
  practiceOpen: false,
  practice: loadPractice(),
  checks: {},
}))

/** The user's own tables and views (schema main), without the catalog datasets. */
export const ownTables = (tables: TableInfo[]) => tables.filter((t) => t.schema === 'main')

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
  if (s.theme !== prev.theme) {
    try {
      localStorage.setItem(THEME_KEY, s.theme)
    } catch {
      /* ignore */
    }
  }
})

function addLog(entry: Omit<LogEntry, 'at'>) {
  set((s) => ({ log: [{ ...entry, at: Date.now() }, ...s.log].slice(0, 200) }))
}

export async function initEngine() {
  try {
    const e = await getEngine((progress) =>
      set((s) => (s.engine.status === 'loading' ? { engine: { ...s.engine, progress } } : {})),
    )
    set({ engine: { status: 'ready', version: e.version, persistent: e.persistent } })
    await refreshCatalog()
    // Tabs kept from the last visit that speak PostgreSQL: start it now rather than on the first run.
    if (get().tabs.some((t) => t.dialect === 'postgres')) void startPostgres()
    const fromModel = await openDdlFromHash()
    const fromLink = await openDatasetFromHash()
    const fromTask = await openTaskFromHash()
    window.addEventListener('hashchange', () => {
      void openDdlFromHash()
      void openDatasetFromHash()
      void openTaskFromHash()
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
    if (!fromModel && !fromLink && !fromTask && ownTables(get().tables).length === 0 && (!e.persistent || !offered)) await loadDemo()
  } catch (e) {
    set({ engine: { status: 'error', error: String(e instanceof Error ? e.message : e) } })
  }
}

export async function refreshCatalog() {
  set({ tables: await loadCatalog() })
}

/** The tree's Refresh: reads both databases again (changes made from another tab, say). */
export async function refreshTree() {
  await refreshCatalog()
  if (get().postgres.status === 'ready') await refreshPgCatalog()
}

const WRITES = /\b(create|drop|alter|insert|update|delete|copy|attach|detach|import|truncate|merge)\b/i

export const tabDialect = (tab: QueryTab | undefined): Dialect => tab?.dialect ?? 'duckdb'

export async function runSql(tabId: string, sql: string) {
  if (!sql.trim()) return
  const dialect = tabDialect(get().tabs.find((t) => t.id === tabId))
  stopped.delete(tabId)
  set((s) => ({ results: { ...s.results, [tabId]: { ...s.results[tabId], status: 'running' } } }))
  if (dialect === 'postgres') return runOnPostgres(tabId, sql)
  let toRun = sql
  let statements: string[] = [sql]
  if (dialect === 'tsql') {
    const translated = await translate(tabId, sql)
    if (!translated) return
    const bad = translated.find((st) => st.error)
    if (bad) {
      const n = translated.indexOf(bad) + 1
      set((s) => ({ resultView: 'translation', results: { ...s.results, [tabId]: { status: 'error', error: `Translation Error: statement ${n} could not be read as T-SQL: ${bad.error}` } } }))
      addLog({ sql, ok: false, text: `T-SQL statement ${n}: ${bad.error}` })
      return
    }
    toRun = duckdbScript(translated)
    // One at a time, so the result shown is the last one that returns rows (as in PostgreSQL
    // tabs), and Stop can end any of them.
    statements = translated.map((st) => st.target!)
  }
  const t0 = performance.now()
  const isStopped = () => stopped.has(tabId)
  try {
    let table = await queryCancellable(statements[0], tabId, isStopped)
    for (const st of statements.slice(1)) {
      const next = await queryCancellable(st, tabId, isStopped)
      if (next.numCols > 0) table = next
    }
    const ms = performance.now() - t0
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'done', table, ms } } }))
    addLog({ sql, ok: true, text: `${table.numRows.toLocaleString()} rows · ${ms.toFixed(0)} ms${dialect === 'tsql' ? ' · T-SQL translated to DuckDB' : ''}` })
    // Always: the saved database must hold every change (src/db/engine.ts empties the WAL on
    // start), and a CHECKPOINT with nothing to write costs next to nothing.
    await checkpoint()
    if (WRITES.test(toRun)) await refreshCatalog()
  } catch (e) {
    if (isCancelled(e)) {
      const ms = performance.now() - t0
      set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error: STOPPED, ms } } }))
      addLog({ sql, ok: false, text: `Stopped after ${(ms / 1000).toFixed(1)} s` })
      // Statements of a script that ran before the stop may have changed tables.
      await checkpoint()
      if (WRITES.test(toRun)) await refreshCatalog()
      return
    }
    const error = String(e instanceof Error ? e.message : e)
    // In a T-SQL tab the hints are what the translation is for; they'd only repeat it.
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error, hints: dialect === 'tsql' ? [] : dialectHints(sql), ms: performance.now() - t0 } } }))
    addLog({ sql, ok: false, text: error.split('\n')[0] })
  }
}

export const STOPPED = 'Stopped: the query was cancelled before it finished.'

/** Tabs whose run was stopped: a T-SQL script checks this between its statements. */
const stopped = new Set<string>()

/** The Stop button (Esc in the editor): cancels the tab's DuckDB query. PostgreSQL tabs can't be stopped. */
export async function stopQuery(tabId: string) {
  if (get().results[tabId]?.status !== 'running') return
  stopped.add(tabId)
  await cancelQuery(tabId)
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
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dialect } : t)), resultView: s.resultView === 'translation' && dialect !== 'tsql' ? 'result' : s.resultView }))
  if (dialect === 'postgres') void startPostgres()
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

async function runOnPostgres(tabId: string, sql: string) {
  const t0 = performance.now()
  try {
    await startPostgres()
    const table = await runPostgres(sql)
    const ms = performance.now() - t0
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'done', table, ms } } }))
    addLog({ sql, ok: true, text: `${table.numRows.toLocaleString()} rows · ${ms.toFixed(0)} ms · PostgreSQL` })
    if (WRITES.test(sql)) await refreshPgCatalog()
  } catch (e) {
    const error = pgError(e)
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error, ms: performance.now() - t0 } } }))
    addLog({ sql, ok: false, text: error.split('\n')[0] })
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
  return id
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
    for (const id of ids) {
      delete results[id]
      delete translations[id]
    }
    return { tabs, activeTab, results, translations, closedTabs: rememberClosed(s.closedTabs, s.tabs.filter((t) => gone.has(t.id))) }
  })
}

/** The last closed tab, back where tabs open (at the end), with its SQL and dialect. */
export function reopenClosedTab() {
  const tab = get().closedTabs.at(-1)
  if (!tab) return
  set((s) => ({ closedTabs: s.closedTabs.slice(0, -1) }))
  addTab(tab.sql, tab.title, tab.dialect)
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

export function renameTab(id: string, title: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)) }))
}

/** Opens a new tab with the query and runs it (used by the object tree). */
export function openAndRun(sql: string, title: string, dialect?: Dialect) {
  const id = addTab(sql, title, dialect)
  void runSql(id, sql)
}

/** Loads the demo shop again (fresh rows) and shows it in the tree. */
export async function loadDemo() {
  await query(DEMO_SQL)
  await checkpoint()
  await refreshCatalog()
  set({ demoHidden: false })
  addLog({ sql: '-- demo shop', ok: true, text: 'Demo shop loaded: customers, products, orders, order_items' })
}

/** All four demo tables are in the database (hidden or not). */
export const hasDemoTables = (tables: TableInfo[]) => DEMO_TABLES.every((n) => ownTables(tables).some((t) => t.name === n))

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

export async function dropObject(t: TableInfo) {
  const name = qualifiedName(t.schema, t.name)
  await query(`DROP ${t.kind === 'view' ? 'VIEW' : 'TABLE'} ${name}`)
  await checkpoint()
  await refreshCatalog()
  addLog({ sql: `DROP ${t.kind.toUpperCase()} ${name}`, ok: true, text: `${name} dropped` })
}

export async function renameObject(t: TableInfo, to: string) {
  await query(`ALTER ${t.kind === 'view' ? 'VIEW' : 'TABLE'} ${qualifiedName(t.schema, t.name)} RENAME TO ${quoteIdent(to)}`)
  await checkpoint()
  await refreshCatalog()
}

/**
 * Queues files for the import dialog. `target`: add the rows to this table. Without it, a file
 * named like an existing empty table (a model's table waiting for data) goes into that table.
 */
export async function enqueueFiles(files: File[], target?: string) {
  set({ importError: null })
  for (const f of files) {
    try {
      const src = await openSource(f)
      src.target = target ?? emptyTableNamed(src.tableName)
      const taken = [...ownTables(get().tables).map((t) => t.name), ...get().imports.map((i) => i.tableName)]
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

/** The name of an existing table called `name` that has no rows yet, or null. */
export function emptyTableNamed(name: string): string | null {
  const t = ownTables(get().tables).find((t) => t.kind === 'table' && t.name.toLowerCase() === name.toLowerCase())
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
  const info = ownTables(get().tables).find((t) => t.name === src.tableName)
  addLog({ sql: `-- import ${src.fileName}`, ok: true, text: `${src.tableName}: ${info?.rows?.toLocaleString() ?? '?'} rows from ${src.fileName}` })
}

/** After the rows were inserted into an existing table (stage 2b). */
export async function finishFill(src: ImportSource, added: number, skipped: number) {
  await clearFill()
  await closeSource(src)
  set((s) => ({ imports: s.imports.filter((i) => i.id !== src.id) }))
  await refreshCatalog()
  const table = src.target!
  addLog({
    sql: `-- fill ${table} from ${src.fileName}`,
    ok: true,
    text: `${table}: ${added.toLocaleString()} rows added from ${src.fileName}${skipped ? `, ${skipped.toLocaleString()} rows with problems skipped` : ''}`,
  })
  openAndRun(`SELECT * FROM ${sqlName(table)} LIMIT 100;`, table)
}

export async function cancelImport(src: ImportSource) {
  await clearFill()
  await closeSource(src)
  set((s) => ({ imports: s.imports.filter((i) => i.id !== src.id) }))
}

export function openWelcome() {
  set({ welcomeOpen: true })
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
 * Opens the generator over the user's own tables. With `focus`, that table and the empty tables
 * it needs (its NOT NULL foreign keys, all the way up) are ticked; without, every empty table.
 */
export async function openGenerate(focus?: string) {
  const rows = new Map(ownTables(get().tables).map((t) => [t.name, t.rows ?? 0]))
  const tables: GenTable[] = (await schemaForModel('main')).map((t) => ({ ...t, rows: rows.get(t.name) ?? 0 }))
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
  if (filled.length) addTab(filled.map((o) => `SELECT * FROM ${sqlName(o.table)} LIMIT 100;`).join('\n\n') + '\n', 'Generated rows')
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

/** Loads a catalog dataset into its own schema (again, if it is there) and opens its starter query. */
export async function openDataset(d: Dataset, reload = false) {
  if (get().dataset?.phase === 'loading') return
  set({ catalogOpen: false })
  if (!reload && (await isLoaded(d.id))) {
    addTab(d.starter, d.title)
    return
  }
  set({ dataset: { phase: 'loading', dataset: d, progress: { step: 'download', share: 0 } } })
  const t0 = performance.now()
  try {
    await loadDataset(d, (progress) => set((s) => (s.dataset?.phase === 'loading' ? { dataset: { ...s.dataset, progress } } : {})))
    await refreshCatalog()
    set({ dataset: null })
    const rows = d.tables.reduce((n, t) => n + t.rows, 0)
    addLog({ sql: `-- dataset ${d.id}`, ok: true, text: `${d.title}: ${d.tables.length} tables, ${rows.toLocaleString()} rows in schema ${d.id} · ${(performance.now() - t0).toFixed(0)} ms` })
    openAndRun(d.starter, d.title)
  } catch (e) {
    await refreshCatalog()
    set({ dataset: { phase: 'error', dataset: d, message: String(e instanceof Error ? e.message : e) } })
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

/**
 * “Show as model” (stage 2c): the tables of one schema (`main` = the user's own) open as a
 * conceptual model in model.quaera.app. Called straight from the click: it opens the window first.
 */
export function openAsModel(schema: string) {
  const label = schema === 'main' ? 'My tables' : datasetById(schema)?.title ?? schema
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

// ------------------------------------------------------------------ practice (stage 5)

export function openPractice(open = true) {
  set({ practiceOpen: open })
}

/** The demo shop's tables must be there for examples and tasks (hidden is fine: queries work). */
async function ensureDemo() {
  if (!hasDemoTables(get().tables)) await loadDemo()
}

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
