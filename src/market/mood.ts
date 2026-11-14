// IDX market mood (NOTES.md "Market mood"): a 0–100 score from visible parts, used as a traffic light before new buys.
// shortcut: foreign net flow is left out because idx.co.id often blocks it (Cloudflare); add it as a fourth part when it's reliable.
import { sma, type Bar } from './indicators'

export type MoodLight = 'red' | 'yellow' | 'green'
/** Below this the mood is Defensive (red): the live rules skip new buys. */
export const MOOD_DEFENSIVE = 35
export interface IdxMood {
  score: number
  light: MoodLight
  /** % of stocks closing above their MA50. */
  breadth?: number
  /** IHSG above MA50 = 50, above MA200 = 50. */
  trend?: number
  /** 100 = IHSG as calm as or calmer than usual, 0 = much more volatile. */
  calm?: number
  above: number
  counted: number
  ihsgClose?: number
}

const stdev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

export function idxMood(ihsg: readonly Bar[], stocks: readonly (readonly Bar[])[]): IdxMood | undefined {
  let above = 0
  let counted = 0
  for (const bars of stocks) {
    const ma = sma(bars.map((b) => b.close), 50).at(-1)
    if (ma === undefined) continue
    counted++
    if (bars[bars.length - 1].close > ma) above++
  }
  const breadth = counted ? (above / counted) * 100 : undefined

  const closes = ihsg.map((b) => b.close)
  const close = closes.at(-1)
  const ma50 = sma(closes, 50).at(-1)
  const ma200 = sma(closes, 200).at(-1)
  const trend = close !== undefined && ma50 !== undefined && ma200 !== undefined ? (close > ma50 ? 50 : 0) + (close > ma200 ? 50 : 0) : undefined

  const rets = closes.slice(1).map((c, i) => c / closes[i] - 1)
  // Recent (20-day) volatility vs the last year's: ratio ≤ 0.8 → 100, ≥ 1.5 → 0.
  const calm = rets.length >= 250 ? Math.min(100, Math.max(0, ((1.5 - stdev(rets.slice(-20)) / stdev(rets.slice(-250))) / 0.7) * 100)) : undefined

  const parts = [breadth, trend, calm].filter((x): x is number => x !== undefined)
  if (!parts.length) return undefined
  const score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
  return { score, light: score < MOOD_DEFENSIVE ? 'red' : score < 65 ? 'yellow' : 'green', breadth, trend, calm, above, counted, ihsgClose: close }
}

/**
 * The mood score as of every index date, for the backtest's "skip when Defensive" test. Same formula as idxMood,
 * using only data up to each date. A stock counts on a date only if it traded that day.
 */
export function moodSeries(index: readonly Bar[], stocks: readonly (readonly Bar[])[]): Map<string, number> {
  const above = new Map<string, [number, number]>() // date → [above MA50, counted]
  for (const bars of stocks) {
    const ma = sma(bars.map((b) => b.close), 50)
    bars.forEach((b, i) => {
      if (ma[i] === undefined) return
      const n = above.get(b.time) ?? [0, 0]
      above.set(b.time, [n[0] + (b.close > ma[i]! ? 1 : 0), n[1] + 1])
    })
  }
  const closes = index.map((b) => b.close)
  const ma50 = sma(closes, 50)
  const ma200 = sma(closes, 200)
  const rets = closes.map((c, i) => (i ? c / closes[i - 1] - 1 : 0))
  const out = new Map<string, number>()
  index.forEach((b, i) => {
    const n = above.get(b.time)
    const breadth = n && n[1] ? (n[0] / n[1]) * 100 : undefined
    const trend = ma50[i] !== undefined && ma200[i] !== undefined ? (b.close > ma50[i]! ? 50 : 0) + (b.close > ma200[i]! ? 50 : 0) : undefined
    const calm = i >= 250 ? Math.min(100, Math.max(0, ((1.5 - stdev(rets.slice(i - 19, i + 1)) / stdev(rets.slice(i - 249, i + 1))) / 0.7) * 100)) : undefined
    const parts = [breadth, trend, calm].filter((x): x is number => x !== undefined)
    if (parts.length) out.set(b.time, Math.round(parts.reduce((a, c) => a + c, 0) / parts.length))
  })
  return out
}
