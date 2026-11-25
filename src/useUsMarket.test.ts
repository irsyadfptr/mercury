import { describe, expect, it } from 'vitest'
import { MIN_MARKET_CAP_USD, scoreFundamentals, type FundamentalInput } from './market/fundamentals'
import { nextRate } from './useUsMarket'

describe('nextRate', () => {
  it('keeps a rate typed by hand', () => expect(nextRate(true, 15_500, 16_200)).toBe(15_500))
  it('takes the fetched rate when automatic', () => expect(nextRate(false, 15_500, 16_200)).toBe(16_200))
  it('keeps the old rate when the fetch failed', () => expect(nextRate(undefined, 15_500, undefined)).toBe(15_500))
})

describe('US market-cap floor', () => {
  const blank = Object.fromEntries(
    ['price', 'marketCap', 'roePct', 'netMarginPct', 'debtToEquity', 'dividendYears', 'earningsGrowthPct', 'pe', 'pb', 'peg', 'dividendYieldPct', 'targetMean', 'totalDebt', 'totalCash', 'beta', 'high52', 'low52', 'currentRatio'].map((k) => [k, null]),
  ) as unknown as FundamentalInput
  const cap = (input: FundamentalInput, opts?: { minMarketCap?: number }) => scoreFundamentals(input, opts).parts[2].metrics.find((m) => m.id === 'marketCap')!
  it('uses $1 bn for US instead of Rp10 tn', () => {
    const us = { ...blank, marketCap: 3e9 }
    expect(cap(us).pass).toBe(false) // $3 bn read as rupiah is tiny
    expect(cap(us, { minMarketCap: MIN_MARKET_CAP_USD }).pass).toBe(true)
  })
})
