import { describe, expect, it } from 'vitest'
import type { Holding, Transaction } from '@/types'
import { circuitBreaker, DEFAULT_BREAKER, realizedEvents, weekStart, type Breaker } from './circuitBreaker'
import { preTradeGate, type GateInput } from './preTradeGate'

let n = 0
const holding = (over: Partial<Holding> = {}): Holding => ({
  id: `h${n++}`,
  assetClass: 'idx_stock',
  group: 'trading',
  symbol: 'BBCA',
  currency: 'IDR',
  paper: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})
const tx = (holdingId: string, type: 'buy' | 'sell', date: string, quantity: number, price: number, fee = 0): Transaction => ({ id: `t${n++}`, holdingId, type, date: `${date}T00:00:00.000Z`, quantity, price, fee })
/** A finished trade: buy 100 units at 1,000, sell at `exit` on `day`. P/L = (exit − 1000) × 100. */
const trade = (day: string, exit: number, over: Partial<Holding> = {}) => {
  const h = holding(over)
  return { h, txns: [tx(h.id, 'buy', '2026-11-02', 100, 1000), tx(h.id, 'sell', day, 100, exit)] }
}
const run = (trades: { h: Holding; txns: Transaction[] }[], today: string, paper = false, netWorth = 1_000_000) =>
  circuitBreaker(
    trades.map((x) => x.h),
    trades.flatMap((x) => x.txns),
    { paper, netWorth, today },
  )

describe('circuit breaker', () => {
  // 2026-11-18 is a Wednesday.
  it('allows trading with no history', () => {
    expect(run([], '2026-11-18')).toMatchObject({ status: 'allowed', rules: [], streak: 0 })
  })
  it('halts for the rest of the day after a 2% realized loss', () => {
    const b = run([trade('2026-11-18', 800)], '2026-11-18') // −20,000 = −2%
    expect(b.status).toBe('halted')
    expect(b.rules).toEqual([{ id: 'daily', limit: 2, observed: 2, resumes: '2026-11-19' }])
    expect(run([trade('2026-11-18', 800)], '2026-11-19').rules.map((r) => r.id)).not.toContain('daily')
  })
  it('halts until next Monday after a 5% week and until the 1st after an 8% month', () => {
    const week = run([trade('2026-11-16', 700), trade('2026-11-17', 850, { symbol: 'X' })], '2026-11-18') // −3% and −1.5%
    expect(week.weekPct).toBeCloseTo(-4.5)
    const five = run([trade('2026-11-16', 700), trade('2026-11-17', 800)], '2026-11-18') // −5%
    expect(five.rules.find((r) => r.id === 'weekly')).toMatchObject({ resumes: '2026-11-23' })
    const month = run([trade('2026-11-03', 600), trade('2026-11-10', 600)], '2026-11-18') // −8% over two weeks
    expect(month.rules.find((r) => r.id === 'monthly')).toMatchObject({ resumes: '2026-12-01' })
    expect(month.rules.find((r) => r.id === 'weekly')).toBeUndefined()
  })
  it('cools down after 2 losing trades in a row, for the loss day and the next', () => {
    const two = [trade('2026-11-16', 990), trade('2026-11-17', 995)]
    expect(run(two, '2026-11-18')).toMatchObject({ status: 'cooldown', streak: 2, rules: [{ id: 'streak', resumes: '2026-11-19' }] })
    expect(run(two, '2026-11-19').status).toBe('allowed')
    // A win in between resets the streak.
    expect(run([trade('2026-11-15', 990), trade('2026-11-16', 1100), trade('2026-11-17', 995)], '2026-11-18').streak).toBe(1)
  })
  it('judges real and paper separately', () => {
    const paperLoss = trade('2026-11-18', 700, { paper: true })
    expect(run([paperLoss], '2026-11-18').status).toBe('allowed')
    expect(run([paperLoss], '2026-11-18', true).status).toBe('halted')
  })
  it('halts when a USD sell this month has no rate (fails closed)', () => {
    const usd = trade('2026-11-10', 990, { currency: 'USD', assetClass: 'crypto' })
    expect(run([usd], '2026-11-18').rules.map((r) => r.id)).toEqual(['missingFx'])
  })
  it('counts partial sells at a loss for the last-loss date, and fees in P/L', () => {
    const h = holding()
    const events = realizedEvents([h], [tx(h.id, 'buy', '2026-11-01', 10, 100, 10), tx(h.id, 'sell', '2026-11-05', 5, 100, 5)])
    // avg cost 101 → (100 − 101) × 5 − 5 = −10
    expect(events).toEqual([{ date: '2026-11-05', pnlIdr: -10, loss: true, paper: false }])
    expect(circuitBreaker([h], [tx(h.id, 'buy', '2026-11-01', 10, 100, 10), tx(h.id, 'sell', '2026-11-05', 5, 100, 5)], { paper: false, netWorth: 1e6, today: '2026-11-18' }).lastLoss).toBe('2026-11-05')
  })
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16')
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // Sunday
    expect(weekStart('2026-11-23')).toBe('2026-11-23')
  })
})

