// CoinGecko Demo API, called from the browser with the user's own key (BYOK).
import type { Holding } from '@/types'

const BASE = 'https://api.coingecko.com/api/v3'

export type CryptoPrices = Record<string, Partial<Record<'idr' | 'usd' | 'usd_24h_change', number>>>

/** Coins always shown on the dashboard, whether held or not. */
export const WATCHLIST = ['btc', 'eth', 'sol', 'xrp', 'hype'] as const
export interface Mood {
  value: number
  sentiment: string
}

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'x-cg-demo-api-key': key } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  return res.json() as Promise<T>
}

/** Prices by lowercase ticker. include_tokens=top picks the biggest coin when a ticker is shared. */
export const fetchPrices = (symbols: readonly string[], key: string) =>
  get<CryptoPrices>(`/simple/price?symbols=${encodeURIComponent(symbols.join(','))}&vs_currencies=idr,usd&include_tokens=top&include_24hr_change=true`, key)

export const fetchMood = async (key: string): Promise<Mood | undefined> =>
  (await get<{ data: { fear_and_greed_index?: Mood } }>('/global', key)).data.fear_and_greed_index

/** Pure: new price per crypto holding id, in the holding's own currency. Unknown tickers are left out. */
export function pricesFor(holdings: readonly Holding[], prices: CryptoPrices): Record<string, number> {
  const out: Record<string, number> = {}
  for (const h of holdings) {
    if (h.assetClass !== 'crypto') continue
    const p = prices[h.symbol.toLowerCase()]?.[h.currency === 'IDR' ? 'idr' : 'usd']
    if (p != null && Number.isFinite(p) && p >= 0) out[h.id] = p
  }
  return out
}
