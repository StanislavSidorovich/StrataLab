// Rules for the editor's Open / Save (.sql files) and for pasting a table copied from Excel.

/** A tab's title from a file name: "Monthly report.sql" → "Monthly report". */
export function tabTitleFromFile(fileName: string): string {
  return fileName.replace(/\.(sql|txt)$/i, '').trim() || 'Query'
}

/** A file name for a tab: characters Windows and macOS refuse become "_"; always ends in .sql. */
export function sqlFileName(title: string): string {
  const base = title
    .replace(/\.sql$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  return `${base || 'query'}.sql`
}

/** Files that open as a query tab when picked or dropped, instead of being imported as data. */
export function isSqlFile(fileName: string): boolean {
  return /\.sql$/i.test(fileName)
}

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
