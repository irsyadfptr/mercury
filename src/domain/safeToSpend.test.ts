import { describe, expect, it } from 'vitest'
import type { Bill, CashEntry } from '@/types'
import { safeToSpend } from './safeToSpend'

const at = (date: string, amount: number, type: CashEntry['type'] = 'expense', category = 'food'): CashEntry => ({ id: date + amount + type, date, type, amount, category, createdAt: '2026-01-01T00:00:00Z' })
const bill = (dueDate: string, amount?: number, extra: Partial<Bill> = {}): Bill => ({ id: dueDate, name: 'x', amount, dueDate, monthly: true, income: false, archived: false, updatedAt: '2026-01-01T00:00:00Z', ...extra })

describe('safeToSpend', () => {
  // Nov 2026 has 30 days; on the 21st there are 10 days left, today included.
  const entries = [at('2026-11-02', 1_000_000), at('2026-11-21', 50_000), at('2026-11-01', 8_000_000, 'income', 'salary'), at('2026-10-30', 999_999)]

  it('shares budget − spent before today − bills left over the days left', () => {
    const s = safeToSpend(entries, [bill('2026-11-25', 500_000), bill('2026-12-01', 900_000), bill('2026-11-26', 100, { income: true })], '2026-11-21', 3_500_000)
    expect(s).toMatchObject({ base: 'budget', billsLeft: 500_000, pool: 2_000_000, daysLeft: 10, perDay: 200_000, spentToday: 50_000, leftToday: 150_000 })
  })
  it('falls back to this month’s income without a budget', () => {
    expect(safeToSpend(entries, [], '2026-11-21')).toMatchObject({ base: 'income', pool: 7_000_000, perDay: 700_000 })
  })
  it('counts overdue unpaid bills, skips ones without an amount, and never goes below 0 a day', () => {
    const s = safeToSpend(entries, [bill('2026-11-10', 300_000), bill('2026-11-24')], '2026-11-21', 1_000_000)
    expect(s).toMatchObject({ billsLeft: 300_000, pool: -300_000, perDay: 0, leftToday: -50_000 })
  })
  it('is undefined with no budget and no income', () => {
    expect(safeToSpend([at('2026-11-02', 10)], [], '2026-11-21')).toBeUndefined()
  })
})
