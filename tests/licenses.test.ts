import { describe, expect, it } from 'vitest'
import { isLicenseFile, licenseOf, licensesText, packageOf, sourceUrl } from '../src/core/licenses'
import { isOnDemand } from '../src/core/pwa'

describe('licence notices', () => {
  it('finds the package a bundled module comes from', () => {
    expect(packageOf('/w/StrataLab/node_modules/@codemirror/view/dist/index.js')).toBe('@codemirror/view')
    expect(packageOf('/w/StrataLab/node_modules/react-dom/cjs/react-dom.production.js?commonjs-exports')).toBe('react-dom')
    expect(packageOf('C:\\w\\node_modules\\zustand\\esm\\index.mjs')).toBe('zustand')
    // a nested copy belongs to the inner package
    expect(packageOf('/w/node_modules/sql-formatter/node_modules/nearley/lib/nearley.js')).toBe('nearley')
    expect(packageOf('/w/StrataLab/src/ui/App.tsx')).toBeNull()
    expect(packageOf('\0vite/preload-helper.js')).toBeNull()
  })

  it('reads the licence field in its old shapes', () => {
    expect(licenseOf({ license: 'MIT' })).toBe('MIT')
    expect(licenseOf({ license: { type: 'BSD-3-Clause' } })).toBe('BSD-3-Clause')
    expect(licenseOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0')
    expect(licenseOf({})).toBe('UNKNOWN')
  })

  it('picks licence and notice files, not code named after them', () => {
    for (const f of ['LICENSE', 'LICENSE.md', 'license.txt', 'LICENCE', 'NOTICE.txt', 'COPYING', 'LICENSE-MIT']) expect(isLicenseFile(f)).toBe(true)
    for (const f of ['license.js', 'README.md', 'package.json', 'licenses.d.ts']) expect(isLicenseFile(f)).toBe(false)
  })

  it('turns repository fields into web addresses', () => {
    expect(sourceUrl({ repository: { type: 'git', url: 'git+https://github.com/apache/arrow.git' } })).toBe('https://github.com/apache/arrow')
    expect(sourceUrl({ repository: 'pmndrs/zustand' })).toBe('https://github.com/pmndrs/zustand')
    expect(sourceUrl({ repository: 'github:lucide-icons/lucide' })).toBe('https://github.com/lucide-icons/lucide')
    expect(sourceUrl({ homepage: 'https://react.dev/' })).toBe('https://react.dev/')
    expect(sourceUrl({})).toBeUndefined()
  })

  it('lists every notice once, by name, with its texts verbatim', () => {
    const text = licensesText(
      [
        { name: 'zustand', version: '5.0.15', license: 'MIT', texts: ['MIT License\r\n\r\nCopyright (c) 2019 Paul Henschel\n\n'] },
        { name: '@codemirror/view', version: '6.43.14', license: 'MIT', url: 'https://github.com/codemirror/view', texts: ['Copyright (C) 2018 Marijn Haverbeke'] },
        { name: 'zustand', version: '4.0.0', license: 'MIT', texts: [] },
        { name: 'bare', license: 'ISC', texts: [] },
      ],
      'Quaera Lab is Apache-2.0.\n',
    )
    expect(text.startsWith('Quaera Lab is Apache-2.0.\n\n- @codemirror/view 6.43.14 (MIT)\n- bare (ISC)\n- zustand 5.0.15 (MIT)\n')).toBe(true)
    expect(text).toContain('Source: https://github.com/codemirror/view')
    expect(text).toContain('MIT License\n\nCopyright (c) 2019 Paul Henschel\n')
    expect(text).not.toContain('\r')
    expect(text).toContain('(The package ships no licence file; its licence is ISC.)')
    expect(text.match(/^zustand/gm)).toHaveLength(1)
  })

  it('is cached by the service worker on first use, not on install', () => {
    expect(isOnDemand('third-party-licenses.txt')).toBe(true)
    expect(isOnDemand('pyodide/LICENSE.txt')).toBe(true)
    expect(isOnDemand('duckdb-ext/NOTICE.txt')).toBe(true)
  })
})
