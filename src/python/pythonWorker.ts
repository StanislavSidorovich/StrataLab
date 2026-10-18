// The Python of Python tabs (stage 7): Pyodide with numpy and pandas in its own Web Worker (not the
// T-SQL translator's: Stop ends this worker). Packages come from the site's pyodide/ folder, or
// from jsDelivr in a copy without them (src/core/python.ts). The page sends one cell at a time,
// with the tables it reads (src/python/kernel.ts); lab.py runs it and gives Jupyter's outputs.
import type { PyodideInterface } from 'pyodide'
import type { PyProxy } from 'pyodide/ffi'
import LAB_PY from './lab.py?raw'
import BACKEND_PY from './lab_backend.py?raw'
import type { PyFrame } from './columns'
import type { Output } from '../core/ipynb'
import { bytesToLoad, type PackageSize } from '../core/python'

export type ToWorker =
  | { type: 'init'; indexURL: string; packageBaseUrl: string; startup: string[]; imports: Record<string, string>; extra: { module: string; url: string; needs: string[] }[]; sizes: Record<string, PackageSize>; coreBytes: number }
  | { type: 'run'; id: number; code: string; line: number; count: number; fetched: Record<string, PyFrame | { error: string }>; names: string[] }
  | { type: 'fetched'; fid: number; frame: PyFrame | { error: string } }

export interface CellResult {
  outputs: Output[]
  grid: PyFrame | null
  /** which of `outputs` is the DataFrame in the grid */
  grid_at: number | null
  saves: { name: string; frame: PyFrame }[]
}

export type FromWorker =
  | { type: 'progress'; text: string; bytes?: { loaded: number; total: number | null } }
  | { type: 'ready'; version: string; jspi: boolean }
  | { type: 'failed'; error: string }
  | { type: 'result'; id: number; result: CellResult }
  | { type: 'fetch'; fid: number; kind: 'table' | 'sql'; arg: string }

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg)

/**
 * The bytes of the download in progress, counted as they arrive: Pyodide's files and packages go
 * through fetch, which is wrapped for this. `total` is worked out from the build's file sizes, null
 * when the site doesn't serve the packages itself.
 */
let phase: { text: string; loaded: number; total: number | null; sentAt: number } | null = null
let counted: string[] = []

const DOWNLOAD_MANAGER_NOTE = 'A download manager (e.g. IDM) took a Python file. Add lab.quaera.app to its exceptions, or press Cancel twice in its dialog and accept “add to exceptions”, then press Retry.'
/** A Pyodide file that came back empty (204 or no bytes): a download manager took it. */
let emptyFetch = false

function report(force = false) {
  if (!phase) return
  const now = performance.now()
  if (!force && now - phase.sentAt < 80) return
  phase.sentAt = now
  post({ type: 'progress', text: phase.text, bytes: { loaded: phase.loaded, total: phase.total } })
}

function startPhase(text: string, total: number | null) {
  phase = { text, loaded: 0, total, sentAt: 0 }
  report(true)
}

function countDownloads() {
  const realFetch = self.fetch.bind(self)
  self.fetch = async (input: RequestInfo | URL, opts?: RequestInit) => {
    const res = await realFetch(input, opts)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (counted.some((c) => url.startsWith(c)) && (res.status === 204 || res.headers.get('content-length') === '0')) emptyFetch = true
    if (!res.body || [101, 204, 205, 304].includes(res.status) || !counted.some((c) => url.startsWith(c))) return res
    const reader = res.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) return report(true), controller.close()
        if (phase) phase.loaded += value.byteLength
        report()
        controller.enqueue(value)
      },
      cancel: (reason) => reader.cancel(reason),
    })
    const counting = new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
    Object.defineProperty(counting, 'url', { value: res.url })
    return counting
  }
}

let py: PyodideInterface | null = null
let init: Extract<ToWorker, { type: 'init' }> | null = null
let runCell: PyProxy | null = null
let imports: PyProxy | null = null
const loaded = new Set<string>()

