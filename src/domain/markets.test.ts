import { describe, expect, it } from 'vitest'
import { legacyHash } from '@/routes'
import type { Holding, Transaction } from '@/types'
import { journalMarket, marketOfClass, scopeSummary } from './markets'
import { summarize } from './portfolio'

const NOW = Date.parse('2026-11-25T00:00:00Z')
const h = (p: Partial<Holding> & Pick<Holding, 'id'>): Holding => ({
  assetClass: 'idx_stock',
  group: 'trading',
  symbol: p.id.toUpperCase(),
  currency: 'IDR',
  paper: false,
  createdAt: '2026-01-01T00:00:00Z',
  manualPriceAt: '2026-11-24T00:00:00Z',
  ...p,
})
const buy = (holdingId: string, quantity: number, price: number): Transaction => ({ id: crypto.randomUUID(), holdingId, type: 'buy', quantity, price, fee: 0, date: '2026-08-01T00:00:00Z' })

describe('marketOfClass', () => {
  it('puts each asset type on one page', () => {
    expect(marketOfClass('crypto')).toBe('crypto')
    expect(marketOfClass('idx_stock')).toBe('stocks')
    expect(marketOfClass('us_stock')).toBe('stocks')
    expect(['money_market', 'bond_fund', 'gold'].map((c) => marketOfClass(c as Holding['assetClass']))).toEqual(['funds', 'funds', 'funds'])
  })
})

describe('scopeSummary', () => {
  const holdings = [
    h({ id: 'adro', stop: 2_400, manualPrice: 2_500 }),
    h({ id: 'btc', assetClass: 'crypto', stop: 900_000_000, manualPrice: 1_000_000_000 }),
    h({ id: 'mm', assetClass: 'money_market', group: 'investing', manualPrice: 1 }),
  ]
  const txns = [buy('adro', 10_000, 2_500), buy('btc', 0.05, 1_000_000_000), buy('mm', 25_000_000, 1)]
  const all = summarize(holdings, txns, undefined, NOW)

  it('keeps only the market’s rows and totals', () => {
    const s = scopeSummary(all, ['crypto'])
    expect(s.rows.map((r) => r.holding.id)).toEqual(['btc'])
    expect(s.netWorth).toBe(50_000_000)
    expect(s.byClass).toEqual({ crypto: 50_000_000 })
  })

  it('keeps risk as % of the whole net worth, so market heats add up to the total', () => {
    const crypto = scopeSummary(all, ['crypto']).heat
    const stocks = scopeSummary(all, ['idx_stock', 'us_stock']).heat
    expect(crypto + stocks).toBeCloseTo(all.heat)
    // btc risks 5M of 100M total.
    expect(crypto).toBeCloseTo(5)
    expect(scopeSummary(all, ['money_market', 'bond_fund', 'gold']).heat).toBe(0)
  })
})

describe('journalMarket', () => {
  const byId = new Map([h({ id: 'btc', assetClass: 'crypto' }), h({ id: 'bbca' }), h({ id: 'mm', assetClass: 'money_market' })].map((x) => [x.id, x]))
  it('uses the note’s own market, else its holding’s, else none (general)', () => {
    expect(journalMarket({ market: 'stocks', holdingId: 'btc' }, byId)).toBe('stocks')
    expect(journalMarket({ holdingId: 'btc' }, byId)).toBe('crypto')
    expect(journalMarket({ holdingId: 'bbca' }, byId)).toBe('stocks')
    expect(journalMarket({ holdingId: 'mm' }, byId)).toBeUndefined()
    expect(journalMarket({}, byId)).toBeUndefined()
  })
})

describe('legacyHash', () => {
  it('sends old pages to their new home', () => {
    expect(legacyHash('#/dashboard')).toBe('#/home')
    expect(legacyHash('#/portfolio')).toBe('#/home')
    expect(legacyHash('#/scanner')).toBe('#/stocks?view=scan')
    expect(legacyHash('#/longterm')).toBe('#/stocks?view=score')
    expect(legacyHash('#/journal?view=trades')).toBe('#/stocks?view=journal&jv=trades')
    expect(legacyHash('#/journal?holding=x&tag=exit')).toBe('#/stocks?view=journal&holding=x&tag=exit')
  })
  it('leaves current pages alone', () => {
    expect(legacyHash('#/crypto?view=scan')).toBeUndefined()
    expect(legacyHash('#/cashflow')).toBeUndefined()
    expect(legacyHash('')).toBeUndefined()
  })
})

describe('stock exchanges', () => {
  it('maps a trade market and exchange to its scanner market and back', async () => {
    const { scanMarketOf, tradeMarketOfScan, exchangeParams, exchangeParamsOf, pricedInUsd, PAPER_CLASS } = await import('./markets')
    expect(scanMarketOf('stocks', 'us')).toBe('us')
    expect(scanMarketOf('stocks')).toBe('idx')
    expect(scanMarketOf('crypto', 'us')).toBe('crypto')
    expect(tradeMarketOfScan('us')).toBe('stocks')
    expect(exchangeParams('us')).toEqual({ ex: 'us' })
    expect(exchangeParams('crypto')).toEqual({})
    expect(exchangeParamsOf('us_stock')).toEqual({ ex: 'us' })
    expect(exchangeParamsOf('idx_stock')).toEqual({ ex: 'idx' })
    expect(exchangeParamsOf('gold')).toEqual({})
    expect([pricedInUsd('idx'), pricedInUsd('us'), pricedInUsd('crypto')]).toEqual([false, true, true])
    expect(PAPER_CLASS.us).toBe('us_stock')
  })
})
