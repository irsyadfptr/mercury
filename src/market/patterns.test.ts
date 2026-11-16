import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { candlePatterns, chartPatterns, pivots } from './patterns'

/** Bars from a list of closes: open = previous close, high/low 0.5 beyond the body. */
function fromCloses(closes: number[]): Bar[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]
    return { time: `2025-01-${String(i + 1).padStart(2, '0')}`, open, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, close, volume: 1e6 }
  })
}
/** Straight-line legs through the given turning points, `n` bars per leg. */
function zigzag(points: number[], n = 8): number[] {
  const out = [points[0]]
  for (let k = 1; k < points.length; k++) for (let j = 1; j <= n; j++) out.push(points[k - 1] + ((points[k] - points[k - 1]) * j) / n)
  return out
}

describe('pivots', () => {
  it('finds alternating swing highs and lows', () => {
    const p = pivots(fromCloses(zigzag([100, 120, 100, 120, 100])))
    expect(p.map((x) => x.kind)).toEqual(['high', 'low', 'high'])
    expect(p[0].i).toBe(8)
  })
})

describe('chart patterns', () => {
  it('double top confirmed on a close below the trough, with a measured-move target', () => {
    const bars = fromCloses(zigzag([100, 120, 105, 120, 95]))
    const dt = chartPatterns(bars).find((p) => p.id === 'doubleTop')!
    expect(dt.status).not.toBe('forming')
    expect(dt.bias).toBe('bear')
    expect(dt.trigger).toBeCloseTo(104.5)
    expect(dt.target).toBeLessThan(dt.trigger)
  })
  it('marks a pattern reached once price touches its target', () => {
    const dt = chartPatterns(fromCloses(zigzag([100, 120, 105, 120, 80]))).find((p) => p.id === 'doubleTop')!
    expect(dt.status).toBe('reached')
    expect(dt.targetHitAt).toBeGreaterThan(dt.breakAt!)
  })
  it('double bottom still forming until the peak breaks', () => {
    const bars = fromCloses(zigzag([120, 100, 112, 100, 108]))
    const db = chartPatterns(bars).find((p) => p.id === 'doubleBottom')!
    expect(db.status).toBe('forming')
    expect(db.bias).toBe('bull')
  })
  it('head and shoulders', () => {
    const bars = fromCloses(zigzag([90, 110, 100, 120, 100, 110, 90]))
    const hs = chartPatterns(bars).find((p) => p.id === 'headShoulders')!
    expect(hs.status).toBe('confirmed')
    expect(hs.points).toHaveLength(5)
  })
  it('ascending triangle: flat top, rising lows', () => {
    const bars = fromCloses(zigzag([90, 120, 100, 120, 108, 115]))
    const tri = chartPatterns(bars).find((p) => p.id === 'ascendingTriangle')!
    expect(tri.bias).toBe('bull')
    expect(tri.status).toBe('forming')
  })
  it('a plain uptrend has no patterns', () => {
    expect(chartPatterns(fromCloses(Array.from({ length: 80 }, (_, i) => 100 + i)))).toEqual([])
  })
})

describe('candle patterns', () => {
  const decline = Array.from({ length: 10 }, (_, i) => 120 - i * 2) // 120 … 102
  it('bullish engulfing after a decline', () => {
    const bars = fromCloses(decline)
    bars.push({ time: 'x', open: 101, high: 105, low: 100.5, close: 104.5, volume: 1e6 })
    expect(candlePatterns(bars).map((c) => c.id)).toContain('bullEngulfing')
  })
  it('hammer after a decline', () => {
    const bars = fromCloses(decline)
    bars.push({ time: 'x', open: 101.5, high: 102.1, low: 97, close: 102, volume: 1e6 })
    expect(candlePatterns(bars).at(-1)?.id).toBe('hammer')
  })
  it('no hammer in an uptrend', () => {
    const bars = fromCloses(decline.slice().reverse())
    bars.push({ time: 'x', open: 119.5, high: 120.1, low: 115, close: 120, volume: 1e6 })
    expect(candlePatterns(bars).filter((c) => c.id === 'hammer')).toEqual([])
  })
})
