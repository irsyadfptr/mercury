// Crypto mood v2: a 0–100 regime score from six weighted parts, ported from the crypto-regime-analyzer skill
// (github.com/tradermonty/claude-trading-skills, MIT). Pure code: closes in, scores out. Thresholds are the skill's
// documented heuristics, not backtested optima. Missing parts have their weight shared out among the rest, but only while
// at least 4 parts and 65% of the weight remain; sparser data gives no score.
import { MOOD_DEFENSIVE, type MoodLight } from './mood'
import type { Bar } from './indicators'

export type RegimePartId = 'btcTrend' | 'altBreadth' | 'dominance' | 'funding' | 'drawdown' | 'momentum'
export const REGIME_WEIGHTS: Record<RegimePartId, number> = { btcTrend: 0.25, altBreadth: 0.2, dominance: 0.15, funding: 0.15, drawdown: 0.15, momentum: 0.1 }
const PART_IDS = Object.keys(REGIME_WEIGHTS) as RegimePartId[]
const MIN_PARTS = 4
const MIN_WEIGHT = 0.65

/** A part's score with the numbers behind it, for the mood card and the AI facts. Undefined score = not enough data. */
export interface RegimePart {
  id: RegimePartId
  weight: number
  score?: number
  /** Short machine label of what the part saw, e.g. 'bullStack', 'crowded'. */
  label?: string
  /** Values behind the score (percentages, rates). */
  values?: Record<string, number>
}

export interface CryptoMood {
  score: number
  light: MoodLight
  parts: RegimePart[]
  /** Share of the full weight that had data, 0–1. */
  coverage: number
}

/** Optional live inputs that have no price history behind them. */
export interface RegimeExtras {
  /** Daily BTC dominance %, oldest first (one reading per day, collected locally). */
  dominance?: readonly number[]
  /** Latest 8-hour funding rates as fractions (0.0001 = 0.01%), one per perpetual. */
  funding?: readonly number[]
}

const clamp = (x: number) => Math.max(0, Math.min(100, x))
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
/** Mean of closes[end − n, end). */
const smaAt = (c: readonly number[], end: number, n: number) => (end >= n ? mean(c.slice(end - n, end)) : undefined)

// ---- 1. BTC trend structure (25%) ----

const SLOPE_LOOKBACK = 20
/** closes[0, end): price vs MA50/MA200 stack, ± the MA200's 20-day slope. */
export function btcTrend(c: readonly number[], end = c.length): RegimePart {
  const part: RegimePart = { id: 'btcTrend', weight: REGIME_WEIGHTS.btcTrend }
  if (end < 200 + SLOPE_LOOKBACK) return part
  const price = c[end - 1]
  const ma50 = smaAt(c, end, 50)!
  const ma200 = smaAt(c, end, 200)!
  const prev = smaAt(c, end - SLOPE_LOOKBACK, 200)!
  const slope = ma200 > prev ? 10 : ma200 < prev ? -10 : 0
  let base: number
  let label: string
  if (price === ma200 && ma50 === ma200) [base, label] = [50, 'flat']
  else if (price > ma50 && ma50 > ma200) [base, label] = [90, 'bullStack']
  else if (price > ma200 && ma50 > ma200) [base, label] = [65, 'pullback']
  else if (ma50 > ma200) [base, label] = [55, 'belowBoth']
  else if (price > ma50) [base, label] = [45, 'recovery']
  else [base, label] = [15, 'bearStack']
  return { ...part, score: clamp(base + slope), label, values: { vsMa50: (price / ma50 - 1) * 100, vsMa200: (price / ma200 - 1) * 100, slope } }
}

/** The dominance part reads BTC's trend as "up" from this trend score. */
const BTC_UP = 60

// ---- 2. Alt breadth (20%) ----

const pctAbove = (alts: readonly (readonly number[])[], ends: readonly number[], n: number) => {
  let above = 0
  let counted = 0
  alts.forEach((c, k) => {
    const ma = smaAt(c, ends[k], n)
    if (ma === undefined) return
    counted++
    if (c[ends[k] - 1] > ma) above++
  })
  return { counted, pct: counted ? (above / counted) * 100 : 0 }
}

