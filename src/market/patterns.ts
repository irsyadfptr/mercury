// Chart and candlestick pattern detection. Pure code, display only: patterns are not part of the checklist score and are not
// backtested. Arrays are oldest first. Every rule below is a named constant so the shapes can be tuned and explained.

import { atr, type Bar } from './indicators'

/** Bars on each side a swing high/low must beat. A pivot is only known PIVOT_SPAN bars after it happens (no peeking). */
export const PIVOT_SPAN = 5
/** Two peaks (or troughs, or shoulders) count as "equal" within this fraction of their average. */
export const EQUAL_TOL = 0.03
/** A double top/bottom needs the trough/peak between the two tops to be at least this far from them. */
export const MIN_DEPTH = 0.05
/** The two tops of a double top/bottom must be at least this many bars apart. */
export const MIN_GAP = 10
/** Only patterns whose last pivot is within this many bars of today are reported. */
export const PATTERN_LOOKBACK = 120
/** Candlestick signals are reported for this many recent bars. */
export const CANDLE_LOOKBACK = 60
/** Bars before a candle used to decide "after a decline" / "after a rise". */
const TREND_BARS = 5

export type Bias = 'bull' | 'bear' | 'neutral'
export interface Point {
  i: number
  price: number
}
export interface Pivot extends Point {
  kind: 'high' | 'low'
}

