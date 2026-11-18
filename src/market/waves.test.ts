import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { labelCount, waveCount, zigzag } from './waves'

/** Bars from a list of closes: open = previous close, high/low 0.5 beyond the body. */
function fromCloses(closes: number[]): Bar[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
    return { time: d, open, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, close, volume: 1e6 }
  })
}
/** Straight-line legs through the given turning points, `n` bars per leg. */
function legs(points: number[], n = 8): number[] {
  const out = [points[0]]
  for (let k = 1; k < points.length; k++) for (let j = 1; j <= n; j++) out.push(points[k - 1] + ((points[k] - points[k - 1]) * j) / n)
  return out
}
const pts = (prices: number[]) => prices.map((price, i) => ({ i: i * 8, price }))

describe('zigzag', () => {
  it('keeps the running leg as the last swing', () => {
    const sw = zigzag(fromCloses(legs([100, 80, 130, 110, 160, 150])), 2)
    expect(sw.map((s) => s.kind)).toEqual(['low', 'high', 'low', 'high', 'low'])
    expect(sw.at(-1)!.price).toBeCloseTo(149.5)
  })
})

describe('labelCount rules', () => {
  it('rejects a wave 2 below the start of wave 1', () => {
    expect(labelCount(pts([100, 130, 95, 150]), 1, 2)).toBeUndefined()
  })
  it('rejects a wave 4 that overlaps wave 1', () => {
    expect(labelCount(pts([100, 130, 112, 170, 128]), 1, 2)).toBeUndefined()
  })
  it('rejects a wave 3 shorter than both 1 and 5', () => {
    expect(labelCount(pts([100, 130, 115, 140, 132, 170, 160]), 1, 2)).toBeUndefined()
  })
  it('rejects a wave B beyond the end of wave 5', () => {
    expect(labelCount(pts([100, 130, 112, 170, 155, 185, 165, 190]), 1, 2)).toBeUndefined()
  })
  it('allows a running wave 3 that has not passed wave 1 yet', () => {
    const c = labelCount(pts([100, 130, 112, 125]), 1, 2)!
    expect(c.current).toBe('3')
    expect(c.invalidation).toBe(100)
    ;[142, 160.54, 190.54].forEach((x, k) => expect(c.levels[k].price).toBeCloseTo(x, 2))
  })
})

describe('labelCount levels', () => {
  it('wave 4: retracement zone of wave 3, invalid inside wave 1', () => {
    const c = labelCount(pts([100, 130, 112, 170, 160]), 1, 2)!
    expect(c.current).toBe('4')
    expect(c.currentDir).toBe('down')
    expect(c.invalidation).toBe(130)
    expect(c.levels[0].price).toBeCloseTo(170 - 0.236 * 58)
    expect(c.guidelines.find((g) => g.id === 'w3Extended')!.met).toBe(true)
  })
  it('down impulse: wave 5 targets below wave 4', () => {
    const c = labelCount(pts([200, 170, 185, 130, 145, 140]), -1, 3)!
    expect(c.dir).toBe('down')
    expect(c.current).toBe('5')
    expect(c.currentDir).toBe('down')
    expect(c.levels.every((l) => l.price < 145)).toBe(true)
    expect(c.invalidation).toBe(170)
  })
})

describe('waveCount', () => {
  it('finds a five-wave advance and the correction after it', () => {
    const bars = fromCloses(legs([140, 125, 100, 130, 112, 170, 155, 185, 168]))
    const c = waveCount(bars)!
    expect(c).toBeDefined()
    expect(c.dir).toBe('up')
    expect(c.current).toBe('A')
    expect(c.points.map((p) => p.label)).toEqual(['0', '1', '2', '3', '4', '5', 'A'])
    expect(c.invalidation).toBeCloseTo(185.5)
  })
  it('returns undefined for too little history', () => {
    expect(waveCount(fromCloses([1, 2, 3]))).toBeUndefined()
  })
})