/** % of alts (BTC excluded) above their MA200, ±5 when the MA50 breadth leads or lags it by 15 points. Needs 5 alts with 200 days. */
export function altBreadth(alts: readonly (readonly number[])[], ends: readonly number[] = alts.map((c) => c.length)): RegimePart {
  const part: RegimePart = { id: 'altBreadth', weight: REGIME_WEIGHTS.altBreadth }
  const eligible = alts.map((_, k) => k).filter((k) => ends[k] >= 200)
  const a = eligible.map((k) => alts[k])
  const e = eligible.map((k) => ends[k])
  const p200 = pctAbove(a, e, 200)
  if (p200.counted < 5) return part
  const p50 = pctAbove(a, e, 50).pct
  const x = p200.pct
  let score = x >= 80 ? 95 : x >= 65 ? 80 : x >= 50 ? 65 : x >= 35 ? 45 : x >= 20 ? 25 : 10
  const label = p50 >= x + 15 ? 'thrust' : p50 <= x - 15 ? 'rollingOver' : 'steady'
  score += label === 'thrust' ? 5 : label === 'rollingOver' ? -5 : 0
  return { ...part, score: clamp(score), label, values: { above200: x, above50: p50, counted: p200.counted } }
}

// ---- 3. BTC dominance (15%) ----

const DOM_LOOKBACK = 30
/** 30-day change in BTC dominance, read together with BTC's trend. Needs 31 daily readings. */
export function dominancePart(series: readonly number[] | undefined, btcTrendScore: number | undefined): RegimePart {
  const part: RegimePart = { id: 'dominance', weight: REGIME_WEIGHTS.dominance }
  if (!series || series.length < DOM_LOOKBACK + 1 || btcTrendScore === undefined) return part
  const now = series[series.length - 1]
  const change = now - series[series.length - 1 - DOM_LOOKBACK]
  const dir = change > 0.5 ? 'rising' : change < -0.5 ? 'falling' : 'flat'
  const up = btcTrendScore >= BTC_UP
  const table = up ? { falling: 90, flat: 75, rising: 65 } : { falling: 10, flat: 25, rising: 30 }
  let score = table[dir]
  if (now >= 62 && !up) score += 5
  else if (now <= 40 && up) score -= 5
  return { ...part, score: clamp(score), label: `${up ? 'btcUp' : 'btcDown'}.${dir}`, values: { dominance: now, change } }
}

// ---- 4. Perpetual funding (15%) ----

/** Average latest 8-hour funding across perpetuals; contrarian at the extremes. Needs 2 rates. */
export function fundingPart(rates: readonly number[] | undefined): RegimePart {
  const part: RegimePart = { id: 'funding', weight: REGIME_WEIGHTS.funding }
  const ok = (rates ?? []).filter((r) => Number.isFinite(r) && Math.abs(r) <= 1)
  if (ok.length < 2) return part
  const avg = mean(ok)
  const [score, label] =
    avg <= -0.0001 ? [80, 'washedOut'] : avg < 0 ? [65, 'skeptical'] : avg <= 0.0001 ? [75, 'neutral'] : avg <= 0.0003 ? [55, 'warming'] : avg <= 0.0006 ? [30, 'crowded'] : [10, 'euphoric']
  return { ...part, score, label, values: { avgPct: avg * 100, count: ok.length } }
}

// ---- 5. Drawdown and volatility (15%) ----

const YEAR = 365
const VOL_WINDOW = 30
/** Sample standard deviation of the log returns ending at closes[end − 1], over `window` returns. */
function realizedVol(c: readonly number[], end: number, window: number): number {
  const rets: number[] = []
  for (let i = end - window; i < end; i++) if (i > 0 && c[i - 1] > 0) rets.push(Math.log(c[i] / c[i - 1]))
  if (rets.length < 2) return 0
  const m = mean(rets)
  return Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1))
}

/** Drawdown from the 1-year high, ±10 when 30-day volatility is in the bottom or top third of the year; floor 15 in a capitulation. */
export function drawdownPart(c: readonly number[], end = c.length): RegimePart {
  const part: RegimePart = { id: 'drawdown', weight: REGIME_WEIGHTS.drawdown }
  if (end < YEAR) return part
  const start = end - YEAR
  let high = 0
  for (let i = start; i < end; i++) high = Math.max(high, c[i])
  const dd = high > 0 ? 1 - c[end - 1] / high : 0
  let score = dd <= 0.1 ? 90 : dd <= 0.2 ? 75 : dd <= 0.35 ? 55 : dd <= 0.5 ? 35 : dd <= 0.65 ? 20 : 10
  // Volatility at weekly steps through the year, measured inside the year (as the skill does).
  const year = c.slice(start, end)
  const vols: number[] = []
  for (let i = VOL_WINDOW; i < year.length; i += 7) vols.push(realizedVol(year, i + 1, VOL_WINDOW))
  const now = realizedVol(year, year.length, VOL_WINDOW)
  const pctile = vols.length ? vols.filter((v) => v <= now).length / vols.length : 0.5
  const label = pctile <= 1 / 3 ? 'calm' : pctile >= 2 / 3 ? 'volatile' : 'normal'
  score += label === 'calm' ? 10 : label === 'volatile' ? -10 : 0
  if (dd > 0.65 && pctile >= 2 / 3) score = Math.max(score, 15)
  return { ...part, score: clamp(score), label, values: { drawdown: dd * 100, volPctile: pctile * 100 } }
}

