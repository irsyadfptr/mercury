// Elliott Wave count. Pure code, display only: like the chart patterns, the count is not part of the checklist score and is not
// backtested. Arrays are oldest first. Every rule and ratio below is a named constant so the count can be explained.
//
// How it works:
// 1. Swings come from an ATR zigzag: a swing ends once price reverses by ZIGZAG_ATR[k] × ATR(14). Each multiple is one wave
//    "degree" (small to large). The leg still running is kept as a provisional last point.
// 2. Every run of swings that ends at the running leg is labelled 0-1-2-3-4-5 (impulse), then A-B-C (correction), in both
//    directions. Counts that break a hard rule are dropped; the rest are scored by the guidelines they meet and how much they explain.
// 3. The best count gives the wave in progress, per-wave numbers, its Fibonacci levels, the price that would invalidate it and,
//    for waves that set up a with-trend move, a risk/reward sketch. The best count of a different shape is kept as the alternate.

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
/** Every guideline the count can meet; confidence = met / this. */
export const GUIDELINE_COUNT = 5

/** Fibonacci multiples behind each wave's levels. */
export const FIB = {
  w3: [1, 1.618, 2.618],
  w4: [0.236, 0.382, 0.5],
  w5: [0.618, 1],
  w5of13: 0.618,
  a: [0.382, 0.5, 0.618],
  b: [0.5, 0.618, 0.786],
  c: [0.618, 1, 1.618],
} as const

export type WaveLabel = '0' | '1' | '2' | '3' | '4' | '5' | 'A' | 'B' | 'C'
const LABELS: WaveLabel[] = ['0', '1', '2', '3', '4', '5', 'A', 'B', 'C']
/** Waves that move with the impulse. */
const IMPULSE_LEGS = new Set<WaveLabel>(['1', '3', '5'])

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
/** A Fibonacci level for the wave in progress: a target for waves 3, 5 and C, a zone edge for 4, A and B. */
export interface WaveLevel {
  price: number
  /** Fibonacci multiple, e.g. 1.618. */
  k: number
  /** What the multiple is of: 'W1', 'W3', 'W1-3', 'W1-5' or 'A'. */
  of: string
  /** The running wave has already reached this level. */
  hit: boolean
}
/** One finished or running wave, measured. */
export interface WaveStat {
  label: Exclude<WaveLabel, '0'>
  from: Point
  to: Point
  /** (to − from) / from. */
  change: number
  bars: number
  /** Size against the wave it is usually compared with: W2/W1, W3/W1, W4/W3, W5/W1, A/(W1-5), B/A, C/A. */
  ratio?: { value: number; of: string }
  /** Still running: `to` is its extreme so far. */
  running: boolean
}
/** A with-trend trade the count suggests, in impulse direction. `now` = from the last close; `zone` = waiting for a pullback level. */
export interface WavePlan {
  kind: 'now' | 'zone'
  entry: number
  stop: number
  target: number
  /** Distances from the entry as fractions. */
  risk: number
  reward: number
  /** reward / risk. */
  rr: number
}

export interface WaveCount {
  /** Direction of the impulse (waves 1, 3, 5). */
  dir: 'up' | 'down'
  /** Zigzag size used, in ATR multiples (the wave degree). */
  degree: number
  /** Wave 0 (the start) and every wave end. The last point is the running leg's extreme so far, not a confirmed turn. */
  points: WavePoint[]
  waves: WaveStat[]
  /** The wave still running (the last point's label). */
  current: WaveLabel
  /** Direction the current wave moves in. */
  currentDir: 'up' | 'down'
  /** A move beyond this breaks a hard rule and the count is wrong. */
  invalidation: number
  /** Wave 5 only, when wave 3 is shorter than wave 1: wave 5 may not be longer than wave 3, so it must stop before this price. */
  cap?: number
  /** Fibonacci levels for the running wave, nearest first. */
  levels: WaveLevel[]
  /** Guidelines that could be checked on the finished waves. */
  guidelines: Guideline[]
  /** Guidelines met / GUIDELINE_COUNT (unchecked ones count as not met yet). */
  confidence: number
  plan?: WavePlan
}

