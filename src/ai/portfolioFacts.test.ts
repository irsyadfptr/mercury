import { describe, expect, it } from 'vitest'
import { summarize } from '@/domain/portfolio'
import type { Holding, Transaction } from '@/types'
import { portfolioFacts } from './portfolioFacts'

const NOW = Date.parse('2026-11-13T00:00:00Z')
const h = (p: Partial<Holding> & Pick<Holding, 'id'>): Holding => ({ assetClass: 'idx_stock', group: 'trading', symbol: p.id.toUpperCase(), currency: 'IDR', paper: false, createdAt: '2026-01-01T00:00:00Z', ...p })
const buy = (holdingId: string, quantity: number, price: number): Transaction => ({ id: crypto.randomUUID(), holdingId, type: 'buy', quantity, price, fee: 0, date: '2026-08-01T00:00:00Z' })

describe('portfolioFacts', () => {
  const holdings = [
    h({ id: 'bbca', group: 'investing', manualPrice: 10_000 }),
    h({ id: 'adro', stop: 2_400, manualPrice: 2_500 }),
    h({ id: 'btc', assetClass: 'crypto', paper: true }),
    h({ id: 'spy', assetClass: 'us_stock', group: 'investing', currency: 'USD', manualPrice: 600 }),
  ]
  const txns = [buy('bbca', 1_000, 9_000), buy('adro', 10_000, 2_600), buy('btc', 0.01, 1_500_000_000), buy('spy', 1, 500)]
  const facts = portfolioFacts(summarize(holdings, txns, undefined, NOW), 6, 1)
  const text = facts.join('\n')

  it('gives shares, P/L, heat and flags as percentages', () => {
    expect(text).toContain('Investing (long-term) 20.0% · Trading (3–6 month swings) 80.0%')
    expect(text).toContain('Portfolio heat (loss if every trade\'s stop hits, % of net worth): 2.0% against a 6.0% limit')
    expect(facts.find((l) => l.startsWith('- ADRO'))).toBe('- ADRO · idx_stock, trading · 50.0% of portfolio · P/L −3.8% · held 104 days · stop risk 2.0% of net worth')
    expect(facts.find((l) => l.startsWith('- BTC'))).toMatch(/PAPER .*\(no price entered, valued at cost\) .* NO stop set/)
    expect(text).toContain('Left out (no USD/IDR rate set): SPY')
  })

  it('never sends rupiah amounts, quantities or prices', () => {
    for (const n of ['50000000', '50,000,000', '10000', '2500', '2600', '0.01', 'Rp']) expect(text).not.toContain(n)
  })

  it('lists the largest holding first and skips sold-out ones', () => {
    expect(facts.filter((l) => l.startsWith('- ')).map((l) => l.split(' ')[1])).toEqual(['ADRO', 'BTC', 'BBCA'])
    expect(portfolioFacts(summarize([h({ id: 'x' })], [], undefined, NOW), 6, 1)).toEqual([])
  })
})
