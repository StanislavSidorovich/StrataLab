// Downloads the Python packages the site serves next to Pyodide (src/core/python.ts) into
// public/pyodide/: pandas, matplotlib and what they need, as Pyodide's own build of the installed
// pyodide package has them, and seaborn's wheel from PyPI. Each file is checked against its sha256
// (pyodide-lock.json, or the pin for seaborn). Run before a build (the deploy workflow does):
//   npm run python-packages
//   npm run python-packages -- --from pyodide-314.0.7.tar.bz2   (the release archive from GitHub)
// Files already there are kept. Also writes pyodide/python-packages-NOTICE.txt: the licence files
// inside the wheels. Without the files the app still works, taking the packages from jsDelivr.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { EXTRA_WHEELS, PYODIDE_DIR, packageClosure, pyodideCdn, pythonPackageFiles, PYTHON_PACKAGES } from '../src/core/python.ts'

const require = createRequire(import.meta.url)
const pyodideDir = dirname(require.resolve('pyodide/package.json'))
const version = JSON.parse(readFileSync(join(pyodideDir, 'package.json'), 'utf8')).version
const lock = JSON.parse(readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8'))
const outDir = join('public', PYODIDE_DIR)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const fromAt = process.argv.indexOf('--from')
const archive = fromAt > 0 ? process.argv[fromAt + 1] : null

const files = pythonPackageFiles(lock)
const missing = files.filter((f) => !(existsSync(join(outDir, f.file)) && sha256(readFileSync(join(outDir, f.file))) === f.sha256))

/** Pyodide's wheels out of the release archive, into a temporary folder. */
function fromArchive(names) {
  const tmp = mkdtempSync(join(tmpdir(), 'pyodide-'))
  const r = spawnSync('tar', ['-xjf', archive, '-C', tmp, ...names.map((n) => `pyodide/${n}`)], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`tar could not read ${archive}`)
  return { dir: join(tmp, 'pyodide'), done: () => rmSync(tmp, { recursive: true, force: true }) }
}

const extra = new Map(EXTRA_WHEELS.map((w) => [w.file, w.url]))
const fromTar = archive ? fromArchive(missing.filter((f) => !extra.has(f.file)).map((f) => f.file)) : null
mkdirSync(outDir, { recursive: true })
let total = 0
for (const f of missing) {
  let bytes
  if (fromTar && !extra.has(f.file)) bytes = readFileSync(join(fromTar.dir, f.file))
  else {
    const url = extra.get(f.file) ?? `${pyodideCdn(version)}${f.file}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  }
  if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: sha256 does not match ${extra.has(f.file) ? 'the pin in src/core/python.ts' : 'pyodide-lock.json'}`)
  writeFileSync(join(outDir, f.file), bytes)
  total += bytes.length
  console.log(`${join(outDir, f.file)}  ${(bytes.length / 1e6).toFixed(2)} MB`)
}
fromTar?.done()
if (missing.length) console.log(`${missing.length} file(s), ${(total / 1e6).toFixed(1)} MB`)

// ------------------------------------------------------------------ licence texts in the wheels

/** The files of a zip (a wheel) whose names pass `want`, as text. */
function unzipText(bytes, want) {
  const buf = Buffer.from(bytes)
  let end = buf.length - 22
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(end + 10)
  let at = buf.readUInt32LE(end + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10)
    const size = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen
    if (!want(name)) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    out.push({ name, text: (method === 8 ? inflateRawSync(raw) : raw).toString('utf8') })
  }
  return out
}

// The dist-info's licence files, and licence files elsewhere in the wheel (matplotlib's fonts: DejaVu, STIX).
const isLicence = (name) => /\.dist-info\/(licenses\/.+|(LICEN[CS]E|COPYING|NOTICE|AUTHORS)[^/]*)$/i.test(name) || /(^|\/)LICEN[CS]E_[^/]+$/.test(name)
const metaField = (meta, field) => new RegExp(`^${field}: (.*)$`, 'mi').exec(meta)?.[1]?.trim()
const parts = []
for (const f of files) {
  const bytes = readFileSync(join(outDir, f.file))
  const meta = unzipText(bytes, (n) => /\.dist-info\/METADATA$/.test(n))[0]?.text ?? ''
  const texts = unzipText(bytes, isLicence)
  const classifiers = [...meta.matchAll(/^Classifier: License :: (?:OSI Approved :: )?(.+)$/gm)].map((m) => m[1].trim()).filter((c) => c !== 'OSI Approved')
  const licence = metaField(meta, 'License-Expression') ?? (classifiers.length ? classifiers.join(', ') : metaField(meta, 'License')) ?? 'see below'
  const head = `${metaField(meta, 'Name')} ${metaField(meta, 'Version')} (${f.file})\nLicence: ${licence}`
  parts.push(`${'='.repeat(78)}\n${head}\n${'='.repeat(78)}\n\n${texts.map((t) => `--- ${t.name.replace(/^[^/]*\.dist-info\//, '')}\n\n${t.text.trimEnd()}`).join('\n\n')}`)
}
writeFileSync(
  join(outDir, 'python-packages-NOTICE.txt'),
  `The Python packages served with Quaera Lab under pyodide/ (for Python tabs): ${PYTHON_PACKAGES.join(', ')}, seaborn and what they need.\n` +
    `They are Pyodide ${version}'s own builds (https://github.com/pyodide/pyodide), served unchanged, and seaborn's wheel from PyPI.\n` +
    `Each one's licence files as its wheel ships them:\n\n${parts.join('\n\n')}\n`,
)
console.log(`${join(outDir, 'python-packages-NOTICE.txt')}: ${packageClosure(lock, PYTHON_PACKAGES).length + EXTRA_WHEELS.length} packages`)
