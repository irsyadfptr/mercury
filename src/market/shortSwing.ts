// Short-term swing rules: trades held at most a week or a month. Pure code, the same idea as the 3–6 month swing checklist
// (trend filter → trigger → ATR-capped stop → R target → time stop) with faster settings. Direction always comes from daily bars;
// the entry comes from 4-hour bars (≤ 1 week) or daily bars (≤ 1 month). Arrays are oldest first.

import { runTrade, summarize, type Backtest, type Trade } from './backtest'
import { atr, ema, macd, roundTo, sma, type Bar } from './indicators'

export type StyleId = 'week' | 'month'
import { usDayOf } from './usTime'

export type ShortMarket = 'idx' | 'crypto' | 'us'

export interface Style {
  id: StyleId
  /** Bar size the entry is read from. */
  entryFrame: '4h' | '1d'
  /** Daily trend: close above a rising MA of this length. */
  trendMa: number
  /** Daily MA stack: fast above slow. */
  fastMa: number
  slowMa: number
  /** Most a trade is held, in trading days (IDX) or calendar days (crypto, which trades every day). */
  holdDays: Record<ShortMarket, number>
}

export const STYLES: Record<StyleId, Style> = {
  week: { id: 'week', entryFrame: '4h', trendMa: 20, fastMa: 20, slowMa: 50, holdDays: { idx: 5, crypto: 7, us: 5 } },
  month: { id: 'month', entryFrame: '1d', trendMa: 50, fastMa: 50, slowMa: 200, holdDays: { idx: 20, crypto: 28, us: 20 } },
}

/** Big-picture filter for both styles: no longs below the daily MA200. */
export const BIG_MA = 200
/** The trend MA counts as rising when above its value this many daily bars ago. */
const RISING_BARS = 5
/** Entry-frame EMA the pullback must touch. */
export const ENTRY_EMA = 20
/** Pullback: a low within this many entry bars touched the EMA. */
const PULLBACK_BARS = 3
/** Breakout above the highest high of this many earlier entry bars; the stop sits below the lowest low of the same window. */
export const SWING_BARS = 10
/** Breakout bar volume must beat the average of this many earlier bars. */
const VOL_BARS = 20
/** Stop never wider than this many entry-frame ATRs. */
export const MAX_ATR_STOP = 2
export const TARGET_R = 2
/** Daily bars the expected-move volatility is measured over. */
const VOL_DAYS = 60

/** What differs between markets. Fees are per side, as a fraction of the trade value. */
export interface ShortMarketRules {
  id: ShortMarket
  /** Minimum average daily traded value (rupiah or USDT). */
  minValue: number
  fees: { buy: number; sell: number }
  step: (price: number) => number
  /** Entry bars per day for each frame (IDX 4H: two blocks a day; crypto: six). */
  barsPerDay: Record<'4h' | '1d', number>
  /** Exchange date of an entry bar's time, to match it to the daily bars (IDX dates are WIB, Binance days are UTC). */
  dayOf: (time: string) => string
}

const WIB_MS = 7 * 3600_000
export const SHORT_IDX: ShortMarketRules = {
  id: 'idx',
  minValue: 20e9,
  // Assumed Stockbit-style fees: 0.15% buy, 0.25% sell (incl. sales tax). Change here if yours differ.
  fees: { buy: 0.0015, sell: 0.0025 },
  step: () => 1,
  barsPerDay: { '4h': 2, '1d': 1 },
  dayOf: (t) => (t.length <= 10 ? t : new Date(Date.parse(t) + WIB_MS).toISOString().slice(0, 10)),
}
export const SHORT_CRYPTO: ShortMarketRules = {
  id: 'crypto',
  minValue: 10e6,
  fees: { buy: 0.001, sell: 0.001 },
  step: (p) => 10 ** (Math.floor(Math.log10(p)) - 4),
  barsPerDay: { '4h': 6, '1d': 1 },
  dayOf: (t) => t.slice(0, 10),
}

/** US stocks: $20M a day, cents; assumed 0.1% a side (check your broker), two 4H blocks a day like IDX (see toUs4h). */
export const SHORT_US: ShortMarketRules = {
  id: 'us',
  minValue: 20e6,
  fees: { buy: 0.001, sell: 0.001 },
  step: (p) => (p < 1 ? 0.0001 : 0.01),
  barsPerDay: { '4h': 2, '1d': 1 },
  dayOf: usDayOf,
}
/** Each market's short-term rules. */
export const SHORT_RULES: Record<ShortMarket, ShortMarketRules> = { idx: SHORT_IDX, crypto: SHORT_CRYPTO, us: SHORT_US }

