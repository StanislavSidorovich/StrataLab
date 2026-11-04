// The first pipeline (`#pipeline=kaiyo-sellout`): the pure rules, and every case of the spec's section 5 table
// run on the real parquet files in duckdb-node-blocking through the same block SQL the page uses.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  checkBlank,
  diagnose,
  emptyState,
  hashWithPipeline,
  hashWithoutPipeline,
  missingSetting,
  nextStatus,
  pipelineFromHash,
  place,
  readState,
  remove,
  runOrder,
  slotOf,
  softNotes,
  type Facts,
  type PipelineState,
  type StepResult,
} from '../src/core/pipeline'
import type { ResultData } from '../src/core/check'
import { checkPipeline, exportFiles, exportText, prepare, resetWork, runAll, snapshot, type SqlPort } from '../src/db/pipelineRun'
import { resultRows } from '../src/db/export'
import { BLOCKS, LANES, silverSql, silverTemplate, slotId, type BlockId, type Settings } from '../src/data/pipelines/kaiyoSellout'

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------- pure rules

function built(order: [BlockId, Partial<Settings>?][], blank = 'sale_date, customer_name, sku_code'): PipelineState {
  let s = emptyState()
  const used: Record<string, number> = {}
  for (const [id, settings] of order) {
    const lane = BLOCKS.find((b) => b.id === id)!.lane
    used[lane] = (used[lane] ?? -1) + 1
    s = place(s, id, slotId(lane, used[lane]))
    s.settings[id] = { ...s.settings[id], ...(order[0][0] === id ? {} : { when: 'succeeded' }), ...settings }
  }
  return { ...s, blank }
}

describe('pipeline: the address', () => {
  it('reads the page and leaves other parts alone', () => {
    expect(pipelineFromHash('#pipeline=kaiyo-sellout')).toBe('kaiyo-sellout')
    expect(pipelineFromHash('#ds=quaera&pipeline=kaiyo-sellout')).toBe('kaiyo-sellout')
    expect(pipelineFromHash('#pipeline=nope')).toBeNull()
    expect(pipelineFromHash('#practice=sql')).toBeNull()
    expect(hashWithoutPipeline('#pipeline=kaiyo-sellout&ds=quaera')).toBe('#ds=quaera')
    expect(hashWithoutPipeline('#pipeline=kaiyo-sellout')).toBe('')
    expect(hashWithPipeline('#ds=quaera', 'kaiyo-sellout')).toBe('#pipeline=kaiyo-sellout&ds=quaera')
    expect(hashWithPipeline('#pipeline=kaiyo-sellout', 'kaiyo-sellout')).toBe('#pipeline=kaiyo-sellout')
  })
})

describe('pipeline: slots and run order', () => {
  it('has 15 slots and 12 blocks', () => {
    expect(LANES.map((l) => l.slots)).toEqual([4, 8, 3])
    expect(BLOCKS).toHaveLength(12)
  })
  it('runs filled slots left to right, lanes in data order, skipping empty ones', () => {
    let s = emptyState()
    s = place(s, 'card-top-chain', slotId('analyst', 2))
    s = place(s, 'dim-customer', slotId('ae', 5))
    s = place(s, 'sql-silver', slotId('ae', 1))
    s = place(s, 'copy-files', slotId('engineer', 3))
    expect(runOrder(s)).toEqual(['copy-files', 'sql-silver', 'dim-customer', 'card-top-chain'])
  })
  it('puts a block only into its own lane, moves a placed block, and takes it back', () => {
    let s = emptyState()
    expect(place(s, 'copy-files', slotId('ae', 0))).toEqual(s)
    s = place(s, 'copy-files', slotId('engineer', 0))
    s = place(s, 'copy-files', slotId('engineer', 2))
    expect(slotOf(s, 'copy-files')).toBe('engineer-2')
    expect(runOrder(s)).toEqual(['copy-files'])
    expect(runOrder(remove(s, 'copy-files'))).toEqual([])
  })
  it('reads what was saved, and starts afresh from anything else', () => {
    expect(readState(null)).toEqual(emptyState())
    expect(readState('not json')).toEqual(emptyState())
    const good = built([['copy-files', { mode: 'replace' }], ['sql-silver']])
    expect(readState(JSON.stringify(good))).toEqual(good)
    // a block in the wrong lane, or twice, is dropped
    const odd = JSON.stringify({ slots: { 'engineer-0': 'sql-silver', 'ae-0': 'sql-silver', 'ae-1': 'sql-silver' } })
    expect(runOrder(readState(odd))).toEqual(['sql-silver'])
  })
})

