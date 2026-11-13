import { describe, expect, it } from 'vitest'
import { parseBackup, toBackup } from './backup'
import { position } from './positions'
import type { Holding, Transaction } from '@/types'

const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'quantity' | 'price' | 'date'>): Transaction => ({
  id: crypto.randomUUID(),
  holdingId: 'h1',
  fee: 0,
  ...p,
})

describe('position (average cost)', () => {
  it('averages buys and realizes P/L on sells, fees included', () => {
    const p = position([
      tx({ type: 'buy', quantity: 100, price: 1000, fee: 1000, date: '2026-01-01T00:00:00Z' }),
      tx({ type: 'buy', quantity: 100, price: 1200, date: '2026-01-02T00:00:00Z' }),
      tx({ type: 'sell', quantity: 50, price: 1500, fee: 500, date: '2026-01-03T00:00:00Z' }),
    ])
    // avg = (100k + 1k + 120k) / 200 = 1105
    expect(p.quantity).toBe(150)
    expect(p.avgCost).toBeCloseTo(1105)
    expect(p.costBasis).toBeCloseTo(165_750)
    expect(p.realizedPnl).toBeCloseTo(50 * (1500 - 1105) - 500)
  })

  it('applies transactions in date order regardless of input order', () => {
    const p = position([
      tx({ type: 'sell', quantity: 1, price: 20, date: '2026-02-01T00:00:00Z' }),
      tx({ type: 'buy', quantity: 1, price: 10, date: '2026-01-01T00:00:00Z' }),
    ])
    expect(p).toEqual({ quantity: 0, avgCost: 0, costBasis: 0, realizedPnl: 10 })
  })

  it('rejects selling more than held', () => {
    expect(() => position([tx({ type: 'sell', quantity: 1, price: 1, date: '2026-01-01T00:00:00Z' })])).toThrow()
  })
})

describe('backup', () => {
  const EXPORTED = '2026-11-13T00:00:00.000Z'
  const holding: Holding = {
    id: 'h1',
    assetClass: 'idx_stock',
    group: 'trading',
    symbol: 'BBCA',
    currency: 'IDR',
    paper: true,
    stop: 8500,
    createdAt: '2026-11-13T00:00:00.000Z',
  }

  it('round-trips export → import', () => {
    const b = toBackup([holding], [tx({ type: 'buy', quantity: 100, price: 9000, date: '2026-11-13T00:00:00Z' })], EXPORTED)
    const r = parseBackup(JSON.stringify(b))
    expect(r.ok && r.data.holdings[0].symbol).toBe('BBCA')
  })

  it('rejects bad JSON, wrong version, bad fields and orphan transactions', () => {
    expect(parseBackup('{').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...toBackup([], [], EXPORTED), schemaVersion: 99 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify(toBackup([{ ...holding, stop: -1 }], [], EXPORTED))).ok).toBe(false)
    const orphan = toBackup([], [tx({ type: 'buy', quantity: 1, price: 1, date: '2026-01-01T00:00:00Z' })], EXPORTED)
    const r = parseBackup(JSON.stringify(orphan))
    expect(!r.ok && r.error).toMatch(/missing holding/)
  })
})
