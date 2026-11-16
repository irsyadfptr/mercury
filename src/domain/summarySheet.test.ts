import { describe, expect, it } from 'vitest'
import type { Account, CashEntry } from '@/types'
import { accountBalances, balanceAdjustment, DEFAULT_ACCOUNT } from './accounts'
import { monthSummary } from './cashflow'
import { summaryRows } from './summarySheet'

const bca: Account = { id: 'bca', name: 'BCA', startingBalance: 1_000, archived: false, updatedAt: '2026-11-01T00:00:00.000Z' }
const accounts = [DEFAULT_ACCOUNT, bca]
let n = 0
const e = (date: string, type: CashEntry['type'], amount: number, category: string, extra: Partial<CashEntry> = {}): CashEntry => ({
  id: `e${++n}`,
  date,
  type,
  amount,
  category,
  createdAt: `${date}T00:00:00.000Z`,
  ...extra,
})

describe('balance adjustment', () => {
  it('logs the difference to the real balance, never as spending or income', () => {
    expect(balanceAdjustment('bca', 1_000, 850, '2026-11-16')).toEqual({ type: 'expense', amount: 150, category: 'adjustment', date: '2026-11-16', account: 'bca' })
    expect(balanceAdjustment('bca', 1_000, 1_200, '2026-11-16')).toMatchObject({ type: 'income', amount: 200 })
    expect(balanceAdjustment('bca', 1_000, 1_000, '2026-11-16')).toBeUndefined()

    const adj = { ...balanceAdjustment('bca', 1_000, 850, '2026-11-16')!, id: 'a', createdAt: 'x' }
    expect(accountBalances(accounts, [adj]).bca).toBe(850)
    expect(monthSummary([adj], '2026-11', '2026-11-16')).toMatchObject({ income: 0, expense: 0, expenseByCategory: [] })
  })
})

describe('Summary tab', () => {
  it('months newest first with categories by total, then account balances', () => {
    const entries = [
      e('2026-10-05', 'income', 10_000, 'salary', { account: 'bca' }),
      e('2026-10-06', 'expense', 3_000, 'housing', { account: 'bca' }),
      e('2026-11-02', 'expense', 500, 'food'),
      e('2026-11-03', 'expense', 1_000, 'housing', { account: 'bca' }),
      e('2026-11-04', 'transfer', 2_000, 'transfer', { account: 'bca', toAccount: 'cash' }),
      e('2026-11-05', 'expense', 100, 'adjustment', { account: 'bca' }),
    ]
    expect(summaryRows(entries, accounts)).toEqual([
      ['month', 'income', 'spent', 'net', 'savingsRate', 'housing', 'food'],
      ['2026-11', 0, 1_500, -1_500, '', 1_000, 500],
      ['2026-10', 10_000, 3_000, 7_000, 70, 3_000, ''],
      [],
      ['account', 'balance'],
      ['Cash', 1_500],
      ['BCA', 1_000 + 10_000 - 3_000 - 1_000 - 2_000 - 100],
      ['total', 1_500 + 4_900],
    ])
  })
})
