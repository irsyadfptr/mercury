// Coins for the crypto scan, each traded against USDT on Binance.
// Live list: the top TOP_N coins by market cap (CoinGecko, needs the user's key), keeping only those with a Binance USDT pair and
// leaving out stablecoins, gold tokens and wrapped/staked copies. Cached for a day. Without a key, or if a call fails, the fixed list
// below is used.
import { z } from 'zod'

/** How many coins the live list keeps. */
export const TOP_N = 50
/** Coins asked from CoinGecko; extra room for the ones dropped below. */
const FETCH_N = 150
const CACHE_KEY = 'mercury.cryptoTop'
const CACHE_MS = 24 * 3600_000

// Fixed fallback: Binance spot 24h volume (data-api.binance.vision /ticker/24hr) on 2026-11-14, established coins with at least
// a year of history on Binance, no stablecoins, tokenised stocks or new listings (HYPE: only 51 days on Binance).
export const CRYPTO_COINS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK',
  'SUI', 'XLM', 'BCH', 'LTC', 'NEAR', 'APT', 'UNI', 'HBAR', 'DOT', 'FIL',
  'AAVE', 'INJ', 'ARB', 'OP', 'RENDER', 'WLD', 'PEPE', 'TAO', 'ENA', 'ONDO',
] as const

/** Dollar/euro stablecoins and gold tokens: they don't trend, so the swing rules don't apply. */
const NOT_TRADED = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD', 'USDD', 'RLUSD', 'FRAX', 'USDP', 'GUSD', 'LUSD', 'EURC', 'EURT', 'AEUR', 'XAUT', 'PAXG', 'BFUSD', 'USDF', 'USDG', 'SUSDE', 'SUSDS'])
/** Wrapped, staked and bridged copies of another coin. */
const COPY = /wrapped|staked|bridged|restak|liquid staking|\bmsol\b|binance-peg/i
/** A coin priced within 2% of $1 is treated as a stablecoin even when it isn't in NOT_TRADED. */
const PEG_BAND = 0.02

const market = z.object({ symbol: z.string(), name: z.string(), current_price: z.number().nullish() })
export type CoinMarket = z.infer<typeof market>

/** Pure: CoinGecko markets (largest first) + Binance symbols → the first `n` tradable tickers, upper case. */
export function pickTopCoins(markets: readonly CoinMarket[], binance: ReadonlySet<string>, n = TOP_N): string[] {
  const out: string[] = []
  for (const c of markets) {
    const s = c.symbol.toUpperCase()
    if (out.includes(s) || NOT_TRADED.has(s) || COPY.test(c.name) || !/^[A-Z0-9]{2,10}$/.test(s)) continue
    if (c.current_price != null && Math.abs(c.current_price - 1) < PEG_BAND) continue
    if (!binance.has(`${s}USDT`)) continue
    out.push(s)
    if (out.length === n) break
  }
  return out
}

export interface CoinList {
  coins: readonly string[]
  /** mcap = live top N by market cap; fixed = the fallback list. */
  source: 'mcap' | 'fixed'
  /** When the live list was made (ms). */
  at?: number
}
export const FIXED_LIST: CoinList = { coins: CRYPTO_COINS, source: 'fixed' }

export function cachedCoinList(): CoinList | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CoinList | null
    return c && Array.isArray(c.coins) && c.coins.length && Date.now() - (c.at ?? 0) < CACHE_MS ? c : undefined
  } catch {
    return undefined
  }
}

/** Top coins by market cap, from the day's cache or fresh; the fixed list when there is no key or a call fails. */
export async function loadCoinList(key: string | undefined): Promise<CoinList> {
  const hit = cachedCoinList()
  if (hit) return hit
  if (!key) return FIXED_LIST
  try {
    const [cg, bn] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${FETCH_N}&page=1`, { headers: { 'x-cg-demo-api-key': key } }),
      fetch('https://data-api.binance.vision/api/v3/ticker/price'),
    ])
    if (!cg.ok || !bn.ok) return FIXED_LIST
    const markets = z.array(market).parse(await cg.json())
    const symbols = new Set(z.array(z.object({ symbol: z.string() })).parse(await bn.json()).map((x) => x.symbol))
    const coins = pickTopCoins(markets, symbols)
    if (coins.length < 10) return FIXED_LIST
    const list: CoinList = { coins, source: 'mcap', at: Date.now() }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(list))
    } catch {
      // Storage blocked: fetched again next scan.
    }
    return list
  } catch {
    return FIXED_LIST
  }
}
