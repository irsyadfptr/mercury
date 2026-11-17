// Crypto fundamentals check: three parts scored by fixed thresholds, like the stock check (fundamentals.ts). Pure code.
// Numbers come from CoinGecko (supply, market), DefiLlama (usage: TVL, fees, revenue) and Binance (listing age, 1-year range).
// null = the source didn't report it: counts as unknown, never as a pass.

export interface CryptoInput {
  marketCap: number | null
  /** Fully diluted valuation: price × max (or total) supply. */
  fdv: number | null
  circulating: number | null
  total: number | null
  max: number | null
  /** % below the all-time high (CoinGecko, negative). */
  athChangePct: number | null
  volume24h: number | null
  /** Days since the first daily candle on Binance. */
  listedDays: number | null
  /** Highest high and lowest low of the last 365 daily candles. */
  high365: number | null
  low365: number | null
  /** GitHub commits in the last 4 weeks (CoinGecko developer data; often missing). */
  commits4w: number | null
  /** DefiLlama: total value locked now, its 7-day change in %, fees over 7 / 30 days and revenue over a year (USD). */
  tvl: number | null
  tvlChange7dPct: number | null
  fees7d: number | null
  fees30d: number | null
  revenue1y: number | null
}

// Thresholds (NOTES.md "Crypto fundamentals").
export const MIN_CIRCULATING_PCT = 70
export const MAX_FDV_RATIO = 1.5
export const MIN_AGE_YEARS = 3
export const MIN_TVL = 1e9
/** Fees over the last 7 days, scaled to 30, vs the last 30 days: ≥ 100% = not slowing down. */
export const MIN_FEES_PACE_PCT = 100
export const MIN_VOLUME_SHARE_PCT = 2
export const MIN_MARKET_CAP = 1e9
/** No more than this far below the all-time high. */
export const MIN_ATH_CHANGE_PCT = -50
/** 1-year high ÷ low. */
export const MAX_SWING_1Y = 3
export const MIN_COMMITS_4W = 20

export type CryptoPartId = 'tokenomics' | 'usage' | 'market'
export type CryptoMetricId =
  | 'circulating'
  | 'fdvRatio'
  | 'hardCap'
  | 'age'
  | 'tvl'
  | 'tvlTrend'
  | 'fees30d'
  | 'feesPace'
  | 'revenue1y'
  | 'volumeShare'
  | 'marketCap'
  | 'athDistance'
  | 'swing1y'
  | 'commits'

export interface CryptoMetric {
  id: CryptoMetricId
  value: number | null
  limit: number
  pass: boolean | null
}
export interface CryptoPart {
  id: CryptoPartId
  score: number
  known: number
  metrics: CryptoMetric[]
}
export interface CryptoScore {
  parts: CryptoPart[]
  total: number
  /** Number of metrics in all parts. */
  max: number
  known: number
}

const ok = (n: number | null): n is number => n !== null && Number.isFinite(n)
const ratio = (a: number | null, b: number | null) => (ok(a) && ok(b) && b > 0 ? a / b : null)

function metric(id: CryptoMetricId, value: number | null, limit: number, test: (v: number) => boolean): CryptoMetric {
  return { id, value: ok(value) ? value : null, limit, pass: ok(value) ? test(value) : null }
}
function part(id: CryptoPartId, metrics: CryptoMetric[]): CryptoPart {
  return { id, metrics, score: metrics.filter((m) => m.pass).length, known: metrics.filter((m) => m.pass !== null).length }
}

export function scoreCrypto(c: CryptoInput): CryptoScore {
  // Supply ceiling: the max supply, or the total when there is no max.
  const cap = ok(c.max) && c.max > 0 ? c.max : c.total
  const circPct = ratio(c.circulating, cap)
  // Hard cap: 1 when a max supply exists, 0 when CoinGecko reports none (unknown only if supply data is missing entirely).
  const hardCap = ok(c.max) && c.max > 0 ? 1 : ok(c.circulating) ? 0 : null
  const pace = ok(c.fees7d) && ok(c.fees30d) && c.fees30d > 0 ? ((c.fees7d * 30) / 7 / c.fees30d) * 100 : null
  const parts = [
    part('tokenomics', [
      metric('circulating', circPct === null ? null : circPct * 100, MIN_CIRCULATING_PCT, (v) => v >= MIN_CIRCULATING_PCT),
      metric('fdvRatio', ratio(c.fdv, c.marketCap), MAX_FDV_RATIO, (v) => v <= MAX_FDV_RATIO),
      metric('hardCap', hardCap, 1, (v) => v === 1),
      metric('age', ok(c.listedDays) ? c.listedDays / 365.25 : null, MIN_AGE_YEARS, (v) => v >= MIN_AGE_YEARS),
    ]),
    part('usage', [
      metric('tvl', c.tvl, MIN_TVL, (v) => v >= MIN_TVL),
      metric('tvlTrend', c.tvlChange7dPct, 0, (v) => v > 0),
      metric('fees30d', c.fees30d, 0, (v) => v > 0),
      metric('feesPace', pace, MIN_FEES_PACE_PCT, (v) => v >= MIN_FEES_PACE_PCT),
      metric('revenue1y', c.revenue1y, 0, (v) => v > 0),
    ]),
    part('market', [
      metric('volumeShare', ratio(c.volume24h, c.marketCap) === null ? null : ratio(c.volume24h, c.marketCap)! * 100, MIN_VOLUME_SHARE_PCT, (v) => v >= MIN_VOLUME_SHARE_PCT),
      metric('marketCap', c.marketCap, MIN_MARKET_CAP, (v) => v >= MIN_MARKET_CAP),
      metric('athDistance', c.athChangePct, MIN_ATH_CHANGE_PCT, (v) => v >= MIN_ATH_CHANGE_PCT),
      metric('swing1y', ratio(c.high365, c.low365), MAX_SWING_1Y, (v) => v <= MAX_SWING_1Y),
      metric('commits', c.commits4w, MIN_COMMITS_4W, (v) => v >= MIN_COMMITS_4W),
    ]),
  ]
  return {
    parts,
    total: parts.reduce((s, p) => s + p.score, 0),
    max: parts.reduce((s, p) => s + p.metrics.length, 0),
    known: parts.reduce((s, p) => s + p.known, 0),
  }
}
