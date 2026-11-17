// How far a price usually moves over a number of days, from its own recent daily swings. A risk measure, not a forecast:
// it says how wide the moves are, never which way. Pure code.
import type { Bar } from './indicators'

/** Daily bars the volatility is measured over. */
export const RANGE_DAYS = 60

/** Standard deviation of daily log returns over the last `days` bars; undefined with too little history. */
export function dailyVol(daily: readonly Bar[], days = RANGE_DAYS): number | undefined {
  if (daily.length < days + 1) return undefined
  const r: number[] = []
  for (let k = daily.length - days; k < daily.length; k++) r.push(Math.log(daily[k].close / daily[k - 1].close))
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1))
}

export interface Range {
  days: number
  /** Typical move (one standard deviation), as a fraction. */
  move: number
  /** About 2 in 3 periods end inside [low1, high1]; about 19 in 20 inside [low2, high2]. */
  low1: number
  high1: number
  low2: number
  high2: number
}

/** Pure: price range over `days` trading periods for a daily volatility `sigma` (log-normal, no drift). */
export function expectedRange(price: number, sigma: number, days: number): Range {
  const s = sigma * Math.sqrt(days)
  return { days, move: Math.exp(s) - 1, low1: price * Math.exp(-s), high1: price * Math.exp(s), low2: price * Math.exp(-2 * s), high2: price * Math.exp(2 * s) }
}

/** Pure: the stop sits inside a normal one-day move, so day-to-day noise alone may hit it. */
export const stopInNoise = (entry: number, stop: number, sigma: number) => entry - stop < entry * (Math.exp(sigma) - 1)
