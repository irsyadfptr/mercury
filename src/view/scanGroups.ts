// Pure: how the Scanner sorts a scan into groups you can act on. No React, no i18n.
import type { Segment } from '@/types'
import { COLOR } from './tokens'

/** buy = every rule passes and the price is in the buy zone; paused = the same while the mood is Defensive;
 * wait = every rule passes, the price isn't in the zone yet (swing) or no trigger yet (short); close = one rule
 * short; none = the rest. */
export type ScanGroup = 'buy' | 'paused' | 'wait' | 'close' | 'none'
export const SCAN_GROUPS: readonly ScanGroup[] = ['buy', 'paused', 'wait', 'close', 'none']

/** A swing check's group, from its score and buy zone. */
export function swingGroup(c: { score: number; rules: readonly unknown[]; zone: string }, defensive: boolean): ScanGroup {
  if (c.score === c.rules.length) return c.zone === 'in' ? (defensive ? 'paused' : 'buy') : 'wait'
  return c.score === c.rules.length - 1 ? 'close' : 'none'
}

/**
 * Rows split into groups in SCAN_GROUPS order (empty groups left out), each sorted by score, highest first, then by
 * symbol.
 */
export function groupScan<T extends { symbol: string; score: number }>(rows: readonly T[], groupOf: (r: T) => ScanGroup): { group: ScanGroup; rows: T[] }[] {
  return SCAN_GROUPS.map((group) => ({
    group,
    rows: rows.filter((r) => groupOf(r) === group).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)),
  })).filter((g) => g.rows.length > 0)
}

/** One pip per rule: filled green when it passes, empty when it fails, outlined when unknown. */
export function rulePips(rules: readonly { pass?: boolean | null }[]): Segment[] {
  return rules.map((r) => (r.pass ? { bg: COLOR.up } : r.pass === false ? { bg: COLOR.empty } : { bg: 'transparent', edge: COLOR.muted }))
}
