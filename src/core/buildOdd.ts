// The sentence of card P8 (spec 3.7): the counts come from the data, and every claim in it is checked against the data too.
export interface OddCounts {
  noRevenue: number
  noUnits: number
  /** sales with negative units */
  returns: number
  /** of those, the ones whose revenue is positive */
  returnsPositive: number
  /** of those, the ones whose revenue is negative */
  returnsNegative: number
}

const n = (x: number) => x.toLocaleString('en-US')
const sales = (x: number) => (x === 1 ? 'sale has' : 'sales have')

/** "174 sales have no revenue, 82 have no units, and 106 have negative units (returns). …"; no word about returns when there are none. */
export function oddText(o: OddCounts): string {
  const head = `${n(o.noRevenue)} ${sales(o.noRevenue)} no revenue, ${n(o.noUnits)} ${o.noUnits === 1 ? 'has' : 'have'} no units`
  if (o.returns === 0) return `${head}, and none have negative units (returns).`
  const first = `${head}, and ${n(o.returns)} ${o.returns === 1 ? 'has' : 'have'} negative units (returns).`
  const rest = 'a real team would agree the sign with the distributor before the numbers go to the Head of Sales.'
  const agree = `We keep both as sent; ${rest}`
  const plain = `We keep them as sent; ${rest}`
  const sign = 'this distributor reports the money of the original sale'
  if (o.returnsNegative > 0 || o.returnsPositive === 0) return `${first} ${plain}`
  if (o.returnsPositive === o.returns) return `${first} ${o.returns === 1 ? 'Its' : 'Their'} revenue came positive: ${sign}. ${agree}`
  return `${first} Where there is a revenue (${n(o.returnsPositive)} of them) it came positive: ${sign}. ${agree}`
}
