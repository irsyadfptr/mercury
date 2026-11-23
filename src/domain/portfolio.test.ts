import { describe, expect, it } from 'vitest'
import { byType, daysHeld, heatTier, holdingQuests, level, openGroup, positionSize, quests, rarity, sizeQuote, summarize, winnersLosers } from './portfolio'
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

  it('picks winners and losers by unrealized %, skipping at-cost and unconverted holdings', () => {
    const { winners, losers } = winnersLosers(summarize(holdings, txns, undefined, NOW).rows)
    expect(winners.map((r) => r.holding.id)).toEqual(['bbca'])
    expect(losers.map((r) => r.holding.id)).toEqual(['adro'])
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

  it('asks to review an open trade once its review date comes', () => {
    const due = h({ id: 'tlkm', stop: 2900, manualPrice: 3000, manualPriceAt: '2026-11-12T00:00:00Z', reviewBy: '2026-11-13' })
    const later = h({ id: 'asii', stop: 4000, manualPrice: 4100, manualPriceAt: '2026-11-12T00:00:00Z', reviewBy: '2026-11-14' })
    const s = summarize([due, later], [buy('tlkm', 100, 3000), buy('asii', 100, 4100)], undefined, NOW)
    expect(quests(s, { tradeLimit: 100, now: NOW, lastExportAt: '2026-11-12T00:00:00Z' })).toEqual([{ kind: 'review', holding: due, since: '2026-11-13' }])
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

describe('by type', () => {
  it('splits a group by asset type in fixed order with totals, P/L and share', () => {
    const holdings = [
      h({ id: 'gold', assetClass: 'gold', group: 'investing', manualPrice: 1_500_000 }),
      h({ id: 'rdpu', assetClass: 'money_market', group: 'investing', manualPrice: 1.1 }),
      h({ id: 'bbca', group: 'investing', manualPrice: 9_000 }),
      h({ id: 'spy', assetClass: 'us_stock', group: 'investing', currency: 'USD', manualPrice: 600 }), // no rate: listed, not totalled
    ]
    const txns = [buy('gold', 2, 1_000_000), buy('rdpu', 1_000_000, 1), buy('bbca', 100, 10_000), buy('spy', 1, 500)]
    const groups = byType(summarize(holdings, txns, undefined, NOW).rows)
    expect(groups.map((g) => [g.assetClass, g.value, g.pnl, g.rows.length])).toEqual([
      ['idx_stock', 900_000, -100_000, 1],
      ['us_stock', 0, 0, 1],
      ['money_market', 1_100_000, 100_000, 1],
      ['gold', 3_000_000, 1_000_000, 1],
    ])
    expect(groups[3].pnlPct).toBe(50)
    expect(groups[3].share).toBeCloseTo((3_000_000 / 5_000_000) * 100)
  })
})

describe('openGroup', () => {
  const holdings = [
    h({ id: 'bbca', group: 'investing', manualPrice: 10_000 }),
    h({ id: 'rdpu', group: 'investing', assetClass: 'money_market' }), // at cost: in value, not in gain
    h({ id: 'adro', manualPrice: 2_500 }),
    h({ id: 'gone', manualPrice: 1_000 }),
    h({ id: 'spy', group: 'investing', assetClass: 'us_stock', currency: 'USD', manualPrice: 600 }),
  ]
  const sell = (holdingId: string, quantity: number, price: number): Transaction => ({ ...buy(holdingId, quantity, price), type: 'sell' })
  const txns = [buy('bbca', 1_000, 9_000), buy('rdpu', 5_000_000, 1), buy('adro', 10_000, 2_600), buy('gone', 100, 900), sell('gone', 100, 1_000), buy('spy', 1, 500)]
  const rows = summarize(holdings, txns, undefined, NOW).rows

  it('totals the open holdings of a group, gain from priced ones only, USD without a rate left out', () => {
    const inv = openGroup(rows, 'investing')
    expect(inv.rows.map((r) => r.holding.id)).toEqual(['bbca', 'rdpu', 'spy'])
    expect(inv.value).toBe(10_000_000 + 5_000_000)
    expect(inv.cost).toBe(9_000_000)
    expect(inv.pnl).toBe(1_000_000)
    expect(inv.pnlPct).toBeCloseTo(11.11, 2)
  })

  it('skips closed holdings', () => {
    const tr = openGroup(rows, 'trading')
    expect(tr.rows.map((r) => r.holding.id)).toEqual(['adro'])
    expect(tr.pnl).toBe(-1_000_000)
  })

  it('is zero for an empty group', () => {
    expect(openGroup([], 'trading')).toEqual({ rows: [], value: 0, cost: 0, pnl: 0, pnlPct: 0 })
  })
})

describe('holdingQuests', () => {
  it('keeps holding to-dos only, most urgent first', () => {
    const a = h({ id: 'a' })
    const b = h({ id: 'b' })
    const list = holdingQuests([
      { kind: 'stalePrice', holding: a, days: 9 },
      { kind: 'backup', days: null },
      { kind: 'setStop', holding: b },
      { kind: 'review', holding: a, since: '2026-11-01' },
      { kind: 'overRisk', holding: a, pct: 1.4 },
      { kind: 'fxRate' },
      { kind: 'setStop', holding: a },
    ])
    expect(list.map((q) => `${q.kind}:${q.holding.id}`)).toEqual(['overRisk:a', 'setStop:b', 'setStop:a', 'review:a', 'stalePrice:a'])
  })
})
