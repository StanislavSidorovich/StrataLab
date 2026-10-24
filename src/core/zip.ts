// A .zip of a few files, for “Export all tables as CSV” where the browser can't write to a folder.
// The writer is ours (the format is small): each file stored, or deflated when the browser's
// CompressionStream made it smaller. No ZIP64: fine below 4 GB and 65,535 files.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** One file of the archive: `data` is the raw bytes (method 0) or a raw deflate of them (method 8). */
export interface ZipEntry {
  name: string
  crc: number
  size: number
  method: 0 | 8
  data: Uint8Array
}

/** A file for the archive; `deflated` (raw deflate of `raw`) is kept only when it is smaller. */
export function zipEntry(name: string, raw: Uint8Array, deflated?: Uint8Array): ZipEntry {
  const packed = deflated && deflated.length < raw.length
  return { name, crc: crc32(raw), size: raw.length, method: packed ? 8 : 0, data: packed ? deflated : raw }
}

/** MS-DOS time and date, local time, as zip keeps them. */
function dosTime(d: Date): [time: number, date: number] {
  const year = Math.max(1980, d.getFullYear())
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()]
}

/** The archive's bytes. Names are UTF-8 (flag bit 11). */
export function zipFiles(entries: ZipEntry[], at = new Date()): Uint8Array {
  const [time, date] = dosTime(at)
  const names = entries.map((e) => new TextEncoder().encode(e.name))
  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0)
  const centralSize = names.reduce((n, b) => n + 46 + b.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const v = new DataView(out.buffer)
  let p = 0
  const u16 = (x: number) => {
    v.setUint16(p, x, true)
    p += 2
  }
  const u32 = (x: number) => {
    v.setUint32(p, x, true)
    p += 4
  }
  const bytes = (b: Uint8Array) => {
    out.set(b, p)
    p += b.length
  }
  const offsets: number[] = []
  entries.forEach((e, i) => {
    offsets.push(p)
    u32(0x04034b50)
    u16(20), u16(0x0800), u16(e.method), u16(time), u16(date)
    u32(e.crc), u32(e.data.length), u32(e.size)
    u16(names[i].length), u16(0)
    bytes(names[i])
    bytes(e.data)
  })
  const centralAt = p
  entries.forEach((e, i) => {
    u32(0x02014b50)
    u16(20), u16(20), u16(0x0800), u16(e.method), u16(time), u16(date)
    u32(e.crc), u32(e.data.length), u32(e.size)
    u16(names[i].length), u16(0), u16(0), u16(0), u16(0)
    u32(0), u32(offsets[i])
    bytes(names[i])
  })
  const centralEnd = p
  u32(0x06054b50)
  u16(0), u16(0), u16(entries.length), u16(entries.length)
  u32(centralEnd - centralAt), u32(centralAt), u16(0)
  return out
}

/**
 * File names for a dataset's tables: characters Windows refuses become `_`, and names that would
 * be the same file on a case-blind disk (Windows, macOS) get `_2`, `_3`…
 */
export function exportFileNames(tables: string[], ext: string): string[] {
  const seen = new Set<string>()
  return tables.map((t) => {
    const base = t.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || 'table'
    let name = `${base}.${ext}`
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}_${n}.${ext}`
    seen.add(name.toLowerCase())
    return name
  })
}
