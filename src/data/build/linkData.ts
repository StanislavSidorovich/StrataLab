// Data of the linking screen of the build page (docs/build-linking-screen.md, sections 3 to 5): the five links the model
// needs, the fixed places of the boxes, and every text the screen says. In its own file: kaiyoSales.ts is long enough.

export type LinkId = 'L1' | 'L2' | 'L3' | 'F1' | 'F2'
export type Pass = 1 | 2

export interface ExpectedLink {
  id: LinkId
  /** 1 = lookups on the clean tables, 2 = the fact to its dimensions */
  pass: Pass
  many: { table: string; column: string }
  one: { table: string; column: string }
}

/** The five links the model needs; any other pair is refused (the Right pair chip). */
export const EXPECTED_LINKS: readonly ExpectedLink[] = [
  { id: 'L1', pass: 1, many: { table: 'clean_sales', column: 'customer_name' }, one: { table: 'clean_customers', column: 'customer_name' } },
  { id: 'L2', pass: 1, many: { table: 'clean_sales', column: 'sku_code' }, one: { table: 'clean_products', column: 'sku_code' } },
  { id: 'L3', pass: 1, many: { table: 'clean_customers', column: 'region_id' }, one: { table: 'clean_regions', column: 'region_id' } },
  { id: 'F1', pass: 2, many: { table: 'gold_fact_sales', column: 'customer_id' }, one: { table: 'gold_dim_customer', column: 'customer_id' } },
  { id: 'F2', pass: 2, many: { table: 'gold_fact_sales', column: 'product_id' }, one: { table: 'gold_dim_product', column: 'product_id' } },
]

export const PASS_TABLES: Record<Pass, readonly string[]> = {
  1: ['clean_sales', 'clean_customers', 'clean_products', 'clean_regions'],
  2: ['gold_fact_sales', 'gold_dim_customer', 'gold_dim_product'],
}

/** How a table is called on the screen: short name, what one row is, and the rows in the plural. */
export const TABLE_INFO: Record<string, { short: string; noun: string; plural: string }> = {
  clean_sales: { short: 'sales', noun: 'sale', plural: 'sales' },
  clean_customers: { short: 'customers', noun: 'customer', plural: 'customers' },
  clean_products: { short: 'products', noun: 'product', plural: 'products' },
  clean_regions: { short: 'regions', noun: 'region', plural: 'regions' },
  gold_fact_sales: { short: 'fact_sales', noun: 'sale', plural: 'sales' },
  gold_dim_customer: { short: 'dim_customer', noun: 'customer', plural: 'customers' },
  gold_dim_product: { short: 'dim_product', noun: 'product', plural: 'products' },
}

/** Summable columns of the fact, drawn with a sigma instead of the number mark (5.1). */
export const MEASURE_COLUMNS: readonly string[] = ['units', 'revenue']

export interface BoxPlace {
  x: number
  y: number
  w: number
}

export const BOX_HEAD = 30
export const BOX_ROW = 22

/** Fixed places of the boxes, one set per pass (5.1): no layout engine, no drag. */
export const LINK_LAYOUT: Record<Pass, { width: number; height: number; boxes: Record<string, BoxPlace> }> = {
  1: {
    width: 880,
    height: 430,
    boxes: {
      clean_sales: { x: 10, y: 110, w: 210 },
      clean_customers: { x: 340, y: 10, w: 220 },
      clean_products: { x: 340, y: 250, w: 220 },
      clean_regions: { x: 680, y: 40, w: 190 },
    },
  },
  2: {
    width: 880,
    height: 330,
    boxes: {
      gold_dim_customer: { x: 10, y: 20, w: 210 },
      gold_fact_sales: { x: 340, y: 70, w: 200 },
      gold_dim_product: { x: 660, y: 20, w: 210 },
    },
  },
}

