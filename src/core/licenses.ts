// The licence notices that go with the site (vite.config.ts → licensesPlugin). The bundler drops
// the libraries' comments, so their copyright lines and licence texts are gathered at build time
// into third-party-licenses.txt, which About & licences links to (src/ui/AboutDialog.tsx).

/** One thing the site ships that someone else wrote: an npm package or a file served as is. */
export interface Notice {
  name: string
  version?: string
  /** SPDX id(s), as the package says */
  license: string
  /** where it comes from */
  url?: string
  /** the LICENSE / NOTICE files, verbatim */
  texts: string[]
}

/**
 * The npm package a bundled module belongs to: `…/node_modules/@codemirror/view/dist/index.js` →
 * `@codemirror/view`. The last node_modules wins (a nested copy). Null for our own code and the
 * bundler's virtual modules.
 */
export function packageOf(moduleId: string): string | null {
  const path = moduleId.replace(/\\/g, '/').replace(/\?.*$/, '')
  if (path.startsWith('\0')) return null
  const at = path.lastIndexOf('/node_modules/')
  if (at < 0) return null
  const parts = path.slice(at + '/node_modules/'.length).split('/')
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  return name && !name.endsWith('/undefined') ? name : null
}

/** The `license` field of a package.json, in its old shapes too. */
export function licenseOf(pkg: { license?: unknown; licenses?: unknown }): string {
  const one = (l: unknown) => (typeof l === 'string' ? l : typeof (l as { type?: unknown })?.type === 'string' ? (l as { type: string }).type : '')
  if (pkg.license) return one(pkg.license) || 'UNKNOWN'
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(one).filter(Boolean).join(' OR ') || 'UNKNOWN'
  return 'UNKNOWN'
}

/** Licence and notice files in a package folder, LICENSE first. */
export function isLicenseFile(fileName: string): boolean {
  return /^(licen[cs]e|notice|copying)([.-].*)?$/i.test(fileName) && !/\.(js|ts|mjs|cjs|json|html)$/i.test(fileName)
}

const RULE = '='.repeat(78)

/** third-party-licenses.txt: a heading, then every notice by name, its licence texts verbatim. */
export function licensesText(notices: Notice[], heading: string): string {
  const byName = new Map<string, Notice>()
  for (const n of notices) if (!byName.has(n.name)) byName.set(n.name, n)
  const sorted = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))
  const out = [heading.trim(), '', ...sorted.map((n) => `- ${n.name}${n.version ? ` ${n.version}` : ''} (${n.license})`), '']
  for (const n of sorted) {
    out.push(RULE, `${n.name}${n.version ? ` ${n.version}` : ''}`, `License: ${n.license}`)
    if (n.url) out.push(`Source: ${n.url}`)
    out.push(RULE, '')
    if (n.texts.length) for (const t of n.texts) out.push(t.replace(/\r\n/g, '\n').trimEnd(), '')
    else out.push(`(The package ships no licence file; its licence is ${n.license}.)`, '')
  }
  return out.join('\n')
}

/** A package.json `repository` / `homepage` as a web address, when it gives one. */
export function sourceUrl(pkg: { homepage?: unknown; repository?: unknown }): string | undefined {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository as { url?: unknown })?.url
  const raw = typeof repo === 'string' ? repo : typeof pkg.homepage === 'string' ? pkg.homepage : undefined
  if (!raw) return undefined
  if (/^github:|^[\w-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw.replace(/^github:/, '')}`
  return raw.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '')
}