describe('pipeline: status', () => {
  it('runs after a success, after a failure only when Completed, never after a skip', () => {
    expect(nextStatus(null, null)).toBe('run')
    expect(nextStatus('succeeded', 'succeeded')).toBe('run')
    expect(nextStatus('failed', 'succeeded')).toBe('skip')
    expect(nextStatus('failed', 'completed')).toBe('run')
    expect(nextStatus('skipped', 'completed')).toBe('skip')
    expect(nextStatus('skipped', 'succeeded')).toBe('skip')
  })
})

describe('pipeline: what is not set', () => {
  it('names the first block with a missing setting', () => {
    const s = built([['copy-files'], ['sql-silver']])
    expect(missingSetting(s)).toEqual({ block: 'copy-files', message: 'Copy files: choose the write mode' })
    s.settings['copy-files'].mode = 'replace'
    expect(missingSetting(s)).toBeNull()
    s.settings['sql-silver'].when = null
    expect(missingSetting(s)).toEqual({ block: 'sql-silver', message: 'SQL step: choose when it runs' })
    s.settings['sql-silver'].when = 'succeeded'
    s.blank = ''
    expect(missingSetting(s)?.block).toBe('sql-silver')
  })
  it('does not ask the first block when it runs', () => {
    const s = built([['notify-team']])
    s.settings['notify-team'].when = null
    expect(missingSetting(s)).toBeNull()
  })
  it('notes a load or a step after a check set to Completed, without blocking', () => {
    const s = built([['copy-files', { mode: 'replace' }], ['notify-team', { when: 'completed' }]])
    expect(softNotes(s)).toHaveLength(1)
    const t = built([['copy-files', { mode: 'replace' }], ['sql-silver'], ['check-unique'], ['dim-customer', { when: 'completed' }]])
    expect(softNotes(t)).toHaveLength(1)
  })
})

describe('pipeline: the blank', () => {
  it('judges the form only', () => {
    expect(checkBlank('sale_date, customer_name, sku_code')).toBeNull()
    expect(checkBlank('lower(sku_code), sale_date')).toBeNull()
    expect(checkBlank('')).toMatch(/empty/)
    expect(checkBlank('   ')).toMatch(/empty/)
    expect(checkBlank('a; DROP TABLE x')).toMatch(/semicolon/)
    expect(checkBlank('a -- b')).toMatch(/comment/)
    expect(checkBlank('a /* b */')).toMatch(/comment/)
    expect(checkBlank('lower(a')).toMatch(/brackets/)
    expect(checkBlank('a)')).toMatch(/brackets/)
    expect(checkBlank('x'.repeat(201))).toMatch(/200/)
    expect(checkBlank('x'.repeat(200))).toBeNull()
  })
  it('shows the template with the blank between two halves', () => {
    const t = silverTemplate()
    expect(t.before).toMatch(/PARTITION BY $/)
    expect(t.after).toMatch(/^ ORDER BY raw_id/)
    expect(silverSql('a, b')).toContain('PARTITION BY a, b ORDER BY raw_id')
  })
})

