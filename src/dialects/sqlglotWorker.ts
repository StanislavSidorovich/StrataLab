// Pyodide + sqlglot in a Web Worker (stage 4): the first T-SQL query loads Python (~12 MB, once,
// then from the browser's cache) without freezing the page. Both are served with the site
// (vite.config.ts copies Pyodide to pyodide/, the sqlglot wheel is in public/sqlglot/).
import type { PyodideInterface } from 'pyodide'
import TRANSLATE_PY from './translate.py?raw'

export interface TranslateRequest {
  id: number
  script: string
  indexURL: string
  wheelURL: string
}

let ready: Promise<PyodideInterface> | null = null

async function start(indexURL: string, wheelURL: string): Promise<PyodideInterface> {
  post({ progress: 'download' })
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import('pyodide')
  const [py, wheel] = await Promise.all([
    loadPyodide({ indexURL }),
    fetch(wheelURL).then((r) => {
      if (!r.ok) throw new Error(`Could not download sqlglot (${r.status})`)
      return r.arrayBuffer()
    }),
  ])
  post({ progress: 'start' })
  py.unpackArchive(new Uint8Array(wheel), 'wheel')
  py.runPython(TRANSLATE_PY)
  return py
}

function post(msg: object) {
  ;(self as unknown as Worker).postMessage(msg)
}

self.onmessage = async (e: MessageEvent<TranslateRequest>) => {
  const { id, script, indexURL, wheelURL } = e.data
  try {
    ready ??= start(indexURL, wheelURL)
    const py = await ready
    py.globals.set('_script', script)
    const json = py.runPython('import json\njson.dumps(translate(_script))') as string
    post({ id, result: JSON.parse(json) })
  } catch (err) {
    ready = null
    post({ id, error: String(err instanceof Error ? err.message : err) })
  }
}
