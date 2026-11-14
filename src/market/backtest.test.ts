import { describe, expect, it } from 'vitest'
import { backtest, runTrade, TIME_STOP_BARS } from './backtest'
import type { Bar } from './indicators'
import { idxMood } from './mood'

/** n weekday bars with closes from f(i) and a fixed ±range. */
function series(n: number, f: (i: number) => number, range = 30): Bar[] {
  const out: Bar[] = []
  const d = new Date('2020-01-06T00:00:00Z')
  while (out.length < n) {
    if (d.getUTCDay() % 6 !== 0) {
      const c = f(out.length)
      out.push({ time: d.toISOString().slice(0, 10), open: c, high: c + range, low: c - range, close: c, volume: 1e7 })
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

describe('backtest', () => {
  it('no signals in a downtrend', () => {
    const b = backtest(series(400, (i) => 5000 - i * 5))
    expect(b.trades).toEqual([])
    expect(b.winRate).toBeUndefined()
  })

  it('buys the day after the signal, one trade at a time; time exits come 40 bars after entry', () => {
    // Rising waves: pullbacks into the zone, then rallies.
    const bars = series(900, (i) => 1000 + i * 3 + 60 * Math.sin(i / 8))
    const b = backtest(bars)
    expect(b.trades.length).toBeGreaterThan(0)
    const at = (time: string) => bars.findIndex((x) => x.time === time)
    for (const t of b.trades) {
      if (t.outcome === 'target') expect(t.r).toBe(2)
      if (t.outcome === 'stop') expect(t.r).toBe(-1)
      if (t.outcome === 'time') expect(at(t.exitTime) - at(t.entryTime)).toBe(TIME_STOP_BARS)
      expect(at(t.exitTime) - at(t.entryTime)).toBeLessThanOrEqual(TIME_STOP_BARS)
    }
    for (let k = 1; k < b.trades.length; k++) expect(b.trades[k].entryTime > b.trades[k - 1].exitTime).toBe(true)
    expect(b.wins).toBe(b.trades.filter((t) => t.r > 0).length)
    expect(b.winRate).toBeCloseTo((b.wins / b.trades.length) * 100)
  })
})

describe('runTrade', () => {
  // Buy at the open of bar 0 = 1000, stop 900 → risk 100, target 1200.
  const b = (time: string, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 })
  const day0 = b('2026-01-05', 1000, 1010, 990, 1005)

  it('stop inside a bar sells at the stop: −1R', () => {
    expect(runTrade([day0, b('2026-01-06', 980, 990, 880, 900)], 0, 900)).toMatchObject({ outcome: 'stop', r: -1, exitTime: '2026-01-06' })
  })
  it('gap down through the stop sells at the open: worse than −1R', () => {
    expect(runTrade([day0, b('2026-01-06', 850, 870, 840, 860)], 0, 900)).toMatchObject({ outcome: 'stop', r: -1.5 })
  })
  it('gap up over the target sells at the open: better than 2R', () => {
    expect(runTrade([day0, b('2026-01-06', 1250, 1260, 1240, 1255)], 0, 900)).toMatchObject({ outcome: 'target', r: 2.5 })
  })
  it('target inside a bar: +2R; a bar touching both counts as the stop', () => {
    expect(runTrade([day0, b('2026-01-06', 1100, 1210, 1090, 1150)], 0, 900)).toMatchObject({ outcome: 'target', r: 2 })
    expect(runTrade([day0, b('2026-01-06', 1100, 1210, 890, 1150)], 0, 900)).toMatchObject({ outcome: 'stop', r: -1 })
  })
  it('the entry bar itself can hit the stop', () => {
    expect(runTrade([b('2026-01-05', 1000, 1010, 880, 950)], 0, 900)).toMatchObject({ outcome: 'stop', r: -1, exitTime: '2026-01-05' })
  })
  it('no stop or target in 40 bars: sells at that close; open at the end of history: no trade', () => {
    const flat = Array.from({ length: TIME_STOP_BARS + 1 }, (_, i) => b(`d${String(i).padStart(3, '0')}`, 1000, 1010, 990, 1050))
    expect(runTrade(flat, 0, 900)).toMatchObject({ outcome: 'time', r: 0.5, exitTime: `d${String(TIME_STOP_BARS).padStart(3, '0')}` })
    expect(runTrade(flat.slice(0, 10), 0, 900)).toBeUndefined()
  })
  it('an open already at or below the stop is no trade', () => expect(runTrade([b('2026-01-05', 900, 950, 880, 920)], 0, 900)).toBeUndefined())
})

describe('idxMood', () => {
  it('strong market is green, weak market is red', () => {
    const up = series(300, (i) => 1000 + i * 5, 5)
    const down = series(300, (i) => 3000 - i * 5, 5)
    const g = idxMood(up, [up, up, down])!
    expect(g.breadth).toBeCloseTo((2 / 3) * 100)
    expect(g.trend).toBe(100)
    expect(g.counted).toBe(3)
    const r = idxMood(down, [down, down])!
    expect(r.trend).toBe(0)
    expect(r.breadth).toBe(0)
    expect(r.light).toBe('red')
  })
  it('a volatility spike lowers calm', () => {
    const quiet = series(300, (i) => 1000 + i + (i % 2) * 2, 5)
    const wild = series(300, (i) => 1000 + i + (i > 280 ? (i % 2) * 80 : (i % 2) * 2), 5)
    expect(idxMood(quiet, [])!.calm).toBeGreaterThan(idxMood(wild, [])!.calm!)
    expect(idxMood(wild, [])!.calm).toBe(0)
  })
  it('nothing to score → undefined', () => expect(idxMood([], [])).toBeUndefined())
})
