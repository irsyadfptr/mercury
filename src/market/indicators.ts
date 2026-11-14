// Pure indicator math and the swing-setup checklist (NOTES.md "Signal rules"). Arrays are oldest first; undefined = not enough bars yet.

export interface Bar {
  /** 'yyyy-mm-dd' (exchange date) */
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type Series = (number | undefined)[]

export function sma(values: readonly number[], n: number): Series {
  let sum = 0
  return values.map((v, i) => {
    sum += v - (i >= n ? values[i - n] : 0)
    return i >= n - 1 ? sum / n : undefined
  })
}

/** EMA seeded with the SMA of the first n values (the usual MACD convention). */
export function ema(values: readonly number[], n: number): Series {
  const k = 2 / (n + 1)
  let prev: number | undefined
  return values.map((v, i) => {
    if (i < n - 1) return undefined
    prev = prev === undefined ? values.slice(0, n).reduce((a, b) => a + b, 0) / n : v * k + prev * (1 - k)
    return prev
  })
}

export function macd(closes: readonly number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast)
  const s = ema(closes, slow)
  const line = closes.map((_, i) => (f[i] !== undefined && s[i] !== undefined ? f[i]! - s[i]! : undefined))
  const start = line.findIndex((v) => v !== undefined)
  const sig: Series = start < 0 ? line.map(() => undefined) : [...line.slice(0, start), ...ema(line.slice(start) as number[], signal)]
  return { line, signal: sig }
}

/** Wilder's ATR. */
export function atr(bars: readonly Bar[], n = 14): Series {
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))))
  let prev: number | undefined
  return tr.map((v, i) => {
    if (i < n - 1) return undefined
    prev = prev === undefined ? tr.slice(0, n).reduce((a, b) => a + b, 0) / n : (prev * (n - 1) + v) / n
    return prev
  })
}

/** Lowest low of the last n bars, including the latest. */
export const lowestLow = (bars: readonly Bar[], n = 20): number | undefined =>
  bars.length < n ? undefined : Math.min(...bars.slice(-n).map((b) => b.low))

