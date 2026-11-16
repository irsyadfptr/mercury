import type { Account, CashEntry, CategoryTotal, MonthSummary, MonthTotal } from '@/types'

export interface MonthHeroProps {
  summary: MonthSummary
  budget?: number
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
  entries: readonly CashEntry[]
  accounts: readonly Account[]
  pendingIds: ReadonlySet<string>
  /** Deletes the entry (from the Sheet too, at the next sync). */
  onRemove: (id: string) => void
}

/** Entries of one calendar day, for the grouped list. */
export interface DayGroup {
  date: string
  entries: CashEntry[]
  /** income − expense for the day; transfers left out */
  net: number
}

export interface AccountsProps {
  /** Every entry, all months: balances are all time. */
  entries: readonly CashEntry[]
}
