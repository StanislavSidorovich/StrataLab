// Tables between DuckDB and pandas (stage 7), without pyarrow: each column travels as its bytes
// (little-endian numbers, int64 microseconds for dates and times, one byte per boolean) or as a
// list of strings, with a null mask. src/python/lab.py reads and writes the same shape with numpy.
import { Bool, DataType, Float32, Float64, Int8, Int16, Int32, Int64, Table, TimestampMicrosecond, Uint8, Uint16, Uint32, Uint64, Utf8, makeData, makeVector, vectorFromArray, type Field, type Vector } from 'apache-arrow'
import { formatterFor } from '../db/format'

export type NumberDtype = 'int8' | 'int16' | 'int32' | 'int64' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float32' | 'float64'
export type PyDtype = NumberDtype | 'bool' | 'datetime64[us]' | 'str'

export interface PyColumn {
  name: string
  dtype: PyDtype
  /** a datetime column's time zone (TIMESTAMPTZ): its values are UTC */
  tz?: string
  /** the values' bytes, for every dtype but str */
  data?: Uint8Array
  /** the values, for str (null for NULL) */
  values?: (string | null)[]
  /** one byte per row, 1 where the value is NULL; left out when there are none */
  nulls?: Uint8Array
}

export interface PyFrame {
  /** rows in the columns */
  rows: number
  /** rows the DataFrame had (more than `rows` when it was cut to the row limit) */
  total?: number
  columns: PyColumn[]
}

const ARRAYS = {
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  int64: BigInt64Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  uint64: BigUint64Array,
  float32: Float32Array,
  float64: Float64Array,
} as const

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)

function nullMask(v: Vector, rows: number): Uint8Array | undefined {
  if (!v.nullCount) return undefined
  const m = new Uint8Array(rows)
  for (let i = 0; i < rows; i++) if (!v.isValid(i)) m[i] = 1
  return m
}

function numberDtype(f: Field): NumberDtype | null {
  const t = f.type
  if (DataType.isInt(t)) return `${t.isSigned ? 'int' : 'uint'}${t.bitWidth}` as NumberDtype
  if (DataType.isFloat(t)) return t.precision === 2 ? 'float64' : t.precision === 1 ? 'float32' : null
  return null
}

/** One DuckDB column for pandas. */
function toColumn(f: Field, v: Vector, rows: number): PyColumn {
  const name = f.name
  const nulls = nullMask(v, rows)
  const dtype = numberDtype(f)
  const t = f.type
  if (dtype) {
    // A copy: toArray() may be a view on DuckDB's buffer, which must not be handed to the worker.
    return { name, dtype, data: new Uint8Array(bytesOf(v.toArray() as ArrayBufferView)), nulls }
  }
  if (DataType.isDecimal(t) || (DataType.isFloat(t) && t.precision === 0)) {
    const fmt = formatterFor(f)
    const out = new Float64Array(rows)
    for (let i = 0; i < rows; i++) out[i] = nulls?.[i] ? NaN : Number(fmt(v.get(i)))
    return { name, dtype: 'float64', data: bytesOf(out), nulls }
  }
  if (DataType.isDate(t) || DataType.isTimestamp(t)) {
    // Arrow gives epoch milliseconds (with the microseconds as a fraction for TIMESTAMP).
    const out = new BigInt64Array(rows)
    for (let i = 0; i < rows; i++) if (!nulls?.[i]) out[i] = BigInt(Math.round(Number(v.get(i)) * 1000))
    const tz = DataType.isTimestamp(t) && t.timezone ? t.timezone : undefined
    return { name, dtype: 'datetime64[us]', ...(tz ? { tz } : {}), data: bytesOf(out), nulls }
  }
  if (DataType.isBool(t)) {
    const out = new Uint8Array(rows)
    for (let i = 0; i < rows; i++) out[i] = v.get(i) ? 1 : 0
    return { name, dtype: 'bool', data: out, nulls }
  }
  const fmt = DataType.isUtf8(t) || DataType.isLargeUtf8(t) || DataType.isDictionary(t) ? (x: unknown) => (x == null ? null : String(x)) : formatterFor(f)
  const values: (string | null)[] = new Array(rows)
  for (let i = 0; i < rows; i++) {
    const x = fmt(v.get(i))
    values[i] = x == null ? null : String(x)
  }
  return { name, dtype: 'str', values, nulls }
}

