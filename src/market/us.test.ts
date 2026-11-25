import { describe, expect, it } from 'vitest'
import { dividendStreak, parseTwelvePrices, parseTwelveSeries, parseUsFundamentals, parseYahooChart, toUs4h, usDayOf } from './us'

// Shapes as documented by Yahoo's v8 chart / v10 quoteSummary and Twelve Data's time_series / price endpoints.
const yahooDaily = {
  chart: {
    result: [
      {
        meta: { symbol: 'AAPL', longName: 'Apple Inc.', gmtoffset: -18000 },
        // 2026-11-23 and 2026-11-24 09:30 New York (14:30 UTC), then a row with a missing price.
        timestamp: [1795444200, 1795530600, 1795617000],
        indicators: { quote: [{ open: [230, 232, null], high: [233, 235, null], low: [229, 231, null], close: [232, 234, null], volume: [5e7, 4e7, null] }] },
        events: { dividends: { '1': { amount: 0.25, date: 1795444200 } } },
      },
    ],
    error: null,
  },
}

describe('parseYahooChart', () => {
  it('dates daily bars in exchange time and skips empty rows', () => {
    const r = parseYahooChart(yahooDaily)
    expect(r.name).toBe('Apple Inc.')
    expect(r.bars.map((b) => b.time)).toEqual(['2026-11-23', '2026-11-24'])
    expect(r.bars[1]).toMatchObject({ open: 232, close: 234, volume: 4e7 })
    expect(r.dividends).toEqual([{ date: '2026-11-23', amount: 0.25 }])
  })
  it('keeps intraday times in UTC', () => {
    expect(parseYahooChart(yahooDaily, true).bars[0].time).toBe('2026-11-23T14:30:00.000Z')
  })
  it('throws not-found when Yahoo has no result', () => {
    expect(() => parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } })).toThrow('not-found')
  })
})

describe('Twelve Data', () => {
  it('parses a series newest-first into oldest-first bars', () => {
    const json = {
      meta: { symbol: 'AAPL', interval: '1day' },
      values: [
        { datetime: '2026-11-24', open: '232', high: '235', low: '231', close: '234', volume: '40000000' },
        { datetime: '2026-11-23', open: '230', high: '233', low: '229', close: '232', volume: '50000000' },
      ],
      status: 'ok',
    }
    expect(parseTwelveSeries(json).map((b) => [b.time, b.close])).toEqual([
      ['2026-11-23', 232],
      ['2026-11-24', 234],
    ])
  })
  it('turns UTC intraday times into ISO', () => {
    const json = { meta: { symbol: 'AAPL' }, values: [{ datetime: '2026-11-24 14:30:00', open: '1', high: '1', low: '1', close: '1', volume: '0' }] }
    expect(parseTwelveSeries(json, true)[0].time).toBe('2026-11-24T14:30:00Z')
  })
  it('reads one or many prices', () => {
    expect(parseTwelvePrices({ price: '234.10' }, ['AAPL'])).toEqual({ AAPL: 234.1 })
    expect(parseTwelvePrices({ AAPL: { price: '234.10' }, XXXX: { code: 400, status: 'error' } }, ['AAPL', 'XXXX'])).toEqual({ AAPL: 234.1 })
  })
})

describe('session time', () => {
  it('dates intraday bars in New York', () => {
    // 2026-11-25 02:00 UTC is still the 24th in New York.
    expect(usDayOf('2026-11-25T02:00:00Z')).toBe('2026-11-24')
    expect(usDayOf('2026-11-24')).toBe('2026-11-24')
  })
  it('builds two blocks a day from hourly bars (winter: New York = UTC−5)', () => {
    const hour = (h: number, close: number) => ({ time: `2026-11-24T${String(h).padStart(2, '0')}:30:00.000Z`, open: close, high: close + 1, low: close - 1, close, volume: 10 })
    // 09:30 … 15:30 New York = 14:30 … 20:30 UTC.
    const blocks = toUs4h([hour(14, 1), hour(15, 2), hour(16, 3), hour(17, 4), hour(18, 5), hour(19, 6), hour(20, 7)])
    expect(blocks.map((b) => b.time)).toEqual(['2026-11-24T14:30:00.000Z', '2026-11-24T18:30:00.000Z'])
    expect(blocks[0]).toMatchObject({ open: 1, close: 4, high: 5, low: 0, volume: 40 })
    expect(blocks[1]).toMatchObject({ open: 5, close: 7, volume: 30 })
  })
  it('follows summer time (New York = UTC−4)', () => {
    const b = { time: '2026-07-14T13:30:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 1 }
    expect(toUs4h([b])[0].time).toBe('2026-07-14T13:30:00.000Z')
  })
})

describe('fundamentals', () => {
  it('counts dividend years back from last year (or this year once paid)', () => {
    expect(dividendStreak(['2021-05-01', '2022-05-01', '2023-05-01', '2024-05-01', '2025-05-01'], '2026-03-01')).toBe(5)
    expect(dividendStreak(['2024-05-01', '2025-05-01', '2026-05-01'], '2026-11-25')).toBe(3)
    expect(dividendStreak(['2020-05-01', '2025-05-01'], '2026-11-25')).toBe(1)
    expect(dividendStreak([], '2026-11-25')).toBe(0)
  })
  it('maps quoteSummary to the score input, converting Yahoo units', () => {
    const json = {
      summary: {
        quoteSummary: {
          result: [
            {
              price: { longName: 'Apple Inc.', marketCap: { raw: 3.5e12 } },
              summaryDetail: { trailingPE: { raw: 35.2 }, dividendYield: { raw: 0.0045 }, beta: { raw: 1.2 }, fiftyTwoWeekHigh: { raw: 240 }, fiftyTwoWeekLow: { raw: 165 } },
              defaultKeyStatistics: { priceToBook: { raw: 50 }, pegRatio: {} },
              financialData: { currentPrice: { raw: 234 }, returnOnEquity: { raw: 1.5 }, profitMargins: { raw: 0.24 }, debtToEquity: { raw: 150.3 }, earningsGrowth: { raw: 0.1 }, targetMeanPrice: { raw: 250 }, totalDebt: { raw: 1e11 }, totalCash: { raw: 6e10 }, currentRatio: { raw: 0.9 } },
              assetProfile: { sector: 'Technology' },
            },
          ],
          error: null,
        },
      },
      dividends: yahooDaily,
    }
    const r = parseUsFundamentals(json, 'AAPL', '2026-11-25')
    expect(r).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' })
    expect(r.input).toMatchObject({ roePct: 150, netMarginPct: 24, earningsGrowthPct: 10, pe: 35.2, pb: 50, peg: null, beta: 1.2, marketCap: 3.5e12, dividendYears: 1 })
    expect(r.input.debtToEquity).toBeCloseTo(1.503)
    expect(r.input.dividendYieldPct).toBeCloseTo(0.45)
  })
})
