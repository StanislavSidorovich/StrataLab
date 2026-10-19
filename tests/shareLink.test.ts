import { describe, expect, it } from 'vitest'
import { MAX_SHARED_TABS, decodeShare, encodeShare, hashWithoutShare, parseShare, planShare, shareDataFromHash, shareUrl } from '../src/core/shareLink'
import { packText } from '../src/core/ddlLink'

const loaded = { datasets: ['chinook', 'northwind'], demoTables: ['customers', 'orders', 'order_items', 'products'], ownTables: ['sales_2024', 'my table'] }

describe('Share: what a link needs', () => {
  it('takes the datasets the queries name', () => {
    const { share } = planShare([{ title: 'q', sql: 'SELECT * FROM chinook."Album" a JOIN chinook.Artist USING (ArtistId)' }], loaded)
    expect(share.datasets).toEqual(['chinook'])
    expect(share.demo).toBe(false)
  })
  it('notices the demo shop and the user’s own tables', () => {
    const { share, notShared } = planShare([{ title: 'q', sql: 'SELECT * FROM orders o JOIN sales_2024 s USING (id) JOIN "my table" m USING (id)' }], loaded)
    expect(share.demo).toBe(true)
    expect(notShared).toEqual(['sales_2024', 'my table'])
  })
  it('needs the demo shop for demo.orders and for a bare orders, unless the sender has their own', () => {
    expect(planShare([{ title: 'q', sql: 'SELECT * FROM demo.orders' }], loaded).share.demo).toBe(true)
    expect(planShare([{ title: 'q', sql: 'x = lab.table("demo.orders")', dialect: 'python' }], loaded).share.demo).toBe(true)
    const own = { ...loaded, ownTables: ['orders'] }
    const r = planShare([{ title: 'q', sql: 'SELECT * FROM orders' }], own)
    expect(r.share.demo).toBe(false)
    expect(r.notShared).toEqual(['orders'])
  })
  it('ignores names in comments, strings and longer names', () => {
    const { share, notShared } = planShare([{ title: 'q', sql: "-- from orders\nSELECT 'sales_2024', 1 AS orders_total /* chinook.x */ FROM customers_2" }], loaded)
    expect(share).toMatchObject({ datasets: [], demo: false })
    expect(notShared).toEqual([])
  })
  it('keeps the dialect only when it is not DuckDB', () => {
    const { share } = planShare([{ title: 'a', sql: 'SELECT 1', dialect: 'duckdb' }, { title: 'b', sql: 'SELECT TOP 1 1', dialect: 'tsql' }], loaded)
    expect(share.tabs).toEqual([{ title: 'a', sql: 'SELECT 1' }, { title: 'b', sql: 'SELECT TOP 1 1', dialect: 'tsql' }])
  })
})

describe('Share: Python tabs', () => {
  const loaded = { datasets: ['quaera', 'chinook'], demoTables: ['orders', 'customers'], ownTables: [] }
  it('keeps l: python and finds datasets named in strings, not in comments', () => {
    const code = '# chinook.Album\norders = lab.table("quaera.orders")\n# %%\nlab.sql("SELECT 1")'
    const { share } = planShare([{ title: 'p', sql: code, dialect: 'python' }], loaded)
    expect(share.datasets).toEqual(['quaera'])
    expect(share.tabs).toEqual([{ title: 'p', sql: code, dialect: 'python' }])
  })
  it('round-trips and reads old links as before', async () => {
    const share = { datasets: ['quaera'], demo: false, tabs: [{ title: 'p', sql: 'x = lab.table("quaera.orders")', dialect: 'python' as const }, { title: 'q', sql: 'SELECT 1' }] }
    expect(await decodeShare(await encodeShare(share))).toEqual(share)
    expect(parseShare('{"v":1,"t":[{"q":"SELECT 1","l":"postgres"}]}').tabs[0].dialect).toBe('postgres')
    expect(parseShare('{"v":1,"t":[{"q":"print(1)","l":"python"}]}').tabs[0]).toEqual({ title: 'Shared query', sql: 'print(1)', dialect: 'python' })
  })
})

describe('Share: the link', () => {
  it('round-trips', async () => {
    const share = { datasets: ['chinook'], demo: true, tabs: [{ title: 'Выручка', sql: "SELECT 'ё' AS x;", dialect: 'postgres' as const }] }
    expect(await decodeShare(await encodeShare(share))).toEqual(share)
  })
  it('refuses damaged and unexpected links', async () => {
    await expect(decodeShare('not-a-link')).rejects.toThrow(/damaged/)
    expect(() => parseShare('{"v":2,"t":[{"q":"x"}]}')).toThrow(/newer version/)
    expect(() => parseShare('{"v":1,"t":[]}')).toThrow(/no queries/)
    expect(() => parseShare('{"v":1,"d":["../x"],"t":[{"q":"x"}]}')).toThrow(/dataset/)
    expect(() => parseShare('{"v":1,"t":[{"q":"x","l":"oracle"}]}')).toThrow(/dialect/)
    expect(() => parseShare(JSON.stringify({ v: 1, t: Array.from({ length: MAX_SHARED_TABS + 1 }, () => ({ q: 'x' })) }))).toThrow(/more than/)
    await expect(decodeShare(await packText('x'.repeat(2_000_000)))).rejects.toThrow(/too large/)
  })
  it('names an untitled query', () => {
    expect(parseShare('{"v":1,"t":[{"q":"SELECT 1"}]}').tabs[0].title).toBe('Shared query')
  })
  it('reads and removes its part of the fragment', () => {
    expect(shareDataFromHash('#s=abc&ds=chinook')).toBe('abc')
    expect(shareDataFromHash('#ds=chinook')).toBeNull()
    expect(hashWithoutShare('#s=abc&ds=chinook')).toBe('#ds=chinook')
    expect(hashWithoutShare('#s=abc')).toBe('')
    expect(shareUrl('https://lab.quaera.app', '/', 'abc')).toBe('https://lab.quaera.app/#s=abc')
  })
})
