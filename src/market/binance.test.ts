import { describe, expect, it } from 'vitest'
import { parseKlines } from './binance'
import { checkSetup, CRYPTO_RULES, roundTo } from './indicators'

describe('parseKlines', () => {
  const day = 864e5
  const k = (open: number, c: string) => [open, '1.0', '2.0', '0.5', c, '100', open + day - 1, '150', 10, '0', '0', '0']
  it('reads Binance klines and drops the candle still forming', () => {
    const t0 = Date.UTC(2026, 10, 12)
    const bars = parseKlines([k(t0, '1.5'), k(t0 + day, '1.6')], t0 + day + 1000)
    expect(bars).toEqual([{ time: '2026-11-12', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }])
  })
  it('rejects junk', () => expect(() => parseKlines([['x']])).toThrow())
})

describe('crypto rounding', () => {
  it('steps keep 5 significant digits without float noise', () => {
    expect(CRYPTO_RULES.step(68314)).toBe(1)
    expect(CRYPTO_RULES.step(0.98)).toBe(0.00001)
    expect(roundTo(0.1 + 0.2, 0.01, 'floor')).toBe(0.3)
    expect(roundTo(2.3456, 0.001, 'ceil')).toBe(2.346)
  })
  it('levels on a sub-dollar coin are not rounded to zero', () => {
    const bars = Array.from({ length: 300 }, (_, i) => {
      const c = 0.5 + i * 0.002
      return { time: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10), open: c, high: c * 1.02, low: c * 0.98, close: c, volume: 1e9 }
    })
    const c = checkSetup(bars, { rules: CRYPTO_RULES })!
    expect(c.rules.find((r) => r.id === 'liquidity')!.pass).toBe(true)
    expect(c.stop).toBeGreaterThan(0)
    expect(c.stop).toBeLessThan(c.entry)
    expect(c.buyZone!.low).toBeGreaterThan(0.5)
    expect(String(c.target2).length).toBeLessThan(10)
  })
})
