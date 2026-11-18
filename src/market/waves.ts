// Elliott Wave count. Pure code, display only: like the chart patterns, the count is not part of the checklist score and is not
// backtested. Arrays are oldest first. Every rule and ratio below is a named constant so the count can be explained.
//
// How it works:
// 1. Swings come from an ATR zigzag: a swing ends once price reverses by ZIGZAG_ATR[k] × ATR(14). Each multiple is one wave
//    "degree" (small to large). The leg still running is kept as a provisional last point.
// 2. Every run of swings that ends at the running leg is labelled 0-1-2-3-4-5 (impulse), then A-B-C (correction), in both
//    directions. Counts that break a hard rule are dropped; the rest are scored by the guidelines they meet and how much they explain.
// 3. The best count gives the wave in progress, its Fibonacci levels and the price that would invalidate it.

import { atr, type Bar } from './indicators'
import type { Point } from './patterns'

/** Zigzag reversal sizes, in ATR(14) multiples, smallest degree first. */
export const ZIGZAG_ATR = [2, 3, 5] as const
/** The count's starting point (wave 0) must be within this many bars of today. */
export const WAVE_LOOKBACK = 300
/** Guideline ranges. Retracements are a fraction of the wave before; W3 and W5 are multiples of W1. */
export const W2_RETRACE = [0.382, 0.786] as const
export const W3_MIN = 1.618
export const W4_RETRACE = [0.236, 0.5] as const
export const W5_OF_W1 = [0.618, 1.618] as const
/** A ratio counts as meeting a Fibonacci guideline within this fraction of it. */
export const FIB_TOL = 0.1

export type WaveLabel = '0' | '1' | '2' | '3' | '4' | '5' | 'A' | 'B' | 'C'
const LABELS: WaveLabel[] = ['0', '1', '2', '3', '4', '5', 'A', 'B', 'C']

export interface WavePoint extends Point {
  label: WaveLabel
}
export type GuidelineId = 'w2Retrace' | 'w3Extended' | 'w4Retrace' | 'alternation' | 'w5Equality'
export interface Guideline {
  id: GuidelineId
  met: boolean
  /** The measured ratio, e.g. W2 retraced 0.55 of W1. */
  ratio: number
}
/** A Fibonacci level for the wave in progress: a target for waves 3, 5 and C, a support/resistance zone edge for 4, A and B. */
export interface WaveLevel {
  price: number
  /** e.g. '1.618 W1' or '0.382 W3'. */
  ref: string
}

export interface WaveCount {
  /** Direction of the impulse (waves 1, 3, 5). */
  dir: 'up' | 'down'
  /** Zigzag size used, in ATR multiples (the wave degree). */
  degree: number
  /** Wave 0 (the start) and every wave end. The last point is the running leg's extreme so far, not a confirmed turn. */
  points: WavePoint[]
  /** The wave still running (the last point's label). */
  current: WaveLabel
  /** Direction the current wave moves in. */
  currentDir: 'up' | 'down'
  /** A close beyond this breaks a hard rule and the count is wrong. */
  invalidation: number
  levels: WaveLevel[]
  /** Guidelines that could be checked on the finished waves. */
  guidelines: Guideline[]
}

interface Swing extends Point {
  kind: 'high' | 'low'
}

