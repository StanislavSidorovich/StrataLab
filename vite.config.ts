/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { swFiles } from './src/core/pwa.ts'

// The .wasm is served gzip-compressed, so the browser can't tell how big it is
// once unpacked; the loading bar needs that number (src/db/engine.ts).
const wasmBytes = (name: string) => statSync(createRequire(import.meta.url).resolve(`@duckdb/duckdb-wasm/dist/${name}`)).size

// Pyodide (Python for the T-SQL translator, stage 4) is served with the site under pyodide/,
// like the datasets: no CDN, so it works where a network blocks one, and later offline.
const PYODIDE_DIR = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
const PYODIDE_FILES: Record<string, string> = {
  'pyodide.mjs': 'text/javascript',
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

function pyodideFiles(): Plugin {
  return {
    name: 'pyodide-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/pyodide\/([^/?]+)/.exec(req.url ?? '')
        const type = m && PYODIDE_FILES[m[1]]
        if (!type) return next()
        res.setHeader('Content-Type', type)
        createReadStream(join(PYODIDE_DIR, m[1])).pipe(res)
      })
    },
    generateBundle() {
      for (const f of Object.keys(PYODIDE_FILES)) this.emitFile({ type: 'asset', fileName: `pyodide/${f}`, source: readFileSync(join(PYODIDE_DIR, f)) })
    },
  }
}

// PWA without extra dependencies (as in StrataFlow): emits sw.js with the shell to download on install
// and the on-demand files with their content hashes (src/core/pwa.ts).
function pwaPlugin(): Plugin {
  const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 12)
  return {
    name: 'stratalab-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const files: Record<string, string> = {}
      for (const [name, out] of Object.entries(bundle)) files[name] = sha(out.type === 'chunk' ? out.code : out.source)
      for (const f of readdirSync('public', { recursive: true, withFileTypes: true }))
        if (f.isFile()) {
          const path = join(f.parentPath, f.name)
          files[path.slice('public/'.length).replace(/\\/g, '/')] = sha(readFileSync(path))
        }
      const { shell, onDemand } = swFiles(files)
      const version = sha(JSON.stringify([shell.map((f) => [f, files[f]]), onDemand]))
      const source = readFileSync('src/pwa/sw.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__SHELL__', JSON.stringify(shell, null, 2))
        .replace('__ON_DEMAND__', JSON.stringify(onDemand, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), pyodideFiles(), pwaPlugin()],
  worker: { format: 'es' },
  // DuckDB-WASM ships its own workers and .wasm files; they are imported with ?url.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm', '@electric-sql/pglite', 'pyodide'] },
  define: { __DUCKDB_WASM_BYTES__: JSON.stringify({ eh: wasmBytes('duckdb-eh.wasm'), mvp: wasmBytes('duckdb-mvp.wasm') }) },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
})
