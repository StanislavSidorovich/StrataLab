import { describe, expect, it } from 'vitest'
import { chartData, clip, compactNumber, isAscending, labelEvery, niceTicks, pickChart, timeTicks, toggleSeries, valueRange, withType, type ChartColumn } from '../src/core/chart'

const n = (name: string, ascending = false): ChartColumn => ({ name, kind: 'number', ascending })
const t = (name: string): ChartColumn => ({ name, kind: 'text' })
const d = (name: string): ChartColumn => ({ name, kind: 'date' })

describe('picking a chart from the columns', () => {
  it('has nothing to plot without a number', () => {
    expect(pickChart([t('name'), d('day')])).toBeNull()
  })

  it('draws numbers over a date as lines', () => {
    expect(pickChart([d('month'), n('revenue'), n('cost')])).toEqual({ type: 'line', x: 0, ys: [1, 2] })
  })

  it('draws numbers per label as bars, and skips an id for Y', () => {
    expect(pickChart([n('customer_id'), t('name'), n('total')])).toEqual({ type: 'bar', x: 1, ys: [2] })
  })

  it('keeps an id on Y when it is the only number', () => {
    expect(pickChart([t('name'), n('id')])).toEqual({ type: 'bar', x: 0, ys: [1] })
  })

  it('draws two numbers as a scatter, or a line over an ascending one', () => {
    expect(pickChart([n('price'), n('quantity')])).toEqual({ type: 'scatter', x: 0, ys: [1] })
    expect(pickChart([n('year', true), n('sales')])).toEqual({ type: 'line', x: 0, ys: [1] })
  })

  it('draws a single number per row', () => {
    expect(pickChart([n('total')])).toEqual({ type: 'bar', x: -1, ys: [0] })
  })

  it('takes at most four series', () => {
    expect(pickChart([t('k'), n('a'), n('b'), n('c'), n('d'), n('e')])?.ys).toEqual([1, 2, 3, 4])
  })
})

describe('changing the chart', () => {
  it('drops series past the new type’s limit', () => {
    expect(withType({ type: 'line', x: 0, ys: [1, 2, 3, 4] }, 'scatter')).toEqual({ type: 'scatter', x: 0, ys: [1, 2, 3] })
  })

  it('adds and removes series, keeping the last one', () => {
    const s = { type: 'bar' as const, x: 0, ys: [1] }
    expect(toggleSeries(s, 2).ys).toEqual([1, 2])
    expect(toggleSeries({ ...s, ys: [1, 2] }, 1).ys).toEqual([2])
    expect(toggleSeries(s, 1).ys).toEqual([1])
    expect(toggleSeries({ ...s, ys: [1, 2, 3, 4] }, 5).ys).toEqual([1, 2, 3, 5])
  })

  it('knows an ascending column', () => {
    expect(isAscending([2020, 2021, 2023])).toBe(true)
    expect(isAscending([1, 1, 2])).toBe(false)
    expect(isAscending([1, null, 2])).toBe(false)
    expect(isAscending([1])).toBe(false)
  })
})

describe('the points', () => {
  const xs = [3, 1, null, 2]
  const ys = [30, 10, 0, 20]

  it('sorts a line by X and leaves out rows with no X', () => {
    const data = chartData({ type: 'line', x: 0, ys: [1] }, 'number', 4, (r) => xs[r], (_, r) => ys[r])
    expect(data).toMatchObject({ scale: 'linear', xs: [1, 2, 3], ys: [[10, 20, 30]], blank: 1, cut: 0 })
  })

  it('keeps bars in the result’s order, a slot per label', () => {
    const data = chartData({ type: 'bar', x: 0, ys: [1] }, 'number', 4, (r) => xs[r], (_, r) => ys[r])
    expect(data).toMatchObject({ scale: 'band', labels: ['3', '1', '2'], xs: [0, 1, 2], ys: [[30, 10, 20]] })
  })

  it('cuts bars past the limit', () => {
    const data = chartData({ type: 'bar', x: -1, ys: [0] }, 'number', 250, (r) => r + 1, () => 1)
    expect(data.labels).toHaveLength(100)
    expect(data.cut).toBe(150)
  })

  it('places dates on a time axis', () => {
    expect(chartData({ type: 'scatter', x: 0, ys: [1] }, 'date', 1, () => 0, () => 1).scale).toBe('time')
  })
})

describe('axes', () => {
  it('picks round ticks that cover the data', () => {
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(-3, 7)).toEqual([-4, -2, 0, 2, 4, 6, 8])
    expect(niceTicks(0.1, 0.33)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35])
    expect(niceTicks(5, 5)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('writes numbers short', () => {
    expect([950, 1200, 3_400_000, 250_000, 0.25, -1500, 0].map(compactNumber)).toEqual(['950', '1.2K', '3.4M', '250K', '0.25', '-1.5K', '0'])
  })

  it('ticks dates by month or year when they span months', () => {
    const { ticks, label } = timeTicks(Date.UTC(2024, 0, 15), Date.UTC(2024, 11, 1))
    expect(ticks.map(label)).toEqual(['2024-04', '2024-07', '2024-10'])
    const years = timeTicks(Date.UTC(2015, 5), Date.UTC(2024, 5))
    expect(years.ticks.map(years.label)).toEqual(['2016', '2018', '2020', '2022', '2024'])
  })

  it('ticks dates by day or week when they span days', () => {
    const { ticks, label } = timeTicks(Date.UTC(2024, 2, 1), Date.UTC(2024, 2, 4))
    expect(ticks.map(label)).toEqual(['2024-03-01', '2024-03-02', '2024-03-03', '2024-03-04'])
  })

  it('puts 0 in the range of bars', () => {
    expect(valueRange([[5, 9], [null, 7]], true)).toEqual([0, 9])
    expect(valueRange([[5, 9]], false)).toEqual([5, 9])
    expect(valueRange([[null]], false)).toEqual([0, 1])
  })

  it('thins crowded labels and clips long ones', () => {
    expect(labelEvery(10, 35)).toBe(4)
    expect(labelEvery(80, 35)).toBe(1)
    expect(clip('Electronics', 6)).toBe('Elect…')
    expect(clip('TV', 6)).toBe('TV')
  })
})
