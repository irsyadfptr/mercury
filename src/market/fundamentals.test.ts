import { describe, expect, it } from 'vitest'
import { scoreFundamentals, type FundamentalInput } from './fundamentals'
import { parseFundamentals, parseScreen } from './idx'

// PTBA from `idx stocks fundamental` / `stocks dividends` on 2026-11-14, trimmed to the fields read.
const ptba = {
  fundamentals: {
    data: {
      symbol: 'PTBA',
      name: 'PT Bukit Asam (Persero) Tbk',
      sector: 'Energy',
      currency: 'IDR',
      financial_currency: 'IDR',
      price: 3200,
      beta: -0.277,
      week52_high: 3490,
      week52_low: 2220,
      valuation: { market_cap: 36845945618432, pe_trailing: 6.2015505, peg: 0.38, price_to_book: 1.358941 },
      profitability: { roe_pct: 24.898, net_margin_pct: 12.782 },
      health: { debt_to_equity: 0.17226, current_ratio: 1.247, total_debt: 4692423213056, total_cash: 7114348036096 },
      growth: { earnings_growth_pct: 214.2 },
      dividend: { yield_pct: 3.58 },
      analyst: { target_mean: 3563.3333 },
    },
  },
  dividends: { data: { consecutive_years: 24 } },
}

describe('fundamentals score', () => {
  it('scores PTBA part by part, showing each input', () => {
    const s = scoreFundamentals(parseFundamentals(ptba).input)
    const fails = s.parts.flatMap((p) => p.metrics.filter((m) => m.pass === false).map((m) => m.id))
    // Analyst upside is 11% (< 15%), the 52-week swing 57% passes, the current ratio 1.25 (< 1.5) fails.
    expect(fails).toEqual(['targetUpside', 'currentRatio'])
    expect(s.parts.map((p) => p.score)).toEqual([5, 4, 4])
    expect(s.total).toBe(13)
    expect(s.known).toBe(15)
    expect(s.parts[1].metrics.find((m) => m.id === 'targetUpside')!.value).toBeCloseTo(11.35, 2)
  })

  it('counts missing data as unknown, never as a pass', () => {
    const empty = Object.fromEntries(Object.keys(parseFundamentals(ptba).input).map((k) => [k, null])) as unknown as FundamentalInput
    const s = scoreFundamentals(empty)
    expect(s.total).toBe(0)
    expect(s.known).toBe(0)
    expect(s.parts.every((p) => p.metrics.every((m) => m.pass === null && m.value === null))).toBe(true)
  })

  it('fails a negative P/E or PEG (losses), and treats a missing dividend history as unknown', () => {
    const r = parseFundamentals({ ...ptba, dividends: null })
    const s = scoreFundamentals({ ...r.input, pe: -4, peg: -0.5 })
    const value = s.parts[1].metrics
    expect(value.find((m) => m.id === 'pe')!.pass).toBe(false)
    expect(value.find((m) => m.id === 'peg')!.pass).toBe(false)
    expect(s.parts[0].metrics.find((m) => m.id === 'dividendYears')!.pass).toBeNull()
  })

  it('drops P/B when the statements are in another currency than the price', () => {
    const usd = { ...ptba, fundamentals: { data: { ...ptba.fundamentals.data, financial_currency: 'USD', valuation: { ...ptba.fundamentals.data.valuation, price_to_book: 14494 } } } }
    expect(parseFundamentals(usd).input.pb).toBeNull()
  })

  it('keeps only screen rows with fundamentals, leaving fields the screen lacks unknown', () => {
    const row = { symbol: 'BBCA', fundamentals_checked: true, price: 5500, roe_pct: 21.2, pe_trailing: 11.4, currency: 'IDR', financial_currency: 'IDR' }
    const r = parseScreen({ data: { universe: 955, rows: [row, { symbol: 'XXXX', fundamentals_checked: false }] } })
    expect(r.rows.map((x) => x.symbol)).toEqual(['BBCA'])
    expect(r.rows[0].input.beta).toBeNull()
    expect(scoreFundamentals(r.rows[0].input).parts[0].score).toBe(1)
  })
})
