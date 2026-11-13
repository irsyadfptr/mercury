// Pure builders for the segmented game bars (XP, heat, trade risk). No React, no i18n.
import type { CssColor, RiskBar, RiskStatus, Segment, TradeRisk } from '@/types'
import { COLOR } from './tokens'

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** XP bar: accent up to progress (0–1), empty after. */
export function xpBar(xp: number, n = 24): Segment[] {
  const filled = Math.round(Math.min(1, Math.max(0, xp)) * n)
  return range(n).map((i) => ({ bg: i < filled ? COLOR.accent : COLOR.empty }))
}

/** The heat bar spans 4/3 of the limit so "over" has room; its last quarter is tinted. */
export const HEAT_BAR_SPAN = 4 / 3

export function heatBar(heat: number, limit: number, n = 24): Segment[] {
  const filled = Math.min(n, Math.round((heat / (limit * HEAT_BAR_SPAN)) * n))
  const fire = (i: number): CssColor => {
    const pos = i / (n - 1)
    return pos < 0.35 ? COLOR.fireYellow : pos < 0.7 ? COLOR.fireOrange : COLOR.fireRed
  }
  return range(n).map((i) => ({ bg: i < filled ? fire(i) : i >= n / HEAT_BAR_SPAN ? COLOR.fireSoft : COLOR.empty }))
}

/** Flame pixel sizes for 0–4 flames: centre flame tallest. */
const FLAME_BASE = [0, 24, 32, 40, 48]
export function flameSizes(flames: number): number[] {
  const mid = (flames - 1) / 2
  return range(flames).map((i) => Math.round(FLAME_BASE[flames] * (1 - Math.abs(i - mid) * 0.18)))
}

/** Share of the per-trade limit at which a trade counts as "close". */
export const CLOSE_TO_LIMIT = 0.8

/** Trade risk as a health bar. Returns null for holdings that carry no trade risk. */
export function riskBar(risk: TradeRisk, limit: number, n = 20): RiskBar | null {
  if (risk.kind === 'none') return null
  if (risk.kind === 'noStop') return { status: { kind: 'noStop' }, segments: range(n).map(() => ({ bg: 'transparent', edge: COLOR.down })) }

  const ratio = risk.pct / limit
  const filled = Math.round(ratio * n)
  const status: RiskStatus =
    ratio > 1 ? { kind: 'over', pct: risk.pct, overBy: risk.pct - limit } : { kind: ratio >= CLOSE_TO_LIMIT ? 'close' : 'safe', pct: risk.pct }
  const fill = status.kind === 'over' ? COLOR.down : status.kind === 'close' ? COLOR.warn : COLOR.accent
  // Over the limit, extra red segments spill past the normal bar length.
  const segments = range(Math.max(n, filled)).map((i) => ({ bg: i >= filled ? COLOR.empty : i >= n ? COLOR.down : fill }))
  return { status, segments }
}
