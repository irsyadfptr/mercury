import { describe, expect, it } from 'vitest'
import { dominanceSeries, parseDominance, parseFunding, recordDominance } from './cryptoRegimeData'

describe('crypto mood v2 live inputs', () => {
  it('picks the USDT perpetual funding of the listed coins', () => {
    const json = [
      { symbol: 'BTCUSDT', lastFundingRate: '0.00010000' },
      { symbol: 'ETHUSDT', lastFundingRate: '-0.00002' },
      { symbol: 'BTCUSDC', lastFundingRate: '0.5' },
      { symbol: 'DOGEUSDT', lastFundingRate: 'x' },
    ]
    expect(parseFunding(json, ['BTC', 'ETH', 'DOGE'])).toEqual([0.0001, -0.00002])
    expect(parseFunding({ code: -1 }, ['BTC'])).toEqual([])
  })
  it('reads BTC dominance and keeps one reading per day, oldest first', () => {
    expect(parseDominance({ data: { market_cap_percentage: { btc: 57.3 } } })).toBe(57.3)
    expect(parseDominance({ data: {} })).toBeUndefined()
    let log = recordDominance({}, '2026-11-02', 57)
    log = recordDominance(log, '2026-11-01', 56)
    log = recordDominance(log, '2026-11-02', 58)
    expect(dominanceSeries(log)).toEqual([56, 58])
  })
})
