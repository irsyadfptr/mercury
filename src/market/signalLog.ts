// Signal postmortem (idea from the signal-postmortem skill, github.com/tradermonty/claude-trading-skills, MIT).
// Every buy signal a scan shows is saved here, including the ones paused because the mood was Defensive. Later scans (or the
// Journal's "Check outcomes") replay the bars after each signal with the backtest's own rules, so the scanner gets a forward
// test on signals it really showed: no hindsight, no survivorship in the list.
import type { Bar } from './indicators'

export type SignalMarket = 'idx' | 'crypto'
/** Which scanner rules made it: the 3–6 month swing checklist, or the ≤ 1 month / ≤ 1 week short-term rules. */
export type SignalStyle = 'swing' | 'month' | 'week'
export const SIGNAL_STYLES: readonly SignalStyle[] = ['swing', 'month', 'week']

/** open = still inside its holding time; pending = no bar after the signal yet; skipped = next open was already below the stop. */
export type SignalStatus = 'pending' | 'open' | 'target' | 'stop' | 'time' | 'skipped'
export const FINAL: readonly SignalStatus[] = ['target', 'stop', 'time', 'skipped']

export interface SignalOutcome {
  status: SignalStatus
  /** Result in R after fees for a finished trade; for an open one, where it stands now (before fees). */
  r?: number
  fill?: number
  exitTime?: string
  /** Best and worst point while held, in R from the fill (MFE ≥ 0, MAE ≤ 0). */
  mfeR?: number
  maeR?: number
  /** % change from the fill to the close 5 and 20 bars later (whatever happened to the trade). */
  ret5?: number
  ret20?: number
  /** Last bar the outcome was checked against. */
  through: string
}

export interface SignalRecord {
  /** market:style:symbol:time */
  id: string
  market: SignalMarket
  style: SignalStyle
  symbol: string
  /** Start time of the signal bar: 'yyyy-mm-dd' for daily, ISO for 4-hour. */
  time: string
  entry: number
  stop: number
  target: number
  /** The mood was Defensive, so the scanner showed it as paused (not a buy). */
  paused: boolean
  mood?: number
  /** ms epoch when first seen. */
  savedAt: number
  outcome?: SignalOutcome
}

export type NewSignal = Omit<SignalRecord, 'id' | 'savedAt' | 'outcome'>
export const signalId = (s: Pick<SignalRecord, 'market' | 'style' | 'symbol' | 'time'>) => `${s.market}:${s.style}:${s.symbol}:${s.time}`
/** Calendar day of a signal (its bar's date). */
export const signalDay = (s: Pick<SignalRecord, 'time'>) => s.time.slice(0, 10)

// shortcut: capped at the newest 1,500 signals in localStorage; move to the Sheet if a longer record is wanted.
const MAX_SIGNALS = 1500

/** Pure: adds signals not seen before (same market, rules, ticker and bar); a re-seen signal keeps its first record. */
export function recordSignals(log: readonly SignalRecord[], fresh: readonly NewSignal[], now = Date.now()): SignalRecord[] {
  const have = new Set(log.map((s) => s.id))
  const added = fresh.map((s) => ({ ...s, id: signalId(s), savedAt: now })).filter((s) => !have.has(s.id) && have.add(s.id))
  return [...log, ...added].sort((a, b) => a.savedAt - b.savedAt).slice(-MAX_SIGNALS)
}

export interface EvalOptions {
  /** Most entry bars held (the rules' time stop). */
  timeStopBars: number
  /** Fees per side as a fraction of trade value. */
  fees: { buy: number; sell: number }
  targetR?: number
}

/**
 * Pure: what happened after a signal, with the backtest's rules: buy at the next bar's open (skipped if that is at or below
 * the stop), sell at the stop, at targetR × risk above the fill, or at the time stop; gaps fill at the open; a bar touching
 * both counts as the stop. Undefined when the signal bar isn't in these bars.
 */
export function evaluateSignal(sig: Pick<SignalRecord, 'time' | 'stop'>, bars: readonly Bar[], { timeStopBars, fees, targetR = 2 }: EvalOptions): SignalOutcome | undefined {
  const i = bars.findIndex((b) => b.time === sig.time)
  if (i < 0) return undefined
  const through = bars[bars.length - 1].time
  const e = i + 1
  if (e >= bars.length) return { status: 'pending', through }
  const fill = bars[e].open
  const stop = sig.stop
  const risk = fill - stop
  if (!(risk > 0)) return { status: 'skipped', fill, through }
  const target = fill + targetR * risk
  const ret = (k: number) => (e + k < bars.length ? (bars[e + k].close / fill - 1) * 100 : undefined)
  const base = { fill, through, ret5: ret(5), ret20: ret(20) }
  let hi = fill
  let lo = fill
  const last = e + timeStopBars
  const done = (j: number, status: SignalStatus, price: number): SignalOutcome => ({
    ...base,
    status,
    exitTime: bars[j].time,
    r: (price - fill) / risk - (fees.buy * fill + fees.sell * price) / risk,
    mfeR: (Math.max(hi, status === 'target' ? price : hi) - fill) / risk,
    maeR: (Math.min(lo, status === 'stop' ? price : lo) - fill) / risk,
  })
  for (let j = e; j < bars.length && j <= last; j++) {
    const b = bars[j]
    if (j > e && b.open <= stop) return done(j, 'stop', b.open)
    if (b.low <= stop) return done(j, 'stop', stop)
    if (j > e && b.open >= target) return done(j, 'target', b.open)
    if (b.high >= target) return done(j, 'target', target)
    hi = Math.max(hi, b.high)
    lo = Math.min(lo, b.low)
    if (j === last) return done(j, 'time', b.close)
  }
  const close = bars[bars.length - 1].close
  return { ...base, status: 'open', r: (close - fill) / risk, mfeR: (hi - fill) / risk, maeR: (lo - fill) / risk }
}

