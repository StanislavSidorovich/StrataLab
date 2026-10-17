// About & licences (Help menu): what Quaera Lab is and its version, whose work it is built on with
// the full licence texts (third-party-licenses.txt, made at build time: vite.config.ts → licensesPlugin),
// and what happens to the user's data. `#about`, `#licences` and `#privacy` open it on that tab.
import { useEffect } from 'react'
import { ExternalLink, Info, X } from 'lucide-react'
import { openAbout, useLab, type AboutTab } from './store'
import { DATASETS } from '../data/datasets'

/** package.json's version (vite.config.ts). */
declare const __APP_VERSION__: string

const SOURCE = 'https://github.com/StanislavSidorovich/StrataLab'

/** The parts a user meets, by what they do; every package with its text is in third-party-licenses.txt. */
const PARTS: [string, string, string, string][] = [
  ['DuckDB, DuckDB-WASM', 'the database that runs your queries', 'MIT', 'https://duckdb.org'],
  ['DuckDB extensions Parquet and ICU', 'datasets, time zones (served with the site)', 'MIT; ICU: Unicode License v3', 'duckdb-ext/NOTICE.txt'],
  ['PGlite', 'the PostgreSQL mode', 'Apache-2.0, PostgreSQL License', 'https://pglite.dev'],
  ['Pyodide, CPython', 'Python in the browser, for the T-SQL translator', 'MPL-2.0, PSF License', 'pyodide/LICENSE.txt'],
  ['sqlglot', 'the T-SQL → DuckDB translation', 'MIT', 'sqlglot/NOTICE.md'],
  ['Apache Arrow', 'results between the database and the page', 'Apache-2.0', 'https://arrow.apache.org'],
  ['SheetJS Community Edition', 'reading and writing Excel files', 'Apache-2.0', 'https://sheetjs.com'],
  ['CodeMirror', 'the SQL editor', 'MIT', 'https://codemirror.net'],
  ['sql-formatter', 'Format SQL', 'MIT', 'https://github.com/sql-formatter-org/sql-formatter'],
  ['React, Zustand, TanStack Virtual', 'the interface', 'MIT', 'https://react.dev'],
  ['Lucide', 'icons', 'ISC', 'https://lucide.dev'],
]

const TABS: [AboutTab, string][] = [
  ['about', 'About'],
  ['licences', 'Licences'],
  ['privacy', 'Privacy'],
]

const HASH_TABS: Record<string, AboutTab> = { '#about': 'about', '#licences': 'licences', '#licenses': 'licences', '#privacy': 'privacy' }

