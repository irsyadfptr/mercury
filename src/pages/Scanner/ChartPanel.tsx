import { useCallback, useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui-bits'
import { useI18n } from '@/i18n'
import type { Bar } from '@/market/indicators'
import { analyzePatterns, type Bias, type PatternAnalysis } from '@/market/patterns'
import type { Key } from '@/types'
import { frameCache } from './frameCache'
import { PriceChart, type ChartLevels, type Focus } from './PriceChart'

const TIMEFRAMES = ['1h', '4h', '1d', '1w', '1M'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]
export type { ChartLevels }
/** Loads bars for a bar size other than daily. */
export type FrameLoader = (tf: Exclude<Timeframe, '1d'>) => Promise<Bar[]>

const BIAS_CLASS: Record<Bias, string> = { bull: 'text-up', bear: 'text-down', neutral: 'text-warn-text' }
const WIB_MS = 7 * 3600_000

/**
 * The price chart with a timeframe switch and the chart pattern list. The checklist, stop and targets always come from the daily
 * bars; other timeframes only change the candles, moving averages and patterns drawn. Tapping a pattern shows just that one, zoomed in.
 */
export function ChartPanel({
  symbol,
  daily,
  levels,
  step,
  price,
  loadFrame,
  cacheKey,
  initialTf = '1d',
  levelsNote = 'chart.levelsDaily',
}: {
  symbol: string
  daily: Bar[]
  levels: ChartLevels
  step: number
  price: (n: number | undefined) => string
  loadFrame: FrameLoader
  /** Unique per market + ticker + last daily bar, for the frame cache. */
  cacheKey: string
  /** The bar size shown first (its bars must be loadable, or '1d'). */
  initialTf?: Timeframe
  /** Shown when the bar size differs from the one the levels came from. */
  levelsNote?: Key
}) {
  const { t } = useI18n()
  const [tf, setTf] = useState<Timeframe>(initialTf)
  const [status, setStatus] = useState<Partial<Record<Timeframe, 'loading' | 'error'>>>({})
  const [, rerender] = useState(0)
  const [showPatterns, setShowPatterns] = useState(true)
  const [focus, setFocus] = useState<Focus>()

  const pick = (next: Timeframe) => {
    setTf(next)
    setFocus(undefined)
    if (next === '1d' || frameCache.has(`${cacheKey}:${next}`) || status[next] === 'loading') return
    setStatus((s) => ({ ...s, [next]: 'loading' }))
    loadFrame(next)
      .then((bars) => {
        frameCache.set(`${cacheKey}:${next}`, bars)
        setStatus((s) => ({ ...s, [next]: undefined }))
        rerender((n) => n + 1)
      })
      .catch(() => setStatus((s) => ({ ...s, [next]: 'error' })))
  }

  // A non-daily first bar size is loaded once, when the panel opens.
  useEffect(() => {
    if (initialTf !== '1d') pick(initialTf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; the panel is keyed by ticker
  }, [])
  const bars = tf === '1d' ? daily : frameCache.get(`${cacheKey}:${tf}`)
  const patterns = useMemo(() => (bars && bars.length > 0 ? analyzePatterns(bars) : undefined), [bars])
  const labels = useCallback((id: string) => t(`pat.short.${id}` as Key), [t])
  const toggleFocus = (f: Focus) => setFocus((cur) => (cur && f && cur.kind === f.kind && cur.key === f.key ? undefined : f))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t('chart.timeframe')} className="flex gap-1 rounded-md border border-border p-1">
          {TIMEFRAMES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === tf}
              onClick={() => pick(id)}
              className={`rounded px-2.5 py-1 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${id === tf ? 'bg-primary text-primary-foreground' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}
            >
              {t(`chart.tf.${id}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showPatterns} onChange={(e) => setShowPatterns(e.target.checked)} className="accent-[var(--accent)]" />
          {t('pat.toggle')}
        </label>
      </div>
      {tf !== initialTf && <p className="text-xs text-text-muted">{t(levelsNote)}</p>}

      {status[tf] === 'error' ? (
        <p className="flex h-[320px] items-center justify-center rounded-md border border-border text-sm text-down">{t('chart.loadFailed')}</p>
      ) : !bars ? (
        <p className="flex h-[320px] items-center justify-center rounded-md border border-border text-sm text-text-muted">{t('chart.loading')}</p>
      ) : (
        <PriceChart
          bars={bars}
          levels={levels}
          label={t('scan.chartLabelTf', { s: symbol, tf: t(`chart.tf.${tf}`) })}
          step={step}
          zoneBand={tf === '1d'}
          patterns={showPatterns ? patterns : undefined}
          focus={showPatterns ? focus : undefined}
          labels={labels}
        />
      )}
      {showPatterns && bars && patterns && <PatternList bars={bars} patterns={patterns} price={price} focus={focus} onFocus={toggleFocus} />}
    </div>
  )
}

