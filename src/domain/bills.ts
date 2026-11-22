// Pure bill and expected-income reminders: when one needs you, what paying / receiving does, and the Bills tab.
// No clock, storage or network.
import type { Bill, BillDue, ColumnSpec, I18n, NewCashEntry } from '@/types'
import { addMonths, daysInMonth, monthOf } from './cashflow'
import { parseTable } from './portfolioSheet'
import { Bill as BillSchema } from './schema'

/** A bill becomes a Dashboard quest this many days before its due date, and stays one while overdue. */
export const BILL_REMIND_DAYS = 3
/** Expected income becomes a quest only once it is this many days late (it usually arrives on its own). */
export const INCOME_LATE_DAYS = 2

const DAY_MS = 86_400_000
const dayNumber = (yyyyMmDd: string) => Date.parse(`${yyyyMmDd}T00:00:00Z`) / DAY_MS

/** Same day next month, clamped to the month's length (Jan 31 → Feb 28). */
export function nextMonthly(dueDate: string): string {
  const month = addMonths(monthOf(dueDate), 1)
  const day = Math.min(Number(dueDate.slice(8, 10)), daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

/**
 * Active bills due within BILL_REMIND_DAYS (or overdue), and expected income at least INCOME_LATE_DAYS late;
 * soonest first. days < 0 = overdue / late.
 */
export function billsDue(bills: readonly Bill[], today: string, remindDays = BILL_REMIND_DAYS): BillDue[] {
  return bills
    .filter((b) => !b.archived)
    .map((bill) => ({ bill, days: dayNumber(bill.dueDate) - dayNumber(today) }))
    .filter((d) => (d.bill.income ? d.days <= -INCOME_LATE_DAYS : d.days <= remindDays))
    .sort((a, b) => a.days - b.days)
}

/**
 * Paying a bill or receiving expected income: a monthly one moves to the next month (from its due date, so a missed
 * month stays due); a one-time one is archived. With an amount, it also returns the entry to log: a "bills" expense,
 * or "salary" income, note = name. The store stamps updatedAt when the bill is saved.
 */
export function payBill(bill: Bill, today: string): { bill: Bill; expense?: NewCashEntry } {
  // shortcut: a bill due on the 29th–31st drifts to the shorter month's last day and stays there; store the original day if that matters.
  const next = bill.monthly ? { dueDate: nextMonthly(bill.dueDate) } : { archived: true }
  const expense: NewCashEntry | undefined = bill.amount
    ? {
        type: bill.income ? 'income' : 'expense',
        amount: bill.amount,
        category: bill.income ? 'salary' : 'bills',
        date: today,
        note: bill.name,
        account: bill.account,
      }
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
  ['income', 'boolean'],
]

export const billsFromSheet = (rows: readonly unknown[][]) => parseTable(BILL_COLUMNS, rows, BillSchema)
