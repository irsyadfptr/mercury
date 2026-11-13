import { useMemo } from 'react'
import type { Summary } from '@/types'
import { summarize } from './domain/portfolio'
import { useSettings } from './settings'
import { useStore } from './store'
import { useNow } from './useNow'

/** The portfolio summary for the current data and time. */
export function useSummary(): Summary {
  const holdings = useStore((s) => s.holdings)
  const transactions = useStore((s) => s.transactions)
  const usdIdr = useSettings((s) => s.usdIdr)
  const now = useNow()
  return useMemo(() => summarize(holdings, transactions, usdIdr, now), [holdings, transactions, usdIdr, now])
}
