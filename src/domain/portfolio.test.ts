import { describe, expect, it } from 'vitest'
import { daysHeld, heatTier, level, positionSize, quests, rarity, sizeQuote, summarize } from './portfolio'
import type { Holding, Transaction } from '@/types'

const NOW = Date.parse('2026-11-13T00:00:00Z')
const h = (p: Partial<Holding> & Pick<Holding, 'id'>): Holding => ({
  assetClass: 'idx_stock',
  group: 'trading',
  symbol: p.id.toUpperCase(),
  currency: 'IDR',
  paper: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...p,
})
const buy = (holdingId: string, quantity: number, price: number, date = '2026-08-01T00:00:00Z'): Transaction => ({
  id: crypto.randomUUID(),
  holdingId,
  type: 'buy',
  quantity,
  price,
  fee: 0,
  date,
})

describe('summarize', () => {
  const holdings = [
    h({ id: 'bbca', group: 'investing', manualPrice: 10_000, manualPriceAt: '2026-11-12T00:00:00Z' }),
    h({ id: 'adro', stop: 2_400, manualPrice: 2_500, manualPriceAt: '2026-11-12T00:00:00Z' }),
    h({ id: 'btc', assetClass: 'crypto' }), // no stop, no manual price → valued at cost
    h({ id: 'spy', assetClass: 'us_stock', group: 'investing', currency: 'USD', manualPrice: 600 }),
  ]
  const txns = [buy('bbca', 1_000, 9_000), buy('adro', 10_000, 2_600), buy('btc', 0.01, 1_500_000_000), buy('spy', 1, 500)]

  it('values holdings, groups them, and leaves out USD without a rate', () => {
    const s = summarize(holdings, txns, undefined, NOW)
    // bbca 10M + adro 25M + btc 15M (at cost)
    expect(s.netWorth).toBe(50_000_000)
    expect(s.invested).toBe(9_000_000 + 26_000_000 + 15_000_000)
    expect(s.byGroup).toEqual({ investing: 10_000_000, trading: 40_000_000 })
    expect(s.missingFx.map((x) => x.id)).toEqual(['spy'])
    expect(s.rows.find((r) => r.holding.id === 'btc')?.v.priceSource).toBe('cost')
  })

  it('converts USD with a rate', () => {
    expect(summarize(holdings, txns, 16_000, NOW).netWorth).toBe(50_000_000 + 600 * 16_000)
  })

  it('computes trade risk and heat from stops', () => {
    const s = summarize(holdings, txns, undefined, NOW)
    const adro = s.rows.find((r) => r.holding.id === 'adro')!
    // (2500 - 2400) * 10000 = 1M → 2% of 50M
    expect(adro.risk).toEqual({ kind: 'ok', amountIdr: 1_000_000, pct: 2 })
    expect(s.rows.find((r) => r.holding.id === 'btc')!.risk.kind).toBe('noStop')
    expect(s.rows.find((r) => r.holding.id === 'bbca')!.risk.kind).toBe('none')
    expect(s.heat).toBe(2)
    expect(adro.daysHeld).toBe(104)
  })

  it('builds quests from rule checks', () => {
    const s = summarize(holdings, txns, undefined, NOW)
    const kinds = quests(s, { tradeLimit: 1, now: NOW }).map((q) => q.kind)
    expect(kinds).toEqual(['overRisk', 'setStop', 'stalePrice', 'stalePrice', 'fxRate', 'backup'])
  })
})

describe('game math', () => {
  it('levels double from Rp10M', () => {
    expect(level(5_000_000)).toEqual({ level: 0, xp: 0.5, next: 10_000_000 })
    expect(level(10_000_000).level).toBe(1)
    const l = level(1_248_350_000)
    expect(l.level).toBe(7)
    expect(l.next).toBe(1_280_000_000)
    expect(l.xp).toBeCloseTo(0.9505, 3)
  })

  it('heat tiers by share of limit', () => {
    expect([0, 2, 3, 4.2, 6, 6.1].map((x) => heatTier(x, 6).tier)).toEqual(['calm', 'warm', 'warm', 'hot', 'onFire', 'overheated'])
  })

  it('rarity by days held', () => {
    expect([0, 30, 90, 180].map(rarity)).toEqual(['common', 'rare', 'epic', 'legendary'])
  })

  it('position size rounds down to lots and rejects bad input', () => {
    // 100M * 1% = 1M risk; 1M / (2600-2400) = 5000 shares = 50 lots
    expect(positionSize({ capital: 100_000_000, riskPct: 1, entry: 2_600, stop: 2_400, lot: 100 })).toBe(5_000)
    expect(positionSize({ capital: 100_000_000, riskPct: 1, entry: 2_600, stop: 2_650, lot: 100 })).toBe(0)
    // crypto, no lot: 1M / 150M per coin = 0.00666666 BTC
    expect(positionSize({ capital: 100_000_000, riskPct: 1, entry: 1_500_000_000, stop: 1_350_000_000 })).toBe(0.00666666)
  })

  it('size quote covers incomplete, bad and ok input', () => {
    const base = { capital: 100_000_000, riskPct: 1 }
    expect(sizeQuote({ ...base, entry: 2_600 })).toEqual({ status: 'incomplete' })
    expect(sizeQuote({ ...base, entry: 2_600, stop: 2_700 })).toEqual({ status: 'stopAboveEntry' })
    expect(sizeQuote({ ...base, entry: 2_600, stop: 2_400, lot: 100 })).toEqual({ status: 'ok', units: 5_000, cost: 13_000_000, lossAtStop: 1_000_000 })
  })

  it('days held from the first transaction', () => {
    expect(daysHeld([], NOW)).toBe(0)
  })
})
