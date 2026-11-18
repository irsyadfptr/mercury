import {
  BaselineSeries,
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type AutoscaleInfo,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { sma, type Bar } from '@/market/indicators'
import type { Bias, ChartPattern, PatternAnalysis } from '@/market/patterns'
import type { WaveCount } from '@/market/waves'
import { useSettings } from '@/settings'

/** Price levels drawn as dashed lines: an optional buy zone, a stop and any targets. */
export interface ChartLevels {
  zone?: { low: number; high: number }
  stop?: number
  targets: { price: number; title: string }[]
}

/** The one pattern the user picked from the list: a chart pattern by id, or a candle signal by bar index. */
export type Focus = { kind: 'chart' | 'candle'; key: string } | undefined

/** CSS token → 'rgb(r, g, b)'. lightweight-charts can't read var() or oklch, so paint it once and read the pixel back. */
function tokenColor(name: string): string {
  const c = document.createElement('canvas').getContext('2d')!
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}
const alpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`)
/** Bars shown before the user scrolls: about a year of daily bars. */
const VISIBLE_BARS = 250
/** Bars of context around a picked pattern. */
const FOCUS_PAD = 15
const WIB_S = 7 * 3600

/**
 * Candles with MA50/MA200 of the bar size shown, and the buy zone, stop and targets (`levels`) as dashed lines.
 * `step` = the price step, for the axis decimals. Hourly bars (ISO times) are plotted in WIB.
 * Patterns: with no focus, every chart pattern is a thin unlabelled outline and candle signals are small arrows. With a focus, only
 * that pattern is drawn, bold and labelled with its break and target, and the view zooms to it.
 */
export function PriceChart({
  bars,
  levels,
  label,
  step,
  zoneBand = true,
  patterns,
  focus,
  labels,
  wave,
}: {
  bars: Bar[]
  levels: ChartLevels
  label: string
  step: number
  /** Shade the buy zone over the last 20 bars (daily view only; on other bar sizes only its edges are drawn). */
  zoneBand?: boolean
  patterns?: PatternAnalysis
  focus?: Focus
  /** Pattern or candle id → the short text shown on the chart. */
  labels?: (id: string) => string
  /** Elliott wave count: drawn as a labelled line through the wave ends, with its Fibonacci levels and invalidation price. */
  wave?: WaveCount
}) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    const el = ref.current
    if (!el || bars.length === 0) return
    const [text, border, up, down, accent, muted, warn] = ['--text', '--border', '--up', '--down', '--accent', '--text-muted', '--warn'].map(tokenColor)
    const intraday = bars[0].time.length > 10
    const at = (i: number): Time => {
      const t = bars[Math.min(i, bars.length - 1)].time
      return intraday ? ((Date.parse(t) / 1000 + WIB_S) as UTCTimestamp) : t
    }
    const focusChart = focus?.kind === 'chart' ? patterns?.chart.find((p) => p.id === focus.key) : undefined
    const focusCandle = focus?.kind === 'candle' ? patterns?.candles.find((c) => String(c.i) === focus.key) : undefined
    const focused = !!(focusChart || focusCandle)

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: text, fontFamily: 'Geist Mono Variable, monospace' },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: intraday, secondsVisible: false, rightOffset: wave ? 4 : 0 },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: 'price', precision: Math.max(0, -Math.floor(Math.log10(step))), minMove: step },
      // Stretch the price axis so the lines drawn are in view: the stop and 3R target, or a picked pattern's trigger and target.
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const r = base()
        if (!r?.priceRange || focusCandle) return r
        const extra: (number | undefined)[] = focusChart
          ? [focusChart.trigger, focusChart.target]
          : [levels.stop, ...levels.targets.map((x) => x.price), wave?.invalidation, ...(wave?.levels.slice(0, 2).map((x) => x.price) ?? [])]
        const known = extra.filter((v): v is number => v !== undefined)
        const { minValue, maxValue } = r.priceRange
        return { ...r, priceRange: { minValue: Math.min(minValue, ...known), maxValue: Math.max(maxValue, ...known) } }
      },
    })
    candles.setData(bars.map(({ open, high, low, close }, i) => ({ time: at(i), open, high, low, close })))
    const closes = bars.map((b) => b.close)
    for (const [n, color] of [[50, accent], [200, muted]] as const) {
      const ma = sma(closes, n)
      chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(
        bars.flatMap((_, i) => (ma[i] === undefined ? [] : [{ time: at(i), value: ma[i]! }])),
      )
    }
    const line = (price: number | undefined, title: string, color: string, style = LineStyle.Dashed) =>
      price !== undefined && candles.createPriceLine({ price, title, color, lineStyle: style, lineWidth: 1, axisLabelVisible: true })
    if (!focused) {
      if (levels.zone) {
        const { low, high } = levels.zone
        if (zoneBand) {
          const fill = alpha(accent, 0.25)
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
            .setData(bars.slice(-20).map((_, k) => ({ time: at(Math.max(0, bars.length - 20) + k), value: high })))
        }
        line(high, 'BUY', accent)
        line(low, 'BUY', accent)
      }
      line(levels.stop, 'STOP', down)
      for (const x of levels.targets) line(x.price, x.title, up)
    }

    const markers: SeriesMarker<Time>[] = []
    if (wave && !focused) {
      // Wave ends joined by a line; the label sits above a high and below a low. The last point is still moving.
      const color = wave.dir === 'up' ? up : down
      chart
        .addSeries(LineSeries, { color: alpha(color, 0.9), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true })
        .setData(wave.points.map((pt) => ({ time: at(pt.i), value: pt.price })))
      wave.points.forEach((pt, k) => {
        const high = k === 0 ? pt.price >= wave.points[1].price : pt.price >= wave.points[k - 1].price
        const text = k === wave.points.length - 1 ? `(${pt.label})` : pt.label
        markers.push({ time: at(pt.i), position: high ? 'aboveBar' : 'belowBar', shape: 'circle', color, text, size: 0 })
      })
      line(wave.invalidation, labels?.('waveInvalid') ?? 'invalid', warn, LineStyle.Dotted)
      for (const l of wave.levels) line(l.price, l.ref, muted, LineStyle.SparseDotted)
    }
    if (patterns) {
      const tone: Record<Bias, string> = { bull: up, bear: down, neutral: warn }
      const draw = (p: ChartPattern, bold: boolean) => {
        const color = bold ? tone[p.bias] : alpha(tone[p.bias], p.status === 'reached' ? 0.45 : 0.75)
        const opts = { color, lineWidth: (bold ? 2 : 1) as 1 | 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: bold }
        chart.addSeries(LineSeries, opts).setData(p.points.map((pt) => ({ time: at(pt.i), value: pt.price })))
        for (const l of p.lines)
          if (l.from.i < l.to.i)
            chart
              .addSeries(LineSeries, { ...opts, lineWidth: 1, lineStyle: LineStyle.Dotted, pointMarkersVisible: false })
              .setData([{ time: at(l.from.i), value: l.from.price }, { time: at(l.to.i), value: l.to.price }])
      }
      if (focusChart) {
        const p = focusChart
        const color = tone[p.bias]
        draw(p, true)
        // Label at the pattern's first point: the newest bars sit against the price axis, which would clip it.
        const first = p.points[0]
        markers.push({ time: at(first.i), position: first.price >= bars[first.i].close ? 'aboveBar' : 'belowBar', shape: 'circle', color, text: labels?.(p.id) ?? p.id, size: 0 })
        if (p.breakAt !== undefined)
          markers.push({ time: at(p.breakAt), position: p.bias === 'bear' ? 'aboveBar' : 'belowBar', shape: p.bias === 'bear' ? 'arrowDown' : 'arrowUp', color, text: labels?.('break') ?? 'break' })
        if (p.targetHitAt !== undefined) markers.push({ time: at(p.targetHitAt), position: p.bias === 'bear' ? 'belowBar' : 'aboveBar', shape: 'circle', color, size: 0.6 })
        line(p.trigger, labels?.('trigger') ?? 'trigger', color, LineStyle.Dotted)
        line(p.target, labels?.('target') ?? 'target', color)
      } else if (focusCandle) {
        const c = focusCandle
        markers.push({ time: at(c.i), position: c.bias === 'bear' ? 'aboveBar' : 'belowBar', shape: c.bias === 'bear' ? 'arrowDown' : 'arrowUp', color: tone[c.bias], text: labels?.(c.id) ?? c.id, size: 1.5 })
      } else {
        for (const p of patterns.chart) draw(p, false)
        // Candle signals: bare arrows (named in the list under the chart), so a busy stretch stays readable.
        for (const c of patterns.candles)
          markers.push({ time: at(c.i), position: c.bias === 'bear' ? 'aboveBar' : 'belowBar', shape: c.bias === 'bear' ? 'arrowDown' : 'arrowUp', color: tone[c.bias], size: 0.7 })
      }
    }
    // Markers must be in time order.
    if (markers.length > 0) createSeriesMarkers(candles, markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)))

    // Zoom: to the picked pattern with some context, else the latest VISIBLE_BARS (MAs still use the history behind them).
    const n = bars.length
    if (focusChart) {
      const p = focusChart
      const last = Math.max(p.end, p.breakAt ?? 0, p.targetHitAt ?? 0)
      chart.timeScale().setVisibleLogicalRange({ from: p.points[0].i - FOCUS_PAD, to: Math.min(n + 2, last + FOCUS_PAD) })
    } else if (focusCandle) {
      chart.timeScale().setVisibleLogicalRange({ from: focusCandle.i - 40, to: Math.min(n + 2, focusCandle.i + 20) })
    } else if (n > VISIBLE_BARS) chart.timeScale().setVisibleLogicalRange({ from: n - VISIBLE_BARS, to: n + (wave ? 4 : 0) })
    return () => chart.remove()
  }, [bars, levels, theme, step, zoneBand, patterns, focus, labels, wave])

  return <div ref={ref} role="img" aria-label={label} className="h-[320px] w-full" />
}