// ---- 6. Momentum thrust (10%) ----

const MOM_LOOKBACK = 30
/** % of coins (BTC included) up over 30 days; a near-total washout scores a contrarian 35. Needs 5 coins. */
export function momentumPart(coins: readonly (readonly number[])[], ends: readonly number[] = coins.map((c) => c.length)): RegimePart {
  const part: RegimePart = { id: 'momentum', weight: REGIME_WEIGHTS.momentum }
  let up = 0
  let counted = 0
  coins.forEach((c, k) => {
    const e = ends[k]
    if (e < MOM_LOOKBACK + 1) return
    counted++
    if (c[e - 1] > c[e - 1 - MOM_LOOKBACK]) up++
  })
  if (counted < 5) return part
  const x = (up / counted) * 100
  const [score, label] = x >= 85 ? [90, 'thrust'] : x >= 65 ? [75, 'positive'] : x >= 45 ? [55, 'mixed'] : x >= 25 ? [35, 'weak'] : x >= 10 ? [20, 'negative'] : [35, 'washout']
  return { ...part, score, label, values: { up: x, counted } }
}

// ---- Composite ----

export const lightOf = (score: number): MoodLight => (score < MOOD_DEFENSIVE ? 'red' : score < 65 ? 'yellow' : 'green')

/** Weighted mean of the parts with data, or undefined when fewer than 4 parts or 65% of the weight have data. */
export function composite(parts: readonly RegimePart[]): { score: number; coverage: number } | undefined {
  const ok = parts.filter((p) => p.score !== undefined)
  const coverage = ok.reduce((s, p) => s + p.weight, 0)
  if (ok.length < MIN_PARTS || coverage < MIN_WEIGHT - 1e-9) return undefined
  return { score: Math.round(ok.reduce((s, p) => s + p.score! * p.weight, 0) / coverage), coverage }
}

/** Today's crypto mood. alts = the scanned coins other than BTC. */
export function cryptoMood(btc: readonly Bar[], alts: readonly (readonly Bar[])[], extras: RegimeExtras = {}): CryptoMood | undefined {
  const b = btc.map((x) => x.close)
  const a = alts.map((bars) => bars.map((x) => x.close))
  const trend = btcTrend(b)
  const parts = [trend, altBreadth(a), dominancePart(extras.dominance, trend.score), fundingPart(extras.funding), drawdownPart(b), momentumPart(b.length ? [b, ...a] : a)]
  const c = composite(parts)
  return c && { score: c.score, light: lightOf(c.score), parts, coverage: c.coverage }
}

/**
 * The mood as of every BTC date, for "skip while Defensive" in backtests. Only the four price parts exist in the past
 * (no dominance or funding history), so this is the price-only version of the live score. Alts count on a date only if
 * they traded that day.
 */
export function cryptoMoodSeries(btc: readonly Bar[], alts: readonly (readonly Bar[])[]): Map<string, number> {
  const b = btc.map((x) => x.close)
  const a = alts.map((bars) => bars.map((x) => x.close))
  const index = alts.map((bars) => new Map(bars.map((x, i) => [x.time, i])))
  const out = new Map<string, number>()
  btc.forEach((bar, i) => {
    const live = a.flatMap((c, k) => {
      const j = index[k].get(bar.time)
      return j === undefined ? [] : [[c, j + 1] as const]
    })
    const closes = live.map(([c]) => c)
    const ends = live.map(([, e]) => e)
    const parts = [btcTrend(b, i + 1), altBreadth(closes, ends), drawdownPart(b, i + 1), momentumPart([b, ...closes], [i + 1, ...ends])]
    const c = composite(parts)
    if (c) out.set(bar.time, c.score)
  })
  return out
}

export const regimePartIds = PART_IDS
