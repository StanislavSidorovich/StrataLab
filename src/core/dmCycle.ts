// Pure helpers for the Data analysis cycle cheat sheet state and `# %%` cell insertion.
import type { DmStageId } from '../data/dmCycle'
import { cellAt, splitCells, type RunPiece } from './pyCells'

export const DM_CYCLE_OPEN_KEY = 'stratalab.dm-cycle.open'
export const DM_CYCLE_STAGE_KEY = 'stratalab.dm-cycle.stage'

const STAGE_IDS: readonly DmStageId[] = ['exploration', 'preprocessing', 'processing', 'analysis']

export function parseDmCycleOpen(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

export function parseDmCycleStage(raw: string | null): DmStageId {
  return STAGE_IDS.includes(raw as DmStageId) ? (raw as DmStageId) : 'exploration'
}

/**
 * Inserts a runnable `# %%` cell containing the chosen cheat-sheet example after the cell at
 * `cursorPos` (or replaces an empty tab), then returns the new document text, cursor position,
 * and `RunPiece` for `runPython`.
 */
export function buildExampleCellInsertion(
  tabText: string,
  cursorPos: number,
  stageTitle: string,
  exampleTitle: string,
  code: string,
): { text: string; cursor: number; run: RunPiece } {
  const body = `# ${stageTitle}: ${exampleTitle}\n${code.trim()}`
  if (!tabText.trim()) {
    const text = `# %%\n${body}\n`
    const cells = splitCells(text)
    const cell = cells[0]
    return {
      text,
      cursor: cell.to,
      run: { code: cell.source, line: cell.line, index: 0, source: cell.source },
    }
  }

  const cells = splitCells(tabText)
  const i = cellAt(cells, cursorPos)
  const at = i >= 0 ? cells[i].to : tabText.length
  const before = tabText.slice(0, at).replace(/\s+$/, '')
  const after = tabText.slice(at).replace(/^\s+/, '')
  const separator = before ? '\n\n' : ''
  const block = `${separator}# %%\n${body}\n`
  const text = after ? `${before}${block}\n${after}` : `${before}${block}`

  const newCells = splitCells(text)
  const index = i >= 0 ? i + 1 : 0
  const cell = newCells[index] ?? newCells[newCells.length - 1]
  const resolvedIndex = newCells.indexOf(cell)
  return {
    text,
    cursor: cell.to,
    run: { code: cell.source, line: cell.line, index: resolvedIndex, source: cell.source },
  }
}

/** Matches Tailwind `md:` (`768px`) and `TablesSheet` in `src/ui/App.tsx`. */
export const PHONE_BREAKPOINT_PX = 768

export type PythonPanelId = 'dmCycle' | 'aiHelper'

export interface PythonPanelsState {
  dmCycleOpen: boolean
  aiPanelOpen: boolean
  lastOpened: PythonPanelId | null
}

/**
 * Resolves initial panel visibility from saved preferences and viewport width. On narrow screens
 * (`< 768px`), if both panels start open, only `aiHelper` stays open so the editor keeps room.
 */
export function resolveInitialPythonPanels(
  savedDmCycleOpen: boolean,
  savedAiPanelOpen: boolean,
  widthPx: number,
): PythonPanelsState {
  if (widthPx < PHONE_BREAKPOINT_PX && savedDmCycleOpen && savedAiPanelOpen) {
    return { dmCycleOpen: false, aiPanelOpen: true, lastOpened: 'aiHelper' }
  }
  const lastOpened: PythonPanelId | null = savedAiPanelOpen
    ? 'aiHelper'
    : savedDmCycleOpen
      ? 'dmCycle'
      : null
  return { dmCycleOpen: savedDmCycleOpen, aiPanelOpen: savedAiPanelOpen, lastOpened }
}

/**
 * Computes panel state when toggling `target`. Below `PHONE_BREAKPOINT_PX`, opening one panel
 * closes the other; on desktop widths both can stay open together.
 */
export function resolveTogglePythonPanel(
  state: PythonPanelsState,
  target: PythonPanelId,
  nextOpen: boolean | undefined,
  widthPx: number,
): PythonPanelsState {
  const current = target === 'dmCycle' ? state.dmCycleOpen : state.aiPanelOpen
  const open = nextOpen ?? !current
  let dmCycleOpen = target === 'dmCycle' ? open : state.dmCycleOpen
  let aiPanelOpen = target === 'aiHelper' ? open : state.aiPanelOpen
  const lastOpened = open ? target : state.lastOpened

  if (open && widthPx < PHONE_BREAKPOINT_PX) {
    if (target === 'dmCycle') aiPanelOpen = false
    else dmCycleOpen = false
  }

  return { dmCycleOpen, aiPanelOpen, lastOpened }
}

/**
 * Reconciles panels across viewport resizes/rotations without flipping panels back and forth:
 * only closes the older panel if width drops below `PHONE_BREAKPOINT_PX` while both are open.
 */
export function resolveResizePythonPanels(
  state: PythonPanelsState,
  widthPx: number,
): PythonPanelsState {
  if (widthPx >= PHONE_BREAKPOINT_PX || !(state.dmCycleOpen && state.aiPanelOpen)) {
    return state
  }
  if (state.lastOpened === 'dmCycle') {
    return { dmCycleOpen: true, aiPanelOpen: false, lastOpened: 'dmCycle' }
  }
  return { dmCycleOpen: false, aiPanelOpen: true, lastOpened: 'aiHelper' }
}
