// Python tabs (stage 7), page side: starts the Python worker, runs a tab's cells one at a time,
// fetching from DuckDB the tables each cell names before it runs (src/core/pyCells.ts), and the
// ones named at run time when the worker asks (JSPI). One Python session for every Python tab;
// Stop and Restart end the worker, so the next run starts a fresh one.
import type { Table } from 'apache-arrow'
import { query } from '../db/engine'
import { callKey, labCalls, tableSql, type LabCall } from '../core/pyCells'
import { EXTRA_WHEELS, PYODIDE_DIR, STARTUP_PACKAGES, pyodideCdn } from '../core/python'
import { arrowFromFrame, frameFromArrow, transferables, type PyFrame } from './columns'
import type { CellResult, FromWorker, ToWorker } from './pythonWorker'

/** Whether the site serves the packages under pyodide/ (all of them), and Pyodide's version (vite.config.ts). */
declare const __OWN_PYTHON_PACKAGES__: boolean
declare const __PYODIDE_VERSION__: string
/** Module name → Pyodide package, for the packages the site serves (src/core/python.ts servedImports). */
declare const __PYTHON_IMPORTS__: Record<string, string>
/** The package files under pyodide/ (none when the site doesn't serve them). */
declare const __PYTHON_FILES__: string[]

export type KernelState = { status: 'off' } | { status: 'loading'; text: string } | { status: 'ready'; version: string; jspi: boolean } | { status: 'error'; error: string }

let worker: Worker | null = null
let started: Promise<void> | null = null
let listener: ((s: KernelState) => void) | null = null
let count = 0
const pending = new Map<number, { resolve: (r: CellResult) => void; reject: (e: Error) => void }>()
let nextId = 0
let readyState: KernelState | null = null

/** Hears about the session starting, failing, and what is downloading. */
export function onKernelState(fn: (s: KernelState) => void) {
  listener = fn
}

const say = (s: KernelState) => listener?.(s)

function siteBase(): URL {
  return new URL('.', document.baseURI)
}

/** Starts Python (once per session): Pyodide, numpy and pandas, and lab.py. */
export function startKernel(): Promise<void> {
  if (started) return started
  const w = new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' })
  worker = w
  count = 0
  started = new Promise<void>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      // An empty progress line: the downloads a cell needed are done.
      if (msg.type === 'progress') say(msg.text || !readyState ? { status: 'loading', text: msg.text || 'Starting Python' } : readyState)
      else if (msg.type === 'ready') {
        readyState = { status: 'ready', version: msg.version, jspi: msg.jspi }
        say(readyState)
        resolve()
        warmCache()
      } else if (msg.type === 'failed') {
        say({ status: 'error', error: msg.error })
        reject(new Error(msg.error))
        stopKernel(false)
      } else if (msg.type === 'result') {
        pending.get(msg.id)?.resolve(msg.result)
        pending.delete(msg.id)
      } else if (msg.type === 'fetch') void answerFetch(w, msg.fid, { kind: msg.kind, arg: msg.arg })
    }
    w.onerror = (e) => {
      const error = e.message || 'Python stopped unexpectedly'
      for (const p of pending.values()) p.reject(new Error(error))
      pending.clear()
      reject(new Error(error))
      // The next run starts a new worker rather than waiting on this one.
      stopKernel(false)
      say({ status: 'error', error })
    }
  })
  const base = siteBase()
  const indexURL = new URL(`${PYODIDE_DIR}/`, base).href
  const own = __OWN_PYTHON_PACKAGES__
  const init: ToWorker = {
    type: 'init',
    indexURL,
    packageBaseUrl: own ? indexURL : pyodideCdn(__PYODIDE_VERSION__),
    startup: [...STARTUP_PACKAGES],
    imports: __PYTHON_IMPORTS__,
    extra: EXTRA_WHEELS.map((x) => ({ module: x.module, url: own ? new URL(x.file, indexURL).href : x.url, needs: x.needs })),
  }
  say({ status: 'loading', text: 'Downloading Python' })
  w.postMessage(init)
  return started
}

/**
 * Once Python is up, the packages not downloaded yet (matplotlib, seaborn…) are fetched in the
 * background, one at a time, so the service worker keeps them: Python tabs then work offline in full
 * after their first use, not only with what that first session imported. Production only (the
 * service worker), once per page.
 */
let warmed = false
function warmCache() {
  if (warmed || !__PYTHON_FILES__.length || !navigator.serviceWorker?.controller) return
  warmed = true
  const dir = new URL(`${PYODIDE_DIR}/`, siteBase())
  setTimeout(async () => {
    for (const f of __PYTHON_FILES__)
      try {
        // Through the service worker, which stores what it hasn't got; the body is read to the end.
        await (await fetch(new URL(f, dir), { priority: 'low' } as RequestInit)).arrayBuffer()
      } catch {
        return // offline or gone: the next visit tries again
      }
  }, 5000)
}

/** Ends the Python session (Stop, Restart): its variables are gone; the next run starts a new one. */
export function stopKernel(tell = true) {
  worker?.terminate()
  worker = null
  started = null
  readyState = null
  for (const p of pending.values()) p.reject(new Error(STOPPED_PY))
  pending.clear()
  if (tell) say({ status: 'off' })
}

export const STOPPED_PY = 'Stopped: Python was restarted, so its variables are gone. Run the cells again.'

export const kernelRunning = () => worker !== null

/** A table or query result for Python, or the DuckDB error it gave. */
async function fetchFrame(c: LabCall): Promise<PyFrame | { error: string }> {
  try {
    const table = await query(c.kind === 'table' ? tableSql(c.arg) : c.arg)
    return frameFromArrow(table)
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) }
  }
}

async function answerFetch(w: Worker, fid: number, c: LabCall) {
  const frame = await fetchFrame(c)
  w.postMessage({ type: 'fetched', fid, frame } satisfies ToWorker, 'error' in frame ? [] : transferables(frame))
}

export interface RanCell {
  count: number
  result: CellResult
  /** the DataFrame for the grid, as an Arrow table */
  grid: Table | null
  /** rows the DataFrame had, when the grid has fewer */
  gridTotal: number
  saves: { name: string; table: Table }[]
}

/** Runs one cell: fetches what it names, then runs it in the session. `line`: where it starts in the tab. */
export async function runCell(code: string, line: number, names: string[]): Promise<RanCell> {
  await startKernel()
  const w = worker!
  const fetched: Record<string, PyFrame | { error: string }> = {}
  for (const c of labCalls(code)) fetched[callKey(c)] = await fetchFrame(c)
  const id = ++nextId
  const n = ++count
  const result = await new Promise<CellResult>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const msg: ToWorker = { type: 'run', id, code, line, count: n, fetched, names }
    w.postMessage(msg, Object.values(fetched).flatMap((f) => ('error' in f ? [] : transferables(f))))
  })
  return {
    count: n,
    result,
    grid: result.grid ? arrowFromFrame(result.grid) : null,
    gridTotal: result.grid?.total ?? 0,
    saves: result.saves.map((s) => ({ name: s.name, table: arrowFromFrame(s.frame) })),
  }
}
