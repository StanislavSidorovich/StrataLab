// Rules for the editor's Open / Save (.sql files; .py and .ipynb for Python tabs) and for
// pasting a table copied from Excel.

/** A tab's title from a file name: "Monthly report.sql" → "Monthly report". */
export function tabTitleFromFile(fileName: string): string {
  return fileName.replace(/\.(sql|txt|py|ipynb)$/i, '').trim() || 'Query'
}

/** A file name for a tab: characters Windows and macOS refuse become "_"; always ends in `.ext`. */
export function tabFileName(title: string, ext: 'sql' | 'py' | 'ipynb'): string {
  const base = title
    .replace(/\.(sql|py|ipynb)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  return `${base || (ext === 'sql' ? 'query' : 'notebook')}.${ext}`
}

/** A file name for an SQL tab, ending in .sql. */
export const sqlFileName = (title: string) => tabFileName(title, 'sql')

/** Files that open as a query tab when picked or dropped, instead of being imported as data. */
export function isSqlFile(fileName: string): boolean {
  return /\.sql$/i.test(fileName)
}

/** Files that open as a Python tab: a script (cells as `# %%`) or a Jupyter notebook. */
export function pythonFileKind(fileName: string): 'py' | 'ipynb' | null {
  const m = /\.(py|ipynb)$/i.exec(fileName)
  return m ? (m[1].toLowerCase() as 'py' | 'ipynb') : null
}

/** Files that open as a tab rather than being imported as data. */
export const opensAsTab = (fileName: string) => isSqlFile(fileName) || pythonFileKind(fileName) !== null

/**
 * Whether pasted text is a table (cells copied from Excel, Google Sheets or a web page come
 * as tab-separated lines): at least two lines (a header and a row), and the first two lines
 * have the same number of tabs, at least one. Tabs inside "quoted" cells are not counted.
 */
export function looksLikeTable(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length < 2) return false
  const tabs = (line: string) => line.replace(/"[^"]*"/g, '').split('\t').length - 1
  const first = tabs(lines[0])
  return first > 0 && tabs(lines[1]) === first
}
