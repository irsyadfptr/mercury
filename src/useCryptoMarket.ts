import { useCallback, useEffect, useState } from 'react'
import { fetchMood, fetchPrices, pricesFor, WATCHLIST, type CryptoPrices, type Mood } from './market/coingecko'
import { useSettings } from './settings'
import { useStore } from './store'

// Skip auto-refresh within this window so tab switching doesn't burn the 10k calls/month.
const MIN_GAP_MS = 5 * 60_000
// Local fallback from .env.local. Anything VITE_* ends up in the built JS, so never set it on a public deploy.
export const ENV_KEY: string | undefined = import.meta.env.VITE_COINGECKO_KEY

interface MarketState {
  mood?: Mood
  prices?: CryptoPrices
  at?: number
  status: 'idle' | 'loading' | 'error'
}
// Kept outside React so it survives page switches during a visit.
let cache: MarketState = { status: 'idle' }

/** Live crypto prices (written into each crypto holding's price) and crypto fear & greed. */
export function useCryptoMarket() {
  const key = useSettings((s) => s.coingeckoKey) || ENV_KEY
  const watched = useSettings((s) => s.watchlist?.crypto)
  const [state, setState] = useState(cache)
  const update = (s: MarketState) => setState((cache = s))

  const refresh = useCallback(async () => {
    if (!key) return
    update({ ...cache, status: 'loading' })
    try {
      const { holdings, updateHolding } = useStore.getState()
      const symbols = [...new Set([...WATCHLIST, ...(watched ?? []).map((x) => x.toLowerCase()), ...holdings.filter((h) => h.assetClass === 'crypto').map((h) => h.symbol.toLowerCase())])]
      const [prices, mood] = await Promise.all([fetchPrices(symbols, key), fetchMood(key)])
      const at = new Date().toISOString()
      for (const [id, price] of Object.entries(pricesFor(holdings, prices))) updateHolding(id, { manualPrice: price, manualPriceAt: at })
      update({ mood, prices, at: Date.now(), status: 'idle' })
    } catch {
      update({ ...cache, status: 'error' })
    }
  }, [key, watched])

  useEffect(() => {
    if (key && !(cache.at && Date.now() - cache.at < MIN_GAP_MS)) void refresh()
  }, [key, refresh])

  return { ...state, hasKey: !!key, refresh }
}
