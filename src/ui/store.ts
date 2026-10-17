import { create } from 'zustand'
import type { Table } from 'apache-arrow'
import { checkpoint, getEngine, query, type EngineProgress } from '../db/engine'
import { loadCatalog, type TableInfo } from '../db/catalog'
import { closeSource, createTable, openSource, type ImportSource } from '../db/importer'
import { dialectHints, type DialectHint } from '../core/dialect'
import { qualifiedName, quoteIdent, sqlName, uniqueName } from '../core/sql'
import { DEMO_SQL, WELCOME_SQL } from '../data/demo'
import { ddlDataFromHash, decodeDdl, hashWithoutDdl } from '../core/ddlLink'
import { planDdl, starterSql, type DdlNote, type DdlPlan } from '../core/ddlPlan'
import { applyPlan, type Existing } from '../db/ddl'
import { clearFill } from '../db/fill'
import { datasetById, datasetFromHash, hashWithoutDataset, type Dataset } from '../data/datasets'
import { isLoaded, loadDataset, removeDataset, type DatasetProgress } from '../db/datasets'

export interface QueryTab {
  id: string
  title: string
  sql: string
}

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
}

const TABS_KEY = 'stratalab.tabs.v1'
const THEME_KEY = 'stratalab.theme'

function loadTabs(): { tabs: QueryTab[]; activeTab: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null')
    if (saved?.tabs?.length) return saved
  } catch {
    /* first visit or blocked storage */
  }
  return { tabs: [{ id: 't1', title: 'Query 1', sql: WELCOME_SQL }], activeTab: 't1' }
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
    const fromModel = await openDdlFromHash()
    const fromLink = await openDatasetFromHash()
    window.addEventListener('hashchange', () => {
      void openDdlFromHash()
      void openDatasetFromHash()
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
    if (!fromModel && !fromLink && ownTables(get().tables).length === 0 && (!e.persistent || !offered)) await loadDemo()
  } catch (e) {
    set({ engine: { status: 'error', error: String(e instanceof Error ? e.message : e) } })
  }
}

export async function refreshCatalog() {
  set({ tables: await loadCatalog() })
}

const WRITES = /\b(create|drop|alter|insert|update|delete|copy|attach|detach|import|truncate|merge)\b/i

export async function runSql(tabId: string, sql: string) {
  if (!sql.trim()) return
  set((s) => ({ results: { ...s.results, [tabId]: { ...s.results[tabId], status: 'running' } } }))
  const t0 = performance.now()
  try {
    const table = await query(sql)
    const ms = performance.now() - t0
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'done', table, ms } } }))
    addLog({ sql, ok: true, text: `${table.numRows.toLocaleString()} rows · ${ms.toFixed(0)} ms` })
    // Always: the saved database must hold every change (src/db/engine.ts empties the WAL on
    // start), and a CHECKPOINT with nothing to write costs next to nothing.
    await checkpoint()
    if (WRITES.test(sql)) await refreshCatalog()
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e)
    set((s) => ({ results: { ...s.results, [tabId]: { status: 'error', error, hints: dialectHints(sql), ms: performance.now() - t0 } } }))
    addLog({ sql, ok: false, text: error.split('\n')[0] })
  }
}

let tabCounter = Date.now()

export function addTab(sql = '', title?: string) {
  const id = `t${++tabCounter}`
  set((s) => {
    const n = s.tabs.length + 1
    return { tabs: [...s.tabs, { id, title: title ?? `Query ${n}`, sql }], activeTab: id }
  })
  return id
}

export function closeTab(id: string) {
  set((s) => {
    const tabs = s.tabs.filter((t) => t.id !== id)
    if (!tabs.length) tabs.push({ id: `t${++tabCounter}`, title: 'Query 1', sql: '' })
    const idx = s.tabs.findIndex((t) => t.id === id)
    const activeTab = s.activeTab === id ? tabs[Math.max(0, idx - 1)].id : s.activeTab
    const results = { ...s.results }
    delete results[id]
    return { tabs, activeTab, results }
  })
}

export function setTabSql(id: string, sql: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)) }))
}

export function renameTab(id: string, title: string) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)) }))
}

/** Opens a new tab with the query and runs it (used by the object tree). */
export function openAndRun(sql: string, title: string) {
  const id = addTab(sql, title)
  void runSql(id, sql)
}

export async function loadDemo() {
  await query(DEMO_SQL)
  await checkpoint()
  await refreshCatalog()
  addLog({ sql: '-- demo shop', ok: true, text: 'Demo shop loaded: customers, products, orders, order_items' })
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

/** `#ds=chinook` in the address (a link from quaera.app or a lesson): load and open that dataset. */
export async function openDatasetFromHash(): Promise<boolean> {
  const id = datasetFromHash(location.hash)
  if (!id) return false
  history.replaceState(null, '', location.pathname + location.search + hashWithoutDataset(location.hash))
  const d = datasetById(id)
  if (!d) {
    set({ importError: `The link asks for a dataset called “${id}”, which StrataLab doesn't have.` })
    return false
  }
  await openDataset(d)
  return true
}
