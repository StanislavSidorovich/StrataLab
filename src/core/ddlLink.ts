// `#ddl=<data>`: CREATE TABLE statements sent by model.quaera.app (StrataSQL) in the URL fragment.
// The fragment never reaches a server. Same packing as StrataSQL's share links: UTF-8,
// deflate-raw, base64url (no padding). StrataSQL's src/core/shareLink.ts must stay in step.

/** The fragment key: `https://lab.quaera.app/#ddl=<data>`. */
export const DDL_PARAM = 'ddl'

/** A script that inflates past this many bytes is refused (a crafted link could inflate without end). */
export const MAX_DDL_BYTES = 5_000_000

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Text packed for a URL fragment: UTF-8, deflate-raw, base64url (also the `#s=` share links). */
export async function packText(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')))
}

export async function encodeDdl(sql: string): Promise<string> {
  return packText(sql)
}

export class TooLarge extends Error {}

/** Inflates chunk by chunk and stops at the limit, so a crafted link cannot fill the memory. */
async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new TooLarge()
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Text back from {@link packText}; throws TooLarge past `limit` bytes, or an error for a damaged link. */
export async function unpackText(data: string, limit: number): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(await inflate(fromBase64Url(data), limit))
}

/** The script back from {@link encodeDdl}; a damaged or oversized link throws a readable error. */
export async function decodeDdl(data: string): Promise<string> {
  try {
    return await unpackText(data, MAX_DDL_BYTES)
  } catch (e) {
    if (e instanceof TooLarge) throw new Error('The model in the link is too large to open.')
    throw new Error('The model link is damaged or incomplete (it may have been cut when it was copied).')
  }
}

/** The `ddl` data in a URL fragment, or null when there is none. */
export function ddlDataFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get(DDL_PARAM) || null
}

/** The fragment without its `ddl` part ('' when nothing else is left). */
export function hashWithoutDdl(hash: string): string {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  p.delete(DDL_PARAM)
  const rest = p.toString()
  return rest ? `#${rest}` : ''
}
