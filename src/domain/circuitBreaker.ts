// Drawdown circuit breaker (idea from the drawdown-circuit-breaker skill, github.com/tradermonty/claude-trading-skills, MIT).
// Pure: realized results of the trading group in, "may I open new risk today?" out. It never closes positions; it only
// stops new entries after realized damage. Real and paper trades are judged separately, so paper losses don't block
// real trades (and the other way round). Days are local calendar dates; weeks start on Monday.
import type { Holding, Transaction } from '@/types'
import { addDays } from './tradeMemory'
import { closedTrades } from './tradeReview'

export interface BreakerSettings {
  /** Realized loss in one day that halts new entries until tomorrow, % of net worth. */
  dailyPct: number
  /** Realized loss this week (from Monday) that halts until next Monday, %. */
  weeklyPct: number
  /** Realized loss this month that halts until the 1st, %. */
  monthlyPct: number
  /** Losing trades in a row that start a cooldown. */
  streak: number
  /** Cooldown length after the streak's last loss, in days (1 ≈ the skill's 24 hours: the loss day and the next). */
  cooldownDays: number
  /** Pre-trade gate: a losing exit this many days back (or less) is a revenge-trade risk. */
  revengeDays: number
}
/** The skill's defaults. */
export const DEFAULT_BREAKER: BreakerSettings = { dailyPct: 2, weeklyPct: 5, monthlyPct: 8, streak: 2, cooldownDays: 1, revengeDays: 1 }

export type BreakerStatus = 'allowed' | 'cooldown' | 'halted'
export type BreakerRuleId = 'daily' | 'weekly' | 'monthly' | 'streak' | 'missingFx'
export interface BreakerRule {
  id: BreakerRuleId
  /** The limit (% of net worth, or losses in a row). */
  limit: number
  observed: number
  /** First day new entries are allowed again, yyyy-mm-dd; none for missingFx (until a rate is set). */
  resumes?: string
}
export interface Breaker {
  status: BreakerStatus
  /** Rules that are active now. */
  rules: BreakerRule[]
  /** Realized P/L as % of net worth (negative = loss). */
  todayPct: number
  weekPct: number
  monthPct: number
  /** Losing trades in a row, newest first. */
  streak: number
  /** Date of the last sell at a loss, partial sells included (the gate's revenge check). */
  lastLoss?: string
}

/** One sell's realized P/L, average-cost method, in rupiah (NaN for USD without a rate). */
export interface RealizedEvent {
  date: string
  pnlIdr: number
  /** Sold below the average cost (known even without a USD/IDR rate). */
  loss: boolean
  paper: boolean
}

/** Pure: realized P/L of every sell in the trading group. */
export function realizedEvents(holdings: readonly Holding[], txns: readonly Transaction[], usdIdr?: number): RealizedEvent[] {
  const out: RealizedEvent[] = []
  for (const h of holdings) {
    if (h.group !== 'trading') continue
    const fx = h.currency === 'IDR' ? 1 : usdIdr || NaN
    let qty = 0
    let cost = 0
    for (const t of txns.filter((x) => x.holdingId === h.id).sort((a, b) => a.date.localeCompare(b.date))) {
      if (t.type === 'buy') {
        qty += t.quantity
        cost += t.quantity * t.price + t.fee
        continue
      }
      const avg = qty ? cost / qty : 0
      const pnl = t.quantity * (t.price - avg) - t.fee
      out.push({ date: t.date.slice(0, 10), pnlIdr: pnl * fx, loss: pnl < 0, paper: h.paper })
      cost -= t.quantity * avg
      qty -= t.quantity
      if (qty < 1e-9) qty = cost = 0
    }
  }
  return out
}

/** Monday of the week of `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}
const nextMonth = (day: string) => {
  const [y, m] = day.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/**
 * Pure: the breaker for real (paper = false) or paper trades. netWorth is the account size the limits are measured
 * against (the same net worth the per-trade risk limit uses). Missing USD/IDR for a USD sell this month halts: the
 * breaker can't tell how much was lost (the skill fails closed on incomplete data).
 */
export function circuitBreaker(holdings: readonly Holding[], txns: readonly Transaction[], opts: { paper: boolean; netWorth: number; usdIdr?: number; today: string; settings?: BreakerSettings }): Breaker {
  const s = opts.settings ?? DEFAULT_BREAKER
  const { today, netWorth } = opts
  const monday = weekStart(today)
  const month = `${today.slice(0, 7)}-01`
  const events = realizedEvents(holdings, txns, opts.usdIdr).filter((e) => e.paper === opts.paper && e.date <= today)
  const pct = (from: string) => {
    const sum = events.filter((e) => e.date >= from && Number.isFinite(e.pnlIdr)).reduce((a, e) => a + e.pnlIdr, 0)
    return netWorth > 0 ? (sum / netWorth) * 100 : 0
  }
  const todayPct = pct(today)
  const weekPct = pct(monday)
  const monthPct = pct(month)

  const trades = closedTrades(holdings, txns, opts.usdIdr)
    .filter((t) => t.paper === opts.paper && t.exitDate <= today)
    .sort((a, b) => b.exitDate.localeCompare(a.exitDate))
  let streak = 0
  while (streak < trades.length && trades[streak].pnl < 0) streak++
  const lastLoss = events
    .filter((e) => e.loss)
    .map((e) => e.date)
    .sort()
    .at(-1)

  const rules: BreakerRule[] = []
  if (events.some((e) => e.date >= month && !Number.isFinite(e.pnlIdr))) rules.push({ id: 'missingFx', limit: 0, observed: 0 })
  if (-todayPct >= s.dailyPct) rules.push({ id: 'daily', limit: s.dailyPct, observed: -todayPct, resumes: addDays(today, 1) })
  if (-weekPct >= s.weeklyPct) rules.push({ id: 'weekly', limit: s.weeklyPct, observed: -weekPct, resumes: addDays(monday, 7) })
  if (-monthPct >= s.monthlyPct) rules.push({ id: 'monthly', limit: s.monthlyPct, observed: -monthPct, resumes: nextMonth(today) })
  if (streak >= s.streak && trades[0]) {
    const resumes = addDays(trades[0].exitDate, s.cooldownDays + 1)
    if (today < resumes) rules.push({ id: 'streak', limit: s.streak, observed: streak, resumes })
  }
  const status: BreakerStatus = rules.some((r) => r.id !== 'streak') ? 'halted' : rules.length ? 'cooldown' : 'allowed'
  return { status, rules, todayPct, weekPct, monthPct, streak, lastLoss }
}
