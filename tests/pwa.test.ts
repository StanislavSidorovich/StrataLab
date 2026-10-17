import { describe, expect, it } from 'vitest'
import { isOnDemand, swFiles } from '../src/core/pwa'

describe('service worker files', () => {
  it('keeps the engines and datasets for first use', () => {
    for (const p of ['assets/duckdb-eh-CfdE9-rk.wasm', 'assets/pglite-CB2rjG_k.data', 'pyodide/pyodide.mjs', 'pyodide/python_stdlib.zip', 'sqlglot/NOTICE.md', 'datasets/quaera/fact_sellout.parquet', 'datasets/catalog.json'])
      expect(isOnDemand(p), p).toBe(true)
  })

  it('downloads the page, scripts and styles on install', () => {
    for (const p of ['index.html', 'manifest.webmanifest', 'icon.svg', 'assets/index-B5fH01hM.js', 'assets/index-CvLDU8Ba.css', 'assets/duckdb-browser-eh.worker-CwdVMcbT.js'])
      expect(isOnDemand(p), p).toBe(false)
  })

  it('splits the build, leaving out source maps and the worker itself', () => {
    const files = { 'sw.js': 'a', 'index.html': 'b', 'assets/index.js.map': 'c', 'assets/index.js': 'd', 'assets/duckdb-eh.wasm': 'e' }
    expect(swFiles(files)).toEqual({ shell: ['assets/index.js', 'index.html'], onDemand: { 'assets/duckdb-eh.wasm': 'e' } })
  })
})
