// Open and Save .sql files (Ctrl+O, Ctrl+S), as in SSMS. Where the browser can write to a
// file the user picked (Chrome, Edge: File System Access API), Save writes back to the same
// file; elsewhere Open reads a copy and Save downloads the tab as a .sql file.
import { addTab, renameTab, useLab } from './store'
import { sqlFileName, tabTitleFromFile } from '../core/editorFiles'

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

const TYPES = [{ description: 'SQL script', accept: { 'text/plain': ['.sql'] } }]

/** The file each tab was opened from or saved to (this visit only: handles aren't kept). */
const handles = new Map<string, SqlFileHandle>()

const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Opens .sql files, each in a new tab named after it. */
export async function openSqlFile() {
  if (window.showOpenFilePicker) {
    try {
      for (const h of await window.showOpenFilePicker({ types: TYPES, multiple: true })) openSqlText(h.name, await (await h.getFile()).text(), h)
    } catch (e) {
      if (!aborted(e)) useLab.setState({ importError: `Could not open the file: ${String(e instanceof Error ? e.message : e)}` })
    }
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sql,.txt'
  input.multiple = true
  input.onchange = () => void openSqlFiles([...(input.files ?? [])])
  input.click()
}

/** .sql files picked or dropped: each in a new tab. */
export async function openSqlFiles(files: File[]) {
  for (const f of files) openSqlText(f.name, await f.text())
}

function openSqlText(fileName: string, text: string, handle?: SqlFileHandle) {
  const id = addTab(text, tabTitleFromFile(fileName))
  if (handle) handles.set(id, handle)
}

/**
 * Saves the active tab. To the file it came from when there is one (and not `saveAs`), else to a
 * file the user picks (the tab takes its name), else as a download. False if cancelled.
 */
export async function saveSqlFile(saveAs = false): Promise<boolean> {
  const s = useLab.getState()
  const tab = s.tabs.find((t) => t.id === s.activeTab)
  if (!tab) return false
  try {
    let handle = saveAs ? undefined : handles.get(tab.id)
    if (!handle && window.showSaveFilePicker) {
      handle = await window.showSaveFilePicker({ types: TYPES, suggestedName: sqlFileName(tab.title) })
      handles.set(tab.id, handle)
      renameTab(tab.id, tabTitleFromFile(handle.name))
    }
    if (handle) {
      const w = await handle.createWritable()
      await w.write(tab.sql)
      await w.close()
      return true
    }
    download(sqlFileName(tab.title), tab.sql)
    return true
  } catch (e) {
    if (!aborted(e)) useLab.setState({ importError: `Could not save the file: ${String(e instanceof Error ? e.message : e)}` })
    return false
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/sql;charset=utf-8' }))
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
