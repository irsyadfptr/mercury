import { describe, expect, it } from 'vitest'
import { parseHistory } from './idx'
import { atr, checkSetup, ema, lowestLow, macd, sma, toWeekly, weeklyTrendSeries, type Bar } from './indicators'

const bar = (time: string, close: number, extra: Partial<Bar> = {}): Bar => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 1e6, ...extra })
/** n weekday bars from Mon 2025-01-06 with closes from f(i). */
function series(n: number, f: (i: number) => number, volume = 1e6): Bar[] {
  const out: Bar[] = []
  const d = new Date('2025-01-06T00:00:00Z')
  while (out.length < n) {
    if (d.getUTCDay() % 6 !== 0) out.push(bar(d.toISOString().slice(0, 10), f(out.length), { volume }))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

describe('moving averages', () => {
  it('sma', () => expect(sma([1, 2, 3, 4], 2)).toEqual([undefined, 1.5, 2.5, 3.5]))
  it('ema seeds with sma then smooths', () => {
    const e = ema([1, 2, 3, 4], 3)
    expect(e.slice(0, 2)).toEqual([undefined, undefined])
    expect(e[2]).toBe(2)
    expect(e[3]).toBe(3) // 4·0.5 + 2·0.5
  })
  it('macd line is fast − slow ema; signal starts 8 bars after the line', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i)
    const m = macd(closes)
    expect(m.line[24]).toBeUndefined()
    expect(m.line[25]).toBeCloseTo(ema(closes, 12)[25]! - ema(closes, 26)[25]!)
    expect(m.signal[32]).toBeUndefined()
    expect(m.signal[33]).toBeDefined()
  })
})

describe('atr, low, weekly', () => {
  it('atr uses true range including gaps', () => {
    const bars = [bar('2025-01-06', 10), bar('2025-01-07', 20)] // gap up: TR = 21 − 10 = 11
    expect(atr(bars, 2)[1]).toBe((2 + 11) / 2)
  })
  it('lowest low of last n', () => {
    expect(lowestLow(series(25, (i) => 100 - i), 20)).toBe(100 - 24 - 1)
    expect(lowestLow(series(5, () => 1), 20)).toBeUndefined()
  })
  it('groups by Monday-start week', () => {
    const w = toWeekly([bar('2025-01-08', 10), bar('2025-01-10', 12, { high: 20 }), bar('2025-01-13', 11)])
    expect(w).toEqual([
      { time: '2025-01-06', open: 10, high: 20, low: 9, close: 12, volume: 2e6 },
      { time: '2025-01-13', open: 11, high: 12, low: 10, close: 11, volume: 1e6 },
    ])
  })
})

describe('weeklyTrendSeries', () => {
  it('matches rebuilding weekly bars from each day of history (no peeking ahead)', () => {
    const bars = series(400, (i) => 2000 + i * 2 + 500 * Math.sin(i / 30))
    // Naive: weekly bars from the prefix, MA30 now vs 4 weeks ago.
    const naive = (prefix: Bar[]) => {
      const w = toWeekly(prefix)
      const ma = sma(w.map((b) => b.close), 30)
      const now = ma[ma.length - 1]
      const before = ma[ma.length - 5]
      return now === undefined || before === undefined ? undefined : w[w.length - 1].close > now && now > before
    }
    const fast = weeklyTrendSeries(bars)
    for (let i = 0; i < bars.length; i++) {
      const want = naive(bars.slice(0, i + 1))
      if (want === undefined) expect(fast[i]).toBeUndefined()
      else expect(fast[i]).toBe(want)
    }
    expect(fast.some((x) => x === true) && fast.some((x) => x === false)).toBe(true)
  })
})

describe('checkSetup', () => {
  it('uptrend with a fresh MACD cross after a dip passes all 5', () => {
    // Steady rise, a short dip, then a bounce on the last bars → MACD crosses up.
    const bars = series(300, (i) => (i < 290 ? 1000 + i * 5 : i < 297 ? 2450 - (i - 290) * 20 : 2310 + (i - 297) * 150), 1e7)
    const c = checkSetup(bars)!
    expect(Object.fromEntries(c.rules.map((r) => [r.id, r.pass]))).toEqual({ weeklyTrend: true, ma50over200: true, closeOverMa50: true, macdCross: true, liquidity: true })
    expect(c.score).toBe(5)
    expect(c.stop).toBeLessThan(c.close)
    expect(c.entry - c.stop!).toBeLessThanOrEqual(3 * c.atr! + 1)
    expect(c.target2).toBe(c.entry + 2 * c.risk!)
    expect(c.target3).toBe(c.entry + 3 * c.risk!)
  })
  it('buy zone is MA50 to MA50 + 2 ATR; stop and targets are measured from the entry', () => {
    // Steady rise: close sits well above MA50 → extended, entry capped at the zone top.
    const up = checkSetup(series(300, (i) => 1000 + i * 5, 1e7))!
    expect(up.buyZone).toEqual({ low: Math.ceil(up.ma50!), high: Math.floor(up.ma50! + 2 * up.atr!) })
    expect(up.zone).toBe('extended')
    expect(up.entry).toBe(up.buyZone!.high)
    expect(up.risk).toBe(up.entry - up.stop!)
    expect(up.target2).toBe(up.entry + 2 * up.risk!)
    // Rise, then a pullback to just above MA50, with wide daily ranges (bigger ATR) → in the zone, entry = close.
    const wide = series(300, (i) => (i < 280 ? 1000 + i * 5 : 2400 - (i - 280) * 2), 1e7).map((x) => ({ ...x, high: x.close + 30, low: x.close - 30 }))
    const dip = checkSetup(wide)!
    expect(dip.zone).toBe('in')
    expect(dip.entry).toBe(dip.close)
  })
  it('downtrend fails trend rules; thin trading fails liquidity', () => {
    const c = checkSetup(series(300, (i) => 3000 - i * 5, 100))!
    expect(c.zone).toBe('none')
    expect(c.buyZone).toBeUndefined()
    // Still shown for reference ("not ideal"), but never the entry.
    expect(c.refZone).toEqual({ low: Math.ceil(c.ma50!), high: Math.floor(c.ma50! + 2 * c.atr!) })
    expect(c.entry).toBe(c.close)
    expect(c.rules.find((r) => r.id === 'ma50over200')!.pass).toBe(false)
    expect(c.rules.find((r) => r.id === 'closeOverMa50')!.pass).toBe(false)
    expect(c.rules.find((r) => r.id === 'liquidity')!.pass).toBe(false)
  })
  it('short history leaves rules undecided, not passed', () => {
    const c = checkSetup(series(60, (i) => 100 + i))!
    expect(c.rules.find((r) => r.id === 'ma50over200')!.pass).toBeUndefined()
    expect(c.score).toBeLessThan(5)
  })
})

describe('parseHistory', () => {
  it('reads idx.history.v1 and keeps the WIB date', () => {
    const json = { schema: 'idx.history.v1', data: { symbol: 'TLKM', name: 'Telkom', candles: [{ time: '2025-10-13T09:00:00+07:00', open: 1, high: 2, low: 0.5, close: 1.5, adj_close: 1.4, volume: 9 }] } }
    expect(parseHistory(json)).toEqual({ name: 'Telkom', bars: [{ time: '2025-10-13', open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 }] })
  })
  it('rejects junk', () => expect(() => parseHistory({ data: {} })).toThrow())
})