export function AboutDialog() {
  const tab = useLab((s) => s.aboutOpen)
  useEffect(() => {
    const fromHash = () => HASH_TABS[location.hash.toLowerCase()] && openAbout(HASH_TABS[location.hash.toLowerCase()])
    fromHash()
    addEventListener('hashchange', fromHash)
    return () => removeEventListener('hashchange', fromHash)
  }, [])
  if (!tab) return null
  const close = () => {
    openAbout(false)
    if (HASH_TABS[location.hash.toLowerCase()]) history.replaceState(null, '', location.pathname + location.search)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="About Quaera Lab" className="w-full max-w-2xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-4 pt-3">
          <Info size={18} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <div className="font-semibold flex-1">Quaera Lab</div>
          <button className="btn btn-ghost" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1 px-3 mt-1" role="tablist" style={{ borderBottom: '1px solid var(--line)' }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className="px-3 py-2 -mb-px"
              style={tab === id ? { fontWeight: 600, borderBottom: '2px solid var(--accent)' } : { color: 'var(--muted)', borderBottom: '2px solid transparent' }}
              onClick={() => openAbout(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-auto px-4 py-3 space-y-3 leading-relaxed" style={{ fontSize: 13.5 }}>
          {tab === 'about' && <About />}
          {tab === 'licences' && <Licences />}
          {tab === 'privacy' && <Privacy />}
        </div>
      </div>
    </div>
  )
}

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="underline" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
)

function About() {
  const engine = useLab((s) => s.engine)
  return (
    <>
      <p>
        A SQL workbench in the browser: add CSV and Excel files or a sample database and query them with SQL (DuckDB, SQL Server T-SQL or PostgreSQL). Nothing to install, no
        account, and <b>your data stays on this device</b>: there is no server that receives it (see Privacy).
      </p>
      <p>
        Part of <A href="https://quaera.app">Quaera</A>, with <A href="https://model.quaera.app">Quaera Model</A> (design tables and keys) and{' '}
        <A href="https://flow.quaera.app">Quaera Flow</A>.
      </p>
      <dl className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <dt style={{ color: 'var(--muted)' }}>Version</dt>
        <dd>{__APP_VERSION__}</dd>
        <dt style={{ color: 'var(--muted)' }}>Database</dt>
        <dd>
          {engine.status === 'ready' ? `DuckDB ${engine.version}${engine.persistent ? ', saved in this browser' : ', in memory: this tab only (private window, or another tab has the database)'}` : engine.status === 'loading' ? 'starting…' : 'did not start'}
        </dd>
        <dt style={{ color: 'var(--muted)' }}>Source code</dt>
        <dd>
          <A href={SOURCE}>github.com/StanislavSidorovich/StrataLab</A>, Apache License 2.0
        </dd>
        <dt style={{ color: 'var(--muted)' }}>Questions, bugs</dt>
        <dd>
          <A href={`${SOURCE}/issues`}>GitHub issues</A>
        </dd>
      </dl>
    </>
  )
}

function Licences() {
  return (
    <>
      <p>
        Quaera Lab’s own code is under the <A href={`${SOURCE}/blob/main/LICENSE`}>Apache License 2.0</A>. It is built on the open-source work below; every package in the site,
        with its copyright and licence text, is listed in{' '}
        <A href="third-party-licenses.txt">
          third-party-licenses.txt <ExternalLink size={11} className="inline" />
        </A>
        .
      </p>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: 12.5 }}>
          <tbody>
            {PARTS.map(([name, what, licence, href]) => (
              <tr key={name} style={{ borderTop: '1px solid var(--line)' }}>
                <td className="py-1 pr-3 align-top">
                  <A href={href}>{name}</A>
                </td>
                <td className="py-1 pr-3 align-top" style={{ color: 'var(--muted)' }}>
                  {what}
                </td>
                <td className="py-1 align-top whitespace-nowrap">{licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="font-semibold pt-1">Sample datasets</div>
      <p style={{ color: 'var(--muted)' }}>
        Each keeps its own licence; the texts are in <A href="datasets/NOTICE.md">datasets/NOTICE.md</A>. Converted to Parquet; the rows are otherwise unchanged.
      </p>
      <ul className="space-y-0.5" style={{ fontSize: 12.5 }}>
        {DATASETS.map((d) => (
          <li key={d.id}>
            <b>{d.title}</b> · {d.licence} · <A href={d.source.url}>{d.source.label}</A>
          </li>
        ))}
        <li>
          <b>Demo shop</b> · made up for Quaera Lab, Apache-2.0 with the code
        </li>
      </ul>
      <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
        Keyboard shortcuts and the layout follow desktop SQL tools such as SSMS and Azure Data Studio; Quaera Lab is not affiliated with Microsoft or DuckDB Labs.
      </p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <p>
        <b>Your data stays in this browser.</b> Files you add, your tables, queries, tabs and history are kept on this device only: the database in the browser’s private storage
        (OPFS; PostgreSQL mode in IndexedDB), the rest in its local storage. Quaera Lab has no server that receives them, no accounts and no cookies.
      </p>
      <p className="font-semibold">What does go over the network</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          The site’s own files: the page, the database engines and the sample datasets you load, from GitHub Pages behind Cloudflare. Like any web host, they see the requests
          (your IP address, browser, the files asked for), not your data.
        </li>
        <li>
          On lab.quaera.app, <b>Cloudflare Web Analytics</b> counts visits without cookies: the page, the site you came from, browser and country.
        </li>
        <li>
          A copy of Quaera Lab run without the site’s database extensions (a developer’s checkout) fetches them from extensions.duckdb.org; lab.quaera.app serves its own.
        </li>
        <li>
          <b>Share</b> links and <b>Show as model ↗</b> carry queries and table definitions in the part of the address after #, which browsers don’t send to servers. Anyone you
          give a link to can read what is in it.
        </li>
      </ul>
      <p className="font-semibold">Keep a copy</p>
      <p>
        Clearing this site’s data in the browser (or “Clear browsing data” with site data) deletes your tables and queries, and nobody can bring them back.{' '}
        <b>File → Download database (.duckdb)</b> saves everything to a file; <b>Restore from a backup…</b> loads it again, here or in another browser.
      </p>
    </>
  )
}
