import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { analyzeWaves, labelCount, waveCount, zigzag } from './waves'

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

describe('numbers', () => {
  it('measures every wave against its usual reference', () => {
    const c = labelCount(pts([100, 130, 112, 170, 155, 185, 168]), 1, 2)!
    expect(c.waves.map((w) => w.label)).toEqual(['1', '2', '3', '4', '5', 'A'])
    expect(c.waves[0].change).toBeCloseTo(0.3)
    expect(c.waves[1].ratio).toEqual({ value: expect.closeTo(0.6), of: 'W1' })
    expect(c.waves[2].ratio!.value).toBeCloseTo(58 / 30)
    expect(c.waves[3].ratio).toEqual({ value: expect.closeTo(15 / 58), of: 'W3' })
    expect(c.waves[5].ratio).toEqual({ value: expect.closeTo(17 / 85), of: 'W1-5' })
    expect(c.waves[5].running).toBe(true)
    expect(c.waves[0].bars).toBe(8)
  })
  it('confidence counts the guidelines met out of five', () => {
    expect(labelCount(pts([100, 130, 112, 170, 155, 185, 168]), 1, 2)!.confidence).toBe(1)
    expect(labelCount(pts([100, 130, 112, 125]), 1, 2)!.confidence).toBeCloseTo(0.2)
  })
  it('marks levels the running wave already reached', () => {
    const c = labelCount(pts([100, 130, 112, 165]), 1, 2)!
    expect(c.levels.map((l) => l.hit)).toEqual([true, true, false])
  })
  it('caps wave 5 when wave 3 is shorter than wave 1', () => {
    const c = labelCount(pts([100, 140, 120, 155, 145, 150]), 1, 2)!
    expect(c.current).toBe('5')
    expect(c.cap).toBeCloseTo(180)
    expect(c.levels.every((l) => l.price < 180)).toBe(true)
  })
  it('drops wave-4 levels inside wave 1', () => {
    const c = labelCount(pts([100, 130, 112, 140, 136]), 1, 2)!
    expect(c.levels.every((l) => l.price > 130)).toBe(true)
  })
})

describe('plan', () => {
  it('wave 3: from the close to the first target not hit, stop at wave 0', () => {
    const c = labelCount(pts([100, 130, 112, 125]), 1, 2, 125)!
    expect(c.plan).toMatchObject({ kind: 'now', entry: 125, stop: 100, target: 142 })
    expect(c.plan!.rr).toBeCloseTo(17 / 25)
  })
  it('wave 4: from the middle zone level to wave 5 = wave 1', () => {
    const c = labelCount(pts([100, 130, 112, 170, 160]), 1, 2, 160)!
    const entry = 170 - 0.382 * 58
    expect(c.plan).toMatchObject({ kind: 'zone', stop: 130 })
    expect(c.plan!.entry).toBeCloseTo(entry)
    expect(c.plan!.target).toBeCloseTo(entry + 30)
  })
  it('down impulse plans a short', () => {
    const c = labelCount(pts([200, 170, 185, 160]), -1, 2, 160)!
    expect(c.plan!.stop).toBe(200)
    expect(c.plan!.target).toBeLessThan(160)
    expect(c.plan!.risk).toBeGreaterThan(0)
  })
  it('none in a correction', () => {
    expect(labelCount(pts([100, 130, 112, 170, 155, 185, 168]), 1, 2)!.plan).toBeUndefined()
  })
})

describe('analyzeWaves', () => {
  it('the alternate reads differently from the primary', () => {
    const a = analyzeWaves(fromCloses(legs([140, 125, 100, 130, 112, 170, 155, 185, 168])))
    expect(a.primary).toBeDefined()
    if (a.alternate) expect(a.alternate.dir !== a.primary!.dir || a.alternate.current !== a.primary!.current).toBe(true)
  })
})