export const LINK_TEXT = {
  lead1: 'Link the tables yourself. Sales name a store and a product by text; the reference tables have the ids. First link each text column to the table that describes it.',
  lead2: 'Now link the fact to its dimensions by id: that is the relationship a dashboard joins on.',
  idle: 'Click the column that names something, then the column it names. Sales name a store: start there.',
  idleStar: 'Click an id in fact_sales, then the same id in its dimension.',
  bridge: 'You linked by name to look the ids up. A store renamed tomorrow would break a link by name, so the star links by id. Your turn: link the fact to its dimensions.',
  lookupNote: 'Linked by name: fine for looking the id up. The star will link by id.',
  shape: 'Many to one (*:1) · Single · Active',
  hint1: ['The sales say which store sold with customer_name. Which table has one row per store?', 'Click sales.customer_name, then customers.customer_name. Do the same for sku_code, then link customers to their region.'],
  hint2: ['The fact now carries customer_id and product_id. Each one is described by one dimension.', 'fact_sales.customer_id to dim_customer.customer_id, fact_sales.product_id to dim_product.product_id.'],
  starLock: (n: number) => `Link the three tables first: ${n} of 3.`,
  oldStar: 'New: link the tables yourself.',
  removeStar: 'This removes the star too. The dashboard keeps the star you built last.',
  peekTitle: 'Revenue of January to June 2026 by chain, with this link:',
  p4: {
    title: 'Names that find no customer',
    action: 'Press Trim on `customer_name`, then Replace values: find Itiba, with Ichiba.',
    text: 'Some store names in the sales find no customer: spaces at the edges, and one chain written two ways. Then link again.',
    hints: ['Group the sales by customer_name and look at the ones that start or end with a space, and at Itiba against Ichiba.', 'Pick customer_name in the column box next to Trim; Replace values uses the same box, and its find and with boxes are case-sensitive.'],
  },
  p7: {
    title: 'Region ids as numbers',
    action: 'Press Extract number with `region_id` chosen.',
    text: 'region_id is R-01 … R-16 here and 1 … 16 in customers, so the two cannot be linked.',
    hints: ['The number is inside the text: R-03 is region 3.', 'Choose region_id in the column box next to Trim first. Example: R-03 becomes 3, R-16 becomes 16.'],
  },
} as const

/** Lines of the linking screen (4.5), the values already formatted by the caller. */
export const LINK_DIAGNOSIS = {
  sameTable: () => 'Both columns are in one table. A link joins two tables: pick the second column in another box.',
  typeMismatch: (a: string, ta: string, b: string, tb: string, sa: string, sb: string) => `${a} is ${ta} and ${b} is ${tb}: ${sa} and ${sb} can't be compared. Fix the type in Clean first.`,
  otherType: (a: string) => `${a} has a type that can't be a key here.`,
  noMatch: (many: string, one: string, sm: string[], so: string[]) => `Not one row of ${many} finds a partner in ${one}: ${sm.join(', ')} against ${so.join(', ')}. Is it the right column?`,
  wrongWay: (one: string, rows: string, values: string) =>
    `${one} repeats: ${rows} rows, only ${values} different values. It's the many side; the side with one row per key goes on the other end. Swap them.`,
  notUnique: (one: string, repeated: string, rows: string, joined: string) =>
    `${one} isn't unique on the "1" side: ${repeated} values appear more than once, so ${rows} sales would become ${joined}. Each value needs one row.`,
  unmatched: (rows: string, noun: string, values: string, sm: string[], more: boolean, revenue: string | null, oneNoun: string) =>
    `${rows} ${noun} found no ${oneNoun} (${values} different values: ${sm.join(', ')}${more ? ', …' : ''})` + (revenue ? `: ${revenue} of revenue would be left out.` : '.') + ' A key has to match to the character.',
  notExpected: (many: string, one: string) => `Every check passes, but ${many} and ${one} don't name the same thing. Which table describes ${many}?`,
  /** two id columns of different things: the numbers overlap by chance */
  idsApart: (a: string, b: string) => {
    const thing = (c: string) => c.replace(/_id$/, '').replace(/_/g, ' ')
    return `${a} numbers ${thing(a)}s, ${b} numbers ${thing(b)}s: the numbers overlap by chance, they are not the same thing. Link ${a} to the ${thing(a)} table.`
  },
  idsUnmatched: (rows: string, noun: string, oneNoun: string) => `${rows} ${noun} found no ${oneNoun}. `,
  sameByChance: (many: string, one: string, maxMany: string, maxOne: string) =>
    `Every check passes, but only by chance: ${many} runs 1 to ${maxMany} and ${one} runs 1 to ${maxOne}, so every number finds a partner. `,
  pass: (many: string, one: string, rows: string) => `One ${one} for each value, and all ${rows} rows of ${many} found theirs.`,
  unusedNote: (unused: string, of: string, what: string) => `${unused} of ${of} ${what} have no sales. Normal: a dimension lists everything, the fact only what was sold.`,
  already: 'This link is already made.',
} as const
