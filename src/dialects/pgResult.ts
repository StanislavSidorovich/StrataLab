// A PGlite result as an Arrow table (stage 4), so PostgreSQL results use the same grid, copy and
// exports as DuckDB's. Each column keeps PostgreSQL's type name for the grid's header.
import { Bool, DateMillisecond, Field, Float64, Int32, Int64, RecordBatch, Schema, Struct, Table, TimestampMillisecond, Utf8, makeData, vectorFromArray, type DataType } from 'apache-arrow'

export interface PgField {
  name: string
  dataTypeID: number
}

/** PostgreSQL's type names by OID, for the ones a learner meets. */
export const PG_TYPES: Record<number, string> = {
  16: 'boolean', 17: 'bytea', 18: 'char', 19: 'name', 20: 'bigint', 21: 'smallint', 23: 'integer', 25: 'text', 26: 'oid',
  114: 'json', 700: 'real', 701: 'double precision', 1042: 'char', 1043: 'varchar', 1082: 'date', 1083: 'time',
  1114: 'timestamp', 1184: 'timestamptz', 1186: 'interval', 1266: 'timetz', 1700: 'numeric', 2950: 'uuid', 3802: 'jsonb',
  1000: 'boolean[]', 1005: 'smallint[]', 1007: 'integer[]', 1009: 'text[]', 1016: 'bigint[]', 1015: 'varchar[]', 1022: 'double precision[]',
}

/** The Arrow type a column becomes; anything else is text (JSON for objects and arrays). */
function arrowType(oid: number): DataType {
  switch (oid) {
    case 16: return new Bool()
    case 21: case 23: case 26: return new Int32()
    case 20: return new Int64()
    case 700: case 701: return new Float64()
    case 1082: return new DateMillisecond()
    case 1114: case 1184: return new TimestampMillisecond()
    default: return new Utf8()
  }
}

const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 1700])

function cell(v: unknown, oid: number): unknown {
  if (v == null) return null
  if (oid === 20) return typeof v === 'bigint' ? v : BigInt(v as number | string)
  if (v instanceof Date) return oid === 1082 || oid === 1114 || oid === 1184 ? v.getTime() : v.toISOString()
  if (v instanceof Uint8Array) return '\\x' + [...v].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (typeof v === 'object') return JSON.stringify(v)
  const t = arrowType(oid)
  return t instanceof Utf8 ? String(v) : v
}

export function pgToArrow(fields: PgField[], rows: unknown[][]): Table {
  // Arrow keeps one column per name: SELECT a.id, b.id gives id and id_2 (DuckDB says id_1).
  const seen = new Map<string, number>()
  const names = fields.map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, n)
    return n === 1 ? f.name : `${f.name}_${n}`
  })
  const cols = fields.map((f, i) => {
    const type = arrowType(f.dataTypeID)
    const meta = new Map([['pg_type', PG_TYPES[f.dataTypeID] ?? `oid ${f.dataTypeID}`]])
    if (NUMERIC.has(f.dataTypeID)) meta.set('numeric', 'true')
    const vec = vectorFromArray(rows.map((r) => cell(r[i], f.dataTypeID)) as never[], type)
    return { field: new Field(names[i], type, true, meta), data: vec.data[0] }
  })
  const schema = new Schema(cols.map((c) => c.field))
  const struct = makeData({ type: new Struct(schema.fields), length: rows.length, nullCount: 0, children: cols.map((c) => c.data) })
  return new Table([new RecordBatch(schema, struct)])
}