/** 'yyyy-mm-dd' → the Monday of its week. */
function weekOf(time: string): string {
  const d = new Date(`${time}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Daily bars → weekly bars, weeks starting Monday. The last week may be partial. */
export function toWeekly(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = []
  let key = ''
  for (const b of bars) {
    const k = weekOf(b.time)
    const w = out[out.length - 1]
    if (k !== key || !w) {
      key = k
      out.push({ ...b, time: k })
    } else {
      w.high = Math.max(w.high, b.high)
      w.low = Math.min(w.low, b.low)
      w.close = b.close
      w.volume += b.volume
    }
  }
  return out
}

const WEEKLY_MA = 30
const RISING_WEEKS = 4

/**
 * Weekly trend up as of each day: weekly close above a rising 30-week MA (rising = above its value 4 weeks ago).
 * Day i sees only finished weeks plus its own week so far, whose close is day i's close, so the backtest never peeks ahead.
 */
export function weeklyTrendSeries(daily: readonly Bar[]): (boolean | undefined)[] {
  const keys = daily.map((b) => weekOf(b.time))
  const finals = toWeekly(daily).map((w) => w.close)
  const sum = [0]
  for (const c of finals) sum.push(sum[sum.length - 1] + c)
  const mean = (from: number, to: number) => (sum[to] - sum[from]) / (to - from) // weeks [from, to)
  let week = -1
  return daily.map((b, i) => {
    if (i === 0 || keys[i] !== keys[i - 1]) week++
    if (week < WEEKLY_MA - 1 + RISING_WEEKS) return undefined
    const now = (sum[week] - sum[week - (WEEKLY_MA - 1)] + b.close) / WEEKLY_MA
    const before = mean(week - RISING_WEEKS - WEEKLY_MA + 1, week - RISING_WEEKS + 1)
    return b.close > now && now > before
  })
}

export const weeklyTrendUp = (daily: readonly Bar[]): boolean | undefined => weeklyTrendSeries(daily).at(-1)

export type RuleId = 'weeklyTrend' | 'ma50over200' | 'closeOverMa50' | 'macdCross' | 'liquidity'
export interface Rule {
  id: RuleId
  /** undefined = not enough history to judge (counts as not passed). */
  pass: boolean | undefined
}

export interface Check {
  rules: Rule[]
  score: number
  close: number
  ma50?: number
  ma200?: number
  atr?: number
  low20?: number
  /** Bars since the last MACD bullish cross, if within the lookback. */
  crossAgo?: number
  /** Average daily traded value, last 20 bars, in the price currency (rupiah, or USDT for crypto). */
  avgValue: number
  /** Where to buy; undefined when the trend rules don't all pass. */
  buyZone?: { low: number; high: number }
  zone: Zone
  /** Price the stop and targets are measured from: the close, capped at the top of the buy zone. */
  entry: number
  stop?: number
  /** entry − stop */
  risk?: number
  target2?: number
  target3?: number
}

/** A MACD bullish cross counts if it happened in the last 5 bars and MACD is still above its signal. */
export const CROSS_LOOKBACK = 5
/** What differs between markets; the rules themselves are the same. */
export interface MarketRules {
  /** Minimum average daily traded value, in the price currency, so a position can be exited. */
  minValue: number
  /** Price step levels are rounded to, for a given price. */
  step: (price: number) => number
  /** Bars in the ~8-week time stop. */
  timeStopBars: number
}
/** IDX: Rp5 bn a day, whole rupiah, 40 trading days. shortcut: whole rupiah, not IDX tick sizes (fraksi), add those to step when they're in config. */
export const IDX_RULES: MarketRules = { minValue: 5e9, step: () => 1, timeStopBars: 40 }
/** Crypto (USDT): $10M a day, 5 significant digits (BTC $0.1… XRP $0.0001), 56 days because it trades every day. */
export const CRYPTO_RULES: MarketRules = { minValue: 10e6, step: (p) => 10 ** (Math.floor(Math.log10(p)) - 4), timeStopBars: 56 }

/** Round to a step without float noise (0.1 + 0.2 style), down, up or to the nearest. */
export function roundTo(x: number, step: number, how: 'floor' | 'ceil' | 'round'): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  return Number((Math[how](x / step) * step).toFixed(decimals))
}
/** Stop never wider than this many ATRs. */
export const MAX_ATR_STOP = 3
/** Buy zone height above MA50, in ATRs. */
export const ZONE_ATR = 2
const TREND_RULES: readonly RuleId[] = ['weeklyTrend', 'ma50over200', 'closeOverMa50']
/** in = price inside the buy zone; extended = above it, wait for a pullback; none = trend rules fail, no setup. */
export type Zone = 'in' | 'extended' | 'none'

/** Indicator series for a whole history, computed once. All are causal: the value at bar i only uses bars up to i. */
export function seriesFor(bars: readonly Bar[]) {
  const closes = bars.map((b) => b.close)
  return { closes, ma50: sma(closes, 50), ma200: sma(closes, 200), macd: macd(closes), atr: atr(bars), weekly: weeklyTrendSeries(bars) }
}

export interface CheckOptions {
  rules?: MarketRules
  /** Precomputed series and the bar to judge (default: the latest); the backtest uses these to replay each day cheaply. */
  series?: ReturnType<typeof seriesFor>
  last?: number
}

/** The checklist as of bar `last`. */
export function checkSetup(allBars: readonly Bar[], { rules: market = IDX_RULES, series, last = allBars.length - 1 }: CheckOptions = {}): Check | undefined {
  if (last < 0) return undefined
  const s = series ?? seriesFor(allBars)
  // The last 20 bars up to `last`, for the 20-bar low and average traded value.
  const recent = allBars.slice(Math.max(0, last - 19), last + 1)
  const close = s.closes[last]
  const ma50 = s.ma50[last]
  const ma200 = s.ma200[last]
  const m = s.macd
  let crossAgo: number | undefined
  for (let i = last; i > last - CROSS_LOOKBACK && i > 0; i--) {
    const [a, s, pa, ps] = [m.line[i], m.signal[i], m.line[i - 1], m.signal[i - 1]]
    if (a !== undefined && s !== undefined && pa !== undefined && ps !== undefined && pa <= ps && a > s) {
      crossAgo = last - i
      break
    }
  }
  const above = m.line[last] !== undefined && m.signal[last] !== undefined && m.line[last]! > m.signal[last]!
  const avgValue = recent.reduce((s, b) => s + b.close * b.volume, 0) / recent.length
  const a = s.atr[last]
  const low20 = lowestLow(recent)

  const rules: Rule[] = [
    { id: 'weeklyTrend', pass: s.weekly[last] },
    { id: 'ma50over200', pass: ma50 !== undefined && ma200 !== undefined ? ma50 > ma200 : undefined },
    { id: 'closeOverMa50', pass: ma50 !== undefined ? close > ma50 : undefined },
    { id: 'macdCross', pass: m.signal[last] !== undefined ? crossAgo !== undefined && above : undefined },
    { id: 'liquidity', pass: avgValue >= market.minValue },
  ]

  // Buy zone: MA50 (trend support) up to MA50 + 2× ATR, only while all three trend rules pass.
  const trendOk = rules.filter((r) => TREND_RULES.includes(r.id)).every((r) => r.pass)
  const step = market.step(close)
  const buyZone = trendOk && ma50 !== undefined && a !== undefined ? { low: roundTo(ma50, step, 'ceil'), high: roundTo(ma50 + ZONE_ATR * a, step, 'floor') } : undefined
  const zone: Zone = !buyZone ? 'none' : close > buyZone.high ? 'extended' : 'in'
  // Risk is measured from what you'd pay: the close, or the top of the zone when the price must pull back first.
  const entry = buyZone ? Math.min(close, buyZone.high) : close

  // Stop: one step below the 20-bar low, but never wider than 3× ATR.
  let stop: number | undefined
  // The 20-bar low only counts when it is below the entry (a strong rally can leave it above the buy zone).
  if (low20 !== undefined && a !== undefined) stop = roundTo(Math.max(low20 - step < entry ? low20 - step : -Infinity, entry - MAX_ATR_STOP * a), step, 'floor')
  const risk = stop !== undefined && stop < entry ? roundTo(entry - stop, step, 'round') : undefined
  return {
    buyZone,
    zone,
    entry,
    rules,
    score: rules.filter((r) => r.pass).length,
    close,
    ma50,
    ma200,
    atr: a,
    low20,
    crossAgo,
    avgValue,
    stop: risk ? stop : undefined,
    risk,
    target2: risk ? roundTo(entry + 2 * risk, step, 'round') : undefined,
    target3: risk ? roundTo(entry + 3 * risk, step, 'round') : undefined,
  }
}
