import { describe, expect, it } from 'vitest'
import type { Holding, HoldingFormValues, Transaction } from '@/types'
import { formToFirstBuy, formToHolding, holdingToForm, parseTransaction, validateHoldingForm } from './holdingForm'

const TODAY = '2026-11-13'
const NOW = '2026-11-13T05:00:00.000Z'
const form = (p: Partial<HoldingFormValues> = {}): HoldingFormValues => ({ ...holdingToForm(undefined, TODAY), ...p })

describe('holding form', () => {
  it('starts with IDX defaults', () => {
    expect(form()).toMatchObject({ assetClass: 'idx_stock', group: 'trading', currency: 'IDR', date: TODAY })
  })

  it('validates required and numeric fields', () => {
    expect(validateHoldingForm(form(), true)).toEqual({ symbol: 'required', qty: 'positive', buyPrice: 'required' })
    expect(validateHoldingForm(form({ symbol: 'X', qty: '1', buyPrice: '0', stop: '-1', price: 'abc' }), true)).toEqual({ stop: 'positive', price: 'positive' })
    // Editing never asks for a first buy.
    expect(validateHoldingForm(form({ symbol: 'X' }), false)).toEqual({})
  })

  it('builds a holding and a first buy in shares from lots', () => {
    const v = form({ symbol: ' adro ', name: ' Alamtri ', stop: '2410', price: '2500', qty: '50', buyPrice: '2600', fee: '' })
    expect(formToHolding(v, undefined, NOW)).toEqual({
      assetClass: 'idx_stock',
      group: 'trading',
      symbol: 'ADRO',
      name: 'Alamtri',
      platform: undefined,
      currency: 'IDR',
      paper: false,
      stop: 2410,
      target: undefined,
      manualPrice: 2500,
      manualPriceAt: NOW,
    })
    expect(formToFirstBuy(v, 'h1')).toEqual({ holdingId: 'h1', type: 'buy', date: '2026-11-13T00:00:00.000Z', quantity: 5000, price: 2600, fee: 0 })
  })

  it('keeps the price timestamp when the price is unchanged, and drops stops outside trading', () => {
    const existing = { manualPrice: 2500, manualPriceAt: '2026-11-01T00:00:00.000Z' } as Holding
    expect(formToHolding(form({ symbol: 'A', price: '2500' }), existing, NOW).manualPriceAt).toBe('2026-11-01T00:00:00.000Z')
    expect(formToHolding(form({ symbol: 'A', price: '2600' }), existing, NOW).manualPriceAt).toBe(NOW)
    expect(formToHolding(form({ symbol: 'A', group: 'investing', stop: '100' }), undefined, NOW).stop).toBeUndefined()
  })
})

describe('transaction row', () => {
  const holding = { id: 'h1', assetClass: 'idx_stock' } as Holding
  const held: Transaction[] = [{ id: 't1', holdingId: 'h1', type: 'buy', date: '2026-11-01T00:00:00.000Z', quantity: 5000, price: 2600, fee: 0 }]
  const row = { type: 'sell' as const, qty: '10', price: '2700', fee: '', date: TODAY }

  it('converts lots and accepts a valid sell', () => {
    expect(parseTransaction(row, holding, held)).toEqual({
      ok: true,
      tx: { holdingId: 'h1', type: 'sell', date: '2026-11-13T00:00:00.000Z', quantity: 1000, price: 2700, fee: 0 },
    })
  })

  it('rejects oversells and bad numbers', () => {
    expect(parseTransaction({ ...row, qty: '60' }, holding, held)).toEqual({ ok: false, error: 'oversell' })
    expect(parseTransaction({ ...row, qty: '0' }, holding, held)).toEqual({ ok: false, error: 'positive' })
    expect(parseTransaction({ ...row, fee: '-5' }, holding, held)).toEqual({ ok: false, error: 'positive' })
  })
})
