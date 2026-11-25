// Loads what the short-term rules need for one ticker: daily bars for direction, and the entry-frame bars (4H or daily).
import { fetchCryptoClosed, fetchCryptoHistory } from './binance'
import { fetchHistory, fetchHourly } from './idx'
import { to4h, type Bar } from './indicators'
import type { ShortMarket, Style } from './shortSwing'
import { fetchUsHistory, fetchUsHourly, toUs4h } from './us'

const FOUR_H = 4 * 3600_000

/** Drops the last bar while its 4-hour block hasn't ended yet (signals use finished bars only). */
export function closedOnly(bars: Bar[], now = Date.now()): Bar[] {
  const last = bars[bars.length - 1]
  return last && Date.parse(last.time) + FOUR_H > now ? bars.slice(0, -1) : bars
}

export interface ShortData {
  name?: string
  daily: Bar[]
  entry: Bar[]
}

// Kept for the visit, so switching styles or reopening a ticker doesn't refetch.
const cache = new Map<string, Promise<ShortData>>()

export function loadShort(market: ShortMarket, style: Style, symbol: string): Promise<ShortData> {
  const key = `${market}:${style.entryFrame}:${symbol}`
  let hit = cache.get(key)
  if (!hit) {
    hit = (async () => {
      const { name, bars: daily } = market === 'idx' ? await fetchHistory(symbol) : market === 'us' ? await fetchUsHistory(symbol) : await fetchCryptoHistory(symbol)
      if (style.entryFrame === '1d') return { name, daily, entry: daily }
      const entry =
        market === 'idx' ? closedOnly(to4h(await fetchHourly(symbol))) : market === 'us' ? closedOnly(toUs4h(await fetchUsHourly(symbol))) : await fetchCryptoClosed(symbol, '4h')
      return { name, daily, entry }
    })()
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

/** Forget the visit's data (the Rescan button), so the next load fetches fresh bars. */
export const clearShortCache = () => cache.clear()
