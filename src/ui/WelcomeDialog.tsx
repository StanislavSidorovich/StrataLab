// The welcome screen: what Quaera Lab is, three ways to start, and where things are on the page.
// Shown once on a first visit (not to someone arriving with a model or a dataset link: they came
// for that), and again from the “?” button in the header.
import { useState } from 'react'
import { Database, Download, FileUp, HelpCircle, Library, Play, Store, X } from 'lucide-react'
import { closeWelcome, enqueueFiles, loadDemo, openAndRun, openCatalog, ownTables, useLab } from './store'
import { ACCEPT } from './Sidebar'
import { DEMO_TABLES, WELCOME_SQL } from '../data/demo'
import { installApp } from '../pwa/register'

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = ACCEPT
  input.onchange = () => void enqueueFiles([...(input.files ?? [])])
  input.click()
}

const PLACES: [string, string, string][] = [
  ['Left', 'Object tree', 'Your tables, the demo shop and loaded datasets. Paste a table copied in Excel (Ctrl+V outside the editor). Click a table to see its columns, double-click for its first 100 rows; the ⋯ menu profiles, exports, renames, adds rows from a file or generates sample rows.'],
  ['Top', 'Query tabs', 'Each tab speaks DuckDB, SQL Server (T-SQL) or PostgreSQL: the switch is above the editor. Write SQL here, with completion of table and column names. Ctrl+Enter or F5 runs the selection, or the whole tab when nothing is selected. Tabs are kept between visits; double-click a tab to rename it. The buttons at the editor’s right undo, redo, comment lines, format the SQL and find.'],
  ['Bottom', 'Result and Messages', 'The result grid shows each column’s type. Copy pastes straight into Excel; CSV and Excel download the result. Messages lists every query and import with its time.'],
  ['Header', 'Open, Save, Run and the engine', 'Open and Save read and write .sql files (Ctrl+O, Ctrl+S). While a query runs, Run becomes Stop (Esc in the editor). “DuckDB · saved in this browser” means your tables survive a reload. Nothing is uploaded: the database lives in this browser only.'],
]

export function WelcomeDialog() {
  const open = useLab((s) => s.welcomeOpen)
  const ready = useLab((s) => s.engine.status === 'ready')
  const hasDemo = useLab((s) => DEMO_TABLES.every((n) => ownTables(s.tables).some((t) => t.name === n)))
  const [installNote, setInstallNote] = useState<string | null>(null)
  if (!open) return null

  const tryDemo = async () => {
    if (!hasDemo) await loadDemo()
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
            <h2 className="font-semibold mb-2">Start in one of three ways</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StartCard
                icon={<Store size={18} />}
                title="Try the demo shop"
                text={`${hasDemo ? 'Already here' : 'Four tables'}: customers, products, orders, order_items. Made-up data (200 customers, 1,500 orders), the same for everyone, so answers can be compared.`}
                action={hasDemo ? 'Run the first query' : 'Load it and run a query'}
                actionIcon={<Play size={13} />}
                onClick={start(() => void tryDemo())}
                disabled={!ready}
              />
              <StartCard
                icon={<Library size={18} />}
                title="Load a sample database"
                text="Chinook, Northwind, AdventureWorks, Sakila and Kaiyo Trading: the databases SQL tutorials use, with their keys, in one click."
                action="Open the catalog"
                onClick={start(() => openCatalog())}
                disabled={!ready}
              />
              <StartCard
                icon={<FileUp size={18} />}
                title="Bring your own file"
                text="CSV, Excel, Parquet or JSON. Drop it anywhere on the page: you see a preview with types, then it becomes a table."
                action="Choose a file…"
                onClick={start(pickFiles)}
                disabled={!ready}
              />
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Where things are</h2>
            <dl className="grid gap-2">
              {PLACES.map(([where, what, how]) => (
                <div key={what} className="flex gap-3 rounded-lg p-2.5" style={{ background: 'var(--panel-2)' }}>
                  <dt className="shrink-0 w-28">
                    <div className="font-semibold">{what}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{where}</div>
                  </dt>
                  <dd>{how}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section style={{ color: 'var(--muted)' }} className="space-y-1">
            <p>
              <b style={{ color: 'var(--text)' }}>Coming from SQL Server or PostgreSQL?</b> Above the editor, switch a tab to <b>SQL Server (T-SQL)</b>: your T-SQL is
              translated to DuckDB before it runs, and you see both side by side. <b>PostgreSQL</b> runs on a real PostgreSQL in this browser; copy tables into it from a
              table's ⋯ menu.
            </p>
            <p>
              <b style={{ color: 'var(--text)' }}>Show as model ↗</b> (above the tables) opens them as an entity–relationship model in{' '}
              <a className="underline" href="https://model.quaera.app" target="_blank" rel="noreferrer">model.quaera.app</a>.
            </p>
          </section>
        </div>

        <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
            <HelpCircle size={13} /> This guide is under the ? button at the top right.
          </span>
          <div className="flex-1" />
          {installNote && (
            <span style={{ color: 'var(--muted)', fontSize: 12 }} className="max-w-xs text-right">
              {installNote}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => void installApp().then(setInstallNote)} title="Open Quaera Lab in its own window, from the home screen or the app list">
            <Download size={14} /> Install as app
          </button>
          <button className="btn btn-primary" onClick={closeWelcome}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function StartCard(props: { icon: React.ReactNode; title: string; text: string; action: string; actionIcon?: React.ReactNode; onClick: () => void; disabled: boolean }) {
  const { icon, title, text, action, actionIcon, onClick, disabled } = props
  return (
    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ border: '1px solid var(--line)', background: 'var(--panel-2)' }}>
      <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--accent)' }}>
        {icon} <span style={{ color: 'var(--text)' }}>{title}</span>
      </div>
      <p className="flex-1">{text}</p>
      <button className="btn justify-center" onClick={onClick} disabled={disabled}>
        {actionIcon} {action}
      </button>
    </div>
  )
}
