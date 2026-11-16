import type { Account, CashEntry, CategoryTotal, EntryFilter, MonthSummary, MonthTotal } from '@/types'

export interface MonthHeroProps {
  summary: MonthSummary
  budget?: number
}

export interface CategoryBarsProps {
  title: string
  totals: readonly CategoryTotal[]
  /** Spending card only: limits per category (editable here, stored in Settings). */
  budgets?: Record<string, number>
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