/** Alternating swing highs/lows where each leg moved at least `mult` × ATR(14). The last swing is the running leg's extreme. */
export function zigzag(bars: readonly Bar[], mult: number): Swing[] {
  const a = atr(bars)
  const start = a.findIndex((v) => v !== undefined)
  if (start < 0) return []
  const out: Swing[] = []
  let dir: 1 | -1 | 0 = 0
  let hi = start
  let lo = start
  let ext = start
  let thr = a[start]!
  for (let i = start + 1; i < bars.length; i++) {
    thr = mult * (a[i] ?? thr)
    const b = bars[i]
    if (dir === 0) {
      if (b.high > bars[hi].high) hi = i
      if (b.low < bars[lo].low) lo = i
      if (lo < hi && bars[hi].high - bars[lo].low >= thr) {
        out.push({ i: lo, price: bars[lo].low, kind: 'low' })
        dir = 1
        ext = hi
      } else if (hi < lo && bars[hi].high - bars[lo].low >= thr) {
        out.push({ i: hi, price: bars[hi].high, kind: 'high' })
        dir = -1
        ext = lo
      }
    } else if (dir === 1) {
      if (b.high > bars[ext].high) ext = i
      else if (bars[ext].high - b.low >= thr) {
        out.push({ i: ext, price: bars[ext].high, kind: 'high' })
        dir = -1
        ext = i
      }
    } else {
      if (b.low < bars[ext].low) ext = i
      else if (b.high - bars[ext].low >= thr) {
        out.push({ i: ext, price: bars[ext].low, kind: 'low' })
        dir = 1
        ext = i
      }
    }
  }
  if (dir === 1) out.push({ i: ext, price: bars[ext].high, kind: 'high' })
  if (dir === -1) out.push({ i: ext, price: bars[ext].low, kind: 'low' })
  return out
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo * (1 - FIB_TOL) && x <= hi * (1 + FIB_TOL)
const fmt = (r: number) => String(r)

/**
 * Labels `pts` (wave 0 first, the last one still running) as an impulse in direction `s` (+1 up, -1 down) followed by a correction.
 * Undefined when a hard rule is broken:
 * - wave 2 never retraces past the start of wave 1;
 * - wave 3 goes beyond the end of wave 1 and is never the shortest of 1, 3 and 5;
 * - wave 4 never enters wave 1's price range;
 * - wave 5 goes beyond the end of wave 3 (no truncation);
 * - wave B never goes beyond the end of wave 5.
 * A rule about the running leg's end only fails once its extreme so far already breaks it.
 * A count that has only reached wave 3 must also have a wave 2 within W2_RETRACE.
 */
export function labelCount(pts: readonly Point[], s: 1 | -1, degree: number): WaveCount | undefined {
  const n = pts.length - 1
  if (n < 3 || n > 8) return undefined
  const p = pts.map((x) => x.price)
  const len = (k: number) => Math.abs(p[k] - p[k - 1])
  const beyond = (a: number, b: number) => s * (a - b) > 0 // a is further in the impulse direction than b
  const done = (k: number) => k < n // wave k has finished (its end is a confirmed turn)

  if (!beyond(p[1], p[0]) || !beyond(p[2], p[0])) return undefined
  if (done(3) && !beyond(p[3], p[1])) return undefined
  if (n >= 4 && !beyond(p[4], p[1])) return undefined
  if (done(5) && (!beyond(p[5], p[3]) || (len(3) < len(1) && len(3) < len(5)))) return undefined
  if (n >= 7 && beyond(p[7], p[5])) return undefined

  const guidelines: Guideline[] = []
  const r2 = len(2) / len(1)
  guidelines.push({ id: 'w2Retrace', met: within(r2, W2_RETRACE), ratio: r2 })
  // With only waves 1 and 2 finished, almost any three swings fit the rules; ask for a textbook wave 2 before calling a wave 3.
  if (n === 3 && !guidelines[0].met) return undefined
  if (done(3)) {
    const r3 = len(3) / len(1)
    guidelines.push({ id: 'w3Extended', met: r3 >= W3_MIN * (1 - FIB_TOL), ratio: r3 })
  }
  if (done(4)) {
    const r4 = len(4) / len(3)
    guidelines.push({ id: 'w4Retrace', met: within(r4, W4_RETRACE), ratio: r4 })
    guidelines.push({ id: 'alternation', met: r2 > 0.5 !== r4 > 0.5, ratio: r4 / r2 })
  }
  if (done(5)) {
    const r5 = len(5) / len(1)
    guidelines.push({ id: 'w5Equality', met: within(r5, W5_OF_W1), ratio: r5 })
  }

  const current = LABELS[n]
  const up = (n % 2 === 1) === (s === 1)
  const at = (from: number, size: number, k: number, ref: string, sign: 1 | -1): WaveLevel => ({ price: from + sign * k * size, ref: `${fmt(k)} ${ref}` })
  const fwd = s
  const back = -s as 1 | -1
  let levels: WaveLevel[] = []
  let invalidation: number
  const w1 = len(1)
  switch (current) {
    case '3':
      levels = [1, 1.618, 2.618].map((k) => at(p[2], w1, k, 'W1', fwd))
      invalidation = p[0]
      break
    case '4':
      levels = [0.236, 0.382, 0.5].map((k) => at(p[3], len(3), k, 'W3', back))
      invalidation = p[1]
      break
    case '5': {
      levels = [0.618, 1].map((k) => at(p[4], w1, k, 'W1', fwd))
      levels.push(at(p[4], Math.abs(p[3] - p[0]), 0.618, 'W1-3', fwd))
      invalidation = p[1]
      break
    }
    case 'A':
    case 'B':
      levels = [0.382, 0.5, 0.618].map((k) => at(p[5], Math.abs(p[5] - p[0]), k, 'W1-5', back))
      invalidation = p[5]
      break
    case 'C':
      levels = [1, 1.618].map((k) => at(p[7], len(6), k, 'A', back))
      invalidation = p[5]
      break
    default:
      return undefined
  }
  levels.sort((a, b) => (up ? a.price - b.price : b.price - a.price))
  return {
    dir: s === 1 ? 'up' : 'down',
    degree,
    points: pts.map((x, k) => ({ i: x.i, price: x.price, label: LABELS[k] })),
    current,
    currentDir: up ? 'up' : 'down',
    invalidation,
    levels,
    guidelines,
  }
}

/** Guidelines met count most; each labelled wave adds half a point, so a count that explains more swings wins ties. */
const score = (c: WaveCount) => c.guidelines.filter((g) => g.met).length + 0.5 * (c.points.length - 1)

/** The best-scoring count over every degree and start that ends at the running leg, or undefined if none fits the rules. */
export function waveCount(bars: readonly Bar[]): WaveCount | undefined {
  const minStart = bars.length - 1 - WAVE_LOOKBACK
  let best: WaveCount | undefined
  for (const mult of ZIGZAG_ATR) {
    const sw = zigzag(bars, mult)
    for (let st = Math.max(0, sw.length - 9); st <= sw.length - 4; st++) {
      if (sw[st].i < minStart) continue
      const c = labelCount(sw.slice(st), sw[st].kind === 'low' ? 1 : -1, mult)
      // Later (larger) degrees win ties: the bigger picture is less noisy.
      if (c && (!best || score(c) >= score(best))) best = c
    }
  }
  return best
}
