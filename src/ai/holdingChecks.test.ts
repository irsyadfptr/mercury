import { describe, expect, it } from 'vitest'
import { scoreFundamentals, type FundamentalInput } from '@/market/fundamentals'
import type { Check } from '@/market/indicators'
import { freshScoreLine, loggedScoreLine, swingLine } from './holdingChecks'

describe('holding check lines', () => {
  it('shows swing rules and distance to the averages as percentages, no prices', () => {
    const c = {
      rules: [
        { id: 'weeklyTrend', pass: false },
        { id: 'ma50over200', pass: false },
        { id: 'closeOverMa50', pass: true },
        { id: 'macdCross', pass: undefined },
        { id: 'liquidity', pass: true },
      ],
      score: 2,
      close: 110,
      ma50: 100,
      ma200: 200,
      avgValue: 1,
      zone: 'none',
      entry: 110,
    } as Check
    const line = swingLine('RATU', c, '2026-11-18')
    expect(line).toBe('RATU swing rules on 2026-11-18: 2/5 pass (weeklyTrend ✗, ma50over200 ✗, closeOverMa50 ✓, macdCross ?, liquidity ✓); price vs MA50 +10.0%, vs MA200 −45.0%')
    expect(line).not.toMatch(/\b110\b/)
  })

  it('lists the long-term parts and failed metrics', () => {
    const input = { price: 100, roePct: 20, netMarginPct: 5 } as unknown as FundamentalInput
    const line = freshScoreLine('BUMI', scoreFundamentals(input))
    expect(line).toMatch(/^BUMI long-term score today: \d+\/15, \d+\/15 with data \(quality \d\/5, value \d\/5, risk \d\/5\)/)
    expect(line).toContain('fails: netMargin')
  })

  it('falls back to the logged score with its date', () => {
    expect(loggedScoreLine('CDIA', { date: '2026-11-10', total: 6, known: 12, price: 1 })).toBe('CDIA long-term score 6/15 (12/15 with data), last checked 2026-11-10')
  })
})