export type ShortRuleId = 'trend' | 'stack' | 'big' | 'trigger' | 'liquidity' | 'reach'
export interface ShortRule {
  id: ShortRuleId
  pass: boolean | undefined
}
export type Trigger = 'pullback' | 'breakout'

export interface ShortCheck {
  rules: ShortRule[]
  score: number
  /** Every rule passes. The mood filter is applied by the caller. */
  signal: boolean
  trigger?: Trigger
  /** Time of the entry bar judged (the last finished one). */
  time: string
  /** Daily bar the direction was read from (the last full day before the entry bar, or the same day for daily entries). */
  day?: string
  close: number
  entry: number
  stop?: number
  risk?: number
  target?: number
  ema?: number
  atr?: number
  /** Typical move over the holding time, as a fraction of the price (one standard deviation). */
  expectedMove?: number
  avgValue?: number
  dailyClose?: number
  trendMa?: number
  fastMa?: number
  slowMa?: number
  bigMa?: number
}

export interface CheckOptions {
  /** Which triggers count (default both). */
  triggers?: readonly Trigger[]
  /** Also require the entry-frame MACD line above its signal. */
  macd?: boolean
  targetR?: number
  /** Require the target to be within the expected move (default on). */
  reach?: boolean
}

/** Everything the checks need, computed once per ticker. All series are causal. */
export function shortSeries(daily: readonly Bar[], entryBars: readonly Bar[], style: Style, market: ShortMarketRules) {
  const dc = daily.map((b) => b.close)
  const ec = entryBars.map((b) => b.close)
  // Daily volatility: standard deviation of log returns over the last VOL_DAYS days.
  const sigma = daily.map((_, i) => {
    if (i < VOL_DAYS) return undefined
    const r: number[] = []
    for (let k = i - VOL_DAYS + 1; k <= i; k++) r.push(Math.log(dc[k] / dc[k - 1]))
    const mean = r.reduce((a, b) => a + b, 0) / r.length
    return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1))
  })
  const value = sma(daily.map((b) => b.close * b.volume), 20)
  // Entry bar → daily index whose close is known by then. A 4H bar only sees the previous full day; a daily bar its own day.
  const dates = daily.map((b) => b.time)
  let d = -1
  const dayIdx = entryBars.map((b) => {
    const day = market.dayOf(b.time)
    while (d + 1 < dates.length && (style.entryFrame === '1d' ? dates[d + 1] <= day : dates[d + 1] < day)) d++
    return d
  })
  return {
    daily,
    entryBars,
    trend: sma(dc, style.trendMa),
    fast: sma(dc, style.fastMa),
    slow: sma(dc, style.slowMa),
    big: sma(dc, BIG_MA),
    sigma,
    value,
    dayIdx,
    ema: ema(ec, ENTRY_EMA),
    atr: atr(entryBars),
    macd: macd(ec),
    vol: sma(entryBars.map((b) => b.volume), VOL_BARS),
  }
}
export type ShortSeries = ReturnType<typeof shortSeries>

