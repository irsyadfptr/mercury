// Trade memory (idea from the trader-memory-core skill, github.com/tradermonty/claude-trading-skills, MIT): every trade
// keeps its setup, thesis, what would prove it wrong, a review date and its initial stop, from entry to postmortem.
// Ideas are the scanner's signals (src/market/signalLog.ts); a trade is Active while units are held and Closed after.
import type { Holding, Setup, Transaction } from '@/types'
import { position } from './positions'

/** Days until a new trade's review: the rules' time stop in calendar days (IDX 40 trading days ≈ 8 weeks). */
export const REVIEW_DAYS: Record<Setup, number> = { swing: 56, month: 28, week: 7, other: 28 }

/** Pure: yyyy-mm-dd plus n calendar days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export type TradeStatus = 'active' | 'closed'
/** Pure: Active while units are held, Closed once everything bought was sold; undefined before the first buy. */
export function tradeStatus(txns: readonly Transaction[]): TradeStatus | undefined {
  if (!txns.some((t) => t.type === 'buy')) return undefined
  return position(txns).quantity > 1e-9 ? 'active' : 'closed'
}

/** Pure: open trades whose review date has come, oldest review first. */
export function reviewsDue(holdings: readonly Holding[], txns: readonly Transaction[], today: string): Holding[] {
  return holdings
    .filter((h) => h.group === 'trading' && h.reviewBy && h.reviewBy <= today && tradeStatus(txns.filter((t) => t.holdingId === h.id)) === 'active')
    .sort((a, b) => a.reviewBy!.localeCompare(b.reviewBy!))
}
