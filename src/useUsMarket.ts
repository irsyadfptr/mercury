import { useCallback, useEffect, useState } from 'react'
import { fetchPrices } from './market/coingecko'
import { fetchUsdIdr, fetchUsPrices, usAvailable } from './market/us'
import { useSettings } from './settings'
import { useStore } from './store'
import { ENV_KEY } from './useCryptoMarket'

// Twelve Data's free plan is 800 calls a day: refresh at most every 15 minutes, not on every page switch.
const MIN_GAP_MS = 15 * 60_000

interface UsState {
  at?: number
  status: 'idle' | 'loading' | 'error'
  /** Where the last automatic USD/IDR rate came from. */
  rateFrom?: 'market' | 'usdt'
}
// Kept outside React so it survives page switches during a visit.
let cache: UsState = { status: 'idle' }

/**
 * Pure: the USD/IDR rate to keep. A rate typed in Settings (manual) is never replaced; otherwise the new one wins
 * when there is one.
 */
export const nextRate = (manual: boolean | undefined, current: number | undefined, fetched: number | undefined) => (manual ? current : (fetched ?? current))

/** Rupiah per USDT from CoinGecko: a close stand-in for USD/IDR when no US source is reachable. */
async function usdtRate(key: string | undefined): Promise<number | undefined> {
  if (!key) return undefined
  const p = (await fetchPrices(['usdt'], key)).usdt?.idr
  return p && p > 5_000 && p < 50_000 ? p : undefined
}

/**
 * Live US stock and ETF prices (written into each US holding's price, like crypto) and the automatic USD/IDR rate.
 * Mounted once in the Shell, so it runs whichever page is open.
 */
export function useUsMarket() {
  const twelveKey = useSettings((s) => s.twelveDataKey)
  const cgKey = useSettings((s) => s.coingeckoKey) || ENV_KEY
  const manual = useSettings((s) => s.usdIdrManual)
  const hasUs = useStore((s) => s.holdings.some((h) => h.assetClass === 'us_stock'))
  const hasUsd = useStore((s) => s.holdings.some((h) => h.currency === 'USD'))
  const [state, setState] = useState(cache)
  const update = (s: UsState) => setState((cache = s))

  const refresh = useCallback(async () => {
    update({ ...cache, status: 'loading' })
    let failed = false
    // Prices first: a missing rate must not stop them.
    if (usAvailable(twelveKey)) {
      try {
        const { holdings, updateHolding } = useStore.getState()
        const us = holdings.filter((h) => h.assetClass === 'us_stock' && h.currency === 'USD')
        const prices = await fetchUsPrices(us.map((h) => h.symbol.toUpperCase()))
        const at = new Date().toISOString()
        for (const h of us) {
          const p = prices[h.symbol.toUpperCase()]
          if (p !== undefined) updateHolding(h.id, { manualPrice: p, manualPriceAt: at })
        }
      } catch {
        failed = true
      }
    }
    let rateFrom: UsState['rateFrom']
    if (!useSettings.getState().usdIdrManual) {
      let rate: number | undefined
      if (usAvailable(twelveKey)) {
        try {
          rate = await fetchUsdIdr()
          rateFrom = 'market'
        } catch {
          // Try USDT below.
        }
      }
      if (rate === undefined) {
        rate = await usdtRate(cgKey).catch(() => undefined)
        if (rate !== undefined) rateFrom = 'usdt'
      }
      const s = useSettings.getState()
      const next = nextRate(s.usdIdrManual, s.usdIdr, rate)
      if (rate !== undefined && next !== s.usdIdr) s.set({ usdIdr: Math.round(next! * 100) / 100, usdIdrAt: new Date().toISOString() })
      else if (rate !== undefined) s.set({ usdIdrAt: new Date().toISOString() })
      if (rate === undefined && hasUsd) failed = true
    }
    update({ at: Date.now(), status: failed ? 'error' : 'idle', rateFrom: rateFrom ?? cache.rateFrom })
  }, [twelveKey, cgKey, hasUsd])

  useEffect(() => {
    // Only worth a call when something is priced in USD (or the rate is automatic and unknown).
    const wanted = hasUs || (hasUsd && !manual)
    if (wanted && !(cache.at && Date.now() - cache.at < MIN_GAP_MS)) void refresh()
  }, [hasUs, hasUsd, manual, refresh])

  return { ...state, available: usAvailable(twelveKey), refresh }
}
