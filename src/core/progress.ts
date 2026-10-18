// Download progress of DuckDB's .wasm file.
//
// The server sends the file gzip-compressed, so Content-Length is the
// compressed size while the browser hands us decompressed bytes. We know the
// decompressed size from the build (vite.config.ts), and prefer it.

/**
 * Percent downloaded, 0–99, or null when the size is unknown. Never 100: the
 * engine still has to start after the download, and a bar stuck on 100% looks frozen.
 */
export function downloadPercent(loaded: number, knownTotal: number, headerTotal: number): number | null {
  // The header size is only usable when nothing was compressed on the way.
  const total = knownTotal > 0 ? knownTotal : headerTotal > 0 && loaded <= headerTotal ? headerTotal : 0
  if (!total) return null
  return Math.max(0, Math.min(99, Math.floor((loaded / total) * 100)))
}

const mb = (bytes: number) => (bytes / 1e6).toFixed(1)

/**
 * The line for a Python download: "Python 7.4 / 17.7 MB · 42 %", or "Python 7.4 MB" when the total is
 * unknown. `text` is the worker's line ("Downloading Python", "Downloading matplotlib, seaborn").
 * The percent stops at 99, as for DuckDB: the packages still have to start.
 */
export function pythonProgressLabel(text: string, bytes: { loaded: number; total: number | null }): string {
  const what = text.replace(/^Downloading /, '')
  if (!bytes.total) return `${what} ${mb(bytes.loaded)} MB`
  const pct = Math.max(0, Math.min(99, Math.floor((bytes.loaded / bytes.total) * 100)))
  return `${what} ${mb(Math.min(bytes.loaded, bytes.total))} / ${mb(bytes.total)} MB · ${pct} %`
}

/** 0–1 for the thin bar, or null when the total is unknown (the bar then pulses). */
export function pythonProgressShare(bytes: { loaded: number; total: number | null }): number | null {
  return bytes.total ? Math.max(0, Math.min(0.99, bytes.loaded / bytes.total)) : null
}
