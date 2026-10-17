// DuckDB-WASM downloads extensions on first use: Parquet (every dataset load) and ICU (time zones,
// current_date). The site serves its own copies under duckdb-ext/ (scripts/fetch-duckdb-extensions.mjs
// puts them in public/ before a build), so datasets load where extensions.duckdb.org is blocked, and offline.

/** The extensions served with the site. */
export const OWN_EXTENSIONS = ['parquet', 'icu'] as const

/** DuckDB's two browser builds (src/db/engine.ts picks one). */
export const WASM_PLATFORMS = ['wasm_eh', 'wasm_mvp'] as const

/** The folder under the site's root, the value for DuckDB's custom_extension_repository. */
export const EXTENSIONS_DIR = 'duckdb-ext'

/** Where DuckDB looks for an extension in a repository: v1.5.4/wasm_eh/parquet.duckdb_extension.wasm */
export function extensionPath(version: string, platform: string, name: string): string {
  return `v${version.replace(/^v/, '')}/${platform}/${name}.duckdb_extension.wasm`
}

/** Every file to serve for one DuckDB version. */
export function ownExtensionPaths(version: string): string[] {
  return WASM_PLATFORMS.flatMap((p) => OWN_EXTENSIONS.map((n) => extensionPath(version, p, n)))
}

/**
 * Whether the site has its own copies for this DuckDB and build (`files`: paths under duckdb-ext/).
 * All or nothing: with one missing, DuckDB would fail to load it instead of falling back.
 */
export function hasOwnExtensions(files: readonly string[], version: string, platform: string): boolean {
  return OWN_EXTENSIONS.every((n) => files.includes(extensionPath(version, platform, n)))
}