export interface WaveAnalysis {
  primary?: WaveCount
  /** The best count with a different direction or current wave, if any. */
  alternate?: WaveCount
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

/** The reference each wave is measured against (see WaveStat.ratio). */
function waveRatio(k: number, p: readonly number[]): WaveStat['ratio'] {
  const len = (j: number) => Math.abs(p[j] - p[j - 1])
  const r = (value: number, of: string) => ({ value, of })
  switch (k) {
    case 2:
      return r(len(2) / len(1), 'W1')
    case 3:
      return r(len(3) / len(1), 'W1')
    case 4:
      return r(len(4) / len(3), 'W3')
    case 5:
      return r(len(5) / len(1), 'W1')
    case 6:
      return r(len(6) / Math.abs(p[5] - p[0]), 'W1-5')
    case 7:
      return r(len(7) / len(6), 'A')
    case 8:
      return r(len(8) / len(6), 'A')
    default:
      return undefined
  }
}

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
 * `close` (the last close) is only used for the trade sketch.
 */
export function labelCount(pts: readonly Point[], s: 1 | -1, degree: number, close?: number): WaveCount | undefined {
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
  const curSign = up ? 1 : -1
  const last = p[n]
  const level = (from: number, size: number, k: number, of: string): WaveLevel => {
    const price = from + curSign * k * size
    return { price, k, of, hit: curSign * (last - price) >= 0 }
  }
  let levels: WaveLevel[] = []
  let invalidation: number
  let cap: number | undefined
  const w1 = len(1)
  switch (current) {
    case '3':
      levels = FIB.w3.map((k) => level(p[2], w1, k, 'W1'))
      invalidation = p[0]
      break
    case '4':
      // Wave 4 can't reach wave 1's range, so levels past it are dropped.
      levels = FIB.w4.map((k) => level(p[3], len(3), k, 'W3')).filter((l) => beyond(l.price, p[1]))
      invalidation = p[1]
      break
    case '5':
      levels = [...FIB.w5.map((k) => level(p[4], w1, k, 'W1')), level(p[4], Math.abs(p[3] - p[0]), FIB.w5of13, 'W1-3')]
      invalidation = p[1]
      if (len(3) < w1) cap = p[4] + s * len(3)
      break
    case 'A':
      levels = FIB.a.map((k) => level(p[5], Math.abs(p[5] - p[0]), k, 'W1-5'))
      invalidation = p[5]
      break
    case 'B':
      levels = FIB.b.map((k) => level(p[6], len(6), k, 'A'))
      invalidation = p[5]
      break
    case 'C':
      levels = FIB.c.map((k) => level(p[7], len(6), k, 'A'))
      invalidation = p[5]
      break
    default:
      return undefined
  }
  levels.sort((a, b) => curSign * (a.price - b.price))
  if (cap !== undefined) levels = levels.filter((l) => !beyond(l.price, cap!))

  const waves: WaveStat[] = []
  for (let k = 1; k <= n; k++)
    waves.push({
      label: LABELS[k] as WaveStat['label'],
      from: { i: pts[k - 1].i, price: p[k - 1] },
      to: { i: pts[k].i, price: p[k] },
      change: (p[k] - p[k - 1]) / p[k - 1],
      bars: pts[k].i - pts[k - 1].i,
      ratio: waveRatio(k, p),
      running: k === n,
    })

  const count: WaveCount = {
    dir: s === 1 ? 'up' : 'down',
    degree,
    points: pts.map((x, k) => ({ i: x.i, price: x.price, label: LABELS[k] })),
    waves,
    current,
    currentDir: up ? 'up' : 'down',
    invalidation,
    cap,
    levels,
    guidelines,
    confidence: guidelines.filter((g) => g.met).length / GUIDELINE_COUNT,
  }
  count.plan = wavePlan(count, close ?? last)
  return count
}

/**
 * A with-trend trade sketch (long in an up impulse, short in a down one), stop at the invalidation price:
 * - in wave 3 or 5: from the last close to the first Fibonacci target not reached yet;
 * - in wave 4: from the middle wave-4 level (or the only one left) to wave 5 = wave 1 measured from there.
 * Undefined for the corrective waves, or when the numbers don't give a positive risk and reward.
 */
export function wavePlan(c: WaveCount, close: number): WavePlan | undefined {
  const s = c.dir === 'up' ? 1 : -1
  let kind: WavePlan['kind']
  let entry: number
  let target: number | undefined
  if (IMPULSE_LEGS.has(c.current)) {
    kind = 'now'
    entry = close
    target = c.levels.find((l) => !l.hit && s * (l.price - close) > 0)?.price
  } else if (c.current === '4') {
    const zone = c.levels[Math.min(1, c.levels.length - 1)]
    if (!zone) return undefined
    kind = 'zone'
    entry = zone.price
    const w1 = Math.abs(c.points[1].price - c.points[0].price)
    target = entry + s * w1
  } else return undefined
  if (target === undefined) return undefined
  const risk = (s * (entry - c.invalidation)) / entry
  const reward = (s * (target - entry)) / entry
  if (!(risk > 0 && reward > 0)) return undefined
  return { kind, entry, stop: c.invalidation, target, risk, reward, rr: reward / risk }
}

/** Guidelines met count most; each labelled wave adds half a point, so a count that explains more swings wins ties. */
export const waveScore = (c: WaveCount) => c.guidelines.filter((g) => g.met).length + 0.5 * (c.points.length - 1)

/** Every count that fits the rules, over every degree and start that ends at the running leg, best first. */
export function waveCounts(bars: readonly Bar[]): WaveCount[] {
  const minStart = bars.length - 1 - WAVE_LOOKBACK
  const close = bars.at(-1)?.close
  const all: WaveCount[] = []
  for (const mult of ZIGZAG_ATR) {
    const sw = zigzag(bars, mult)
    for (let st = Math.max(0, sw.length - 9); st <= sw.length - 4; st++) {
      if (sw[st].i < minStart) continue
      const c = labelCount(sw.slice(st), sw[st].kind === 'low' ? 1 : -1, mult, close)
      if (c) all.push(c)
    }
  }
  // Larger degrees win ties: the bigger picture is less noisy.
  return all.sort((a, b) => waveScore(b) - waveScore(a) || b.degree - a.degree)
}

/** The best count, and the best one that reads differently (other direction or other wave in progress). */
export function analyzeWaves(bars: readonly Bar[]): WaveAnalysis {
  const all = waveCounts(bars)
  const primary = all[0]
  const alternate = primary && all.find((c) => c.dir !== primary.dir || c.current !== primary.current)
  return { primary, alternate }
}

/** The best count only. */
export const waveCount = (bars: readonly Bar[]): WaveCount | undefined => analyzeWaves(bars).primary
