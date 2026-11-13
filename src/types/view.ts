import type { AssetClass } from './domain'

export type CssColor = string

export interface TileColors {
  bg: CssColor
  fg: CssColor
}

export interface Segment {
  bg: CssColor
  /** Outline instead of fill (used for "unknown" risk). */
  edge?: CssColor
}

export type RiskStatus =
  | { kind: 'noStop' }
  | { kind: 'safe' | 'close'; pct: number }
  | { kind: 'over'; pct: number; overBy: number }

export interface RiskBar {
  status: RiskStatus
  segments: Segment[]
}

export interface AllocationItem {
  assetClass: AssetClass
  /** IDR value. */
  value: number
  /** Share of net worth, 0–100. */
  pct: number
}

/**
 * Three-zone treemap: the largest block on the left at full height; on the right, the second
 * block on top and the rest in a row underneath. Each zone's flex weight is its value, so area ∝ value.
 */
export interface Treemap {
  first: AllocationItem
  second?: AllocationItem
  rest: AllocationItem[]
  /** Flex weights for the right column and its bottom row. */
  rightWeight: number
  restWeight: number
}
