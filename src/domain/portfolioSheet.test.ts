import { describe, expect, it } from 'vitest'
import type { Holding, Transaction } from '@/types'
import { HOLDING_COLUMNS, mergePortfolios, portfolioFromSheet, portfolioSyncAction, toRow, TRANSACTION_COLUMNS } from './portfolioSheet'

const holding: Holding = {
  id: 'h1',
  assetClass: 'idx_stock',
  group: 'trading',
  symbol: 'ADRO',
  currency: 'IDR',
  paper: true,
  stop: 2410,
  manualPrice: 2500,
  manualPriceAt: '2026-11-13T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
}
const tx: Transaction = { id: 't1', holdingId: 'h1', type: 'buy', date: '2026-11-01T00:00:00.000Z', quantity: 5000, price: 2600, fee: 0 }

describe('portfolio ↔ sheet rows', () => {
  it('round-trips holdings and transactions, keeping optional fields optional', () => {
    const p = portfolioFromSheet([toRow(HOLDING_COLUMNS, holding)], [toRow(TRANSACTION_COLUMNS, tx)])
    expect(p).toEqual({ holdings: [holding], transactions: [tx], skipped: 0 })
    expect('name' in p.holdings[0]).toBe(false)
  })

  it('reads hand-typed cells and skips rows that do not fit', () => {
    const typed = ['h2', 'crypto', 'trading', 'BTC', '', 'Binance', 'IDR', 'TRUE', '', '', 'Rp1,500,000,000', '', '2026-11-01T00:00:00.000Z', '']
    const broken = ['h3', 'stamps', 'trading', 'X', '', '', 'IDR', 'FALSE', '', '', '', '', '2026-11-01T00:00:00.000Z', '']
    const orphanTx = ['t9', 'missing', 'buy', '2026-11-01T00:00:00.000Z', 1, 1, 0, '']
    const p = portfolioFromSheet([typed, broken, ['', '']], [orphanTx])
    expect(p.holdings).toHaveLength(1)
    expect(p.holdings[0]).toMatchObject({ symbol: 'BTC', paper: true, manualPrice: 1_500_000_000 })
    expect(p.transactions).toEqual([])
    expect(p.skipped).toBe(2)
  })

  it('merges by id, this device first', () => {
    const remote = { holdings: [{ ...holding, symbol: 'OLD' }, { ...holding, id: 'h2' }], transactions: [tx] }
    const merged = mergePortfolios({ holdings: [holding], transactions: [] }, remote)
    expect(merged.holdings.map((h) => [h.id, h.symbol])).toEqual([['h1', 'ADRO'], ['h2', 'ADRO']])
    expect(merged.transactions).toEqual([tx])
  })
})

describe('sync direction', () => {
  const T1 = '2026-11-13T01:00:00.000Z'
  const T2 = '2026-11-13T02:00:00.000Z'
  const T3 = '2026-11-13T03:00:00.000Z'

  it('first sync: pull onto an empty device, merge when both have data, push into an empty sheet', () => {
    expect(portfolioSyncAction({ hasData: false }, { hasData: true, updatedAt: T1 })).toBe('pull')
    expect(portfolioSyncAction({ hasData: true }, { hasData: true, updatedAt: T1 })).toBe('merge')
    expect(portfolioSyncAction({ hasData: true }, { hasData: false })).toBe('push')
    expect(portfolioSyncAction({ hasData: false }, { hasData: false })).toBe('none')
  })

  it('an empty sheet never wipes local data', () => {
    expect(portfolioSyncAction({ hasData: true, syncedAt: T1, changedAt: T1 }, { hasData: false, updatedAt: T2 })).toBe('push')
  })

  it('no local edits: pull; local edits: push unless another device wrote later', () => {
    expect(portfolioSyncAction({ hasData: true, syncedAt: T2, changedAt: T1 }, { hasData: true, updatedAt: T2 })).toBe('pull')
    expect(portfolioSyncAction({ hasData: true, syncedAt: T1, changedAt: T3 }, { hasData: true, updatedAt: T2 })).toBe('push')
    expect(portfolioSyncAction({ hasData: true, syncedAt: T1, changedAt: T2 }, { hasData: true, updatedAt: T3 })).toBe('pull')
    // Deleting everything on purpose is a local edit, so it pushes.
    expect(portfolioSyncAction({ hasData: false, syncedAt: T1, changedAt: T2 }, { hasData: true, updatedAt: T1 })).toBe('push')
  })
})
