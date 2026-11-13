import type { CashEntry, CategoryTotal, MonthSummary, MonthTotal } from '@/types'

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
  pendingIds: ReadonlySet<string>
  onRemovePending: (id: string) => void
}

/** Entries of one calendar day, for the grouped list. */
export interface DayGroup {
  date: string
  entries: CashEntry[]
  /** income − expense for the day */
  net: number
}
