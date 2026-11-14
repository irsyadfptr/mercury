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
}

/**
 * One trade bought at the open of bar `e` with a fixed stop; target = 2R from that fill.
 * Gaps fill at the open: opening below the stop sells there (a loss worse than −1R), opening above the target sells there.
 * When a bar touches both stop and target, the stop counts (we can't know which came first).
 * Returns undefined when the open is already at or below the stop (no trade), or history ends while the trade is open.
 */
export function runTrade(bars: readonly Bar[], e: number, stop: number, timeStopBars = TIME_STOP_BARS): Trade | undefined {
  const entry = bars[e].open
  const risk = entry - stop
  if (!(risk > 0)) return undefined
  const target = entry + 2 * risk
  const done = (j: number, outcome: Trade['outcome'], price: number): Trade => ({ entryTime: bars[e].time, exitTime: bars[j].time, outcome, r: (price - entry) / risk })
  const last = e + timeStopBars
  for (let j = e; j < bars.length && j <= last; j++) {
    const b = bars[j]
    if (j > e && b.open <= stop) return done(j, 'stop', b.open)
    if (b.low <= stop) return done(j, 'stop', stop)
    if (j > e && b.open >= target) return done(j, 'target', b.open)
    if (b.high >= target) return done(j, 'target', target)
    if (j === last) return done(j, 'time', b.close)
  }
  return undefined
}

/**
 * Signal = every rule passes and the price is inside the buy zone at a day's close. You only see that after the close,
 * so the trade buys at the next day's open, with checkSetup's stop. One trade at a time.
 * shortcut: no fees or slippage (about 0.4% for a buy and a sell on IDX, ~0.2% on Binance).
 */
export function backtest(bars: readonly Bar[], rules: MarketRules = IDX_RULES): Backtest {
  const trades: Trade[] = []
  const series = seriesFor(bars)
  // MA200 needs 200 bars, so earlier bars can never signal.
  for (let i = 199; i < bars.length - 1; i++) {
    const c = checkSetup(bars, { rules, series, last: i })
    if (!c || c.score < c.rules.length || c.zone !== 'in' || c.stop === undefined) continue
    if (bars[i + 1].open <= c.stop) continue // gapped through the stop before we could buy: skip
    const trade = runTrade(bars, i + 1, c.stop, rules.timeStopBars)
    if (!trade) break // history ends while the trade is still open: leave it out
    trades.push(trade)
    i = bars.findIndex((b) => b.time === trade.exitTime)
  }
  const wins = trades.filter((t) => t.r > 0).length
  return {
    trades,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : undefined,
    avgR: trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : undefined,
  }
}
