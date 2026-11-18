import { useI18n } from '@/i18n'
import { useWatchlist, type WatchMarket } from '@/watchlist'

/** ☆ / ★ toggle: adds the ticker to the watchlist, so every scan includes it. */
export function WatchButton({ market, symbol }: { market: WatchMarket; symbol: string }) {
  const { t } = useI18n()
  const w = useWatchlist(market)
  const on = w.has(symbol)
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!on && w.full}
      onClick={() => w.toggle(symbol)}
      title={t(on ? 'watch.remove' : w.full ? 'watch.full' : 'watch.add')}
      className={`rounded border px-2 py-0.5 font-label text-[11px] uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 ${on ? 'border-warn bg-warn-soft text-warn-text' : 'border-border text-text-muted hover:bg-surface-2 hover:text-text'}`}
    >
      {on ? `★ ${t('watch.on')}` : `☆ ${t('watch.off')}`}
    </button>
  )
}