describe('pipeline: the diagnosis picks the first line that fits', () => {
  const step = (block: BlockId, status: StepResult['status'], extra: Partial<StepResult> = {}): StepResult => ({ block, status, ms: 1, rows: null, message: '', ...extra })
  const facts = (over: Partial<Facts>): Facts => ({
    order: ['copy-files', 'sql-silver'],
    settings: built([['copy-files', { mode: 'replace' }], ['sql-silver']]).settings,
    blank: 'sale_date, customer_name, sku_code',
    run1: [],
    run2: [],
    bronzeColumns: ['raw_id'],
    counts1: {},
    counts2: {},
    top1: null,
    top2: null,
    refRows: 3000,
    ref: [{ chain: 'Minori', revenue: '90829.50' }, { chain: 'Nagisa', revenue: '87647.48' }],
    dupGroups: 0,
    noKey: 0,
    ...over,
  })
  it('names the semicolons, the blob and the header', () => {
    const f = facts({ settings: built([['copy-files', { mode: 'replace', delim: ',' }]]).settings, run1: [step('copy-files', 'failed')] })
    expect(diagnose(f, [false, true, true])[0]).toMatch(/semicolons/)
    expect(diagnose(facts({ bronzeColumns: ['source_file', 'content'] }), [false, true, false])[0]).toMatch(/Binary/)
    expect(diagnose(facts({ bronzeColumns: ['column0', 'column1'] }), [false, true, false])[0]).toMatch(/first line/)
  })
  it('counts the doubling from the runs', () => {
    const f = facts({ counts1: { bronze_sellout_raw: 3110 }, counts2: { bronze_sellout_raw: 6220 } })
    expect(diagnose(f, [true, false, true])[1]).toBe('The second run added the same 3,110 rows again: bronze went 3,110 → 6,220. Append needs Clear before it, or use Replace.')
  })
  it('says what the duplicates did to the answer', () => {
    const f = facts({ counts1: { bronze_sellout_raw: 3110, silver_sellout: 3110 }, top1: { chain: 'Nagisa', revenue: '95406.98' } })
    expect(diagnose(f, [false, true, false])[0]).toBe('110 sales arrived twice in the files. They put Nagisa first: 95,406.98 instead of 87,647.48.')
  })
  it('tells raw_id from a key that is too short', () => {
    const raw = facts({ blank: 'raw_id', counts1: { bronze_sellout_raw: 3110, silver_sellout: 3110 }, top1: { chain: 'Nagisa', revenue: '95406.98' } })
    expect(diagnose(raw, [false, true, false])[0]).toMatch(/raw_id numbers the lines/)
    expect(diagnose(facts({ counts1: { bronze_sellout_raw: 3110, silver_sellout: 660 } }), [false, true, true])[0]).toBe('The key is too short: different sales were merged, silver kept 660 of 3,000.')
  })
  it('sends a step that came too early after its builder', () => {
    const f = facts({ run1: [step('fact-sellout', 'failed', { error: 'Catalog Error: Table with name gold_dim_customer does not exist!' })] })
    expect(diagnose(f, [false, true, false])[0]).toBe('Fact: sell-out reads pipe_kaiyo.gold_dim_customer, which isn\'t built yet at this point. Move it after Dimension: stores.')
  })
  it('says the card is right and gold is not, when the measure hides the doubling', () => {
    const f = facts({ settings: built([['card-top-chain', { measure: 'distinct' }]]).settings, dupGroups: 110, answerOk: true })
    expect(diagnose(f, [true, true, false])[2]).toMatch(/Fix it in silver, not in the measure/)
  })
})

// ---------------------------------------------------------------- the cases of section 5

let port: SqlPort

