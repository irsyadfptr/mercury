import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { SHORT_CRYPTO, SHORT_IDX, shortBacktest, shortCheck, shortCheckAt, shortSeries, STYLES, timeStopBars } from './shortSwing'

/** n daily bars from 2024-01-01 (every day, like crypto) with closes from f(i). */
function daily(n: number, f: (i: number) => number, volume = 1e6): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = f(i)
    const open = i ? f(i - 1) : close
    return { time: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), open, high: Math.max(open, close) * 1.005, low: Math.min(open, close) * 0.995, close, volume }
  })
}
/** 4-hour bars over the same days (six a day, UTC), closes from f(k). */
function fourH(days: number, f: (k: number) => number, volume = 1e6): Bar[] {
  return Array.from({ length: days * 6 }, (_, k) => {
    const close = f(k)
    const open = k ? f(k - 1) : close
    return { time: new Date(Date.UTC(2024, 0, 1) + k * 4 * 3600_000).toISOString(), open, high: Math.max(open, close) * 1.002, low: Math.min(open, close) * 0.998, close, volume }
  })
}

describe('short swing rules', () => {
  const up = daily(260, (i) => 100 * 1.003 ** i, 1e9)

  it('a 4H bar reads direction from the previous full day only (no peeking)', () => {
    const four = fourH(260, (k) => 100 * 1.0005 ** k)
    const s = shortSeries(up, four, STYLES.week, SHORT_CRYPTO)
    const k = 6 * 250 + 3 // a bar on day 250
    expect(up[s.dayIdx[k]].time).toBe(up[249].time)
  })

  it('a daily entry reads its own day', () => {
    const s = shortSeries(up, up, STYLES.month, SHORT_CRYPTO)
    expect(s.dayIdx[200]).toBe(200)
  })

  it('trend rules pass in a steady uptrend; the trigger decides the signal', () => {
    const c = shortCheck(up, up, STYLES.month, SHORT_CRYPTO)!
    expect(c.rules.find((r) => r.id === 'trend')?.pass).toBe(true)
    expect(c.rules.find((r) => r.id === 'stack')?.pass).toBe(true)
    expect(c.rules.find((r) => r.id === 'big')?.pass).toBe(true)
    expect(c.rules.find((r) => r.id === 'liquidity')?.pass).toBe(true)
  })

  it('finds a breakout with volume and sets a stop below the swing low, at most 2× ATR', () => {
    const bars = daily(260, (i) => (i < 250 ? 100 * 1.003 ** i : 100 * 1.003 ** 249 * (1 + (i - 249) * 0.002)), 1e9)
    bars[259] = { ...bars[259], close: bars[258].close * 1.05, high: bars[258].close * 1.06, volume: 5e9 }
    const s = shortSeries(bars, bars, STYLES.month, SHORT_CRYPTO)
    const c = shortCheckAt(s, 259, STYLES.month, SHORT_CRYPTO, { reach: false })
    expect(c.trigger).toBe('breakout')
    expect(c.stop).toBeLessThan(c.entry)
    expect(c.entry - c.stop!).toBeLessThanOrEqual(2 * c.atr! + SHORT_CRYPTO.step(c.entry)) // rounded down one price step at most
    expect(c.target).toBeCloseTo(c.entry + 2 * c.risk!, 2)
  })

  it('downtrend: no trend pass, no signal', () => {
    const c = shortCheck(daily(260, (i) => 200 * 0.997 ** i, 1e9), daily(260, (i) => 200 * 0.997 ** i, 1e9), STYLES.month, SHORT_CRYPTO)!
    expect(c.rules.find((r) => r.id === 'trend')?.pass).toBe(false)
    expect(c.signal).toBe(false)
  })

  it('fees lower every trade', () => {
    const wave = daily(400, (i) => 100 * 1.002 ** i * (1 + 0.04 * Math.sin(i / 4)), 1e9)
    const gross = shortBacktest(wave, wave, STYLES.month, SHORT_CRYPTO, { fees: false, reach: false })
    const net = shortBacktest(wave, wave, STYLES.month, SHORT_CRYPTO, { reach: false })
    expect(gross.trades.length).toBeGreaterThan(0)
    expect(net.trades.length).toBe(gross.trades.length)
    net.trades.forEach((t, k) => expect(t.r).toBeLessThan(gross.trades[k].r))
  })

  it('time stop in entry bars', () => {
    expect(timeStopBars(STYLES.week, SHORT_IDX)).toBe(10) // 5 days × 2 four-hour blocks
    expect(timeStopBars(STYLES.week, SHORT_CRYPTO)).toBe(42) // 7 days × 6
    expect(timeStopBars(STYLES.month, SHORT_IDX)).toBe(20)
  })

  it('IDX day of an hourly bar is its WIB date', () => {
    expect(SHORT_IDX.dayOf('2026-11-16T20:00:00.000Z')).toBe('2026-11-17')
  })
})
