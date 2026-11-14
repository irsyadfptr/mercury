// Replays the swing setup over a ticker's own history: how often did the stop or the 2R target get hit first?
import { checkSetup, IDX_RULES, seriesFor, type Bar, type MarketRules } from './indicators'

/** ~8 weeks of IDX trading days (NOTES.md time stop). */
export const TIME_STOP_BARS = IDX_RULES.timeStopBars

export interface Trade {
  entryTime: string
  exitTime: string
  outcome: 'target' | 'stop' | 'time'
  /** Result in R (risk units): (exit − entry) / (entry − stop). −1 at the stop, +2 at the target, worse or better on gaps. */
  r: number
}

export interface Backtest {
  trades: Trade[]
  wins: number
  /** % of trades that ended in profit (target, or time stop above entry). */
  winRate?: number
  avgR?: number
  /** Sum of R over all trades. */
  totalR: number
  /** Most losing trades in a row, in entry-date order. */
  worstStreak: number
}

/** Settings the rules test varies; the defaults are the live rules. */
export interface BacktestOptions {
  /** Target as a multiple of risk. */
  targetR?: number
  /** Require the MACD cross rule to pass (false = trend, liquidity and buy zone only). */
  requireMacd?: boolean
  /** Skip signals on these dates, e.g. when the market mood was Defensive. */
  skip?: (date: string) => boolean
  /** Trailing stop instead of a fixed target: the stop rises to the highest close since entry minus this many ATRs. */
  trailAtr?: number
}

export interface TradeOptions {
  timeStopBars?: number
  targetR?: number
  /** ATR series (same index as bars) and multiple for a trailing stop; replaces the fixed target. */
  trail?: { atr: readonly (number | undefined)[]; k: number }
}

/** Pure: stats for any set of trades, one ticker's or many pooled together. */
export function summarize(trades: readonly Trade[]): Backtest {
  const sorted = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))
  let run = 0
  let worstStreak = 0
  for (const t of sorted) {
    run = t.r > 0 ? 0 : run + 1
    worstStreak = Math.max(worstStreak, run)
  }
  const wins = trades.filter((t) => t.r > 0).length
  const totalR = trades.reduce((s, t) => s + t.r, 0)
  return {
    trades: sorted,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : undefined,
    avgR: trades.length ? totalR / trades.length : undefined,
    totalR,
    worstStreak,
  }
}

/**
 * One trade bought at the open of bar `e` with a starting stop; R = entry − that stop.
 * Fixed target (default): sells at targetR × R above the fill, or at the time stop (~8 weeks).
 * Trailing stop: no target; after each close the stop rises to (highest close since entry − k × ATR). The 8-week
 * time stop then only applies if the trade is not above its entry, and the hold is capped at 3× that (~6 months).
 * Gaps fill at the open: opening below the stop sells there (a loss worse than −1R), opening above the target sells there.
 * When a bar touches both stop and target, the stop counts (we can't know which came first).
 * Returns undefined when the open is already at or below the stop (no trade), or history ends while the trade is open.
 */
export function runTrade(bars: readonly Bar[], e: number, stop: number, { timeStopBars = TIME_STOP_BARS, targetR = 2, trail }: TradeOptions = {}): Trade | undefined {
  const entry = bars[e].open
  const risk = entry - stop
  if (!(risk > 0)) return undefined
  const target = trail ? Infinity : entry + targetR * risk
  const done = (j: number, outcome: Trade['outcome'], price: number): Trade => ({ entryTime: bars[e].time, exitTime: bars[j].time, outcome, r: (price - entry) / risk })
  const last = e + (trail ? 3 : 1) * timeStopBars
  let best = entry
  for (let j = e; j < bars.length && j <= last; j++) {
    const b = bars[j]
    if (j > e && b.open <= stop) return done(j, 'stop', b.open)
    if (b.low <= stop) return done(j, 'stop', stop)
    if (j > e && b.open >= target) return done(j, 'target', b.open)
    if (b.high >= target) return done(j, 'target', target)
    if (j === last || (trail && j === e + timeStopBars && b.close <= entry)) return done(j, 'time', b.close)
    if (trail) {
      best = Math.max(best, b.close)
      const a = trail.atr[j]
      if (a !== undefined) stop = Math.max(stop, best - trail.k * a)
    }
  }
  return undefined
}

/**
 * Signal = every rule passes and the price is inside the buy zone at a day's close. You only see that after the close,
 * so the trade buys at the next day's open, with checkSetup's stop. One trade at a time.
 * shortcut: no fees or slippage (about 0.4% for a buy and a sell on IDX, ~0.2% on Binance).
 */
export function backtest(bars: readonly Bar[], rules: MarketRules = IDX_RULES, { targetR = 2, requireMacd = true, skip, trailAtr }: BacktestOptions = {}): Backtest {
  const trades: Trade[] = []
  const series = seriesFor(bars)
  // MA200 needs 200 bars, so earlier bars can never signal.
  for (let i = 199; i < bars.length - 1; i++) {
    const c = checkSetup(bars, { rules, series, last: i })
    if (!c || !c.rules.every((r) => r.pass || (!requireMacd && r.id === 'macdCross')) || c.zone !== 'in' || c.stop === undefined) continue
    if (skip?.(bars[i].time)) continue
    if (bars[i + 1].open <= c.stop) continue // gapped through the stop before we could buy: skip
    const trail = trailAtr ? { atr: series.atr, k: trailAtr } : undefined
    const trade = runTrade(bars, i + 1, c.stop, { timeStopBars: rules.timeStopBars, targetR, trail })
    if (!trade) break // history ends while the trade is still open: leave it out
    trades.push(trade)
    i = bars.findIndex((b) => b.time === trade.exitTime)
  }
  return summarize(trades)
}