/** Swing highs and lows, alternating (a run of same-kind pivots keeps only the most extreme one). */
export function pivots(bars: readonly Bar[], span = PIVOT_SPAN): Pivot[] {
  const out: Pivot[] = []
  const push = (p: Pivot) => {
    const prev = out[out.length - 1]
    if (prev?.kind !== p.kind) out.push(p)
    else if (p.kind === 'high' ? p.price > prev.price : p.price < prev.price) out[out.length - 1] = p
  }
  for (let i = span; i < bars.length - span; i++) {
    let hi = true
    let lo = true
    for (let j = i - span; j <= i + span && (hi || lo); j++) {
      if (j === i) continue
      // Ties: the earlier bar wins, so a flat top gives one pivot, not two.
      if (j < i ? bars[j].high >= bars[i].high : bars[j].high > bars[i].high) hi = false
      if (j < i ? bars[j].low <= bars[i].low : bars[j].low < bars[i].low) lo = false
    }
    if (hi) push({ i, price: bars[i].high, kind: 'high' })
    if (lo) push({ i, price: bars[i].low, kind: 'low' })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Chart patterns

export type ChartPatternId =
  | 'doubleTop'
  | 'doubleBottom'
  | 'headShoulders'
  | 'inverseHeadShoulders'
  | 'ascendingTriangle'
  | 'descendingTriangle'
  | 'symmetricalTriangle'

export interface PatternLine {
  from: Point
  to: Point
  kind: 'neckline' | 'upper' | 'lower'
}

export interface ChartPattern {
  id: ChartPatternId
  /** Direction once confirmed. A symmetrical triangle is neutral until it breaks out. */
  bias: Bias
  /** forming = shape is there, no close through the neckline/edge yet; confirmed = a close broke it. */
  status: 'forming' | 'confirmed'
  /** The pivots that outline the shape, oldest first. */
  points: Point[]
  lines: PatternLine[]
  /** Bar index of the first close through the neckline or triangle edge. */
  breakAt?: number
  /** Price level that confirms the pattern (the neckline or triangle edge, as of today or the break). */
  trigger: number
  /** Measured-move target: the pattern's height projected from the break. */
  target?: number
  /** Bar index of the last pivot. */
  end: number
}

const near = (a: number, b: number, tol = EQUAL_TOL) => Math.abs(a - b) <= tol * ((a + b) / 2)
/** Value at bar i on the straight line through two points. */
const lineAt = (a: Point, b: Point, i: number) => a.price + ((b.price - a.price) * (i - a.i)) / (b.i - a.i)

/** First bar after `from` whose close is beyond `level(i)` in direction `dir`; undefined if none yet. */
function firstClose(bars: readonly Bar[], from: number, dir: 'above' | 'below', level: (i: number) => number): number | undefined {
  for (let i = from + 1; i < bars.length; i++) if (dir === 'above' ? bars[i].close > level(i) : bars[i].close < level(i)) return i
  return undefined
}

/** Double top (H L H) or double bottom (L H L). Invalid once price closes beyond the tops before confirming. */
function doubles(bars: readonly Bar[], piv: readonly Pivot[]): ChartPattern[] {
  const out: ChartPattern[] = []
  for (let k = 0; k + 2 < piv.length; k++) {
    const [a, mid, b] = [piv[k], piv[k + 1], piv[k + 2]]
    const top = a.kind === 'high'
    if (b.i - a.i < MIN_GAP || !near(a.price, b.price)) continue
    const avg = (a.price + b.price) / 2
    if (Math.abs(avg - mid.price) / avg < MIN_DEPTH) continue
    const extreme = top ? Math.max(a.price, b.price) : Math.min(a.price, b.price)
    const breakAt = firstClose(bars, b.i, top ? 'below' : 'above', () => mid.price)
    const failAt = firstClose(bars, b.i, top ? 'above' : 'below', () => extreme * (top ? 1 + EQUAL_TOL : 1 - EQUAL_TOL))
    if (failAt !== undefined && (breakAt === undefined || failAt < breakAt)) continue
    const end = breakAt ?? bars.length - 1
    out.push({
      id: top ? 'doubleTop' : 'doubleBottom',
      bias: top ? 'bear' : 'bull',
      status: breakAt === undefined ? 'forming' : 'confirmed',
      points: [a, mid, b],
      lines: [{ from: { i: a.i, price: mid.price }, to: { i: end, price: mid.price }, kind: 'neckline' }],
      breakAt,
      trigger: mid.price,
      target: mid.price - (avg - mid.price),
      end: b.i,
    })
  }
  return out
}

/** Head and shoulders (H L H L H, middle highest) or the inverse (L H L H L, middle lowest), neckline through the two inner pivots. */
function headShoulders(bars: readonly Bar[], piv: readonly Pivot[]): ChartPattern[] {
  const out: ChartPattern[] = []
  for (let k = 0; k + 4 < piv.length; k++) {
    const [ls, n1, head, n2, rs] = piv.slice(k, k + 5)
    const top = ls.kind === 'high'
    const s = top ? 1 : -1
    // Head beyond both shoulders by more than the tolerance; shoulders roughly level.
    if (!(s * (head.price - ls.price) > EQUAL_TOL * ls.price && s * (head.price - rs.price) > EQUAL_TOL * rs.price)) continue
    if (!near(ls.price, rs.price, 2 * EQUAL_TOL)) continue
    const neck = (i: number) => lineAt(n1, n2, i)
    const breakAt = firstClose(bars, rs.i, top ? 'below' : 'above', neck)
    const failAt = firstClose(bars, rs.i, top ? 'above' : 'below', () => head.price)
    if (failAt !== undefined && (breakAt === undefined || failAt < breakAt)) continue
    const end = breakAt ?? bars.length - 1
    const trigger = neck(end)
    out.push({
      id: top ? 'headShoulders' : 'inverseHeadShoulders',
      bias: top ? 'bear' : 'bull',
      status: breakAt === undefined ? 'forming' : 'confirmed',
      points: [ls, n1, head, n2, rs],
      lines: [{ from: { i: ls.i, price: neck(ls.i) }, to: { i: end, price: trigger }, kind: 'neckline' }],
      breakAt,
      trigger,
      target: trigger - (head.price - neck(head.i)),
      end: rs.i,
    })
  }
  return out
}

/**
 * Triangles from the last two swing highs and the last two swing lows, all within the lookback.
 * Flat = the two pivots within the tolerance; the lines must be converging.
 */
function triangle(bars: readonly Bar[], piv: readonly Pivot[]): ChartPattern | undefined {
  const last = bars.length - 1
  const recent = piv.filter((p) => p.i >= last - PATTERN_LOOKBACK)
  const highs = recent.filter((p) => p.kind === 'high').slice(-2)
  const lows = recent.filter((p) => p.kind === 'low').slice(-2)
  if (highs.length < 2 || lows.length < 2) return undefined
  const [h1, h2] = highs
  const [l1, l2] = lows
  const flatTop = near(h1.price, h2.price)
  const flatBottom = near(l1.price, l2.price)
  const falling = !flatTop && h2.price < h1.price
  const rising = !flatBottom && l2.price > l1.price
  const id: ChartPatternId | undefined =
    flatTop && rising ? 'ascendingTriangle' : flatBottom && falling ? 'descendingTriangle' : falling && rising ? 'symmetricalTriangle' : undefined
  if (!id) return undefined
  const upper = (i: number) => (flatTop ? (h1.price + h2.price) / 2 : lineAt(h1, h2, i))
  const lower = (i: number) => (flatBottom ? (l1.price + l2.price) / 2 : lineAt(l1, l2, i))
  const start = Math.min(h1.i, l1.i)
  const end = Math.max(h2.i, l2.i)
  // The edges must still be apart at the last pivot (not already crossed).
  if (upper(end) <= lower(end)) return undefined
  const up = firstClose(bars, end, 'above', upper)
  const down = firstClose(bars, end, 'below', lower)
  const breakAt = up === undefined ? down : down === undefined ? up : Math.min(up, down)
  const brokeUp = breakAt !== undefined && breakAt === up
  const lineEnd = breakAt ?? last
  const height = upper(start) - lower(start)
  const bias: Bias = breakAt !== undefined ? (brokeUp ? 'bull' : 'bear') : id === 'ascendingTriangle' ? 'bull' : id === 'descendingTriangle' ? 'bear' : 'neutral'
  const trigger = breakAt !== undefined ? (brokeUp ? upper(breakAt) : lower(breakAt)) : bias === 'bear' ? lower(last) : upper(last)
  return {
    id,
    bias,
    status: breakAt === undefined ? 'forming' : 'confirmed',
    points: [...highs, ...lows].sort((a, b) => a.i - b.i),
    lines: [
      { from: { i: h1.i, price: upper(h1.i) }, to: { i: lineEnd, price: upper(lineEnd) }, kind: 'upper' },
      { from: { i: l1.i, price: lower(l1.i) }, to: { i: lineEnd, price: lower(lineEnd) }, kind: 'lower' },
    ],
    breakAt,
    trigger,
    target: bias === 'neutral' ? undefined : trigger + (bias === 'bull' ? height : -height),
    end,
  }
}

/** Chart patterns ending in the last PATTERN_LOOKBACK bars, at most one per type (the most recent), newest first. */
export function chartPatterns(bars: readonly Bar[], piv: readonly Pivot[] = pivots(bars)): ChartPattern[] {
  const minEnd = bars.length - 1 - PATTERN_LOOKBACK
  const latest = new Map<ChartPatternId, ChartPattern>()
  for (const p of [...doubles(bars, piv), ...headShoulders(bars, piv)]) {
    if (p.end < minEnd) continue
    const prev = latest.get(p.id)
    if (!prev || p.end > prev.end) latest.set(p.id, p)
  }
  const tri = triangle(bars, piv)
  if (tri) latest.set(tri.id, tri)
  return [...latest.values()].sort((a, b) => b.end - a.end)
}

// ---------------------------------------------------------------------------------------------------------------------
// Candlestick patterns

export type CandleId = 'bullEngulfing' | 'bearEngulfing' | 'hammer' | 'shootingStar' | 'morningStar' | 'eveningStar'
export interface CandleSignal {
  id: CandleId
  i: number
  bias: Bias
}
export const CANDLE_BIAS: Record<CandleId, Bias> = {
  bullEngulfing: 'bull',
  bearEngulfing: 'bear',
  hammer: 'bull',
  shootingStar: 'bear',
  morningStar: 'bull',
  eveningStar: 'bear',
}

/** A wick at least this many times the body; the other wick at most WICK_OTHER × body. */
const WICK_LONG = 2
const WICK_OTHER = 0.5
/** Body ≥ this many ATRs counts as a big candle (stars); ≤ STAR_BODY of the first candle's body is a small middle star. */
const BIG_BODY_ATR = 0.6
const STAR_BODY = 0.3

/** Candle signals in the last `lookback` bars, oldest first. Reversal shapes only count after a matching move (5-bar close change). */
export function candlePatterns(bars: readonly Bar[], lookback = CANDLE_LOOKBACK): CandleSignal[] {
  const a = atr(bars)
  const out: CandleSignal[] = []
  for (let i = Math.max(TREND_BARS + 2, bars.length - lookback); i < bars.length; i++) {
    const [b, p, pp] = [bars[i], bars[i - 1], bars[i - 2]]
    const body = Math.abs(b.close - b.open)
    const upper = b.high - Math.max(b.open, b.close)
    const lower = Math.min(b.open, b.close) - b.low
    // Trend into the pattern: judged before the pattern's first candle.
    const before = (n: number) => bars[i - n].close - bars[i - n - TREND_BARS].close
    const down1 = before(1) < 0
    const up1 = before(1) > 0
    const add = (id: CandleId) => out.push({ id, i, bias: CANDLE_BIAS[id] })
    const pBull = p.close > p.open
    const pBear = p.close < p.open

    if (pBear && b.close > b.open && b.open <= p.close && b.close >= p.open && body > Math.abs(p.close - p.open) && down1) add('bullEngulfing')
    else if (pBull && b.close < b.open && b.open >= p.close && b.close <= p.open && body > Math.abs(p.close - p.open) && up1) add('bearEngulfing')
    else if (body > 0 && lower >= WICK_LONG * body && upper <= WICK_OTHER * body && down1) add('hammer')
    else if (body > 0 && upper >= WICK_LONG * body && lower <= WICK_OTHER * body && up1) add('shootingStar')

    const at = a[i - 2]
    if (at === undefined) continue
    const ppBody = Math.abs(pp.close - pp.open)
    const pBody = Math.abs(p.close - p.open)
    const mid = (pp.open + pp.close) / 2
    if (pp.close < pp.open && ppBody >= BIG_BODY_ATR * at && pBody <= STAR_BODY * ppBody && b.close > b.open && b.close > mid && before(2) < 0) add('morningStar')
    else if (pp.close > pp.open && ppBody >= BIG_BODY_ATR * at && pBody <= STAR_BODY * ppBody && b.close < b.open && b.close < mid && before(2) > 0) add('eveningStar')
  }
  return out
}

/** Everything the chart and the list need, computed once per history. */
export function analyzePatterns(bars: readonly Bar[]) {
  const piv = pivots(bars)
  return { pivots: piv, chart: chartPatterns(bars, piv), candles: candlePatterns(bars) }
}
export type PatternAnalysis = ReturnType<typeof analyzePatterns>
