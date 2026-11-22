import type { ReactNode } from 'react'
import type { Account, CashEntry, CategoryTotal, EntryFilter, MonthSummary, MonthTotal } from '@/types'

export interface MoneyNowProps {
  /** Every entry, all months: balances are all time. */
  entries: readonly CashEntry[]
  today: string
  /** The sync status line, shown under the total (Cashflow only). */
  sync?: ReactNode
  /** Tapping an account shows its entries; without it (Dashboard), it opens Cashflow. */
  onPick?: (accountId: string) => void
}

export interface MonthHeroProps {
  summary: MonthSummary
  budget?: number
  onPrev: () => void
  /** Missing on the current month: there is no next one yet. */
  onNext?: () => void
}

export interface SpendingMixProps {
  totals: readonly CategoryTotal[]
  /** Limits per category (editable here, stored in Settings). */
  budgets: Record<string, number>
  /** Spending per category over the same days of the month before, for ▲▼. */
  lastMonth: Record<string, number>
  month: string
  /** Days of `month` covered (all of it for a past month). */
  days: number
}

export interface BudgetEditorProps {
  budgets: Record<string, number>
  /** Categories to offer besides the built-in spending ones (e.g. custom ones spent on). */
  extra: readonly string[]
}

export interface CategoryBarsProps {
  title: string
  totals: readonly CategoryTotal[]
}

export interface SixMonthsProps {
  months: readonly MonthTotal[]
  /** The month being viewed, highlighted. */
  current: string
}

export interface EntryListProps {
  /** Entries to list: the month's, or every match when filtering. */
  entries: readonly CashEntry[]
  /** Every entry, for running balances and the category list. */
  all: readonly CashEntry[]
  accounts: readonly Account[]
  pendingIds: ReadonlySet<string>
  /** Starts a delete that can be undone for a few seconds. */
  onRemove: (e: CashEntry) => void
  filter: EntryFilter
  onFilter: (f: EntryFilter) => void
  filtering: boolean
  today: string
  /** This month, unfiltered: show today and yesterday, fold the rest of the month. */
  fold: boolean
}

/** Entries of one calendar day, for the grouped list. */
export interface DayGroup {
  date: string
  entries: CashEntry[]
  /** income − expense for the day; transfers and adjustments left out */
  net: number
}

export interface AccountsProps {
  /** Every entry, all months: balances are all time. */
  entries: readonly CashEntry[]
  /** Tapping an account's name shows its entries. */
  onPick: (accountId: string) => void
}
