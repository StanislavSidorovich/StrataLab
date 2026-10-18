// Python tabs as Jupyter notebooks (stage 7): a tab's `# %%` cells, with the outputs of their last
// run, to an .ipynb (nbformat 4.5) that runs in Jupyter or Colab, and an .ipynb back to a tab.
// Outputs already have Jupyter's shape (src/python/lab.py makes them), so they go in unchanged.
import { joinCells, type Cell } from './pyCells'

/** Jupyter's MIME bundle: Lab shows text/plain and image/png (base64), never the HTML. */
export interface MimeBundle {
  'text/plain'?: string
  'text/html'?: string
  'image/png'?: string
}

export type Output =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { output_type: 'execute_result'; execution_count: number; data: MimeBundle; metadata: Record<string, unknown> }
  | { output_type: 'display_data'; data: MimeBundle; metadata: Record<string, unknown> }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

/** A cell's last run: its number ([1], [2] … in this Python session) and what it showed. */
export interface CellRun {
  count: number
  outputs: Output[]
}

/** The tag on the setup cell, which Open leaves out. */
export const SETUP_TAG = 'quaera-lab-setup'

/** Where an exported notebook reads the catalog datasets from. */
export const LAB_URL = 'https://lab.quaera.app/'

/** A catalog dataset a notebook reads: its schema and its tables' Parquet files. */
export interface NotebookDataset {
  id: string
  tables: { name: string; file: string }[]
}

/** The catalog datasets a tab's code names (`quaera.fact_sellout`, `"chinook".Track`). */
export function datasetsUsed<T extends { id: string }>(code: string, datasets: T[]): T[] {
  return datasets.filter((d) => new RegExp(`(^|[^\\w."])"?${d.id}"?\\s*\\.\\s*["\\w]`, 'i').test(code))
}

const pyString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * The first cell of an exported notebook: `lab` for Jupyter and Colab, on DuckDB, with the same
 * calls as in Lab. The sample datasets the notebook uses are read from lab.quaera.app; the user's
 * own tables from `<name>.parquet` files next to the notebook.
 */
export function setupSource(datasets: NotebookDataset[], base = LAB_URL): string {
  const ds = datasets
    .map((d) => `    ${pyString(d.id)}: {${d.tables.map((t) => `${pyString(t.name)}: ${pyString(t.file)}`).join(', ')}},`)
    .join('\n')
  return `# Quaera Lab (lab.quaera.app): this cell gives the notebook \`lab\` outside Lab, in Jupyter or Colab.
# lab.table("name"), lab.sql("SELECT …") and lab.save(df, "name") work as in Lab, on DuckDB.
# Sample datasets are read from lab.quaera.app; your own tables from <name>.parquet files next to
# this notebook (in Lab: the table's ⋯ menu → Export → Parquet). Needs duckdb: pip install duckdb
import pathlib
import duckdb

LAB_DATASETS = {
${ds}
}


class Lab:
    def __init__(self, base=${pyString(base)}):
        self.con = duckdb.connect()
        for schema, tables in LAB_DATASETS.items():
            self.con.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            for name, file in tables.items():
                url = f"{base}datasets/{schema}/{file}"
                self.con.execute(f'CREATE VIEW "{schema}"."{name}" AS SELECT * FROM read_parquet(\\'{url}\\')')
        for f in sorted(pathlib.Path(".").glob("*.parquet")):
            path = f.as_posix().replace("'", "''")
            self.con.execute(f'CREATE VIEW "{f.stem}" AS SELECT * FROM read_parquet(\\'{path}\\')')

    def table(self, name):
        return self.con.table(name).df()

    def sql(self, query):
        return self.con.sql(query).df()

    def save(self, df, name):
        self.con.register("_lab_df", df)
        self.con.execute(f'CREATE OR REPLACE TABLE "{name}" AS SELECT * FROM _lab_df')
        self.con.unregister("_lab_df")

    def tables(self):
        rows = self.con.sql("SELECT schema_name, table_name FROM duckdb_tables() UNION ALL SELECT schema_name, view_name FROM duckdb_views() WHERE NOT internal ORDER BY 1, 2").fetchall()
        return [n if s == "main" else f"{s}.{n}" for s, n in rows]


lab = Lab()
`
}

