import { BaselineSeries, CandlestickSeries, createChart, createSeriesMarkers, LineSeries, LineStyle, type AutoscaleInfo, type SeriesMarker, type Time } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { sma, type Bar, type Check } from '@/market/indicators'
import type { Bias, PatternAnalysis } from '@/market/patterns'
import { useSettings } from '@/settings'

/** CSS token → 'rgb(r, g, b)'. lightweight-charts can't read var() or oklch, so paint it once and read the pixel back. */
function tokenColor(name: string): string {
  const c = document.createElement('canvas').getContext('2d')!
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Daily candles (last year) with MA50/MA200, the buy zone, and the stop and targets as dashed lines. `step` = the price step, for the axis decimals.
 * With `patterns`, chart patterns are drawn as an outline through their pivots plus their neckline/edges, and candle signals as markers.
 * `labels` turns a pattern or candle id into the short text shown on the chart.
 */
export function PriceChart({ bars, check, label, step, patterns, labels }: { bars: Bar[]; check: Check; label: string; step: number; patterns?: PatternAnalysis; labels?: (id: string) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const [text, border, up, down, accent, muted, warn] = ['--text', '--border', '--up', '--down', '--accent', '--text-muted', '--warn'].map(tokenColor)
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: text, fontFamily: 'Geist Mono Variable, monospace' },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceFormat: { type: 'price', precision: Math.max(0, -Math.floor(Math.log10(step))), minMove: step },
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
    if (patterns) {
      const tone: Record<Bias, string> = { bull: up, bear: down, neutral: warn }
      const at = (i: number) => bars[Math.min(i, bars.length - 1)].time
      const markers: SeriesMarker<Time>[] = []
      for (const p of patterns.chart) {
        const color = tone[p.bias]
        const opts = { color, lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true }
        chart.addSeries(LineSeries, opts).setData(p.points.map((pt) => ({ time: at(pt.i), value: pt.price })))
        for (const l of p.lines)
          chart
            .addSeries(LineSeries, { ...opts, lineWidth: 1, lineStyle: LineStyle.Dotted, pointMarkersVisible: false })
            .setData(l.from.i === l.to.i ? [] : [{ time: at(l.from.i), value: l.from.price }, { time: at(l.to.i), value: l.to.price }])
        const last = p.points[p.points.length - 1]
        markers.push({ time: at(last.i), position: last.price >= bars[last.i].close ? 'aboveBar' : 'belowBar', shape: 'circle', color, text: labels?.(p.id) ?? p.id, size: 0 })
        if (p.breakAt !== undefined)
          markers.push({ time: at(p.breakAt), position: p.bias === 'bear' ? 'aboveBar' : 'belowBar', shape: p.bias === 'bear' ? 'arrowDown' : 'arrowUp', color, text: labels?.('break') ?? 'break' })
      }
      for (const c of patterns.candles)
        markers.push({ time: at(c.i), position: c.bias === 'bear' ? 'aboveBar' : 'belowBar', shape: c.bias === 'bear' ? 'arrowDown' : 'arrowUp', color: tone[c.bias], text: labels?.(c.id) ?? c.id })
      // Markers must be in time order.
      createSeriesMarkers(candles, markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)))
    }
    // Show the last year; MA200 still uses the full two years behind it.
    if (bars.length > 250) chart.timeScale().setVisibleLogicalRange({ from: bars.length - 250, to: bars.length })
    return () => chart.remove()
  }, [bars, check, theme, step, patterns, labels])

  return <div ref={ref} role="img" aria-label={label} className="h-[320px] w-full" />
}