describe('pre-trade gate', () => {
  const allowed: Breaker = { status: 'allowed', rules: [], todayPct: 0, weekPct: 0, monthPct: 0, streak: 0 }
  const base: GateInput = {
    planWritten: true,
    entry: 1000,
    stop: 900,
    units: 100, // risk 10,000 = 1% of 1M
    fx: 1,
    netWorth: 1_000_000,
    tradeLimit: 1,
    heat: 3,
    heatLimit: 6,
    mood: { light: 'yellow', date: '2026-11-17' },
    breaker: allowed,
    today: '2026-11-18',
  }
  const result = (i: Partial<GateInput>) => {
    const g = preTradeGate({ ...base, ...i })
    return { decision: g.decision, bad: g.checks.filter((c) => c.result !== 'pass').map((c) => `${c.id}:${c.result}`) }
  }
  it('says GO when every check passes', () => {
    expect(result({})).toEqual({ decision: 'go', bad: [] })
    expect(preTradeGate(base).riskPct).toBeCloseTo(1)
  })
  it('says NO-GO for a missing plan or stop, oversize, heat, a fresh loss, a Defensive mood or the breaker', () => {
    expect(result({ planWritten: false }).bad).toEqual(['plan:fail'])
    expect(result({ stop: undefined }).bad).toEqual(['stop:fail', 'size:fail', 'heat:unknown'])
    expect(result({ stop: 1000 }).decision).toBe('noGo')
    expect(result({ units: 101 }).bad).toEqual(['size:fail'])
    expect(result({ heat: 5.5 }).bad).toEqual(['heat:fail'])
    expect(result({ lastLoss: '2026-11-17' }).bad).toEqual(['revenge:fail'])
    expect(result({ lastLoss: '2026-11-16' }).decision).toBe('go')
    expect(result({ mood: { light: 'red', date: '2026-11-18' } }).bad).toEqual(['mood:fail'])
    expect(result({ breaker: { ...allowed, status: 'cooldown' } }).bad).toEqual(['breaker:fail'])
  })
  it('asks for a review when the mood is old or missing, or the risk is unknown', () => {
    expect(result({ mood: { light: 'green', date: '2026-11-14' } })).toEqual({ decision: 'review', bad: ['mood:unknown'] })
    expect(result({ mood: undefined }).decision).toBe('review')
    expect(result({ fx: NaN }).bad).toEqual(['size:unknown', 'heat:unknown'])
  })
  it('skips the plan check for Scanner signals and the mood check for funds and gold', () => {
    expect(preTradeGate({ ...base, planWritten: undefined, mood: null }).checks.map((c) => c.id)).toEqual(['stop', 'size', 'heat', 'revenge', 'breaker'])
  })
  it('uses the configured revenge window', () => {
    expect(result({ lastLoss: '2026-11-15', settings: { ...DEFAULT_BREAKER, revengeDays: 3 } }).bad).toEqual(['revenge:fail'])
  })
})
