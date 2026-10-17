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
