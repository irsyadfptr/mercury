import { describe, expect, it } from 'vitest'
import type { Holding, HoldingFormValues, Transaction } from '@/types'
import { cashOf, formByAmount, formToFirstBuy, formToHolding, holdingToForm, parseTransaction, validateHoldingForm } from './holdingForm'
import { valueHolding } from './portfolio'
import { monthSummary } from './cashflow'

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

describe('funds entered by amount', () => {
  const fundForm = (p: Partial<HoldingFormValues> = {}) => form({ assetClass: 'money_market', group: 'investing', symbol: 'RDPU', ...p })

  it('first buy: amount invested + current value, no quantity', () => {
    const v = fundForm({ buyPrice: '1000000', price: '1050000' })
    expect(validateHoldingForm(fundForm({ buyPrice: '' }), true)).toEqual({ buyPrice: 'positive' })
    expect(validateHoldingForm(v, true)).toEqual({})
    const h = { ...formToHolding(v, undefined, NOW), id: 'f', createdAt: NOW } as Holding
    const buy = { ...formToFirstBuy(v, 'f'), id: 't1' } as Transaction
    expect(h.byAmount).toBe(true)
    expect(buy).toMatchObject({ quantity: 1_000_000, price: 1 })
    expect(h.manualPrice).toBeCloseTo(1.05)
    expect(valueHolding(h, [buy], undefined)).toMatchObject({ valueIdr: 1_050_000, costIdr: 1_000_000 })
    // Editing shows the current value again.
    expect(holdingToForm(h, TODAY, [buy]).price).toBe('1050000')
  })

  it('a top-up adds exactly its amount to cost and value; a withdrawal returns its amount', () => {
    const h = { id: 'f', assetClass: 'money_market', group: 'investing', symbol: 'RDPU', currency: 'IDR', paper: false, byAmount: true, manualPrice: 1.05, createdAt: NOW } as Holding
    const txns = [{ id: 't1', holdingId: 'f', type: 'buy', date: '2026-11-01T00:00:00.000Z', quantity: 1_000_000, price: 1, fee: 0 }] as Transaction[]
    const top = parseTransaction({ type: 'buy', qty: '500000', price: '', fee: '', date: TODAY }, h, txns)
    if (!top.ok) throw new Error('top-up rejected')
    expect(cashOf(top.tx)).toBe(500_000)
    const after = valueHolding(h, [...txns, { ...top.tx, id: 't2' }], undefined)
    expect(after.valueIdr).toBeCloseTo(1_550_000)
    expect(after.costIdr).toBeCloseTo(1_500_000)
    const out = parseTransaction({ type: 'sell', qty: '210000', price: '', fee: '', date: TODAY }, h, txns)
    expect(out.ok && cashOf(out.tx)).toBe(210_000)
  })

  it('funds recorded earlier in units keep the unit form', () => {
    const old = { id: 'o', assetClass: 'money_market', group: 'investing', symbol: 'OLD', currency: 'IDR', paper: false, createdAt: NOW } as Holding
    expect(formByAmount(old, 'money_market')).toBe(false)
    expect(formByAmount(undefined, 'money_market')).toBe(true)
    expect(formByAmount(undefined, 'idx_stock')).toBe(false)
  })

  it('money moved to a holding is never spending', () => {
    const e = { id: 'x', date: '2026-11-13', type: 'expense' as const, amount: 1_000_000, category: 'invest', createdAt: NOW }
    expect(monthSummary([e], '2026-11', TODAY)).toMatchObject({ expense: 0, expenseByCategory: [] })
  })
})
