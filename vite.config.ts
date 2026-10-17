/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'

// The .wasm is served gzip-compressed, so the browser can't tell how big it is
// once unpacked; the loading bar needs that number (src/db/engine.ts).
const wasmBytes = (name: string) => statSync(createRequire(import.meta.url).resolve(`@duckdb/duckdb-wasm/dist/${name}`)).size

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // DuckDB-WASM ships its own workers and .wasm files; they are imported with ?url.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  define: { __DUCKDB_WASM_BYTES__: JSON.stringify({ eh: wasmBytes('duckdb-eh.wasm'), mvp: wasmBytes('duckdb-mvp.wasm') }) },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
})
