import type { Position, Transaction } from '@/types'

/** Average-cost method, transactions applied in date order. Throws if a sell exceeds the units held. */
export function position(txns: readonly Transaction[]): Position {
  let quantity = 0
  let costBasis = 0
  let realizedPnl = 0
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    if (t.type === 'buy') {
      quantity += t.quantity
      costBasis += t.quantity * t.price + t.fee
    } else {
      if (t.quantity > quantity + 1e-9) throw new Error(`Sell of ${t.quantity} exceeds ${quantity} held (txn ${t.id})`)
      const avg = quantity ? costBasis / quantity : 0
      realizedPnl += t.quantity * (t.price - avg) - t.fee
      costBasis -= t.quantity * avg
      quantity -= t.quantity
      if (quantity < 1e-9) quantity = costBasis = 0
    }
  }
  return { quantity, avgCost: quantity ? costBasis / quantity : 0, costBasis, realizedPnl }
}
