import { describe, expect, it } from 'vitest'
import type { Bill } from '@/types'
import { billsDue, billsFromSheet, nextMonthly, payBill } from './bills'
import { mergeNewest } from './portfolioSheet'

const at = '2026-11-01T00:00:00.000Z'
const bill = (id: string, dueDate: string, extra: Partial<Bill> = {}): Bill => ({ id, name: id, dueDate, monthly: true, archived: false, updatedAt: at, ...extra })

describe('bills due', () => {
  it('lists overdue and due within 3 days, soonest first; skips later and archived', () => {
    const bills = [bill('wifi', '2026-11-19'), bill('pln', '2026-11-14'), bill('rent', '2026-11-20'), bill('old', '2026-11-10', { archived: true }), bill('bpjs', '2026-11-16')]
    expect(billsDue(bills, '2026-11-16').map((d) => [d.bill.id, d.days])).toEqual([
      ['pln', -2],
      ['bpjs', 0],
      ['wifi', 3],
    ])
  })
})

describe('paying', () => {
  it('a monthly bill moves a month on from its due date and logs the expense', () => {
    const r = payBill(bill('wifi', '2026-10-25', { amount: 350_000, account: 'bca' }), '2026-11-16')
    expect(r.bill).toMatchObject({ dueDate: '2026-11-25', archived: false })
    expect(r.expense).toEqual({ type: 'expense', amount: 350_000, category: 'bills', date: '2026-11-16', note: 'wifi', account: 'bca' })
  })

  it('a one-time bill is archived; no amount = nothing logged', () => {
    const r = payBill(bill('tax', '2026-11-20', { monthly: false }), '2026-11-16')
    expect(r.bill.archived).toBe(true)
    expect(r.expense).toBeUndefined()
  })

  it('clamps to the month length', () => {
    expect(nextMonthly('2027-01-31')).toBe('2027-02-28')
    expect(nextMonthly('2026-12-15')).toBe('2027-01-15')
  })
})

describe('Bills tab', () => {
  it('reads rows, with a due date typed in the Sheet (day number); newest edit wins', () => {
    const r = billsFromSheet([['pln', 'PLN', '', 46342, true, '', false, at], ['bad']])
    expect(r.items).toEqual([{ id: 'pln', name: 'PLN', dueDate: '2026-11-16', monthly: true, archived: false, updatedAt: at }])
    expect(r.skipped).toBe(1)
    const paid = { ...r.items[0], dueDate: '2026-12-16', updatedAt: '2026-11-16T00:00:00.000Z' }
    expect(mergeNewest([paid], r.items)).toEqual([paid])
  })
})
