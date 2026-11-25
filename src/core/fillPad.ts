// The word bank and the gaps of a fill question on a phone (choose mode): where each chip sits after a tap or a drag. Pure; the
// pointer handling is in src/ui/FillPhone.tsx. State: for every gap, the index of the chip in it, or null. A chip is in at most one gap.
export type Slots = (number | null)[]

export const emptySlots = (gaps: number): Slots => Array.from({ length: gaps }, () => null)

export const usedChips = (s: Slots): Set<number> => new Set(s.filter((x): x is number => x !== null))
export const isComplete = (s: Slots): boolean => s.length > 0 && s.every((x) => x !== null)
const where = (s: Slots, chip: number): number => s.indexOf(chip)

/** A tap on a chip of the bank: it fills the first empty gap. Nothing when every gap is full or the chip is already placed. */
export function tapChip(s: Slots, chip: number): Slots {
  if (where(s, chip) >= 0) return s
  const gap = s.indexOf(null)
  if (gap < 0) return s
  return s.map((x, i) => (i === gap ? chip : x))
}

/** A tap on a filled gap: the chip goes back to the bank. */
export const tapGap = (s: Slots, gap: number): Slots => (s[gap] == null ? s : s.map((x, i) => (i === gap ? null : x)))

/** A chip of the bank dropped on a gap: it goes in, and the chip that was there goes back to the bank. A placed chip moves (its old gap empties). */
export function dropChip(s: Slots, chip: number, gap: number): Slots {
  if (gap < 0 || gap >= s.length || s[gap] === chip) return s
  return s.map((x, i) => (i === gap ? chip : x === chip ? null : x))
}

/** A filled gap dragged onto another gap: the two swap (onto an empty gap it just moves). */
export function dragGap(s: Slots, from: number, to: number): Slots {
  if (from === to || from < 0 || to < 0 || from >= s.length || to >= s.length || s[from] == null) return s
  return s.map((x, i) => (i === from ? s[to] : i === to ? s[from] : x))
}

/** A filled gap dragged out of every gap: its chip goes back to the bank. */
export const dragOut = (s: Slots, from: number): Slots => tapGap(s, from)

/** The words in the gaps, or null while one is empty. */
export const wordsOf = (s: Slots, bank: readonly string[]): string[] | null => (isComplete(s) ? s.map((x) => bank[x as number]) : null)

/** A saved answer put back on the pad: each word found in the bank (once each, spelling compared exactly); null when it does not fit. */
export function slotsFromWords(words: readonly string[], bank: readonly string[]): Slots | null {
  const taken = new Set<number>()
  const out: Slots = []
  for (const w of words) {
    const i = bank.findIndex((b, k) => b === w && !taken.has(k))
    if (i < 0) return null
    taken.add(i)
    out.push(i)
  }
  return out
}
