// The welcome screen: what Quaera Lab is, three ways to start, and where things are on the page.
// Shown once on a first visit (not to someone arriving with a model or a dataset link: they came
// for that), and again from the Help (?) menu in the header.
import { useState } from 'react'
import { Database, Download, FileUp, HelpCircle, Library, Play, Store, X } from 'lucide-react'
import { closeWelcome, enqueueFiles, hasDemoTables, openAndRun, openCatalog, showDemo, useLab } from './store'
import { ACCEPT } from './Sidebar'
import { AuthorLinks } from './AuthorLinks'
import { WELCOME_SQL } from '../data/demo'
import { installApp } from '../pwa/register'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** The keys, as in SSMS and Azure Data Studio where the browser lets us. */
const KEYS: [string, string][] = [
  [`${mod}Enter · F5`, 'Run the selection, or the whole tab'],
  ['Esc', 'Stop the running query (in the editor)'],
  [`${mod}O`, 'Open a .sql, .py or .ipynb file'],
  [`${mod}S · ${isMac ? '⇧⌘S' : 'Ctrl+Shift+S'}`, 'Save the tab (.sql; a Python tab as .py or .ipynb) · save as'],
  [isMac ? '⇧⌥F' : 'Shift+Alt+F', 'Format SQL'],
  ['Shift+Enter', 'Python tab: run the cell at the cursor'],
  [`${mod}/`, 'Comment or uncomment the lines'],
  [`${mod}F`, 'Find and replace'],
  [`${mod}Z · ${isMac ? '⇧⌘Z' : 'Ctrl+Y'}`, 'Undo · redo'],
  ['Ctrl+Space', 'Complete a table or column name'],
  [`${mod}V`, 'Outside the editor: make a table of cells copied from Excel'],
  [isMac ? '⌥⇧T' : 'Alt+Shift+T', 'Reopen the last closed tab'],
]

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = ACCEPT
  input.onchange = () => void enqueueFiles([...(input.files ?? [])])
  input.click()
}

/** The four parts of the page in a line each; the long version is under "More about each part". */
const SHORT: [string, string][] = [
  ['Left', 'Your tables and sample datasets; click one for its columns, double-click for its rows.'],
  ['Top', 'Query tabs: SQL or Python. The SQL button beside Run picks the dialect.'],
  ['Bottom', 'Results, Chart, Messages and History; Export and Save as table.'],
  ['Header', 'File: open and save, add CSV / Excel, Share link, backup.'],
]

const PLACES: [string, string, string][] = [
  ['Left', 'Object tree', 'Your tables, the demo shop and loaded datasets; the box above them finds a table or a column. Paste a table copied in Excel (Ctrl+V outside the editor). Click a table to see its columns, double-click for its first 100 rows; its ⋯ menu profiles, exports, renames, adds rows from a file or generates sample rows. The ⋯ next to TABLES downloads the whole database as one file and restores it: keep a copy before clearing the browser.'],
  ['Top', 'Query tabs', 'A tab is SQL or Python (+ opens New SQL query / New Python notebook, as do a table’s or a dataset’s ⋯ menu; the icon and the top stripe of a tab tell which). The SQL button above the editor, next to Run, says how the SQL is written: DuckDB, or T-SQL or PostgreSQL (its Compare dialects… shows the same task in each, and in pandas) (while a query runs, Run becomes Stop; Esc in the editor stops it too). Write SQL here, with completion of table and column names. Ctrl+Enter or F5 runs the selection, or the whole tab when nothing is selected. Explain, next to Run, shows how the database runs the query: its steps, the rows at each step and where the time goes, with a plain-words note on each step (a query that would change data is only planned, not run). Tabs are kept between visits; double-click a tab to rename it, right-click it to duplicate, close others or reopen a closed one. Right-click the editor for Run, Explain, Format, Cut / Copy / Paste and more (Shift + right-click gives the browser’s own menu). The buttons at the editor’s right undo, redo, comment lines, format the SQL and find.'],
  ['Bottom', 'Result, Chart, Plan, Messages and History', 'The result grid shows each column’s type and up to 10,000 rows (a note offers more when the query returned more); Chart draws it, Plan shows the last Explain. Copy pastes straight into Excel (right-click a cell for one value, a row or a column); Export downloads CSV, Excel, JSON or Parquet; Save as table keeps the result as a new table. In a Python tab, Output shows every cell’s output in one column, each DataFrame as a small table of its first rows, and DataFrame shows one on the whole pane: the last, or the one you open from Output with “Open in DataFrame view”. Messages lists every query and import of this visit with its time; History keeps the queries you ran between visits (search it, click one to open it in a new tab).'],
  ['Header', 'The File menu and the engine', 'File opens and saves .sql files, and .py or .ipynb for Python tabs (Ctrl+O, Ctrl+S), adds CSV / Excel or a pasted table, opens the sample datasets, makes a Share link with the queries and the datasets they use, and downloads or restores the whole database. “DuckDB · saved in this browser” means your tables survive a reload. Nothing is uploaded: the database lives in this browser only.'],
]

