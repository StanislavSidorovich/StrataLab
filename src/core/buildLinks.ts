// The rules of the linking screen (docs/build-linking-screen.md, sections 3 to 6): the learner's links, the four checks
// on a pair of columns and the one line that says what is wrong, and the SQL of "Build the star". Pure: the queries that
// produce the facts are in src/db/buildRun.ts (`linkFacts`).
import { EXPECTED_LINKS, LINK_DIAGNOSIS, LINK_TEXT, TABLE_INFO, type ExpectedLink, type LinkId, type Pass } from '../data/build/linkData'
import { SCHEMA, type BuildSourceId } from '../data/build/kaiyoSales'

export interface Slot {
  table: string
  column: string
}

export interface Link {
  id: LinkId
  many: Slot
  one: Slot
}

// ---------------------------------------------------------------- types (8.1)

export type Family = 'text' | 'number' | 'date' | 'other'

/** text / number / date by DuckDB's type name; anything else is "other" and never matches. */
export function typeFamily(t: string): Family {
  const u = t.trim().toUpperCase()
  if (/^VARCHAR(\(\d+\))?$/.test(u) || u === 'TEXT' || u === 'STRING') return 'text'
  if (/^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|INT|DOUBLE|FLOAT|REAL)$/.test(u) || /^DECIMAL(\(\d+,\s*\d+\))?$/.test(u)) return 'number'
  if (u === 'DATE' || u.startsWith('TIMESTAMP')) return 'date'
  return 'other'
}

const FAMILY_WORD: Record<Family, string> = { text: 'text', number: 'a number', date: 'a date', other: 'another type' }
const sameSlot = (a: Slot, b: Slot) => a.table === b.table && a.column === b.column
export const sameLink = (a: Pick<Link, 'many' | 'one'>, b: Pick<Link, 'many' | 'one'>) => sameSlot(a.many, b.many) && sameSlot(a.one, b.one)

export const swap = (p: { many: Slot; one: Slot }): { many: Slot; one: Slot } => ({ many: p.one, one: p.many })

/** The expected link this pair is, in the given pass (orientation counts), or null. */
export const matchExpected = (pair: { many: Slot; one: Slot }, pass: Pass): ExpectedLink | null =>
  EXPECTED_LINKS.find((e) => e.pass === pass && sameLink(e, pair)) ?? null

const short = (t: string) => TABLE_INFO[t]?.short ?? t
/** "sales.customer_name" */
export const slotName = (s: Slot) => `${short(s.table)}.${s.column}`

// ---------------------------------------------------------------- the facts (4.4)

export interface SideFacts {
  slot: Slot
  /** DuckDB's type name */
  type: string
  /** rows in the table / rows whose key is not null / different values / values that appear more than once */
  total: number
  rows: number
  distinct: number
  repeated: number
  min: string | null
  max: string | null
  /** up to three different values */
  samples: string[]
}

export interface FoundFacts {
  /** N rows (and different values) with no partner on the 1 side */
  unmatchedRows: number
  unmatchedValues: number
  unmatchedSamples: string[]
  /** revenue of those rows, when the N table has a revenue column */
  unmatchedRevenue: string | null
  /** rows after the join, 1-side values no N row uses */
  joinRows: number
  oneUnused: number
}

export interface LinkFacts {
  many: SideFacts
  one: SideFacts
  /** null when the types differ: comparing text with a number is an error, not a count */
  found: FoundFacts | null
}

// ---------------------------------------------------------------- the diagnosis (4.1, 4.2)

export type ChipId = 'types' | 'one' | 'found' | 'pair'
export type ChipState = 'pass' | 'fail' | 'skip'

export interface LinkChip {
  id: ChipId
  label: string
  state: ChipState
  /** why, on hover and in the line */
  hint: string
}

export type DiagKey = 'sameTable' | 'typeMismatch' | 'noMatch' | 'wrongWay' | 'notUnique' | 'unmatched' | 'notExpected' | 'sameByChance' | 'pass'

export type Fix = { kind: 'swap' } | { kind: 'region' } | { kind: 'clean'; source: BuildSourceId }

export interface LinkDiagnosis {
  key: DiagKey
  /** every chip passes: Create link is allowed */
  ok: boolean
  chips: LinkChip[]
  /** the first failing check, or the pass line */
  line: string
  notes: string[]
  fix: Fix | null
  /** the short number drawn on the dashed line */
  badLabel: string | null
  /** the result in numbers (12.8) */
  result: string
  /** the expected link this pair is (null when it is not one of the five) */
  expected: ExpectedLink | null
}

