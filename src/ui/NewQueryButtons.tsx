// "New SQL query" and "New Python notebook" side by side, wherever a dataset can be queried
// (catalog cards, a dataset's guide): Python is one of the two ways in, not hidden behind SQL.
import { Database, SquareTerminal } from 'lucide-react'

/** `load`: the dataset isn't loaded yet; either button loads it first. */
/** `primary`: the SQL button is the card's main one (not where something else already is). */
export function NewQueryButtons({ onSql, onPython, load = false, what = 'this dataset', primary = true }: { onSql: () => void; onPython: () => void; load?: boolean; what?: string; primary?: boolean }) {
  const first = load ? `Loads ${what}, then opens ` : 'Opens '
  return (
    <>
      <button className={primary ? 'btn btn-primary' : 'btn'} onClick={onSql} title={`${first}a new SQL tab on ${what}`}>
        <Database size={14} /> {load ? 'Load · SQL' : 'SQL query'}
      </button>
      <button className="btn" onClick={onPython} title={`${first}a new Python tab: lab.table(…) gives a table as a pandas DataFrame`}>
        <SquareTerminal size={14} style={{ color: 'var(--py)' }} /> {load ? 'Load · Python' : 'Python notebook'}
      </button>
    </>
  )
}
