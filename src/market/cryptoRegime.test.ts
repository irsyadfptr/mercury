import { describe, expect, it } from 'vitest'
import { altBreadth, btcTrend, composite, cryptoMood, cryptoMoodSeries, dominancePart, drawdownPart, fundingPart, momentumPart, REGIME_WEIGHTS, type RegimePart } from './cryptoRegime'
import type { Bar } from './indicators'

const day = (i: number) => new Date(Date.UTC(2023, 0, 1) + i * 864e5).toISOString().slice(0, 10)
const bars = (closes: number[]): Bar[] => closes.map((c, i) => ({ time: day(i), open: c, high: c, low: c, close: c, volume: 1 }))
const rising = (n: number, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step)
const falling = (n: number, start = 1000, step = 1) => Array.from({ length: n }, (_, i) => start - i * step)

describe('BTC trend part', () => {
  it('needs 220 closes', () => {
    expect(btcTrend(rising(219)).score).toBeUndefined()
  })
  it('scores a bull stack with a rising MA200 at 100 and a bear stack with a falling one at 5', () => {
    expect(btcTrend(rising(300))).toMatchObject({ score: 100, label: 'bullStack' })
    expect(btcTrend(falling(300))).toMatchObject({ score: 5, label: 'bearStack' })
  })
  it('a pullback inside the uptrend scores 65 + 10', () => {
    // Long rise, then a dip below the MA50 that stays above the MA200.
    const c = [...rising(280, 100, 1), ...Array(20).fill(330)]
    expect(btcTrend(c)).toMatchObject({ label: 'pullback', score: 75 })
  })
})

describe('alt breadth part', () => {
  it('needs 5 alts with 200 days', () => {
    expect(altBreadth([rising(250), rising(250), rising(250), rising(250), rising(150)]).score).toBeUndefined()
  })
  it('maps % above MA200 to the band and adds +5 when the MA50 breadth leads', () => {
    const up = rising(250)
    // 3 of 5 above MA200 (60% → 65); MA50 breadth also 60%: steady.
    expect(altBreadth([up, up, up, falling(250), falling(250)])).toMatchObject({ score: 65, label: 'steady' })
    // Fell for 200 days, then rose for 50: above the MA50, still below the MA200 → thrust.
    const turning = [...falling(200, 1000, 2), ...rising(50, 600, 1)]
    expect(altBreadth([up, turning, turning, turning, turning])).toMatchObject({ label: 'thrust', score: 30 })
  })
})

describe('dominance part', () => {
  const flat = Array(31).fill(55)
  it('needs 31 readings', () => expect(dominancePart(flat.slice(1), 90).score).toBeUndefined())
  it('reads dominance together with BTC trend', () => {
    expect(dominancePart([...flat.slice(1), 53], 90)).toMatchObject({ score: 90, label: 'btcUp.falling' })
    expect(dominancePart([...flat.slice(1), 57], 20)).toMatchObject({ score: 30, label: 'btcDown.rising' })
    expect(dominancePart(flat, 20)).toMatchObject({ score: 25 })
  })
  it('adds +5 at a washout extreme and −5 at a froth extreme', () => {
    expect(dominancePart(Array(31).fill(63), 20).score).toBe(30)
    expect(dominancePart(Array(31).fill(39), 90).score).toBe(70)
  })
})

describe('funding part', () => {
  it('needs 2 rates and bands the average 8h rate', () => {
    expect(fundingPart([0.0001]).score).toBeUndefined()
    expect(fundingPart([-0.0002, -0.0001]).score).toBe(80)
    expect(fundingPart([0.0001, 0.0001]).score).toBe(75)
    expect(fundingPart([0.0004, 0.0005]).score).toBe(30)
    expect(fundingPart([0.001, 0.002]).score).toBe(10)
  })
  it('ignores non-finite rates', () => expect(fundingPart([NaN, 0.0001, 0.0001]).values?.count).toBe(2))
})

describe('drawdown part', () => {
  it('needs a year of closes', () => expect(drawdownPart(rising(364)).score).toBeUndefined())
  it('scores near the high well and a deep drawdown badly', () => {
    expect(drawdownPart(rising(400)).values?.drawdown).toBeCloseTo(0)
    expect(drawdownPart([...rising(300, 100, 1), ...falling(100, 399, 3)]).values?.drawdown).toBeGreaterThan(50)
  })
})

describe('momentum part', () => {
  it('needs 5 coins and gives a washout a contrarian 35', () => {
    expect(momentumPart([rising(40), rising(40)]).score).toBeUndefined()
    expect(momentumPart(Array(5).fill(rising(40)))).toMatchObject({ score: 90, label: 'thrust' })
    expect(momentumPart(Array(10).fill(falling(40)))).toMatchObject({ score: 35, label: 'washout' })
  })
})

describe('composite', () => {
  const part = (id: RegimePart['id'], score?: number): RegimePart => ({ id, weight: REGIME_WEIGHTS[id], score })
  it('shares out missing weight while 4 parts and 65% remain', () => {
    const c = composite([part('btcTrend', 80), part('altBreadth', 60), part('dominance'), part('funding'), part('drawdown', 40), part('momentum', 20)])
    // (80×.25 + 60×.2 + 40×.15 + 20×.1) / .7 = 40 / .7 = 57.1
    expect(c).toEqual({ score: 57, coverage: expect.closeTo(0.7) })
  })
  it('gives no score with fewer than 4 parts', () => {
    expect(composite([part('btcTrend', 80), part('altBreadth', 60), part('drawdown', 40)])).toBeUndefined()
  })
})

describe('cryptoMood and its history', () => {
  const btc = bars(rising(400, 100, 1))
  const alts = Array.from({ length: 6 }, () => bars(rising(400, 50, 0.5)))
  it('is healthy in a broad uptrend', () => {
    const m = cryptoMood(btc, alts, { funding: [0.0001, 0.0001] })!
    expect(m.light).toBe('green')
    expect(m.parts.find((p) => p.id === 'dominance')!.score).toBeUndefined()
  })
  it('the history uses only data up to each date and matches the live price-only score on the last day', () => {
    const series = cryptoMoodSeries(btc, alts)
    expect(series.has(day(100))).toBe(false) // under 220 BTC closes: no trend part, too few parts
    expect(series.get(day(399))).toBe(cryptoMood(btc, alts)!.score)
  })
})
