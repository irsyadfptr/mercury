import { BaselineSeries, CandlestickSeries, createChart, LineSeries, LineStyle, type AutoscaleInfo } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { sma, type Bar, type Check } from '@/market/indicators'
import { useSettings } from '@/settings'

/** CSS token → 'rgb(r, g, b)'. lightweight-charts can't read var() or oklch, so paint it once and read the pixel back. */
function tokenColor(name: string): string {
  const c = document.createElement('canvas').getContext('2d')!
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/** Daily candles (last year) with MA50/MA200 and the suggested stop and targets as dashed lines. */
export function PriceChart({ bars, check, label }: { bars: Bar[]; check: Check; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const [text, border, up, down, accent, muted] = ['--text', '--border', '--up', '--down', '--accent', '--text-muted'].map(tokenColor)
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: text, fontFamily: 'Geist Mono Variable, monospace' },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceFormat: { type: 'price', precision: 0, minMove: 1 },
      // Stretch the price axis so the stop and 3R target lines are always in view.
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const r = base()
        if (!r?.priceRange) return r
        const { minValue, maxValue } = r.priceRange
        return { ...r, priceRange: { minValue: Math.min(minValue, check.stop ?? minValue), maxValue: Math.max(maxValue, check.target3 ?? maxValue) } }
      },
    })
    candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    const closes = bars.map((b) => b.close)
    for (const [n, color] of [[50, accent], [200, muted]] as const) {
      const ma = sma(closes, n)
      chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(
        bars.flatMap((b, i) => (ma[i] === undefined ? [] : [{ time: b.time, value: ma[i]! }])),
      )
    }
    const line = (price: number | undefined, title: string, color: string) =>
      price !== undefined && candles.createPriceLine({ price, title, color, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true })
    // Buy zone: a shaded band over the last 20 bars, with its edges labelled on the price axis.
    if (check.buyZone) {
      const { low, high } = check.buyZone
      const fill = accent.replace('rgb(', 'rgba(').replace(')', ', 0.25)')
      chart
        .addSeries(BaselineSeries, {
          baseValue: { type: 'price', price: low },
          topLineColor: accent,
          topFillColor1: fill,
          topFillColor2: fill,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        .setData(bars.slice(-20).map((b) => ({ time: b.time, value: high })))
      line(high, 'BUY', accent)
      line(low, 'BUY', accent)
    }
    line(check.stop, 'STOP', down)
    line(check.target2, '2R', up)
    line(check.target3, '3R', up)
    // Show the last year; MA200 still uses the full two years behind it.
    if (bars.length > 250) chart.timeScale().setVisibleLogicalRange({ from: bars.length - 250, to: bars.length })
    return () => chart.remove()
  }, [bars, check, theme])

  return <div ref={ref} role="img" aria-label={label} className="h-[320px] w-full" />
}
