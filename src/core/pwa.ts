// Which built files the service worker keeps, and how (src/pwa/sw.js, vite.config.ts → pwaPlugin).
// The engines and datasets are most of the site (~110 MB: DuckDB's two .wasm builds, Pyodide, PGlite),
// and a visit uses only some of them, so they are cached on first use, not on install.

/** Files fetched only when a feature needs them: kept after their first download. */
export const isOnDemand = (path: string) => /^(pyodide|sqlglot|datasets)\//.test(path) || /\.(wasm|data|parquet|whl|zip)$/.test(path)

export interface SwFiles {
  /** Downloaded when the service worker installs: the page, its scripts and styles. */
  shell: string[]
  /** Path → content hash. A file is downloaded again only when its hash changes. */
  onDemand: Record<string, string>
}

/** Splits the built files (path → content hash) into the shell and the on-demand files. */
export function swFiles(files: Record<string, string>): SwFiles {
  const shell: string[] = []
  const onDemand: Record<string, string> = {}
  for (const path of Object.keys(files).sort()) {
    if (path.endsWith('.map') || path === 'sw.js') continue
    if (isOnDemand(path)) onDemand[path] = files[path]
    else shell.push(path)
  }
  return { shell, onDemand }
}
