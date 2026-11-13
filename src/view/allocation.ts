// Pure allocation → treemap layout for the Inventory card.
import type { AllocationItem, AssetClass, Treemap } from '@/types'

/** Classes with a positive value, largest first. */
export function allocation(byClass: Partial<Record<AssetClass, number>>, netWorth: number): AllocationItem[] {
  return (Object.entries(byClass) as [AssetClass, number][])
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([assetClass, value]) => ({ assetClass, value, pct: netWorth ? (value / netWorth) * 100 : 0 }))
}

/** Three-zone treemap layout (see the Treemap type). */
export function treemap(items: readonly AllocationItem[]): Treemap | null {
  const [first, second, ...rest] = items
  if (!first) return null
  const restWeight = rest.reduce((a, b) => a + b.value, 0)
  return { first, second, rest, rightWeight: (second?.value ?? 0) + restWeight, restWeight }
}

/** Display size for a block's % label: bigger blocks get bigger numbers, clamped. */
export const tileFontSize = (pct: number, isLargest: boolean): number => (isLargest ? 80 : Math.max(30, Math.min(56, pct * 2.4)))