/** A DuckDB result as columns for pandas (lab.table, lab.sql). */
export function frameFromArrow(table: Table): PyFrame {
  const rows = table.numRows
  return { rows, columns: table.schema.fields.map((f, i) => toColumn(f, table.getChildAt(i)!, rows)) }
}

/** Arrow's validity bitmap (1 = has a value) from a null mask. */
function validity(nulls: Uint8Array, rows: number): Uint8Array {
  const bits = new Uint8Array(Math.ceil(rows / 8))
  for (let i = 0; i < rows; i++) if (!nulls[i]) bits[i >> 3] |= 1 << (i & 7)
  return bits
}

const ARROW_TYPES = {
  int8: () => new Int8(),
  int16: () => new Int16(),
  int32: () => new Int32(),
  int64: () => new Int64(),
  uint8: () => new Uint8(),
  uint16: () => new Uint16(),
  uint32: () => new Uint32(),
  uint64: () => new Uint64(),
  float32: () => new Float32(),
  float64: () => new Float64(),
} as const

/** The typed array over a column's bytes (copied, so it is aligned). */
function typed(dtype: NumberDtype | 'datetime64[us]', data: Uint8Array, rows: number) {
  const Arr = dtype === 'datetime64[us]' ? BigInt64Array : ARRAYS[dtype]
  const copy = data.slice(0, rows * Arr.BYTES_PER_ELEMENT)
  return new Arr(copy.buffer, 0, rows)
}

function fromColumn(c: PyColumn, rows: number): Vector {
  const isNull = (i: number) => !!c.nulls?.[i]
  const nullBitmap = c.nulls?.some((x) => x) ? validity(c.nulls, rows) : undefined
  if (c.dtype === 'str') return vectorFromArray((c.values ?? []).slice(0, rows).map((x, i) => (isNull(i) ? null : x)), new Utf8())
  if (c.dtype === 'bool') return vectorFromArray(Array.from({ length: rows }, (_, i) => (isNull(i) ? null : !!c.data![i])), new Bool())
  // makeData's types don't list `data` for every type it takes; the props are Arrow's own.
  if (c.dtype === 'datetime64[us]') return makeVector(makeData({ type: new TimestampMicrosecond(c.tz ?? null), length: rows, data: typed(c.dtype, c.data!, rows), nullBitmap } as never))
  return makeVector(makeData({ type: ARROW_TYPES[c.dtype](), length: rows, data: typed(c.dtype, c.data!, rows), nullBitmap } as never))
}

/** Unique column names for the grid: `x`, `x_1`, `x_2` (a DataFrame may repeat a name). */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>()
  return names.map((n) => {
    let name = n || 'column'
    for (let k = 1; taken.has(name.toLowerCase()); k++) name = `${n || 'column'}_${k}`
    taken.add(name.toLowerCase())
    return name
  })
}

/** A pandas DataFrame (as lab.py sends it) as an Arrow table, for the grid and for DuckDB. */
export function arrowFromFrame(frame: PyFrame): Table {
  const names = uniqueNames(frame.columns.map((c) => c.name))
  return new Table(Object.fromEntries(frame.columns.map((c, i) => [names[i], fromColumn(c, frame.rows)])))
}

/** The buffers a frame can hand over to a worker instead of copying them. */
export const transferables = (frame: PyFrame): ArrayBuffer[] =>
  frame.columns.flatMap((c) => [c.data?.buffer, c.nulls?.buffer]).filter((b): b is ArrayBuffer => b instanceof ArrayBuffer)
