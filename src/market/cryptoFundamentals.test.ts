import { describe, expect, it } from 'vitest'
import { scoreCrypto, type CryptoInput } from './cryptoFundamentals'

const none: CryptoInput = {
  marketCap: null, fdv: null, circulating: null, total: null, max: null, athChangePct: null, volume24h: null, listedDays: null,
  high365: null, low365: null, commits4w: null, tvl: null, tvlChange7dPct: null, fees7d: null, fees30d: null, revenue1y: null,
}
const strong: CryptoInput = {
  marketCap: 200e9, fdv: 210e9, circulating: 19.8e6, total: 19.8e6, max: 21e6, athChangePct: -20, volume24h: 20e9, listedDays: 2000,
  high365: 100, low365: 60, commits4w: 150, tvl: 5e9, tvlChange7dPct: 3, fees7d: 10e6, fees30d: 40e6, revenue1y: 300e6,
}

describe('crypto fundamentals', () => {
  it('everything unknown scores 0 with 0 known, out of 14', () => {
    expect(scoreCrypto(none)).toMatchObject({ total: 0, known: 0, max: 14 })
  })
  it('a strong coin passes every metric', () => {
    const s = scoreCrypto(strong)
    expect(s.total).toBe(14)
    expect(s.parts.map((p) => p.score)).toEqual([4, 5, 5])
  })
  it('no max supply: circulating measured against total, hard cap fails', () => {
    const s = scoreCrypto({ ...strong, max: null, total: 20e6 })
    const tok = s.parts[0].metrics
    expect(tok.find((m) => m.id === 'circulating')?.value).toBeCloseTo(99)
    expect(tok.find((m) => m.id === 'hardCap')?.pass).toBe(false)
  })
  it('fees slowing down fails the pace check', () => {
    const s = scoreCrypto({ ...strong, fees7d: 5e6, fees30d: 40e6 }) // 7d pace = 21.4M/30d
    expect(s.parts[1].metrics.find((m) => m.id === 'feesPace')?.pass).toBe(false)
  })
  it('heavy future dilution fails the FDV check', () => {
    expect(scoreCrypto({ ...strong, fdv: 600e9 }).parts[0].metrics.find((m) => m.id === 'fdvRatio')?.pass).toBe(false)
  })
})
