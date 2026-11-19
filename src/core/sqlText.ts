// A .sql file as text. SQL Server tools (SSMS, PowerDesigner) often save in the Windows code page, not UTF-8,
// and `File.text()` reads every file as UTF-8: an accent then turns into “�” and the script runs with wrong data.
// UTF-8 (with or without a BOM) is tried first and strictly, UTF-16 is read by its BOM, anything else is taken
// as Windows-1252 (Western European: ã, é, ç, €). A Cyrillic file in Windows-1251 is not told apart from it.

export type SqlEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export function decodeSqlText(bytes: Uint8Array): { text: string; encoding: SqlEncoding } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' }
  }
}

/** The text of a picked or dropped file; `.sql` and `.py` go through `decodeSqlText`, a notebook is JSON (UTF-8). */
export async function readFileText(file: Blob): Promise<string> {
  return decodeSqlText(new Uint8Array(await file.arrayBuffer())).text
}
