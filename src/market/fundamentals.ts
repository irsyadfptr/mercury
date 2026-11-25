// Long-term (fundamentals) check: three parts scored 0–5 by fixed thresholds. Pure; numbers come from idx (Yahoo), never from AI.

/** Every input the score reads. null = the data source didn't report it. Percentages are in percent (15 = 15%). */
export interface FundamentalInput {
  price: number | null
  marketCap: number | null
  roePct: number | null
  netMarginPct: number | null
  debtToEquity: number | null
  /** Years in a row with a cash dividend (idx `stocks dividends`). */
  dividendYears: number | null
  earningsGrowthPct: number | null
  pe: number | null
  pb: number | null
  peg: number | null
  dividendYieldPct: number | null
  targetMean: number | null
  totalDebt: number | null
  totalCash: number | null
  beta: number | null
  high52: number | null
  low52: number | null
  currentRatio: number | null
}

// Thresholds (NOTES.md "Long-term check").
export const MIN_ROE_PCT = 15
export const MIN_NET_MARGIN_PCT = 10
export const MAX_DEBT_TO_EQUITY = 1
export const MIN_DIVIDEND_YEARS = 5
export const MIN_EARNINGS_GROWTH_PCT = 0
export const MAX_PE = 15
export const MAX_PB = 2
export const MAX_PEG = 1
export const MIN_DIVIDEND_YIELD_PCT = 3
export const MIN_TARGET_UPSIDE_PCT = 15
export const MAX_BETA = 1
/** 52-week high over 52-week low, minus 1, in percent. */
export const MAX_SWING_52W_PCT = 60
export const MIN_CURRENT_RATIO = 1.5
export const MIN_MARKET_CAP = 10e12
/** US (USD): $1 bn, about the same size class as Rp10 tn. */
export const MIN_MARKET_CAP_USD = 1e9

export type PartId = 'quality' | 'value' | 'risk'
export type MetricId =
  | 'roe'
  | 'netMargin'
  | 'debtToEquity'
  | 'dividendYears'
  | 'earningsGrowth'
  | 'pe'
  | 'pb'
  | 'peg'
  | 'dividendYield'
  | 'targetUpside'
  | 'netCash'
  | 'beta'
  | 'swing52w'
  | 'currentRatio'
  | 'marketCap'

export interface Metric {
  id: MetricId
  /** The number tested (null = unknown). */
  value: number | null
  /** The threshold it is tested against. */
  limit: number
  /** null = unknown: counts as not passed, never as a pass. */
  pass: boolean | null
}
export interface Part {
  id: PartId
  /** Metrics passed, 0–5. */
  score: number
  /** Metrics with data, 0–5. */
  known: number
  metrics: Metric[]
}
export interface FundamentalScore {
  parts: Part[]
  /** Sum of the three parts, 0–15. */
  total: number
  known: number
}

const ok = (n: number | null) => n !== null && Number.isFinite(n)
const pct = (a: number | null, b: number | null) => (ok(a) && ok(b) && b! > 0 ? (a! / b! - 1) * 100 : null)

type Test = (v: number) => boolean
const atLeast = (limit: number): [number, Test] => [limit, (v) => v >= limit]
const atMost = (limit: number): [number, Test] => [limit, (v) => v <= limit]
/** For ratios that mean nothing when negative (loss-making P/E, PEG). */
const positiveAtMost = (limit: number): [number, Test] => [limit, (v) => v > 0 && v <= limit]

function metric(id: MetricId, value: number | null, [limit, test]: [number, Test]): Metric {
  return { id, value: ok(value) ? value : null, limit, pass: ok(value) ? test(value!) : null }
}

function part(id: PartId, metrics: Metric[]): Part {
  return { id, metrics, score: metrics.filter((m) => m.pass).length, known: metrics.filter((m) => m.pass !== null).length }
}

/** minMarketCap: in the input's currency (IDX rupiah by default; US passes MIN_MARKET_CAP_USD). */
export function scoreFundamentals(f: FundamentalInput, { minMarketCap = MIN_MARKET_CAP }: { minMarketCap?: number } = {}): FundamentalScore {
  const netCash = ok(f.totalCash) && ok(f.totalDebt) ? f.totalCash! - f.totalDebt! : null
  const parts = [
    part('quality', [
      metric('roe', f.roePct, atLeast(MIN_ROE_PCT)),
      metric('netMargin', f.netMarginPct, atLeast(MIN_NET_MARGIN_PCT)),
      metric('debtToEquity', f.debtToEquity, atMost(MAX_DEBT_TO_EQUITY)),
      metric('dividendYears', f.dividendYears, atLeast(MIN_DIVIDEND_YEARS)),
      metric('earningsGrowth', f.earningsGrowthPct, [MIN_EARNINGS_GROWTH_PCT, (v) => v > MIN_EARNINGS_GROWTH_PCT]),
    ]),
    part('value', [
      metric('pe', f.pe, positiveAtMost(MAX_PE)),
      metric('pb', f.pb, positiveAtMost(MAX_PB)),
      metric('peg', f.peg, positiveAtMost(MAX_PEG)),
      metric('dividendYield', f.dividendYieldPct, atLeast(MIN_DIVIDEND_YIELD_PCT)),
      metric('targetUpside', pct(f.targetMean, f.price), atLeast(MIN_TARGET_UPSIDE_PCT)),
    ]),
    // Risk: 5 = low risk.
    part('risk', [
      metric('netCash', netCash, atLeast(0)),
      metric('beta', f.beta, atMost(MAX_BETA)),
      metric('swing52w', pct(f.high52, f.low52), atMost(MAX_SWING_52W_PCT)),
      metric('currentRatio', f.currentRatio, atLeast(MIN_CURRENT_RATIO)),
      metric('marketCap', f.marketCap, atLeast(minMarketCap)),
    ]),
  ]
  return { parts, total: parts.reduce((s, p) => s + p.score, 0), known: parts.reduce((s, p) => s + p.known, 0) }
}