export function WelcomeDialog() {
  const open = useLab((s) => s.welcomeOpen)
  const ready = useLab((s) => s.engine.status === 'ready')
  const hasDemo = useLab((s) => hasDemoTables(s.tables))
  const [installNote, setInstallNote] = useState<string | null>(null)
  if (!open) return null

  const tryDemo = async () => {
    await showDemo()
    openAndRun(WELCOME_SQL, 'Demo shop')
  }

  const start = (fn: () => void) => () => {
    closeWelcome()
    fn()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,14,20,0.55)' }} onMouseDown={(e) => e.target === e.currentTarget && closeWelcome()}>
      <div role="dialog" aria-label="Welcome to Quaera Lab" className="w-full max-w-3xl max-h-full flex flex-col rounded-xl shadow-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Database size={22} style={{ color: 'var(--accent)' }} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[16px]">Welcome to Quaera Lab</div>
            <div style={{ color: 'var(--muted)' }}>
              A SQL workbench in your browser: query CSV and Excel files or sample databases with SQL. Nothing to install, and your files never leave this device.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeWelcome} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto min-h-0 px-5 py-4 space-y-5">
          <section>
            <h2 className="font-semibold mb-2">Start here</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StartCard
                icon={<Store size={18} />}
                title="Try the demo shop"
                text={`${hasDemo ? 'Already here' : 'Four tables'}: demo.customers, demo.products, demo.orders, demo.order_items. Made-up data, the same for everyone.`}
                action={hasDemo ? 'Run the first query' : 'Load it and run a query'}
                actionIcon={<Play size={13} />}
                onClick={start(() => void tryDemo())}
                disabled={!ready}
                primary
              />
              <StartCard
                icon={<Library size={18} />}
                title="Load a sample database"
                text="Chinook, Northwind, AdventureWorks, Sakila, Kaiyo Trading: in one click."
                action="Open the catalog"
                onClick={start(() => openCatalog())}
                disabled={!ready}
              />
              <StartCard
                icon={<FileUp size={18} />}
                title="Bring your own file"
                text="CSV, Excel, Parquet or JSON. Drop it anywhere on the page."
                action="Choose a file…"
                onClick={start(pickFiles)}
                disabled={!ready}
              />
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Where things are</h2>
            <dl className="grid gap-1.5">
              {SHORT.map(([where, what]) => (
                <div key={where} className="flex gap-3">
                  <dt className="shrink-0 w-16 font-semibold">{where}</dt>
                  <dd style={{ color: 'var(--muted)' }}>{what}</dd>
                </div>
              ))}
            </dl>
          </section>

          <details>
            <summary className="cursor-pointer font-semibold">More about each part and the keyboard shortcuts</summary>
            <dl className="grid gap-2 mt-2">
              {PLACES.map(([where, what, how]) => (
                <div key={what} className="rounded-lg p-2.5 sm:flex gap-3" style={{ background: 'var(--panel-2)' }}>
                  <dt className="shrink-0 sm:w-28">
                    <div className="font-semibold">{what}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{where}</div>
                  </dt>
                  <dd>{how}</dd>
                </div>
              ))}
            </dl>
            <h2 className="font-semibold mt-4 mb-2">Keyboard shortcuts</h2>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2" style={{ fontSize: 12.5 }}>
              {KEYS.map(([keys, what]) => (
                <div key={keys} className="flex gap-3">
                  <dt className="shrink-0 w-40 flex flex-wrap items-start gap-1">
                    {keys.split(' · ').map((k) => (
                      <kbd key={k} className="mono px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', fontSize: 11.5 }}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </details>

          <details style={{ color: 'var(--muted)' }}>
          <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text)' }}>SQL Server, PostgreSQL, Python and Model</summary>
          <section className="space-y-1 mt-2">
            <p>
              <b style={{ color: 'var(--text)' }}>Coming from SQL Server or PostgreSQL?</b> Above the editor, press the <b>SQL · DuckDB</b> button and under <b>Write as…</b> pick <b>T-SQL (SQL Server)</b>: your T-SQL is
              translated to DuckDB before it runs, and you see both side by side. <b>PostgreSQL</b> (same menu) runs on a real PostgreSQL in this browser; copy tables into it from a
              table's ⋯ menu.
            </p>
            <p>
              <b style={{ color: 'var(--text)' }}>Prefer Python?</b> Open a <b>New Python notebook</b> (the + beside the tabs, File, or a table’s ⋯ menu): pandas, matplotlib and seaborn over the same tables, with{' '}
              <code className="mono">lab.table("demo.orders")</code> and <code className="mono">lab.sql("SELECT …")</code>. A cell is everything up to the next <code className="mono"># %%</code> line (not up to a semicolon): the bar over each cell has Run cell and Run below, + Cell adds a boundary; Run all (Ctrl+Enter) runs every cell, Run cell (Shift+Enter) the one at the cursor. The first run
              downloads Python (about 20 MB, once, with a progress bar); File → Download as notebook takes the tab to Jupyter or Colab. If Python won’t start and a download manager such as IDM popped up, add lab.quaera.app to its exceptions and press Retry.
            </p>
            <p>
              <b style={{ color: 'var(--text)' }}>Show as model ↗</b> (above the tables) opens them as an entity–relationship model in{' '}
              <a className="underline" href="https://model.quaera.app" target="_blank" rel="noreferrer">model.quaera.app</a>.
            </p>
          </section>
          </details>
          <AuthorLinks className="mt-3" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
            <HelpCircle size={13} className="shrink-0" /> This guide is under the ? button at the top right.
          </span>
          <div className="flex-1 hidden sm:block" />
          {installNote && (
            <span style={{ color: 'var(--muted)', fontSize: 12 }} className="max-w-xs text-right">
              {installNote}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => void installApp().then(setInstallNote)} title="Open Quaera Lab in its own window, from the home screen or the app list">
            <Download size={14} /> Install as app
          </button>
          <button className="btn" onClick={closeWelcome}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function StartCard(props: { icon: React.ReactNode; title: string; text: string; action: string; actionIcon?: React.ReactNode; onClick: () => void; disabled: boolean; primary?: boolean }) {
  const { icon, title, text, action, actionIcon, onClick, disabled, primary } = props
  return (
    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel-2)' }}>
      <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--accent)' }}>
        {icon} <span style={{ color: 'var(--text)' }}>{title}</span>
      </div>
      <p className="flex-1">{text}</p>
      <button className={`btn justify-center${primary ? ' btn-primary' : ''}`} onClick={onClick} disabled={disabled}>
        {actionIcon} {action}
      </button>
    </div>
  )
}
