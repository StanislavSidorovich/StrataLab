/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { swFiles } from './src/core/pwa.ts'
import { EXTENSIONS_DIR } from './src/core/extensions.ts'
import { isLicenseFile, licenseOf, licensesText, packageOf, sourceUrl, type Notice } from './src/core/licenses.ts'

// The .wasm is served gzip-compressed, so the browser can't tell how big it is
// once unpacked; the loading bar needs that number (src/db/engine.ts).
const wasmBytes = (name: string) => statSync(createRequire(import.meta.url).resolve(`@duckdb/duckdb-wasm/dist/${name}`)).size

// The DuckDB extensions in public/duckdb-ext/ (scripts/fetch-duckdb-extensions.mjs): the engine uses
// them instead of extensions.duckdb.org when they are there (src/core/extensions.ts).
const extDir = join('public', EXTENSIONS_DIR)
const ownExtensions = existsSync(extDir)
  ? readdirSync(extDir, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => join(f.parentPath, f.name).slice(extDir.length + 1).replace(/\\/g, '/'))
  : []

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

// Licence notices (src/core/licenses.ts): the bundler drops the libraries' comments, so their licence
// texts go in third-party-licenses.txt (linked from About & licences), with the DuckDB extensions'
// and Pyodide's, which are files served as they are; Pyodide and the extensions also get their own
// next to them. The texts not shipped in npm packages are kept in licenses/.
const legal = (f: string) => readFileSync(join('licenses', f), 'utf8')
const PYODIDE_LICENSE = () =>
  `Pyodide is distributed under the Mozilla Public License 2.0 (below); source: https://github.com/pyodide/pyodide\n` +
  `python_stdlib.zip holds the CPython standard library, under the Python Software Foundation License (at the end).\n\n` +
  `${legal('pyodide-mpl-2.0.txt').trimEnd()}\n\n${'='.repeat(78)}\nCPython\n${'='.repeat(78)}\n\n${legal('cpython.txt')}`
const DUCKDB_EXT_NOTICE = () =>
  `The DuckDB extensions here (parquet, icu) are built by DuckDB from https://github.com/duckdb/duckdb and served unchanged.\n` +
  `DuckDB is under the MIT License; the ICU extension contains ICU and its Unicode data, under the Unicode License v3 and the\n` +
  `licences that follow it.\n\n${'='.repeat(78)}\nDuckDB\n${'='.repeat(78)}\n\n${legal('duckdb.txt').trimEnd()}\n\n${'='.repeat(78)}\nICU\n${'='.repeat(78)}\n\n${legal('icu.txt')}`

/** Packages served as files rather than bundled as code: their .wasm, workers and data. */
const SERVED_PACKAGES = ['@duckdb/duckdb-wasm', '@electric-sql/pglite', 'pyodide']

function packageNotice(name: string, dir: string): Notice | null {
  const pkgFile = join(dir, 'package.json')
  if (!existsSync(pkgFile)) return null
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const texts = readdirSync(dir)
    .filter(isLicenseFile)
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
  // Two that ship no licence file: Pyodide (MPL-2.0) and DuckDB-WASM (MIT, the same text as DuckDB's).
  if (!texts.length && name === 'pyodide') texts.push(PYODIDE_LICENSE())
  if (!texts.length && name === '@duckdb/duckdb-wasm') texts.push(legal('duckdb.txt'))
  return { name, version: pkg.version, license: licenseOf(pkg), url: sourceUrl(pkg), texts }
}

/** third-party-licenses.txt for these packages (name → folder), with the files served as they are. */
function thirdPartyLicenses(packages: Map<string, string>): string {
  for (const name of SERVED_PACKAGES) if (!packages.has(name)) packages.set(name, join('node_modules', name))
  const notices = [...packages].map(([name, dir]) => packageNotice(name, dir)).filter((n): n is Notice => n != null)
  notices.push(
    { name: 'DuckDB extensions: parquet, icu (duckdb-ext/)', license: 'MIT; ICU: Unicode-3.0 and others', url: 'https://github.com/duckdb/duckdb', texts: [DUCKDB_EXT_NOTICE()] },
    { name: 'CPython standard library (in Pyodide)', license: 'PSF-2.0', url: 'https://github.com/python/cpython', texts: [legal('cpython.txt')] },
    { name: 'sqlglot (sqlglot/)', license: 'MIT', url: 'https://github.com/tobymao/sqlglot', texts: [readFileSync('public/sqlglot/NOTICE.md', 'utf8')] },
    { name: 'Sample datasets (datasets/)', license: 'MIT, BSD-2-Clause, CC BY-NC-SA 4.0: see below', texts: [readFileSync('public/datasets/NOTICE.md', 'utf8')] },
  )
  return licensesText(
    notices,
    `Quaera Lab (https://lab.quaera.app) is open source under the Apache License 2.0: https://github.com/StanislavSidorovich/StrataLab\n\n` +
      `It is built with the software and data below. This file lists each of them with its licence, copyright and notice texts\n` +
      `as they ship it; it is made when the site is built, from the packages that went into it.`,
  )
}

/** Our own dependencies, for the dev server (a build lists what the bundle actually holds). */
const devPackages = () =>
  new Map(Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies).map((n) => [n, join('node_modules', n)] as [string, string]))

function licensesPlugin(): Plugin {
  const files = (packages: () => Map<string, string>): Record<string, () => string> => ({
    'third-party-licenses.txt': () => thirdPartyLicenses(packages()),
    'pyodide/LICENSE.txt': PYODIDE_LICENSE,
    [`${EXTENSIONS_DIR}/NOTICE.txt`]: DUCKDB_EXT_NOTICE,
  })
  return {
    name: 'stratalab-licenses',
    configureServer(server) {
      const served = files(devPackages)
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').replace(/^\//, '').replace(/[?#].*$/, '')
        if (!served[path]) return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(served[path]())
      })
    },
    generateBundle(_, bundle) {
      const packages = new Map<string, string>()
      for (const out of Object.values(bundle))
        if (out.type === 'chunk')
          for (const id of out.moduleIds) {
            const name = packageOf(id)
            if (name && !packages.has(name)) {
              const path = id.replace(/\\/g, '/')
              packages.set(name, path.slice(0, path.lastIndexOf('/node_modules/') + '/node_modules/'.length + name.length))
            }
          }
      for (const [fileName, text] of Object.entries(files(() => packages))) this.emitFile({ type: 'asset', fileName, source: text() })
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
  plugins: [react(), tailwindcss(), pyodideFiles(), licensesPlugin(), pwaPlugin()],
  worker: { format: 'es' },
  // DuckDB-WASM ships its own workers and .wasm files; they are imported with ?url.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm', '@electric-sql/pglite', 'pyodide'] },
  define: {
    __DUCKDB_WASM_BYTES__: JSON.stringify({ eh: wasmBytes('duckdb-eh.wasm'), mvp: wasmBytes('duckdb-mvp.wasm') }),
    __OWN_DUCKDB_EXTENSIONS__: JSON.stringify(ownExtensions),
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version),
  },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
})
