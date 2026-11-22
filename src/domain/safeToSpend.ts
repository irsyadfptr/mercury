import type { Bill, CashEntry, SafeToSpend } from '@/types'
import { daysInMonth, isCashflow, monthOf } from './cashflow'

/**
 * What can be spent per day for the rest of the month without breaking the plan. The pool is the monthly budget (or,
 * without one, this month's income so far), minus what was spent before today, minus bills still to pay this month
 * (fixed amounts, including overdue ones). It is shared over the days left, today included, so the daily number holds
 * steady through the day and today's spending only uses it up. Undefined with neither a budget nor any income.
 */
export function safeToSpend(entries: readonly CashEntry[], bills: readonly Bill[], today: string, budget?: number): SafeToSpend | undefined {
  const month = monthOf(today)
  let income = 0
  let spentBefore = 0
  let spentToday = 0
  for (const e of entries) {
    if (monthOf(e.date) !== month || !isCashflow(e)) continue
    if (e.type === 'income') income += e.amount
    else if (e.date < today) spentBefore += e.amount
    else if (e.date === today) spentToday += e.amount
  }
  const base = budget && budget > 0 ? 'budget' : income > 0 ? 'income' : undefined
  if (!base) return undefined
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const billsLeft = bills.filter((b) => !b.archived && !b.income && b.amount && b.dueDate <= monthEnd).reduce((sum, b) => sum + (b.amount ?? 0), 0)
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1
  const pool = (base === 'budget' ? budget! : income) - spentBefore - billsLeft
  const perDay = Math.max(0, Math.floor(pool / daysLeft))
  return { base, pool, perDay, spentToday, leftToday: perDay - spentToday, daysLeft, billsLeft }
}
