import { describe, expect, it } from 'vitest'
import { crc32 as nodeCrc32, deflateRawSync, inflateRawSync } from 'node:zlib'
import { crc32, exportFileNames, zipEntry, zipFiles } from '../src/core/zip'

/** Reads an archive back the way an unzip tool does: from the central directory at the end. */
function unzip(zip: Uint8Array): Map<string, { text: string; method: number; flags: number }> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  expect(v.getUint32(end + 12, true)).toBe(end - p)
  const out = new Map<string, { text: string; method: number; flags: number }>()
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const flags = v.getUint16(p + 8, true)
    const method = v.getUint16(p + 10, true)
    const crc = v.getUint32(p + 16, true)
    const csize = v.getUint32(p + 20, true)
    const size = v.getUint32(p + 24, true)
    const nlen = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nlen))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const packed = zip.subarray(start, start + csize)
    const raw = method === 8 ? new Uint8Array(inflateRawSync(packed)) : packed
    expect(raw.length).toBe(size)
    expect(nodeCrc32(raw)).toBe(crc)
    out.set(name, { text: new TextDecoder().decode(raw), method, flags })
    p += 46 + nlen
  }
  return out
}

const bytes = (s: string) => new TextEncoder().encode(s)

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('writes an archive an unzip tool reads back, stored and deflated', () => {
    const big = 'id,name\n' + Array.from({ length: 2000 }, (_, i) => `${i},Québec ${i % 7}`).join('\n') + '\n'
    const small = 'a\n1\n'
    const zip = zipFiles([zipEntry('customers.csv', bytes(big), new Uint8Array(deflateRawSync(bytes(big)))), zipEntry('tiny.csv', bytes(small))])
    const files = unzip(zip)
    expect([...files.keys()]).toEqual(['customers.csv', 'tiny.csv'])
    expect(files.get('customers.csv')).toMatchObject({ text: big, method: 8, flags: 0x0800 })
    expect(files.get('tiny.csv')).toMatchObject({ text: small, method: 0 })
    expect(zip.length).toBeLessThan(big.length)
  })

  it('keeps the raw bytes when deflating does not make them smaller', () => {
    const raw = bytes('x')
    expect(zipEntry('x.csv', raw, new Uint8Array(deflateRawSync(raw))).method).toBe(0)
  })

  it('keeps UTF-8 names and an empty archive valid', () => {
    expect([...unzip(zipFiles([zipEntry('Ventes_été.csv', bytes('a\n'))])).keys()]).toEqual(['Ventes_été.csv'])
    expect(unzip(zipFiles([])).size).toBe(0)
  })
})

describe('export file names', () => {
  it('replaces characters Windows refuses and keeps names apart on a case-blind disk', () => {
    expect(exportFileNames(['fact_sellout', 'a/b', 'what?', 'Orders', 'orders', 'ORDERS', 'trail. '], 'csv')).toEqual([
      'fact_sellout.csv',
      'a_b.csv',
      'what_.csv',
      'Orders.csv',
      'orders_2.csv',
      'ORDERS_3.csv',
      'trail.csv',
    ])
  })
})
