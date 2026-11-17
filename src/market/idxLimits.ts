// IDX daily price limits (ARA up / ARB down), from IDX press release 2734, valid 2026-10-20 to 2026-12-31 (NOTES.md).
// Time-limited: when VALID_UNTIL passes, the checks below still run but report `expired` so the UI can say to re-check idx.co.id.

export const LIMITS_VALID_FROM = '2026-10-20'
export const LIMITS_VALID_UNTIL = '2026-12-31'

/** ARB (largest fall allowed in one day), in rupiah, for a stock whose reference price is `price`. */
export function arbAmount(price: number): number {
  // Rp1–14: one rupiah; Rp15 and up: 7% of the price.
  return price <= 14 ? 1 : price * 0.07
}
/** ARA (largest rise in one day), in rupiah. */
export function araAmount(price: number): number {
  if (price <= 10) return 1
  if (price <= 200) return price * 0.35
  if (price <= 5000) return price * 0.25
  return price * 0.2
}

export interface ArbCheck {
  /** One ARB from the entry, in rupiah and as a fraction of the entry. */
  arb: number
  arbPct: number
  /** The stop is further than one ARB below the entry: getting there takes more than one limit-down day. */
  beyond: boolean
  /** Limit-down days at most it takes to fall from the entry to the stop. */
  days: number
  /** The limits above are past their valid-until date. */
  expired: boolean
}

/** Pure: how the stop sits against the ARB limit. `today` is 'yyyy-mm-dd' (WIB). */
export function arbCheck(entry: number, stop: number, today: string): ArbCheck {
  const arb = arbAmount(entry)
  let days = 0
  for (let p = entry; p > stop && days < 50; days++) p -= arbAmount(p)
  return { arb, arbPct: arb / entry, beyond: entry - stop > arb, days, expired: today > LIMITS_VALID_UNTIL }
}