/** Chart patterns and recent candle signals, newest first. Rows are buttons: tapping one shows it alone on the chart. */
function PatternList({
  bars,
  patterns,
  price,
  focus,
  onFocus,
}: {
  bars: Bar[]
  patterns: PatternAnalysis
  price: (n: number | undefined) => string
  focus: Focus
  onFocus: (f: Focus) => void
}) {
  const { t, day } = useI18n()
  // Daily and longer bars carry a date; hourly bars an ISO time, shown in WIB.
  const when = (time: string) => {
    if (time.length <= 10) return day(time)
    const wib = new Date(Date.parse(time) + WIB_MS).toISOString()
    return `${day(wib.slice(0, 10))} ${wib.slice(11, 16)}`
  }
  const candles = [...patterns.candles].reverse()
  const row = (selected: boolean) =>
    `flex w-full flex-wrap items-center gap-x-3 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${selected ? 'bg-accent-soft' : 'hover:bg-surface-2'}`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>{t('pat.title')}</Label>
        {(patterns.chart.length > 0 || candles.length > 0) && <span className="text-xs text-text-muted">{t(focus ? 'pat.tapAgain' : 'pat.tapHint')}</span>}
      </div>
      {patterns.chart.length === 0 && candles.length === 0 ? (
        <p className="text-sm text-text-muted">{t('pat.none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
          {patterns.chart.map((p) => {
            const selected = focus?.kind === 'chart' && focus.key === p.id
            return (
              <li key={p.id}>
                <button type="button" aria-pressed={selected} onClick={() => onFocus({ kind: 'chart', key: p.id })} className={row(selected)}>
                  <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${BIAS_CLASS[p.bias]}`}>{t(`pat.bias.${p.bias}`)}</span>
                  <span className="flex-1">
                    {t(`pat.${p.id}`)} <span className={`rounded px-1.5 py-px font-label text-[11px] uppercase ${p.status === 'forming' ? 'bg-surface-2 text-text-muted' : 'bg-accent-soft text-accent-text'}`}>{t(`pat.status.${p.status}`)}</span>
                  </span>
                  <span className="w-full pl-[4.25rem] font-mono text-xs text-text-muted sm:w-auto sm:pl-0">
                    {p.breakAt !== undefined ? t('pat.broke', { d: when(bars[p.breakAt].time), p: price(p.trigger) }) : t('pat.watch', { p: price(p.trigger), d: when(bars[p.end].time) })}
                    {p.target !== undefined && ` · ${t(p.targetHitAt !== undefined ? 'pat.targetHit' : 'pat.target', { p: price(p.target), d: p.targetHitAt !== undefined ? when(bars[p.targetHitAt].time) : '' })}`}
                  </span>
                </button>
              </li>
            )
          })}
          {candles.map((c) => {
            const key = String(c.i)
            const selected = focus?.kind === 'candle' && focus.key === key
            return (
              <li key={`${c.id}-${c.i}`}>
                <button type="button" aria-pressed={selected} onClick={() => onFocus({ kind: 'candle', key })} className={row(selected)}>
                  <span className={`w-14 shrink-0 font-label text-[11px] uppercase ${BIAS_CLASS[c.bias]}`}>{t(`pat.bias.${c.bias}`)}</span>
                  <span className="flex-1">{t(`pat.${c.id}`)}</span>
                  <span className="font-mono text-xs text-text-muted">{when(bars[c.i].time)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-text-muted">{t('pat.note')}</p>
    </div>
  )
}
