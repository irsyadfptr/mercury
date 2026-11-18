// The user's watchlist: tickers always added to the Scanner's scans, per market. Stored with the settings (this browser only).
import { useSettings } from './settings'

export type WatchMarket = 'idx' | 'crypto'
/** Keeps the scan quick and inside the free API limits. */
export const MAX_WATCH = 20

/** Pure: the scan list plus watched tickers not already in it (watched ones last). */
export const withWatched = (list: readonly string[], watch: readonly string[]): string[] => [...list, ...watch.filter((s) => !list.includes(s))]

export function useWatchlist(market: WatchMarket) {
  const watchlist = useSettings((s) => s.watchlist)
  const set = useSettings((s) => s.set)
  const list = watchlist?.[market] ?? []
  const toggle = (symbol: string) => {
    const cur = watchlist ?? { idx: [], crypto: [] }
    const next = list.includes(symbol) ? list.filter((s) => s !== symbol) : list.length < MAX_WATCH ? [...list, symbol] : list
    set({ watchlist: { ...cur, [market]: next } })
  }
  return { list, has: (s: string) => list.includes(s), toggle, full: list.length >= MAX_WATCH }
}
