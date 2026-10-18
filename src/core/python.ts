// Python next to SQL (stage 7): which packages the site serves next to Pyodide, and where a
// copy without them takes them from. scripts/fetch-python-packages.mjs puts the files in
// public/pyodide/ before a build (the deploy runs it); src/python/kernel.ts loads them.

/** What `import` can reach in a Python tab: these and the packages they need. */
export const PYTHON_PACKAGES = ['numpy', 'pandas', 'matplotlib'] as const

/** Loaded with Python itself (`lab` needs them); matplotlib and seaborn wait for an import. */
export const STARTUP_PACKAGES = ['numpy', 'pandas'] as const

/** A wheel Pyodide's build lacks, from PyPI as it is (pure Python), pinned by its hash. */
export interface ExtraWheel {
  /** the name `import` uses */
  module: string
  file: string
  url: string
  sha256: string
  /** loaded first (from Pyodide's build) */
  needs: string[]
}

export const EXTRA_WHEELS: ExtraWheel[] = [
  {
    module: 'seaborn',
    file: 'seaborn-0.13.2-py3-none-any.whl',
    url: 'https://files.pythonhosted.org/packages/83/11/00d3c3dfc25ad54e731d91449895a79e4bf2384dc3ac01809010ba88f6d5/seaborn-0.13.2-py3-none-any.whl',
    sha256: '636f8336facf092165e27924f223d3c62ca560b1f2bb5dff7ab7fad265361987',
    needs: ['numpy', 'pandas', 'matplotlib'],
  },
]

/** The folder under the site's root: Pyodide's core and the packages, side by side. */
export const PYODIDE_DIR = 'pyodide'

/** Where Pyodide's own build of a version lives on jsDelivr (a copy without the files uses it). */
export const pyodideCdn = (version: string) => `https://cdn.jsdelivr.net/pyodide/v${version}/full/`

export interface LockPackage {
  name: string
  file_name: string
  sha256: string
  depends: string[]
  /** the names `import` uses for it */
  imports: string[]
}

export interface Lock {
  info: { python: string }
  packages: Record<string, LockPackage>
}

/** The packages named and everything they need, from pyodide-lock.json, sorted by name. */
export function packageClosure(lock: Lock, names: readonly string[]): LockPackage[] {
  const seen = new Map<string, LockPackage>()
  const visit = (name: string) => {
    const key = name.toLowerCase()
    if (seen.has(key)) return
    const p = lock.packages[key]
    if (!p) throw new Error(`${name} is not in Pyodide's build`)
    seen.set(key, p)
    for (const d of p.depends) visit(d)
  }
  for (const n of names) visit(n)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Every file to serve: Pyodide's wheels for PYTHON_PACKAGES, then the extra wheels. */
export function pythonPackageFiles(lock: Lock): { file: string; sha256: string }[] {
  return [...packageClosure(lock, PYTHON_PACKAGES).map((p) => ({ file: p.file_name, sha256: p.sha256 })), ...EXTRA_WHEELS.map((w) => ({ file: w.file, sha256: w.sha256 }))]
}

/**
 * Whether the site serves its own copies (`files`: names under pyodide/). All or nothing: with
 * one missing, Pyodide would fail on it instead of taking the set from jsDelivr.
 */
export function hasOwnPackages(files: readonly string[], lock: Lock): boolean {
  return pythonPackageFiles(lock).every((f) => files.includes(f.file))
}

/** Module name → package, for what the site serves: an import of anything else is not downloaded. */
export function servedImports(lock: Lock): Record<string, string> {
  return Object.fromEntries(packageClosure(lock, PYTHON_PACKAGES).flatMap((p) => p.imports.map((m) => [m, p.name] as [string, string])))
}

/** The extra wheels a piece of code imports (seaborn): `imports` as Pyodide's find_imports gives them. */
export const extraWheelsFor = (imports: readonly string[]) => EXTRA_WHEELS.filter((w) => imports.includes(w.module))

/** A package's size on disk (bytes, 0 when the site doesn't serve it) and what it needs, for the download bar. */
export interface PackageSize {
  size: number
  depends: string[]
}

/**
 * Bytes still to download to load `names`: their files and their dependencies', less what is
 * `loaded` already. Null when a size is unknown (a copy that takes packages from jsDelivr).
 */
export function bytesToLoad(sizes: Record<string, PackageSize>, names: readonly string[], loaded: ReadonlySet<string>): number | null {
  const seen = new Set<string>()
  let total = 0
  let unknown = false
  const visit = (name: string) => {
    const key = name.toLowerCase()
    if (seen.has(key) || loaded.has(key)) return
    seen.add(key)
    const p = sizes[key]
    if (!p) return void (unknown = true)
    if (!p.size) unknown = true
    total += p.size
    p.depends.forEach(visit)
  }
  names.forEach(visit)
  return unknown ? null : total
}
