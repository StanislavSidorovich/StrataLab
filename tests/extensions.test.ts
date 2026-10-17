import { describe, expect, it } from 'vitest'
import { extensionPath, hasOwnExtensions, ownExtensionPaths } from '../src/core/extensions'
import { isOnDemand } from '../src/core/pwa'

describe('DuckDB extensions served with the site', () => {
  it('uses the path DuckDB asks a repository for', () => {
    expect(extensionPath('1.5.4', 'wasm_eh', 'parquet')).toBe('v1.5.4/wasm_eh/parquet.duckdb_extension.wasm')
    expect(extensionPath('v1.5.4', 'wasm_mvp', 'icu')).toBe('v1.5.4/wasm_mvp/icu.duckdb_extension.wasm')
  })

  it('lists Parquet and ICU for both builds', () => {
    expect(ownExtensionPaths('v1.5.4')).toEqual([
      'v1.5.4/wasm_eh/parquet.duckdb_extension.wasm',
      'v1.5.4/wasm_eh/icu.duckdb_extension.wasm',
      'v1.5.4/wasm_mvp/parquet.duckdb_extension.wasm',
      'v1.5.4/wasm_mvp/icu.duckdb_extension.wasm',
    ])
  })

  it('is used only when every extension is there for this DuckDB and build', () => {
    const all = ownExtensionPaths('1.5.4')
    expect(hasOwnExtensions(all, '1.5.4', 'wasm_eh')).toBe(true)
    expect(hasOwnExtensions(all, '1.5.4', 'wasm_mvp')).toBe(true)
    expect(hasOwnExtensions(all, '1.5.5', 'wasm_eh')).toBe(false)
    expect(hasOwnExtensions(all.filter((p) => !p.includes('wasm_eh/icu')), '1.5.4', 'wasm_eh')).toBe(false)
    expect(hasOwnExtensions([], '1.5.4', 'wasm_eh')).toBe(false)
  })

  it('is cached by the service worker on first use, not on install', () => {
    for (const p of ownExtensionPaths('1.5.4')) expect(isOnDemand(`duckdb-ext/${p}`)).toBe(true)
  })
})
