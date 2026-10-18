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

export type ToWorker =
  | { type: 'init'; indexURL: string; packageBaseUrl: string; startup: string[]; imports: Record<string, string>; extra: { module: string; url: string; needs: string[] }[] }
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
  | { type: 'progress'; text: string }
  | { type: 'ready'; version: string; jspi: boolean }
  | { type: 'failed'; error: string }
  | { type: 'result'; id: number; result: CellResult }
  | { type: 'fetch'; fid: number; kind: 'table' | 'sql'; arg: string }

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg)

let py: PyodideInterface | null = null
let init: Extract<ToWorker, { type: 'init' }> | null = null
let runCell: PyProxy | null = null
let imports: PyProxy | null = null
const loaded = new Set<string>()

async function start(msg: Extract<ToWorker, { type: 'init' }>) {
  init = msg
  post({ type: 'progress', text: 'Downloading Python' })
  const { loadPyodide } = (await import(/* @vite-ignore */ `${msg.indexURL}pyodide.mjs`)) as typeof import('pyodide')
  py = await loadPyodide({ indexURL: msg.indexURL, packageBaseUrl: msg.packageBaseUrl })
  await loadPackages(msg.startup)
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
async function loadPackages(names: string[]) {
  const todo = names.filter((n) => !loaded.has(n) && !(n in py!.loadedPackages))
  if (!todo.length) return
  post({ type: 'progress', text: `Downloading ${todo.join(', ')}` })
  await py!.loadPackage(todo, { messageCallback: () => {}, errorCallback: (e) => console.warn(e) })
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
    post({ type: 'progress', text: `Downloading ${w.module}` })
    await py!.loadPackage(w.url, { messageCallback: () => {} })
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
      post({ type: 'failed', error: text || 'Python could not start. If an antivirus or a download manager is set to take .zip files, let this site through and reload.' })
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
