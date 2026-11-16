// Pure bill reminders: when a bill is due, what paying it does, and the Bills tab of the Sheet. No clock, storage or network.
import type { Bill, BillDue, ColumnSpec, I18n, NewCashEntry } from '@/types'
import { addMonths, daysInMonth, monthOf } from './cashflow'
import { parseTable } from './portfolioSheet'
import { Bill as BillSchema } from './schema'

/** A bill becomes a Dashboard quest this many days before its due date, and stays one while overdue. */
export const BILL_REMIND_DAYS = 3

const DAY_MS = 86_400_000
const dayNumber = (yyyyMmDd: string) => Date.parse(`${yyyyMmDd}T00:00:00Z`) / DAY_MS

/** Same day next month, clamped to the month's length (Jan 31 → Feb 28). */
export function nextMonthly(dueDate: string): string {
  const month = addMonths(monthOf(dueDate), 1)
  const day = Math.min(Number(dueDate.slice(8, 10)), daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

/** Active bills due within BILL_REMIND_DAYS of today (or overdue), soonest first. days < 0 = overdue. */
export function billsDue(bills: readonly Bill[], today: string): BillDue[] {
  return bills
    .filter((b) => !b.archived)
    .map((bill) => ({ bill, days: dayNumber(bill.dueDate) - dayNumber(today) }))
    .filter((d) => d.days <= BILL_REMIND_DAYS)
    .sort((a, b) => a.days - b.days)
}

/**
 * Paying a bill: a monthly one moves to the next month (from its due date, so a missed month stays due);
 * a one-time one is archived. With an amount, it also returns the expense to log (category "bills", note = name).
 * The store stamps updatedAt when the bill is saved.
 */
export function payBill(bill: Bill, today: string): { bill: Bill; expense?: NewCashEntry } {
  // shortcut: a bill due on the 29th–31st drifts to the shorter month's last day and stays there; store the original day if that matters.
  const next = bill.monthly ? { dueDate: nextMonthly(bill.dueDate) } : { archived: true }
  const expense: NewCashEntry | undefined = bill.amount
    ? { type: 'expense', amount: bill.amount, category: 'bills', date: today, note: bill.name, account: bill.account }
    : undefined
  return { bill: { ...bill, ...next }, expense }
}

/** "3 days late" / "due today" / "in 2 days", for the Bills card and the Dashboard quest. */
export function dueTag(days: number, t: I18n['t']): string {
  if (days < 0) return t('quest.billOverdue', { d: -days })
  return days === 0 ? t('quest.billToday') : t('quest.billSoon', { d: days })
}

// ---- Google Sheet: Bills tab ----

export const BILL_COLUMNS: readonly ColumnSpec[] = [
  ['id', 'string'],
  ['name', 'string'],
  ['amount', 'number'],
  ['dueDate', 'date'],
  ['monthly', 'boolean'],
  ['account', 'string'],
  ['archived', 'boolean'],
  ['updatedAt', 'string'],
]

export const billsFromSheet = (rows: readonly unknown[][]) => parseTable(BILL_COLUMNS, rows, BillSchema)