const fmt = (n: number) => n.toLocaleString('en-US')
const money = (v: string) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A text value in quotes, edge spaces drawn as a visible mark (as P1's card); numbers as they are. */
const quote = (v: string, f: Family) => (f === 'text' ? `'${v.replace(/^ +| +$/g, (m) => '␣'.repeat(m.length))}'` : v)
const sourceOf = (table: string): BuildSourceId | null => {
  const m = /^clean_(sales|customers|products|regions)$/.exec(table)
  return m ? (m[1] as BuildSourceId) : null
}

/** Judges the facts of a pair. `taken`: the same link is already made. First failing check wins (4.2). */
export function diagnoseLink(facts: LinkFacts, pass: Pass, taken = false): LinkDiagnosis {
  const { many, one, found } = facts
  const expected = matchExpected({ many: many.slot, one: one.slot }, pass)
  const fm = typeFamily(many.type)
  const fo = typeFamily(one.type)
  const sameTable = many.slot.table === one.slot.table
  const typesOk = fm === fo && fm !== 'other'
  const oneOk = one.repeated === 0
  const foundOk = found !== null && found.unmatchedRows === 0
  const dataOk = typesOk && oneOk && foundOk && !sameTable
  const pairOk = dataOk && expected !== null && !taken

  const chips: LinkChip[] = [
    { id: 'types', label: 'Types', state: typesOk ? 'pass' : 'fail', hint: typesOk ? 'Same family: the two columns can be compared.' : 'The columns can\'t be compared.' },
    { id: 'one', label: 'One side', state: oneOk ? 'pass' : 'fail', hint: oneOk ? `${slotName(one.slot)} has one row per value.` : `${fmt(one.repeated)} values of ${slotName(one.slot)} repeat.` },
    {
      id: 'found',
      label: 'Found',
      state: found === null ? 'skip' : foundOk ? 'pass' : 'fail',
      hint: found === null ? 'Needs matching types.' : foundOk ? 'Every row finds its partner.' : `${fmt(found.unmatchedRows)} rows find no partner.`,
    },
    { id: 'pair', label: 'Right pair', state: dataOk ? (pairOk ? 'pass' : 'fail') : 'skip', hint: dataOk ? (pairOk ? 'One of the links the model needs.' : 'Not one of the links the model needs.') : 'Runs once the three checks pass.' },
  ]

  const nameM = slotName(many.slot)
  const nameO = slotName(one.slot)
  const shM = short(many.slot.table)
  const shO = short(one.slot.table)
  const infoM = TABLE_INFO[many.slot.table]
  const infoO = TABLE_INFO[one.slot.table]
  const nounO = infoO?.noun ?? 'row'

  const result =
    `${shO}: ${fmt(one.total)} rows, ${oneOk ? 'keys unique' : `${fmt(one.repeated)} keys repeat`} · ` +
    (found ? `${shM}: ${fmt(found.unmatchedRows)} of ${fmt(many.rows)} rows found no ${nounO}` : `${shM}: not compared (types differ)`)

  const base = { chips, notes: [] as string[], result, expected }
  const regionText = (many.slot.table === 'clean_regions' && many.slot.column === 'region_id' && fm === 'text') || (one.slot.table === 'clean_regions' && one.slot.column === 'region_id' && fo === 'text')

  if (sameTable) return { ...base, key: 'sameTable', ok: false, line: LINK_DIAGNOSIS.sameTable(), fix: null, badLabel: null }
  if (!typesOk) {
    const line =
      fm === 'other' || fo === 'other'
        ? LINK_DIAGNOSIS.otherType(fm === 'other' ? nameM : nameO)
        : LINK_DIAGNOSIS.typeMismatch(nameM, `${FAMILY_WORD[fm]} (${many.type})`, nameO, `${FAMILY_WORD[fo]} (${one.type})`, many.samples[0] ?? '?', one.samples[0] ?? '?')
    return { ...base, key: 'typeMismatch', ok: false, line, fix: regionText ? { kind: 'region' } : null, badLabel: 'types differ' }
  }
  const f = found!
  // two numeric id columns of different things: a failing match is not a typo, the numbers just overlap
  const bothIds = fm === 'number' && /_id$/.test(many.slot.column) && /_id$/.test(one.slot.column) && many.slot.column !== one.slot.column
  const idsLine = LINK_DIAGNOSIS.idsApart(many.slot.column, one.slot.column)
  if (bothIds && !expected && f.unmatchedRows > 0 && oneOk) {
    const head = LINK_DIAGNOSIS.idsUnmatched(fmt(f.unmatchedRows), infoM?.plural ?? 'rows', infoO?.noun ?? 'row')
    return { ...base, key: 'unmatched', ok: false, line: head + idsLine, fix: null, badLabel: `${fmt(f.unmatchedRows)} not found` }
  }
  if (many.rows > 0 && f.unmatchedRows === many.rows) {
    const line = LINK_DIAGNOSIS.noMatch(nameM, nameO, f.unmatchedSamples.map((v) => quote(v, fm)), one.samples.map((v) => quote(v, fo)))
    return { ...base, key: 'noMatch', ok: false, line, fix: null, badLabel: 'none found' }
  }
  if (!oneOk && many.repeated === 0) {
    return { ...base, key: 'wrongWay', ok: false, line: LINK_DIAGNOSIS.wrongWay(nameO, fmt(one.rows), fmt(one.distinct)), fix: { kind: 'swap' }, badLabel: 'repeats' }
  }
  if (!oneOk) {
    const line = LINK_DIAGNOSIS.notUnique(nameO, fmt(one.repeated), fmt(many.rows), fmt(f.joinRows))
    const source = sourceOf(one.slot.table)
    return { ...base, key: 'notUnique', ok: false, line, fix: source ? { kind: 'clean', source } : null, badLabel: `${fmt(f.joinRows)} rows` }
  }
  if (f.unmatchedRows > 0) {
    const line = LINK_DIAGNOSIS.unmatched(
      fmt(f.unmatchedRows),
      infoM?.plural ?? 'rows',
      fmt(f.unmatchedValues),
      f.unmatchedSamples.map((v) => quote(v, fm)),
      f.unmatchedValues > f.unmatchedSamples.length,
      f.unmatchedRevenue ? money(f.unmatchedRevenue) : null,
      nounO,
    )
    const source = sourceOf(one.slot.table)
    return { ...base, key: 'unmatched', ok: false, line, fix: source ? { kind: 'clean', source } : null, badLabel: `${fmt(f.unmatchedRows)} not found` }
  }
  if (!expected) {
    const ids = bothIds
    const line = ids ? LINK_DIAGNOSIS.sameByChance(nameM, nameO, many.max ?? '?', one.max ?? '?') + idsLine : LINK_DIAGNOSIS.notExpected(nameM, nameO)
    return { ...base, key: ids ? 'sameByChance' : 'notExpected', ok: false, line, fix: null, badLabel: 'not this pair' }
  }
  const notes: string[] = []
  if (f.oneUnused > 0) notes.push(LINK_DIAGNOSIS.unusedNote(fmt(f.oneUnused), fmt(one.distinct), infoO?.plural ?? 'rows'))
  if (expected.id === 'L1' || expected.id === 'L2') notes.push(LINK_TEXT.lookupNote)
  if (taken) return { ...base, key: 'pass', ok: false, line: LINK_DIAGNOSIS.already, notes, fix: null, badLabel: null }
  return { ...base, key: 'pass', ok: true, line: LINK_DIAGNOSIS.pass(shM, nounO, fmt(many.rows)), notes, fix: null, badLabel: null }
}

/** A short caption on an accepted line: "3,000 → 144 ✓". */
export const acceptedLabel = (facts: LinkFacts) => `${fmt(facts.many.rows)} → ${fmt(facts.one.distinct)} ✓`

// ---------------------------------------------------------------- the links and what is kept (6)

export const LINK_IDS: readonly LinkId[] = ['L1', 'L2', 'L3', 'F1', 'F2']
const L = (links: readonly Link[], id: LinkId) => links.find((l) => l.id === id)

/** The links of one pass, in order. */
export const linksOfPass = (links: readonly Link[], pass: Pass): Link[] => links.filter((l) => EXPECTED_LINKS.find((e) => e.id === l.id)?.pass === pass)
/** L1 to L3 are made. */
export const canBuildStar = (links: readonly Link[]) => (['L1', 'L2', 'L3'] as const).every((id) => L(links, id))
/** F1 and F2 are made: the Model step can be done. */
export const modelLinked = (links: readonly Link[]) => (['F1', 'F2'] as const).every((id) => L(links, id))

/** Adds a link (the id comes from the expected list); one link per id. */
export function addLink(links: readonly Link[], link: Link): Link[] {
  return LINK_IDS.filter((id) => id === link.id || L(links, id)).map((id) => (id === link.id ? link : L(links, id)!))
}

/** Removes a link. A lookup removed after the star clears the star and the id links; the gold tables stay (6). */
export function removeLink(links: readonly Link[], star: boolean, id: LinkId): { links: Link[]; star: boolean } {
  const rest = links.filter((l) => l.id !== id)
  const pass1 = EXPECTED_LINKS.find((e) => e.id === id)?.pass === 1
  if (pass1 && star) return { links: linksOfPass(rest, 1), star: false }
  return { links: rest, star }
}

/** Saved links, repaired: only the five expected ones, as expected; the id links only after the star was built. */
export function readLinks(raw: unknown, star: boolean): Link[] {
  if (!Array.isArray(raw)) return []
  const out: Link[] = []
  for (const e of EXPECTED_LINKS) {
    if (e.pass === 2 && !star) continue
    const hit = raw.find((x) => x && typeof x === 'object' && (x as Link).id === e.id && sameLink(x as Link, e))
    if (hit) out.push({ id: e.id, many: { ...e.many }, one: { ...e.one } })
  }
  return out
}

// ---------------------------------------------------------------- Build the star (6)

/** The three statements of "Build the star", written from the learner's links L1 to L3; null until all three are made. */
export function starStatements(links: readonly Link[]): string[] | null {
  const l1 = L(links, 'L1')
  const l2 = L(links, 'L2')
  const l3 = L(links, 'L3')
  if (!l1 || !l2 || !l3) return null
  const t = (n: string) => `${SCHEMA}.${n}`
  return [
    `CREATE OR REPLACE TABLE ${t('gold_dim_customer')} AS
SELECT c.customer_id, c.customer_name, c.customer_type, c.chain_name, c.region_id, c.city,
       r.region_name, r.macro_region                                  -- new: the region on the customer
FROM ${t('clean_customers')} c
LEFT JOIN ${t('clean_regions')} r ON r.${l3.one.column} = c.${l3.many.column}   -- your link L3`,
    `CREATE OR REPLACE TABLE ${t('gold_dim_product')} AS
SELECT product_id, sku_code, product_name, brand, category FROM ${t('clean_products')}`,
    `-- the sales carry names and SKUs; the fact carries ids, looked up through your links
CREATE OR REPLACE TABLE ${t('gold_fact_sales')} AS
SELECT s.sale_date, c.customer_id, p.product_id, s.units, s.revenue
FROM ${t('clean_sales')} s
LEFT JOIN ${t('gold_dim_customer')} c ON c.${l1.one.column} = s.${l1.many.column}   -- your link L1
LEFT JOIN ${t('gold_dim_product')} p ON p.${l2.one.column} = s.${l2.many.column}    -- your link L2`,
  ]
}

/** The same, as the text shown and opened in a tab. */
export const starSql = (links: readonly Link[]): string | null => starStatements(links)?.map((s) => s + ';').join('\n\n') ?? null

// ---------------------------------------------------------------- the SQL behind the chips (4.4), shown folded

/** The queries `linkFacts` runs for a pair, written out with the table and column names filled in. */
export function checkSqlText(many: Slot, one: Slot): string {
  const mt = `${SCHEMA}.${many.table}`
  const ot = `${SCHEMA}.${one.table}`
  const mc = many.column
  const oc = one.column
  return `-- Types: the two data types
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = '${SCHEMA}'
  AND ((table_name = '${many.table}' AND column_name = '${mc}') OR (table_name = '${one.table}' AND column_name = '${oc}'));

-- One side: rows, different values, values that repeat (0 repeats = ok)
SELECT count(${oc}) AS rows, count(DISTINCT ${oc}) AS different,
       (SELECT count(*) FROM (SELECT ${oc} FROM ${ot} WHERE ${oc} IS NOT NULL GROUP BY 1 HAVING count(*) > 1)) AS repeated
FROM ${ot};

-- Found: rows of the many side with no partner (0 = ok); skipped when the types differ
SELECT count(*) AS rows, count(DISTINCT m.${mc}) AS different
FROM ${mt} m
WHERE m.${mc} IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ${ot} o WHERE o.${oc} = m.${mc});

-- rows after the join, and values of the one side nobody uses
SELECT count(*) FROM ${mt} m JOIN ${ot} o ON o.${oc} = m.${mc};
SELECT count(DISTINCT o.${oc}) FROM ${ot} o
WHERE NOT EXISTS (SELECT 1 FROM ${mt} m WHERE m.${mc} = o.${oc});`
}
