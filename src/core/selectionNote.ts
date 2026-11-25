// The hint beside Run: when part of the editor is selected, Run (and F5) execute only that part.
// A student who selects the INSERTs and runs them never reaches the CREATE above, so we say it out loud.

/** Non-blank lines in the selected text; 0 when the selection is empty or only whitespace. */
export function selectedLines(text: string): number {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '').length
}

/** "Selection only · 18 lines", or null when nothing worth a hint is selected. */
export function selectionNote(lines: number): string | null {
  if (lines <= 0) return null
  return `Running selection only · ${lines} line${lines === 1 ? '' : 's'}`
}