beforeAll(async () => {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
  const dist = resolve('node_modules/@duckdb/duckdb-wasm/dist')
  const db = await duckdb.createDuckDB({ mvp: { mainModule: `${dist}/duckdb-mvp.wasm`, mainWorker: '' }, eh: { mainModule: `${dist}/duckdb-eh.wasm`, mainWorker: '' } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME)
  await db.instantiate()
  const conn = db.connect()
  port = {
    query: async (sql) => resultRows(conn.query(sql)) as ResultData,
    registerText: async (name, text) => {
      db.registerFileText(name, text)
    },
    parquet: async (folder, file) => resolve('public/datasets', folder, file).replace(/\\/g, '/'),
  }
  await prepare(port)
}, 180_000)

const COPY: Partial<Settings> = { mode: 'replace' }
const dims: [BlockId][] = [['dim-customer'], ['dim-product'], ['fact-sellout']]
const correct = (copy: Partial<Settings> = COPY, card: Partial<Settings> = {}, key?: string) => built([['copy-files', copy], ['sql-silver'], ...dims, ['card-top-chain', card]], key)

interface Row {
  bronze: number | null
  silver: number | null
  dimC?: number | null
  dimP?: number | null
  fact?: number | null
  top?: string | null
}

async function cases(name: string, state: PipelineState, run1: Row, run2: Row, ok: [boolean, boolean, boolean] | [boolean | null, boolean | null, boolean | null]) {
  const r = await checkPipeline(port, state)
  const at = async (c: typeof r.counts1, w: Row, label: string) => {
    expect(c.bronze_sellout_raw ?? null, `${name} ${label} bronze`).toBe(w.bronze)
    expect(c.silver_sellout ?? null, `${name} ${label} silver`).toBe(w.silver)
    if (w.dimC !== undefined) expect(c.gold_dim_customer ?? null, `${name} ${label} dimC`).toBe(w.dimC)
    if (w.dimP !== undefined) expect(c.gold_dim_product ?? null, `${name} ${label} dimP`).toBe(w.dimP)
    if (w.fact !== undefined) expect(c.gold_fact_sellout ?? null, `${name} ${label} fact`).toBe(w.fact)
  }
  await at(r.counts1, run1, 'run 1')
  await at(r.counts2, run2, 'run 2')
  const top = r.answer?.rows[0] ? `${r.answer.rows[0][0]} ${Number(r.answer.rows[0][1]).toFixed(2)}` : null
  if (run2.top !== undefined) expect(top, `${name} card`).toBe(run2.top)
  const got = [r.proofs.answer.ok, r.proofs.again.ok, r.proofs.clean.ok]
  ok.forEach((want, i) => {
    if (want !== null) expect(got[i], `${name} proof ${i + 1}: ${JSON.stringify(r.proofs)}`).toBe(want)
  })
  return r
}

const ALL: Row = { bronze: 3110, silver: 3000, dimC: 144, dimP: 47, fact: 3000, top: 'Minori 90829.50' }
const NO_DEDUP: Row = { bronze: 3110, silver: 3110, dimC: 144, dimP: 47, fact: 3110 }

describe('pipeline: the 30 files', () => {
  it('read back as the copy step reads them, they equal the raw rows', async () => {
    expect(exportFiles()).toHaveLength(30)
    expect(exportFiles()[0]).toBe('pipe_kaiyo/export_2024-01.csv')
    expect(exportFiles()[29]).toBe('pipe_kaiyo/export_2026-06.csv')
    const list = `[${exportFiles().map((f) => `'${f}'`).join(', ')}]`
    const back = `SELECT * EXCLUDE (filename), parse_filename(filename) AS source_file FROM read_csv(${list}, delim = ';', header = true, all_varchar = true, filename = true)`
    const raw = 'SELECT CAST(raw_id AS VARCHAR) AS raw_id, sale_date, customer_name, sku_code, units, revenue, source_file FROM pipe_kaiyo.src_raw_sellout'
    const one = async (sql: string) => Number((await port.query(sql)).rows[0][0])
    expect(await one(`SELECT count(*) FROM (${back})`)).toBe(3110)
    expect(await one(`SELECT count(*) FROM (SELECT * FROM (${back}) EXCEPT ALL SELECT * FROM (${raw}))`)).toBe(0)
    expect(await one(`SELECT count(*) FROM (SELECT * FROM (${raw}) EXCEPT ALL SELECT * FROM (${back}))`)).toBe(0)
  })
  it('quotes a field with a space and writes NULL as nothing', () => {
    expect(exportText([[1, '2024-5-20', '  Minori #1014 ', 'sk-1', null, '3,5']])).toBe('raw_id;sale_date;customer_name;sku_code;units;revenue\n1;2024-5-20;"  Minori #1014 ";sk-1;;3,5\n')
  })
})

describe('pipeline: the reference', () => {
  it('has the five chains of section 1, and 595 sales when right', async () => {
    const r = await port.query('SELECT chain_name, revenue FROM pipe_kaiyo.ref_report_top_chain ORDER BY revenue DESC')
    expect(r.rows.map((x) => `${x[0]} ${Number(x[1]).toFixed(2)}`)).toEqual(['Minori 90829.50', 'Nagisa 87647.48', 'Ichiba 55108.64', 'Kaigan 49607.59', 'Prima 30649.92'])
    expect((await port.query('SELECT count(*) FROM pipe_kaiyo.ref_silver_sellout')).rows[0][0]).toBe(3000)
  })
})

describe('pipeline: cases', () => {
  it('correct, Replace: three proofs', async () => {
    const r = await cases('correct', correct(), ALL, ALL, [true, true, true])
    expect(r.solved).toBe(true)
    expect(r.run2.map((s) => s.status)).toEqual(Array(6).fill('succeeded'))
    expect(r.run2[1].verdict).toEqual({ rows: 3000, extra: 0, missing: 0 })
  })
  it('correct with Clear → Copy (Append)', async () => {
    await cases('clear+append', built([['clear-bronze'], ['copy-files', { mode: 'append' }], ['sql-silver'], ...dims, ['card-top-chain']]), ALL, ALL, [true, true, true])
  })
  it('Append twice without Clear: bronze doubles, the answer holds, proof 2 fails', async () => {
    const r = await cases('append', correct({ mode: 'append' }), ALL, { ...ALL, bronze: 6220 }, [true, false, true])
    expect(r.proofs.again.diagnosis).toBe('The second run added the same 3,110 rows again: bronze went 3,110 → 6,220. Append needs Clear before it, or use Replace.')
  })
  it('no de-duplication: Nagisa leads, proofs 1 and 3 fail', async () => {
    const state = { ...correct(), dedup: false }
    const r = await cases('no dedup', state, { ...NO_DEDUP, top: 'Nagisa 95406.98' }, { ...NO_DEDUP, top: 'Nagisa 95406.98' }, [false, true, false])
    expect(r.proofs.answer.diagnosis).toBe('110 sales arrived twice in the files. They put Nagisa first: 95,406.98 instead of 87,647.48.')
  })
  it('no de-duplication with Append: Nagisa 190,813.96 and nothing passes', async () => {
    await cases('no dedup append', { ...correct({ mode: 'append' }), dedup: false }, { ...NO_DEDUP, top: 'Nagisa 95406.98' }, { bronze: 6220, silver: 6220, dimC: 144, dimP: 47, fact: 6220, top: 'Nagisa 190813.96' }, [false, false, false])
  })
  it('key raw_id keeps every line', async () => {
    const r = await cases('raw_id', correct(COPY, {}, 'raw_id'), { ...NO_DEDUP, top: 'Nagisa 95406.98' }, { ...NO_DEDUP, top: 'Nagisa 95406.98' }, [false, true, false])
    expect(r.proofs.answer.diagnosis).toMatch(/raw_id numbers the lines/)
    await cases('raw_id append', correct({ mode: 'append' }, {}, 'raw_id'), { ...NO_DEDUP, top: 'Nagisa 95406.98' }, { bronze: 6220, silver: 3110, dimC: 144, dimP: 47, fact: 3110, top: 'Nagisa 95406.98' }, [false, false, false])
  })
  it('keys that are too short merge different sales', async () => {
    await cases('customer+sku', correct(COPY, {}, 'customer_name, sku_code'), { ...ALL, silver: 660, fact: 660, top: 'Minori 1751.29' }, { ...ALL, silver: 660, fact: 660, top: 'Minori 1751.29' }, [false, true, true])
    await cases('date+sku', correct(COPY, {}, 'sale_date, sku_code'), { ...ALL, silver: 2049, fact: 2049, top: 'Minori 66139.23' }, { ...ALL, silver: 2049, fact: 2049, top: 'Minori 66139.23' }, [false, true, true])
    await cases('date+customer', correct(COPY, {}, 'sale_date, customer_name'), { ...ALL, silver: 2350, fact: 2350, top: 'Minori 67007.60' }, { ...ALL, silver: 2350, fact: 2350, top: 'Minori 67007.60' }, [false, true, true])
  })
  it('other right keys give the same rows, in any case and order', async () => {
    for (const key of ['SALE_DATE, Customer_Name, SKU_CODE', 'sku_code, customer_name, sale_date', 'source_file, sale_date, customer_name, sku_code', 'sale_date, customer_name, sku_code, units, revenue'])
      await cases(key, correct(COPY, {}, key), ALL, ALL, [true, true, true])
  })
  it('distinct-rows measure over a doubled fact hides the doubling from the card only', async () => {
    const r = await cases('distinct', correct(COPY, { measure: 'distinct' }, 'raw_id'), { ...NO_DEDUP, top: 'Minori 90829.50' }, { ...NO_DEDUP, top: 'Minori 90829.50' }, [true, true, false])
    expect(r.proofs.clean.diagnosis).toBe('The card is right, but gold still holds 110 doubled sales and every other report reads them. Fix it in silver, not in the measure.')
    await cases('distinct append', correct({ mode: 'append' }, { measure: 'distinct' }, 'raw_id'), { ...NO_DEDUP, top: 'Minori 90829.50' }, { bronze: 6220, silver: 3110, dimC: 144, dimP: 47, fact: 3110, top: 'Minori 90829.50' }, [true, false, false])
  })
  it('latest file only: one month', async () => {
    const one = { bronze: 116, silver: 110, dimC: 144, dimP: 47, fact: 110, top: 'Nagisa 23160.07' }
    const r = await cases('latest', correct({ mode: 'replace', files: 'latest' }), one, one, [false, true, true])
    expect(r.proofs.answer.diagnosis).toBe('Only export_2026-06.csv was loaded: 116 rows, one month. The question needs January to June.')
    await cases('latest append', correct({ mode: 'append', files: 'latest' }), one, { ...one, bronze: 232 }, [false, false, true])
  })
  it('Copy → Clear empties bronze', async () => {
    const empty = { bronze: 0, silver: 0, dimC: 144, dimP: 47, fact: 0, top: null }
    const r = await cases('copy-clear', built([['copy-files', COPY], ['clear-bronze'], ['sql-silver'], ...dims, ['card-top-chain']]), empty, empty, [false, true, false])
    expect(r.proofs.answer.diagnosis).toBe('Clear ran after Copy and emptied bronze: nothing reached silver.')
  })
  it('header = No: the header line became data and silver fails', async () => {
    const r = await cases('no header', correct({ mode: 'replace', header: false }), { bronze: 3140, silver: null }, { bronze: 3140, silver: null }, [false, null, false])
    expect(r.proofs.answer.diagnosis).toMatch(/first line of each file/)
    expect(r.run1.map((s) => s.status)).toEqual(['succeeded', 'failed', 'skipped', 'skipped', 'skipped', 'skipped'])
  })
  it('binary: 30 rows, no columns', async () => {
    const r = await cases('binary', correct({ mode: 'replace', format: 'binary' }), { bronze: 30, silver: null }, { bronze: 30, silver: null }, [false, null, false])
    expect(r.proofs.answer.diagnosis).toMatch(/Binary copies each file/)
  })
  it('delimiter ,: the files are not read as columns', async () => {
    // The CLI's sniffer refuses; if WASM reads each line as one field instead, silver is what fails.
    const r = await checkPipeline(port, correct({ mode: 'replace', delim: ',' }))
    expect(r.proofs.answer.ok).toBe(false)
    expect(r.run1[0].status === 'failed' || r.run1[1].status === 'failed').toBe(true)
    expect(r.proofs.answer.diagnosis).toMatch(/semicolons/)
  })
  it('fact before the dimensions fails on a missing table', async () => {
    const r = await cases('fact first', built([['copy-files', COPY], ['sql-silver'], ['fact-sellout'], ['dim-customer'], ['dim-product'], ['card-top-chain']]), { bronze: 3110, silver: 3000 }, { bronze: 3110, silver: 3000 }, [false, null, false])
    expect(r.run1[2].status).toBe('failed')
    expect(r.proofs.answer.diagnosis).toBe('Fact: sell-out reads pipe_kaiyo.gold_dim_customer, which isn\'t built yet at this point. Move it after Dimension: stores.')
  })
})

describe('pipeline: checks', () => {
  it('a check that fails stops the run when the next step waits for success', async () => {
    const withCheck = built([['copy-files', COPY], ['sql-silver'], ['check-unique'], ...dims, ['card-top-chain']], 'raw_id')
    const r = await checkPipeline(port, withCheck)
    expect(r.run1.map((s) => s.status)).toEqual(['succeeded', 'succeeded', 'failed', 'skipped', 'skipped', 'skipped', 'skipped'])
    expect(r.run1[2].rows).toBe(110)
    expect(r.proofs.note).toMatch(/stopped the run/)
  })
  it('the same check passes on the right silver, and the key check finds every sale its store', async () => {
    const state = built([['copy-files', COPY], ['sql-silver'], ['check-unique'], ['check-rows'], ['dim-customer'], ['dim-product'], ['fact-sellout'], ['check-keys'], ['card-top-chain'], ['card-row-count']])
    const r = await checkPipeline(port, state)
    expect(r.run2.map((s) => [s.status, s.rows])).toEqual([['succeeded', 3110], ['succeeded', 3000], ['succeeded', 0], ['succeeded', 3000], ['succeeded', 144], ['succeeded', 47], ['succeeded', 3000], ['succeeded', 0], ['succeeded', 'Minori, 90,829.50'], ['succeeded', 595]])
    expect(r.solved).toBe(true)
  })
  it('a check that fails but is followed by a Completed step is named', async () => {
    const state = built([['copy-files', COPY], ['sql-silver'], ['check-unique'], ['dim-customer', { when: 'completed' }], ['dim-product'], ['fact-sellout'], ['card-top-chain']], 'raw_id')
    const r = await checkPipeline(port, state)
    expect(r.run1.map((x) => x.status)).toEqual(['succeeded', 'succeeded', 'failed', 'succeeded', 'succeeded', 'succeeded', 'succeeded'])
    expect(r.proofs.answer.diagnosis).toMatch(/raw_id numbers/)
  })
})

describe('pipeline: Run again without reset', () => {
  it('Append twice shows 6,220 in bronze on real rows', async () => {
    const state = correct({ mode: 'append' })
    await resetWork(port)
    await runAll(port, state)
    expect((await snapshot(port)).counts.bronze_sellout_raw).toBe(3110)
    await runAll(port, state)
    expect((await snapshot(port)).counts.bronze_sellout_raw).toBe(6220)
    await resetWork(port)
    expect((await snapshot(port)).counts.bronze_sellout_raw).toBeNull()
  })
  it('card-row-count: 595 right, 618 without de-duplication', async () => {
    await resetWork(port)
    await runAll(port, built([['copy-files', COPY], ['sql-silver'], ...dims, ['card-row-count']]))
    expect(Number((await port.query('SELECT sales FROM pipe_kaiyo.report_row_count')).rows[0][0])).toBe(595)
    await resetWork(port)
    await runAll(port, { ...built([['copy-files', COPY], ['sql-silver'], ...dims, ['card-row-count']]), dedup: false })
    expect(Number((await port.query('SELECT sales FROM pipe_kaiyo.report_row_count')).rows[0][0])).toBe(618)
  })
  it('a typo in the blank fails the step with DuckDB\'s message and the column list', async () => {
    await resetWork(port)
    const j = await runAll(port, correct(COPY, {}, 'sale_dat, customer_name'))
    expect(j[1].status).toBe('failed')
    expect(j[1].message).toContain('raw_id, source_file, sale_date')
    expect(j[2].status).toBe('skipped')
  })
})