async function start(msg: Extract<ToWorker, { type: 'init' }>) {
  init = msg
  counted = [msg.indexURL, msg.packageBaseUrl, ...msg.extra.map((x) => x.url)]
  countDownloads()
  const packages = bytesToLoad(msg.sizes, msg.startup, new Set())
  startPhase('Downloading Python', packages === null || !msg.coreBytes ? null : msg.coreBytes + packages)
  const { loadPyodide } = (await import(/* @vite-ignore */ `${msg.indexURL}pyodide.mjs`)) as typeof import('pyodide')
  py = await loadPyodide({ indexURL: msg.indexURL, packageBaseUrl: msg.packageBaseUrl })
  await loadPackages(msg.startup, true)
  phase = null
  post({ type: 'progress', text: 'Starting pandas' })
  py.FS.writeFile('/home/pyodide/lab.py', LAB_PY)
  py.FS.writeFile('/home/pyodide/lab_backend.py', BACKEND_PY)
  const lab = py.pyimport('lab')
  runCell = lab.run_cell
  imports = lab.imports
  // A table named at run time can be fetched mid-cell only where WebAssembly can wait (JSPI).
  const jspi = typeof (WebAssembly as { Suspending?: unknown }).Suspending === 'function'
  post({ type: 'ready', version: py.runPython('import sys\nsys.version.split()[0]') as string, jspi })
}

/** Pyodide's packages (and what they need) not loaded yet, with a line for the page while they download. */
async function loadPackages(names: string[], inPhase = false) {
  const todo = names.filter((n) => !loaded.has(n) && !(n in py!.loadedPackages))
  if (!todo.length) return
  if (!inPhase) startPhase(`Downloading ${todo.join(', ')}`, bytesToLoad(init!.sizes, todo, new Set([...loaded, ...Object.keys(py!.loadedPackages)].map((n) => n.toLowerCase()))))
  try {
    await py!.loadPackage(todo, { messageCallback: () => {}, errorCallback: (e) => console.warn(e) })
  } finally {
    if (!inPhase) phase = null
  }
  todo.forEach((n) => loaded.add(n))
}

/**
 * What a cell imports, of the packages the site serves (matplotlib…), then the extra wheels (seaborn)
 * after what they need. Anything else is left to fail in the cell as Python's ModuleNotFoundError.
 */
async function packagesFor(code: string) {
  const found = (imports as unknown as (c: string) => PyProxy)(code).toJs() as string[]
  await loadPackages([...new Set(found.map((m) => init!.imports[m]).filter(Boolean))])
  for (const w of init!.extra.filter((x) => found.includes(x.module) && !loaded.has(x.module))) {
    await loadPackages(w.needs)
    startPhase(`Downloading ${w.module}`, bytesToLoad(init!.sizes, [w.module], new Set()))
    try {
      await py!.loadPackage(w.url, { messageCallback: () => {} })
    } finally {
      phase = null
    }
    loaded.add(w.module)
  }
}

// A table asked for while a cell runs (a name built at run time): the page answers with `fetched`.
let nextFid = 0
const waiting = new Map<number, (frame: PyFrame | { error: string }) => void>()
function fetchFromPage(kind: 'table' | 'sql', arg: string): Promise<PyFrame | { error: string }> {
  const fid = ++nextFid
  post({ type: 'fetch', fid, kind, arg })
  return new Promise((resolve) => waiting.set(fid, resolve))
}

let ready: Promise<void> | null = null

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  if (msg.type === 'init') {
    ready = start(msg).catch((err) => {
      // Pyodide's own failures can be plain objects (ExitStatus when python_stdlib.zip came back empty:
      // an antivirus or download manager that takes .zip downloads), which String() turns into "[object Object]".
      const text = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
      post({ type: 'failed', error: emptyFetch ? DOWNLOAD_MANAGER_NOTE : text || DOWNLOAD_MANAGER_NOTE })
      throw err
    })
    return
  }
  if (msg.type === 'fetched') {
    waiting.get(msg.fid)?.(msg.frame)
    waiting.delete(msg.fid)
    return
  }
  await ready
  try {
    await packagesFor(msg.code)
  } catch (err) {
    // A package that would not download: the import fails in the cell with Python's own error.
    console.warn(err)
  }
  post({ type: 'progress', text: '' })
  const fetched = py!.toPy(msg.fetched)
  const names = py!.toPy(msg.names)
  try {
    const proxy = (await (runCell as unknown as { callPromising: (...a: unknown[]) => Promise<PyProxy> }).callPromising(msg.code, msg.line, msg.count, fetched, names, fetchFromPage)) as PyProxy
    const result = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as CellResult
    proxy.destroy()
    post({ type: 'result', id: msg.id, result })
  } finally {
    fetched.destroy()
    names.destroy()
  }
}