/** The checklist as of entry bar i (its close). */
export function shortCheckAt(s: ShortSeries, i: number, style: Style, market: ShortMarketRules, opts: CheckOptions = {}): ShortCheck {
  const { triggers = ['pullback', 'breakout'], macd: needMacd = false, targetR = TARGET_R, reach = true } = opts
  const bars = s.entryBars
  const b = bars[i]
  const d = s.dayIdx[i]
  const dailyClose = d >= 0 ? s.daily[d].close : undefined
  const tr = d >= 0 ? s.trend[d] : undefined
  const trPrev = d >= RISING_BARS ? s.trend[d - RISING_BARS] : undefined
  const fast = d >= 0 ? s.fast[d] : undefined
  const slow = d >= 0 ? s.slow[d] : undefined
  const big = d >= 0 ? s.big[d] : undefined
  const sigma = d >= 0 ? s.sigma[d] : undefined
  const avgValue = d >= 0 ? s.value[d] : undefined

  const e = s.ema[i]
  const a = s.atr[i]
  let trigger: Trigger | undefined
  if (e !== undefined && i >= SWING_BARS) {
    const touched = bars.slice(Math.max(0, i - PULLBACK_BARS + 1), i + 1).some((x) => x.low <= e)
    const pullback = touched && b.close > e && b.close > b.open && b.close > bars[i - 1].high
    const priorHigh = Math.max(...bars.slice(i - SWING_BARS, i).map((x) => x.high))
    const v = s.vol[i - 1]
    const breakout = b.close > priorHigh && v !== undefined && b.volume > v
    trigger = pullback && triggers.includes('pullback') ? 'pullback' : breakout && triggers.includes('breakout') ? 'breakout' : undefined
  }
  const macdOk = s.macd.line[i] !== undefined && s.macd.signal[i] !== undefined && s.macd.line[i]! > s.macd.signal[i]!

  // Stop: one step under the lowest low of the swing window, never wider than MAX_ATR_STOP ATRs. Entry = this bar's close.
  const step = market.step(b.close)
  const entry = b.close
  let stop: number | undefined
  if (a !== undefined && i >= SWING_BARS) {
    const low = Math.min(...bars.slice(i - SWING_BARS + 1, i + 1).map((x) => x.low))
    stop = roundTo(Math.max(low - step, entry - MAX_ATR_STOP * a), step, 'floor')
    if (!(stop < entry)) stop = undefined
  }
  const risk = stop !== undefined ? entry - stop : undefined
  const target = risk !== undefined ? roundTo(entry + targetR * risk, step, 'round') : undefined
  const expectedMove = sigma !== undefined ? Math.exp(sigma * Math.sqrt(style.holdDays[market.id])) - 1 : undefined

  const rules: ShortRule[] = [
    { id: 'trend', pass: dailyClose !== undefined && tr !== undefined && trPrev !== undefined ? dailyClose > tr && tr > trPrev : undefined },
    { id: 'stack', pass: fast !== undefined && slow !== undefined ? fast > slow : undefined },
    { id: 'big', pass: dailyClose !== undefined && big !== undefined ? dailyClose > big : undefined },
    { id: 'trigger', pass: e === undefined ? undefined : !!trigger && (!needMacd || macdOk) },
    { id: 'liquidity', pass: avgValue !== undefined ? avgValue >= market.minValue : undefined },
    { id: 'reach', pass: !reach ? true : target === undefined || expectedMove === undefined ? undefined : target - entry <= entry * expectedMove },
  ]
  return {
    rules,
    score: rules.filter((r) => r.pass).length,
    signal: rules.every((r) => r.pass) && stop !== undefined,
    trigger,
    time: b.time,
    day: d >= 0 ? s.daily[d].time : undefined,
    close: b.close,
    entry,
    stop,
    risk,
    target,
    ema: e,
    atr: a,
    expectedMove,
    avgValue,
    dailyClose,
    trendMa: tr,
    fastMa: fast,
    slowMa: slow,
    bigMa: big,
  }
}

/** The checklist on the latest entry bar. */
export function shortCheck(daily: readonly Bar[], entryBars: readonly Bar[], style: Style, market: ShortMarketRules, opts?: CheckOptions): ShortCheck | undefined {
  if (!entryBars.length || !daily.length) return undefined
  return shortCheckAt(shortSeries(daily, entryBars, style, market), entryBars.length - 1, style, market, opts)
}

export interface ShortBacktestOptions extends CheckOptions {
  /** Skip signals whose direction day is in a Defensive mood. */
  skip?: (day: string) => boolean
  /** Charge fees (default on). */
  fees?: boolean
}

/** Entry bars in the time stop. */
export const timeStopBars = (style: Style, market: ShortMarketRules) => style.holdDays[market.id] * market.barsPerDay[style.entryFrame]

/**
 * Replays the rules on every past entry bar. A signal at a bar's close buys at the next bar's open (skipped if that open is at or
 * below the stop). Exits at the first of stop, target or the time stop; gaps fill at the open. One trade at a time.
 * Fees (buy + sell, per side) are taken off each trade's R, so a result above 0R means it beat costs.
 */
export function shortBacktest(daily: readonly Bar[], entryBars: readonly Bar[], style: Style, market: ShortMarketRules, opts: ShortBacktestOptions = {}): Backtest {
  const { skip, fees = true, targetR = TARGET_R } = opts
  const s = shortSeries(daily, entryBars, style, market)
  const trades: Trade[] = []
  const hold = timeStopBars(style, market)
  for (let i = SWING_BARS; i < entryBars.length - 1; i++) {
    const c = shortCheckAt(s, i, style, market, opts)
    if (!c.signal || c.stop === undefined) continue
    if (skip && c.day && skip(c.day)) continue
    if (entryBars[i + 1].open <= c.stop) continue
    const t = runTrade(entryBars, i + 1, c.stop, { timeStopBars: hold, targetR })
    if (!t) break
    const fill = entryBars[i + 1].open
    const risk = fill - c.stop
    const exit = fill + t.r * risk
    trades.push(fees ? { ...t, r: t.r - (market.fees.buy * fill + market.fees.sell * exit) / risk } : t)
    let j = i + 1
    while (j < entryBars.length && entryBars[j].time !== t.exitTime) j++
    i = j
  }
  return summarize(trades)
}
