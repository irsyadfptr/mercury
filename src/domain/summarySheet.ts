// Pure: the Summary tab the sync writes for reading in Google Sheets. The app never reads it back.
import type { Account, CashEntry } from '@/types'
import { accountBalances } from './accounts'
import { isCashflow, monthOf, monthSummary } from './cashflow'

/** Fixed first columns; one column per expense category follows (most spent first). */
export const SUMMARY_COLUMNS = ['month', 'income', 'spent', 'net', 'savingsRate'] as const

/**
 * One row per month with entries (newest first): income, spent, net, savings rate % and spending per category,
 * then a blank row and each active account's current balance plus the total. Transfers and adjustments are left out
 * of the month figures, as in the app.
 */
export function summaryRows(entries: readonly CashEntry[], accounts: readonly Account[]): (string | number)[][] {
  const real = entries.filter((e) => isCashflow(e))
  const months = [...new Set(real.map((e) => monthOf(e.date)))].sort().reverse()
  const spentBy = new Map<string, number>()
  for (const e of real) if (e.type === 'expense') spentBy.set(e.category, (spentBy.get(e.category) ?? 0) + e.amount)
  const categories = [...spentBy].sort((a, b) => b[1] - a[1]).map(([c]) => c)

  const monthRows = months.map((m) => {
    const s = monthSummary(entries, m, `${m}-01`)
    const byCategory = new Map(s.expenseByCategory.map((c) => [c.category, c.amount]))
    const rate = s.savingsRate === null ? '' : Math.round(s.savingsRate * 10) / 10
    return [m, s.income, s.expense, s.net, rate, ...categories.map((c) => byCategory.get(c) ?? '')]
  })

  const balances = accountBalances(accounts, entries)
  const active = accounts.filter((a) => !a.archived)
  return [
    [...SUMMARY_COLUMNS, ...categories],
    ...monthRows,
    [],
    ['account', 'balance'],
    ...active.map((a) => [a.name, balances[a.id]]),
    ['total', active.reduce((sum, a) => sum + balances[a.id], 0)],
  ]
}