/** Text as Jupyter stores it: lines, each but the last ending in a newline. */
const lines = (text: string): string[] => {
  const out = text.split('\n').map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l))
  return out[out.length - 1] === '' ? out.slice(0, -1) : out
}

function outputJson(o: Output): unknown {
  if (o.output_type === 'stream') return { ...o, text: lines(o.text) }
  if (o.output_type === 'error') return o
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o.data)) if (v != null) data[k] = k === 'image/png' ? v : lines(v)
  return { ...o, data }
}

export interface NotebookInput {
  cells: Pick<Cell, 'kind' | 'source'>[]
  /** per cell, its last run (code cells only) */
  runs: (CellRun | null | undefined)[]
  datasets: NotebookDataset[]
}

/** The notebook's JSON, as Jupyter writes it (one-space indent, a newline at the end). */
export function toNotebook({ cells, runs, datasets }: NotebookInput): string {
  const setup = { cell_type: 'code', id: 'lab-setup', metadata: { tags: [SETUP_TAG] }, execution_count: null, source: lines(setupSource(datasets)), outputs: [] }
  const body = cells.map((c, i) => {
    const id = `lab-${i + 1}`
    if (c.kind === 'markdown') return { cell_type: 'markdown', id, metadata: {}, source: lines(c.source) }
    const run = runs[i]
    return { cell_type: 'code', id, metadata: {}, execution_count: run?.count ?? null, source: lines(c.source), outputs: (run?.outputs ?? []).map(outputJson) }
  })
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python' },
    },
    cells: [setup, ...body],
  }
  return JSON.stringify(nb, null, 1) + '\n'
}

export interface OpenedNotebook {
  /** the tab's text: the cells with `# %%` lines */
  text: string
  cells: number
  /** what was left out or changed, in plain words */
  notes: string[]
}

const textOf = (source: unknown): string => (Array.isArray(source) ? source.join('') : typeof source === 'string' ? source : '')

/** An .ipynb as a Python tab's text. Throws with a plain message when the file is not a notebook. */
export function fromNotebook(json: string): OpenedNotebook {
  let nb: { nbformat?: unknown; cells?: unknown; metadata?: { kernelspec?: { language?: unknown }; language_info?: { name?: unknown } } }
  try {
    nb = JSON.parse(json)
  } catch {
    throw new Error('This file is not a Jupyter notebook (it is not JSON).')
  }
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.cells)) throw new Error('This file is not a Jupyter notebook (it has no cells).')
  if (nb.nbformat !== 4) throw new Error(`This notebook is in an old format (nbformat ${String(nb.nbformat)}); open and save it in Jupyter first to update it.`)
  const notes: string[] = []
  const language = String(nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? 'python').toLowerCase()
  if (language !== 'python') notes.push(`The notebook is written for ${language}, not Python: its code may not run here.`)
  const cells: { kind: Cell['kind']; source: string }[] = []
  let setup = 0
  let raw = 0
  let outputs = false
  for (const c of nb.cells as { cell_type?: unknown; source?: unknown; metadata?: { tags?: unknown }; outputs?: unknown }[]) {
    if (!c || typeof c !== 'object') continue
    const tags = Array.isArray(c.metadata?.tags) ? c.metadata.tags : []
    if (tags.includes(SETUP_TAG)) {
      setup++
      continue
    }
    const source = textOf(c.source).replace(/\s+$/, '')
    if (Array.isArray(c.outputs) && c.outputs.length) outputs = true
    if (c.cell_type === 'code') cells.push({ kind: 'code', source })
    else if (c.cell_type === 'markdown') cells.push({ kind: 'markdown', source })
    else if (c.cell_type === 'raw') {
      raw++
      cells.push({ kind: 'markdown', source })
    }
  }
  if (setup) notes.push('The Quaera Lab setup cell was left out: in Lab, `lab` is already there.')
  if (raw) notes.push(`${raw} raw cell(s) became text cells.`)
  if (outputs) notes.push('Outputs saved in the notebook are not shown: run the cells to see them.')
  return { text: cells.length ? joinCells(cells) : '# %%\n', cells: cells.length, notes }
}
