// Pre-trade discipline gate (idea from the pre-trade-discipline-gate skill, github.com/tradermonty/claude-trading-skills, MIT).
// Pure: a planned entry in, GO / REVIEW / NO-GO out, with every check visible. A fail blocks (NO-GO); a check that
// can't be answered (no mood scan lately, no USD/IDR rate) asks for a review instead. The app never places orders, so
// the gate decides what the app lets you do: Scanner paper trades need GO; a real trade you already placed can still be
// recorded, marked as a review or a rule break, and that decision goes to the journal and the trade review.
import type { MoodLight } from '@/market/mood'
import type { Breaker, BreakerSettings } from './circuitBreaker'
import { DEFAULT_BREAKER } from './circuitBreaker'

export type GateCheckId = 'plan' | 'stop' | 'size' | 'heat' | 'revenge' | 'mood' | 'breaker'
export type CheckResult = 'pass' | 'fail' | 'unknown'
export interface GateCheck {
  id: GateCheckId
  result: CheckResult
  /** Numbers behind the check, for the message. */
  values?: Record<string, number | string>
}
export type GateDecision = 'go' | 'review' | 'noGo'
export interface Gate {
  decision: GateDecision
  checks: GateCheck[]
  /** Loss at the stop, % of net worth (undefined when it can't be worked out). */
  riskPct?: number
}

/** A mood older than this many days is too old to trust. */
export const MOOD_MAX_AGE_DAYS = 3

export interface GateInput {
  /** Thesis written. undefined = not asked (a Scanner signal is its own written plan). */
  planWritten?: boolean
  entry?: number
  stop?: number
  units: number
  /** Rupiah per unit of the trade's currency; NaN when unknown (USD without a rate). */
  fx: number
  netWorth: number
  tradeLimit: number
  /** Current portfolio heat, % of net worth. */
  heat: number
  heatLimit: number
  /** Last losing exit (same real/paper side), yyyy-mm-dd. */
  lastLoss?: string
  /** The market's last mood; undefined = never scanned; null = no mood for this asset (funds, gold). */
  mood?: { light: MoodLight; date: string } | null
  breaker: Breaker
  today: string
  settings?: BreakerSettings
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

export function preTradeGate(i: GateInput): Gate {
  const s = i.settings ?? DEFAULT_BREAKER
  const checks: GateCheck[] = []
  if (i.planWritten !== undefined) checks.push({ id: 'plan', result: i.planWritten ? 'pass' : 'fail' })

  const hasStop = i.stop !== undefined && i.entry !== undefined && i.stop < i.entry
  checks.push({ id: 'stop', result: i.stop === undefined || i.entry === undefined ? 'fail' : hasStop ? 'pass' : 'fail' })

  const riskIdr = hasStop ? (i.entry! - i.stop!) * i.units * i.fx : NaN
  const riskPct = Number.isFinite(riskIdr) && i.netWorth > 0 ? (riskIdr / i.netWorth) * 100 : undefined
  const eps = 1e-9
  checks.push(
    riskPct === undefined
      ? { id: 'size', result: hasStop ? 'unknown' : 'fail' }
      : { id: 'size', result: riskPct <= i.tradeLimit + eps ? 'pass' : 'fail', values: { risk: riskPct, limit: i.tradeLimit } },
  )
  checks.push(
    riskPct === undefined
      ? { id: 'heat', result: 'unknown' }
      : { id: 'heat', result: i.heat + riskPct <= i.heatLimit + eps ? 'pass' : 'fail', values: { after: i.heat + riskPct, limit: i.heatLimit } },
  )

  const sinceLoss = i.lastLoss ? daysBetween(i.lastLoss, i.today) : undefined
  checks.push({ id: 'revenge', result: sinceLoss !== undefined && sinceLoss <= s.revengeDays ? 'fail' : 'pass', values: i.lastLoss ? { last: i.lastLoss } : undefined })

  if (i.mood !== null) {
    const fresh = i.mood && daysBetween(i.mood.date, i.today) <= MOOD_MAX_AGE_DAYS
    checks.push({ id: 'mood', result: !i.mood || !fresh ? 'unknown' : i.mood.light === 'red' ? 'fail' : 'pass', values: i.mood ? { date: i.mood.date } : undefined })
  }

  checks.push({ id: 'breaker', result: i.breaker.status === 'allowed' ? 'pass' : 'fail', values: { status: i.breaker.status } })

  const decision: GateDecision = checks.some((c) => c.result === 'fail') ? 'noGo' : checks.some((c) => c.result === 'unknown') ? 'review' : 'go'
  return { decision, checks, riskPct }
}
