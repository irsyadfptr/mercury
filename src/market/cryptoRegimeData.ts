// Live inputs for crypto mood v2 that have no price history: perpetual funding (Binance futures, public, no key) and
// BTC dominance (CoinGecko /global with the user's Demo key). Both are best effort: a failed call just leaves that part out.
// shortcut: fapi.binance.com browser CORS not yet confirmed on a real run (the build sandbox can't reach it); a CORS or
// geo block shows as "no data" for funding, never as an error.
import type { RegimeExtras } from './cryptoRegime'

const FUNDING_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex'
const GLOBAL_URL = 'https://api.coingecko.com/api/v3/global'
const DOMINANCE_KEY = 'mercury.btcDominance'
/** Keep about 4 months of daily readings; the part needs 31. */
const MAX_DAYS = 120

/** Pure: latest funding rates for the given coins' USDT perpetuals from a premiumIndex response (all symbols). */
export function parseFunding(json: unknown, coins: readonly string[]): number[] {
  if (!Array.isArray(json)) return []
  const want = new Set(coins.map((c) => `${c}USDT`))
  return json.flatMap((row: { symbol?: unknown; lastFundingRate?: unknown }) => {
    const rate = Number(row?.lastFundingRate)
    return typeof row?.symbol === 'string' && want.has(row.symbol) && Number.isFinite(rate) ? [rate] : []
  })
}

/** Pure: BTC's share of total crypto market cap, %, from a CoinGecko /global response. */
export function parseDominance(json: unknown): number | undefined {
  const v = (json as { data?: { market_cap_percentage?: { btc?: unknown } } })?.data?.market_cap_percentage?.btc
  return typeof v === 'number' && v > 0 && v <= 100 ? v : undefined
}

export type DominanceLog = Record<string, number>

/** Pure: today's reading replaces any earlier one of the same UTC day; the oldest days drop off. */
export function recordDominance(log: DominanceLog, day: string, value: number): DominanceLog {
  const next = { ...log, [day]: value }
  const days = Object.keys(next).sort()
  return Object.fromEntries(days.slice(-MAX_DAYS).map((d) => [d, next[d]]))
}

/**
 * Pure: readings oldest first, one per day. A missed day is skipped rather than filled, so "30 readings ago" can be a little
 * more than 30 days ago when the app wasn't opened every day.
 */
export const dominanceSeries = (log: DominanceLog): number[] =>
  Object.keys(log)
    .sort()
    .map((d) => log[d])

export function loadDominanceLog(): DominanceLog {
  try {
    return JSON.parse(localStorage.getItem(DOMINANCE_KEY) ?? '{}') as DominanceLog
  } catch {
    return {}
  }
}
function saveDominanceLog(log: DominanceLog) {
  try {
    localStorage.setItem(DOMINANCE_KEY, JSON.stringify(log))
  } catch {
    // Storage blocked: the dominance part waits for 31 readings that can't be kept.
  }
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

/** Fetches funding and today's dominance (saved locally); each part missing on failure. */
export async function fetchRegimeExtras(coins: readonly string[], cgKey: string | undefined): Promise<RegimeExtras> {
  const [funding, dominance] = await Promise.all([
    json(FUNDING_URL)
      .then((j) => parseFunding(j, coins))
      .catch(() => undefined),
    cgKey
      ? json(GLOBAL_URL, { headers: { 'x-cg-demo-api-key': cgKey } })
          .then(parseDominance)
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  let log = loadDominanceLog()
  if (dominance !== undefined) {
    log = recordDominance(log, new Date().toISOString().slice(0, 10), dominance)
    saveDominanceLog(log)
  }
  return { funding, dominance: dominanceSeries(log) }
}
