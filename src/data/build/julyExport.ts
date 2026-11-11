// The July 2026 export of the Refresh step (spec docs/build-kaiyo-sales-spec.md, 5.7): a 31st file in the sales folder that the
// distributor sends "in August". Made here, deterministically (a fixed seed), from the stores and SKUs the sales already have,
// and written exactly like the other 30 files. It carries the dirt the learner's steps already handle (lines sent twice,
// decimal commas, three of the date spellings) and one new thing no step handles: dates written year first with slashes.
import type { Cell } from '../../core/check'

export const JULY_FILE = 'export_2026-07.csv'
/** The date written as `2026/07/03`: the one problem the learner's steps have not met. */
export const NEW_DATE_FORMAT = '%Y/%m/%d'

export interface JulyInput {
  /** store names as the clean sales write them, sorted */
  customers: readonly string[]
  /** SKUs sold, sorted, with their list price */
  skus: readonly { sku: string; price: number }[]
  /** raw_id of the first line */
  firstId: number
}

/** One true sale of July: what a clean table should hold for it. */
export interface JulySale {
  date: string
  customer: string
  sku: string
  units: number | null
  /** money in cents, so sums are exact */
  cents: number | null
}

export interface JulyFile {
  /** the lines of the file, in order, as the file writes them (raw_id first) */
  rows: Cell[][]
  /** the true sales, one per sale (the lines sent twice counted once) */
  sales: JulySale[]
  /** lines sent twice (the second copy) */
  copies: number
  /** lines whose date is written year first (the copies included) */
  newFormatLines: number
}

/** A small seeded generator (mulberry32): the same numbers on every machine. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const JULY_SEED = 20260703
/** 104 sales, 8 of them sent twice: 112 lines. */
export const JULY_SALES = 104
export const JULY_COPIES = 8

const two = (n: number) => String(n).padStart(2, '0')

export function julyFile(input: JulyInput): JulyFile {
  const rand = seeded(JULY_SEED)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const seen = new Set<string>()
  const sales: JulySale[] = []
  while (sales.length < JULY_SALES) {
    const i = sales.length
    const date = `2026-07-${two(1 + Math.floor(rand() * 31))}`
    const customer = pick(input.customers)
    const s = pick(input.skus)
    const key = `${date}|${customer}|${s.sku}`
    if (seen.has(key)) continue
    seen.add(key)
    // three returns (negative units), one sale without units and one without revenue: the odd values P8 talks about
    const ret = i === 11 || i === 47 || i === 83
    const units = i === 58 ? null : ret ? -(1 + Math.floor(rand() * 3)) : 1 + Math.floor(rand() * 10)
    const cents = i === 19 ? null : Math.round((units ?? 1 + Math.floor(rand() * 10)) * s.price * (0.85 + 0.15 * rand()) * 100)
    sales.push({ date, customer, sku: s.sku, units, cents })
  }
  sales.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // eight of them arrive twice, the copy right after the first line
  const twice = new Set<number>()
  while (twice.size < JULY_COPIES) twice.add(Math.floor(rand() * sales.length))

  const rows: Cell[][] = []
  let id = input.firstId
  let newFormatLines = 0
  sales.forEach((sale, i) => {
    const [y, m, d] = sale.date.split('-')
    const r = rand()
    const spelling = r < 0.4 ? `${y}-${m}-${d}` : r < 0.65 ? `${d}.${m}.${y}` : r < 0.8 ? `${d}/${m}/${y}` : `${y}/${m}/${d}`
    const comma = rand() < 0.45
    const unitsComma = rand() < 0.3
    const money = sale.cents === null ? null : (sale.cents / 100).toFixed(2)
    const units = sale.units === null ? null : unitsComma ? `${sale.units},0` : String(sale.units)
    const line = (): Cell[] => [String(id++), spelling, sale.customer, sale.sku, units, money === null ? null : comma ? money.replace('.', ',') : money]
    rows.push(line())
    if (spelling.startsWith(y + '/')) newFormatLines += 1
    if (twice.has(i)) {
      rows.push(line())
      if (spelling.startsWith(y + '/')) newFormatLines += 1
    }
  })
  return { rows, sales, copies: JULY_COPIES, newFormatLines }
}

/** Revenue of the true sales of July, in cents (the sales without a revenue count as nothing). */
export const julyCents = (file: Pick<JulyFile, 'sales'>) => file.sales.reduce((a, s) => a + (s.cents ?? 0), 0)
