// Turns Arrow cell values into text for the results grid and for exports.
// DuckDB-WASM hands back dates as epoch milliseconds and decimals as big
// numbers without their scale, so the column type decides the format.
import { DataType, util, type Field } from 'apache-arrow'

export type CellFormatter = (v: unknown) => string | number | null

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function isoTimestamp(ms: number): string {
  const d = new Date(ms)
  const base = `${isoDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  const frac = d.getUTCMilliseconds()
  return frac ? `${base}.${String(frac).padStart(3, '0')}` : base
}

function scaled(digits: string, scale: number): string {
  if (!scale) return digits
  const neg = digits.startsWith('-')
  const abs = (neg ? digits.slice(1) : digits).padStart(scale + 1, '0')
  return (neg ? '-' : '') + abs.slice(0, -scale) + '.' + abs.slice(-scale)
}

function json(v: unknown): string {
  return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x))
}

export function formatterFor(field: Field): CellFormatter {
  const t = field.type
  if (DataType.isDecimal(t)) {
    const scale = t.scale
    return (v) => (v == null ? null : scaled(util.bigNumToString(v as never), scale))
  }
  if (DataType.isDate(t)) return (v) => (v == null ? null : isoDate(Number(v)))
  if (DataType.isTimestamp(t)) return (v) => (v == null ? null : isoTimestamp(Number(v)))
  if (DataType.isTime(t)) {
    // DuckDB TIME arrives in microseconds (bigint)
    return (v) => {
      if (v == null) return null
      const totalSec = Math.floor(Number(v) / 1e6)
      return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}`
    }
  }
  if (DataType.isInt(t) || DataType.isFloat(t)) {
    return (v) => {
      if (v == null) return null
      if (typeof v === 'bigint') {
        const n = Number(v)
        return Number.isSafeInteger(n) ? n : v.toString()
      }
      return v as number
    }
  }
  if (DataType.isBool(t)) return (v) => (v == null ? null : v ? 'true' : 'false')
  if (DataType.isUtf8(t) || DataType.isLargeUtf8(t)) return (v) => (v == null ? null : (v as string))
  return (v) => {
    if (v == null) return null
    if (typeof v === 'object' && v !== null && 'toJSON' in v) return json((v as { toJSON(): unknown }).toJSON())
    if (typeof v === 'bigint') return v.toString()
    if (typeof v === 'object') return json(v)
    return String(v)
  }
}

export function isNumericField(field: Field): boolean {
  const t = field.type
  return DataType.isInt(t) || DataType.isFloat(t) || DataType.isDecimal(t)
}

/** Short type label for column headers: "INTEGER", "DECIMAL(10,2)", "DATE"… */
export function typeLabel(field: Field): string {
  const t = field.type
  if (DataType.isDecimal(t)) return `DECIMAL(${t.precision},${t.scale})`
  if (DataType.isInt(t)) return t.bitWidth === 64 ? 'BIGINT' : t.bitWidth === 32 ? 'INTEGER' : t.bitWidth === 16 ? 'SMALLINT' : 'TINYINT'
  if (DataType.isFloat(t)) return 'DOUBLE'
  if (DataType.isUtf8(t) || DataType.isLargeUtf8(t)) return 'VARCHAR'
  if (DataType.isDate(t)) return 'DATE'
  if (DataType.isTimestamp(t)) return 'TIMESTAMP'
  if (DataType.isTime(t)) return 'TIME'
  if (DataType.isBool(t)) return 'BOOLEAN'
  return String(t).toUpperCase()
}
