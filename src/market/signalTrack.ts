// Glue between the scanners and the signal log: the rules' holding time and fees per market and style, and one call a scan
// makes at its end to save new signals and update old ones with the bars it already loaded (no extra fetches).
import { CRYPTO_RULES, IDX_RULES, US_RULES, type Bar, type MarketRules } from './indicators'
import { loadSignals, recordSignals, saveSignals, updateOutcomes, type EvalOptions, type NewSignal, type SignalMarket, type SignalStyle } from './signalLog'
import { SHORT_RULES, STYLES, timeStopBars } from './shortSwing'

const SWING_RULES: Record<SignalMarket, MarketRules> = { idx: IDX_RULES, crypto: CRYPTO_RULES, us: US_RULES }

/** Same holding time as the scanner's backtest for those rules; fees as in the short-term backtests (IDX 0.15% + 0.25%, Binance and US 0.1% a side). */
export function evalOptions(market: SignalMarket, style: SignalStyle): EvalOptions {
  const short = SHORT_RULES[market]
  const hold = style === 'swing' ? SWING_RULES[market].timeStopBars : timeStopBars(STYLES[style], short)
  return { timeStopBars: hold, fees: short.fees }
}

/**
 * Saves this scan's signals and re-checks unfinished ones for every ticker scanned.
 * rows: each ticker with the bars its rules trade on (daily for swing and ≤ 1 month, 4-hour for ≤ 1 week).
 */
export function trackScan(market: SignalMarket, style: SignalStyle, signals: readonly NewSignal[], rows: readonly { symbol: string; bars: readonly Bar[] }[]) {
  const opts = evalOptions(market, style)
  let log = recordSignals(loadSignals(), signals)
  for (const r of rows) log = updateOutcomes(log, market, style, r.symbol, r.bars, opts)
  saveSignals(log)
}
