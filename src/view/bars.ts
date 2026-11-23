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

/** Spending vs budget: accent while fine, warn from CLOSE_TO_LIMIT, red segments spill past the bar when over. */
export function budgetBar(spent: number, budget: number, n = 24): Segment[] {
  const ratio = budget > 0 ? spent / budget : 0
  const filled = Math.round(ratio * n)
  const fill = ratio > 1 ? COLOR.down : ratio >= CLOSE_TO_LIMIT ? COLOR.warn : COLOR.accent
  return range(Math.max(n, Math.min(filled, n * 2))).map((i) => ({ bg: i >= filled ? COLOR.empty : i >= n ? COLOR.down : fill }))
}

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

/** Fear & greed zones on CoinGecko's 0–100 scale: red fear, yellow neutral, green greed. */
export function moodColor(value: number): CssColor {
  if (value < 25) return COLOR.fireRed
  if (value < 45) return COLOR.fireOrange
  if (value <= 55) return COLOR.warn
  return COLOR.up
}

/** Mood gauge: each filled segment takes the colour of its own zone, so the bar reads red → green. */
export function moodBar(value: number, n = 20): Segment[] {
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * n)
  return range(n).map((i) => ({ bg: i < filled ? moodColor(((i + 0.5) / n) * 100) : COLOR.empty }))
}

/**
 * Pixel grid for "where it went": n cells shared out by amount (largest remainder, so they always add up to n), in
 * the order given. A category too small for one cell gets none; empty when nothing was spent.
 */
export function shareCells(totals: readonly { category: string; amount: number }[], n = 100): string[] {
  const sum = totals.reduce((s, x) => s + Math.max(0, x.amount), 0)
  if (sum <= 0) return []
  const exact = totals.map((x) => (Math.max(0, x.amount) / sum) * n)
  const counts = exact.map(Math.floor)
  const byRemainder = range(totals.length).sort((a, b) => exact[b] - counts[b] - (exact[a] - counts[a]))
  const missing = n - counts.reduce((s, c) => s + c, 0)
  for (let i = 0; i < missing; i++) counts[byRemainder[i]]++
  return totals.flatMap((x, i) => Array<string>(counts[i]).fill(x.category))
}

/**
 * Calendar shading: 1–4 by where an amount falls among the month's spending days (quartiles), 0 for nothing spent.
 * Ranks, not the raw scale, so one big day (rent) doesn't wash every other day out to the lightest step.
 */
export function spendLevel(amounts: readonly number[]): (amount: number) => number {
  const sorted = amounts.filter((a) => a > 0).sort((a, b) => a - b)
  return (amount) => {
    if (amount <= 0 || !sorted.length) return 0
    const below = sorted.filter((a) => a < amount).length
    return Math.min(4, 1 + Math.floor((below / sorted.length) * 4))
  }
}

/**
 * A running trade on one line from stop to target: where the stop, entry, current price and target sit, as 0–100 %
 * of the line. Without a stop or target, the line ends a little past the lowest or highest of the other prices.
 */
export function tradeTrack(entry: number, now: number, stop?: number, target?: number): { stop?: number; entry: number; now: number; target?: number } {
  const known = [entry, now, ...(stop ? [stop] : []), ...(target ? [target] : [])]
  const span = Math.max(...known) - Math.min(...known) || Math.abs(entry) * 0.1 || 1
  const lo = stop ?? Math.min(...known) - span * 0.1
  const hi = target ?? Math.max(...known) + span * 0.1
  const at = (p: number) => Math.min(100, Math.max(0, ((p - lo) / (hi - lo || 1)) * 100))
  return { stop: stop ? at(stop) : undefined, entry: at(entry), now: at(now), target: target ? at(target) : undefined }
}

/**
 * A share (0–100 %) as a short pixel bar in one colour: n segments, any share above 0 lights at least one, so a
 * small type is still visible next to a big one.
 */
export function shareBar(pct: number, color: CssColor, n = 10): Segment[] {
  const p = Math.min(100, Math.max(0, pct))
  const filled = p > 0 ? Math.max(1, Math.round((p / 100) * n)) : 0
  return range(n).map((i) => ({ bg: i < filled ? color : COLOR.empty }))
}
