/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // DuckDB-WASM ships its own workers and .wasm files; they are imported with ?url.
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
})