/** Pure: re-checks every unfinished signal of one ticker under one set of rules against fresh bars. */
export function updateOutcomes(log: readonly SignalRecord[], market: SignalMarket, style: SignalStyle, symbol: string, bars: readonly Bar[], opts: EvalOptions): SignalRecord[] {
  return log.map((s) => {
    if (s.market !== market || s.style !== style || s.symbol !== symbol || (s.outcome && FINAL.includes(s.outcome.status))) return s
    const outcome = evaluateSignal(s, bars, opts)
    return outcome ? { ...s, outcome } : s
  })
}

/** Signals still waiting for an outcome, as distinct market/style/ticker groups to fetch bars for. */
export function unfinished(log: readonly SignalRecord[]): { market: SignalMarket; style: SignalStyle; symbol: string }[] {
  const seen = new Map<string, { market: SignalMarket; style: SignalStyle; symbol: string }>()
  for (const s of log) if (!s.outcome || !FINAL.includes(s.outcome.status)) seen.set(`${s.market}:${s.style}:${s.symbol}`, { market: s.market, style: s.style, symbol: s.symbol })
  return [...seen.values()]
}

// ---- Postmortem stats ----

export type Verdict = 'won' | 'lost' | 'open' | 'pending' | 'skipped'
/** Pure: won/lost by the result after fees; time-stop exits count by their sign. */
export function verdict(s: SignalRecord): Verdict {
  const o = s.outcome
  if (!o || o.status === 'pending') return 'pending'
  if (o.status === 'open') return 'open'
  if (o.status === 'skipped') return 'skipped'
  return (o.r ?? 0) > 0 ? 'won' : 'lost'
}

export interface SignalStats {
  total: number
  /** Finished trades (target, stop or time stop). */
  closed: number
  open: number
  won: number
  winRate?: number
  avgR?: number
  totalR: number
  avgMfe?: number
  avgMae?: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
export function signalStats(signals: readonly SignalRecord[]): SignalStats {
  const closed = signals.filter((s) => ['won', 'lost'].includes(verdict(s)))
  const rs = closed.map((s) => s.outcome!.r ?? 0)
  const won = closed.filter((s) => verdict(s) === 'won').length
  return {
    total: signals.length,
    closed: closed.length,
    open: signals.filter((s) => verdict(s) === 'open').length,
    won,
    winRate: closed.length ? (won / closed.length) * 100 : undefined,
    avgR: avg(rs),
    totalR: rs.reduce((a, b) => a + b, 0),
    avgMfe: avg(closed.flatMap((s) => (s.outcome?.mfeR === undefined ? [] : [s.outcome.mfeR]))),
    avgMae: avg(closed.flatMap((s) => (s.outcome?.maeR === undefined ? [] : [s.outcome.maeR]))),
  }
}

/** What a signal could be matched to: a trading holding and the date of its first buy. */
export interface TakenCandidate {
  id: string
  symbol: string
  market: SignalMarket
  signalId?: string
  firstBuy?: string
}
/** A buy within this many days after the signal's bar counts as taking it. */
export const TAKEN_DAYS = 5

/** Pure: ids of signals you acted on: linked from a paper trade, or a buy of that ticker within 5 days of the signal. */
export function takenSignals(signals: readonly SignalRecord[], holdings: readonly TakenCandidate[]): Set<string> {
  const out = new Set<string>()
  for (const s of signals) {
    const day = Date.parse(`${signalDay(s)}T00:00:00Z`)
    const hit = holdings.some((h) => {
      if (h.signalId) return h.signalId === s.id
      if (h.symbol !== s.symbol || h.market !== s.market || !h.firstBuy) return false
      const d = (Date.parse(`${h.firstBuy.slice(0, 10)}T00:00:00Z`) - day) / 864e5
      return d >= 0 && d <= TAKEN_DAYS
    })
    if (hit) out.add(s.id)
  }
  return out
}

// ---- Storage ----

const KEY = 'mercury.signals'
export function loadSignals(): SignalRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as SignalRecord[]) : []
  } catch {
    return []
  }
}
export function saveSignals(log: readonly SignalRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
    window.dispatchEvent(new Event(SIGNALS_EVENT))
  } catch {
    // Storage blocked: signals are seen but not followed up.
  }
}
/** Fired after the log is saved, so an open Journal can refresh. */
export const SIGNALS_EVENT = 'mercury:signals'
