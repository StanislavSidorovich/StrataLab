// Open and Save .sql files (Ctrl+O, Ctrl+S), as in SSMS. Where the browser can write to a
// file the user picked (Chrome, Edge: File System Access API), Save writes back to the same
// file; elsewhere Open reads a copy and Save downloads the tab as a .sql file. Python tabs
// (stage 7) open from and save to .py (cells as `# %%`) and Jupyter notebooks (.ipynb).
import { addTab, renameTab, tabDialect, useLab, type QueryTab } from './store'
import { pythonFileKind, tabFileName, tabTitleFromFile } from '../core/editorFiles'
import { datasetsUsed, fromNotebook, toNotebook } from '../core/ipynb'
import { splitCells } from '../core/pyCells'
import { DATASETS } from '../data/datasets'

// Not in TypeScript's DOM library yet.
interface WritableFile {
  write(data: string): Promise<void>
  close(): Promise<void>
}
interface SqlFileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableFile>
}
interface PickerOptions {
  types: { description: string; accept: Record<string, string[]> }[]
  suggestedName?: string
}
declare global {
  interface Window {
    showOpenFilePicker?: (o: PickerOptions & { multiple?: boolean }) => Promise<SqlFileHandle[]>
    showSaveFilePicker?: (o: PickerOptions) => Promise<SqlFileHandle>
  }
}

const SQL_TYPE = { description: 'SQL script', accept: { 'text/plain': ['.sql'] } }
const PY_TYPE = { description: 'Python script (cells as # %%)', accept: { 'text/x-python': ['.py'] } }
const NOTEBOOK_TYPE = { description: 'Jupyter notebook', accept: { 'application/x-ipynb+json': ['.ipynb'] } }
const OPEN_TYPES = [{ description: 'SQL, Python or a notebook', accept: { 'text/plain': ['.sql', '.py', '.ipynb'] } }]

/** The file each tab was opened from or saved to (this visit only: handles aren't kept). */
const handles = new Map<string, SqlFileHandle>()

const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Opens .sql files, each in a new tab named after it. */
export async function openSqlFile() {
  if (window.showOpenFilePicker) {
    try {
      for (const h of await window.showOpenFilePicker({ types: OPEN_TYPES, multiple: true })) openSqlText(h.name, await (await h.getFile()).text(), h)
    } catch (e) {
      if (!aborted(e)) useLab.setState({ importError: `Could not open the file: ${String(e instanceof Error ? e.message : e)}` })
    }
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sql,.txt,.py,.ipynb'
  input.multiple = true
  input.onchange = () => void openSqlFiles([...(input.files ?? [])])
  input.click()
}

/** .sql files picked or dropped: each in a new tab. */
export async function openSqlFiles(files: File[]) {
  for (const f of files) openSqlText(f.name, await f.text())
}

function openSqlText(fileName: string, text: string, handle?: SqlFileHandle) {
  const kind = pythonFileKind(fileName)
  let id: string
  if (kind === 'ipynb') {
    let nb: ReturnType<typeof fromNotebook>
    try {
      nb = fromNotebook(text)
    } catch (e) {
      useLab.setState({ importError: `Could not open ${fileName}: ${String(e instanceof Error ? e.message : e)}` })
      return
    }
    id = addTab(nb.text, tabTitleFromFile(fileName), 'python')
    useLab.setState({ notice: [`${fileName}: ${nb.cells} cell${nb.cells === 1 ? '' : 's'} opened as a Python tab.`, ...nb.notes].join(' ') })
  } else id = addTab(text, tabTitleFromFile(fileName), kind === 'py' ? 'python' : undefined)
  if (handle) handles.set(id, handle)
}

/** A Python tab as a Jupyter notebook: its cells, the outputs of their last run, and the setup cell. */
export function notebookText(tab: QueryTab): string {
  const cells = splitCells(tab.sql)
  const runs = useLab.getState().cellRuns[tab.id] ?? {}
  return toNotebook({
    cells,
    runs: cells.map((c) => (c.kind === 'code' ? runs[c.source] : null)),
    datasets: datasetsUsed(tab.sql, DATASETS).map((d) => ({ id: d.id, tables: d.tables.map((t) => ({ name: t.name, file: t.file })) })),
  })
}

/** File → Download as notebook: the active Python tab as an .ipynb. */
export function downloadNotebook() {
  const s = useLab.getState()
  const tab = s.tabs.find((t) => t.id === s.activeTab)
  if (!tab || tabDialect(tab) !== 'python') return
  download(tabFileName(tab.title, 'ipynb'), notebookText(tab), 'application/x-ipynb+json')
}

/** What Save writes: the tab's text, or a notebook when the file is an .ipynb. */
const fileText = (tab: QueryTab, fileName: string) => (pythonFileKind(fileName) === 'ipynb' ? notebookText(tab) : tab.sql)

/**
 * Saves the active tab. To the file it came from when there is one (and not `saveAs`), else to a
 * file the user picks (the tab takes its name), else as a download. False if cancelled.
 */
export async function saveSqlFile(saveAs = false): Promise<boolean> {
  const s = useLab.getState()
  const tab = s.tabs.find((t) => t.id === s.activeTab)
  if (!tab) return false
  try {
    const python = tabDialect(tab) === 'python'
    let handle = saveAs ? undefined : handles.get(tab.id)
    if (!handle && window.showSaveFilePicker) {
      handle = await window.showSaveFilePicker({ types: python ? [PY_TYPE, NOTEBOOK_TYPE] : [SQL_TYPE], suggestedName: tabFileName(tab.title, python ? 'py' : 'sql') })
      handles.set(tab.id, handle)
      renameTab(tab.id, tabTitleFromFile(handle.name))
    }
    if (handle) {
      const w = await handle.createWritable()
      await w.write(fileText(tab, handle.name))
      await w.close()
      return true
    }
    download(tabFileName(tab.title, python ? 'py' : 'sql'), tab.sql, python ? 'text/x-python' : 'application/sql')
    return true
  } catch (e) {
    if (!aborted(e)) useLab.setState({ importError: `Could not save the file: ${String(e instanceof Error ? e.message : e)}` })
    return false
  }
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Forgets a closed tab's file. */
export function forgetFile(tabId: string) {
  handles.delete(tabId)
}
