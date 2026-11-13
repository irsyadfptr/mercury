import { useMemo } from 'react'
import type { CashEntry } from '@/types'
import { useCashflow } from './cashflowStore'
import { mergeEntries } from './domain/cashflow'

/** Every entry this device knows: the Sheet copy plus the not-yet-synced queue. */
export function useCashEntries(): { entries: CashEntry[]; pendingIds: ReadonlySet<string> } {
  const synced = useCashflow((s) => s.synced)
  const pending = useCashflow((s) => s.pending)
  return useMemo(() => ({ entries: mergeEntries(synced, pending), pendingIds: new Set(pending.map((e) => e.id)) }), [synced, pending])
}
