import { describe, expect, it } from 'vitest'
import type { Bar } from './indicators'
import { dailyVol, expectedRange, stopInNoise } from './expectedRange'

const bars = (closes: number[]): Bar[] => closes.map((close, i) => ({ time: String(i), open: close, high: close, low: close, close, volume: 1 }))

describe('expected range', () => {
  it('flat prices have no volatility', () => expect(dailyVol(bars(Array(61).fill(100)))).toBe(0))
  it('needs enough history', () => expect(dailyVol(bars([1, 2, 3]))).toBeUndefined())
  it('alternating ±1% days give about 1% daily volatility', () => {
    const c = [100]
    for (let i = 0; i < 60; i++) c.push(c[c.length - 1] * (i % 2 ? 0.99 : 1.01))
    expect(dailyVol(bars(c))).toBeCloseTo(0.01, 3)
  })
  it('range scales with the square root of time and is symmetric in log terms', () => {
    const r = expectedRange(100, 0.02, 25) // σ√25 = 10%
    expect(r.move).toBeCloseTo(Math.exp(0.1) - 1)
    expect(r.low1 * r.high1).toBeCloseTo(100 * 100)
    expect(r.high2).toBeCloseTo(100 * Math.exp(0.2))
  })
  it('a stop closer than one day of noise is flagged', () => {
    expect(stopInNoise(100, 99, 0.03)).toBe(true)
    expect(stopInNoise(100, 90, 0.03)).toBe(false)
  })
})
