import { describe, expect, it } from 'vitest'
import type { Holding, Transaction } from '@/types'
import { reviewsDue, tradeStatus, addDays } from './tradeMemory'
import { closedTrades, excursion, filterTrades, KELLY_MIN, reviewStats } from './tradeReview'

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1',
  assetClass: 'idx_stock',
  group: 'trading',
  symbol: 'BBCA',
  currency: 'IDR',
  paper: false,
  stop: 900,
  initialStop: 900,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})
let n = 0
const tx = (type: 'buy' | 'sell', date: string, quantity: number, price: number, fee = 0, holdingId = 'h1'): Transaction => ({ id: `t${n++}`, holdingId, type, date: `${date}T00:00:00.000Z`, quantity, price, fee })

describe('closedTrades', () => {
  it('turns a round trip into one trade with R from the initial stop', () => {
    const [t] = closedTrades([holding({ stop: 1000, setup: 'swing', exitReason: 'target' })], [tx('buy', '2026-01-01', 100, 1000, 0), tx('buy', '2026-01-02', 100, 1000), tx('sell', '2026-01-20', 200, 1200, 1000)])
    // risk = (1000 − 900) × 200 = 20,000; P/L = 240,000 − 200,000 − 1,000 = 39,000
    expect(t).toMatchObject({ entryDate: '2026-01-01', exitDate: '2026-01-20', days: 19, pnl: 39_000, pnlIdr: 39_000, rApprox: false, setup: 'swing', exitReason: 'target' })
    expect(t.r).toBeCloseTo(1.95)
  })
  it('ignores open trades and the investing group, and splits re-entries into separate trades', () => {
    const txns = [tx('buy', '2026-01-01', 10, 1000), tx('sell', '2026-01-05', 10, 900), tx('buy', '2026-02-01', 10, 1000), tx('sell', '2026-02-05', 5, 1100)]
    const trades = closedTrades([holding(), holding({ id: 'h2', group: 'investing' })], [...txns, tx('buy', '2026-01-01', 1, 1, 0, 'h2'), tx('sell', '2026-01-02', 1, 2, 0, 'h2')])
    expect(trades.map((t) => [t.key, t.r])).toEqual([['h1:0', -1]])
  })
  it('marks R from the current stop as approximate, and has no R without a stop below the entry', () => {
    const txns = [tx('buy', '2026-01-01', 10, 1000), tx('sell', '2026-01-05', 10, 1100)]
    expect(closedTrades([holding({ initialStop: undefined, stop: 950 })], txns)[0]).toMatchObject({ r: 2, rApprox: true })
    expect(closedTrades([holding({ initialStop: undefined, stop: undefined })], txns)[0].r).toBeUndefined()
  })
  it('converts USD P/L to rupiah only with a rate', () => {
    const h = holding({ assetClass: 'crypto', currency: 'USD', stop: 90, initialStop: 90 })
    const txns = [tx('buy', '2026-01-01', 1, 100), tx('sell', '2026-01-05', 1, 110)]
    expect(closedTrades([h], txns, 16_000)[0].pnlIdr).toBe(160_000)
    expect(closedTrades([h], txns)[0].pnlIdr).toBeNaN()
  })
})

describe('reviewStats', () => {
  const trade = (r: number, exit: string, setup: Holding['setup'] = 'swing') => {
    const id = `h${n++}`
    return closedTrades([holding({ id, setup })], [tx('buy', '2026-01-01', 1, 1000, 0, id), tx('sell', exit, 1, 1000 + r * 100, 0, id)])[0]
  }
  it('computes win rate, expectancy, profit factor and the worst losing run', () => {
    const s = reviewStats([trade(2, '2026-01-10'), trade(-1, '2026-01-11'), trade(-1, '2026-01-12'), trade(1, '2026-01-13', 'week')])
    expect(s).toMatchObject({ n: 4, wins: 2, losses: 2, winRate: 50, expectancy: 0.25, avgWinR: 1.5, avgLossR: -1, profitFactor: 1.5, worstStreak: 2, rCount: 4 })
    expect(s.bySetup.map((g) => [g.key, g.n])).toEqual([
      ['swing', 3],
      ['week', 1],
    ])
    expect(s.halfKelly).toBeUndefined()
  })
  it(`gives half-Kelly only from ${KELLY_MIN} trades with an R, never below 0`, () => {
    const win = Array.from({ length: 15 }, () => trade(2, '2026-01-10'))
    const loss = Array.from({ length: 15 }, () => trade(-1, '2026-01-11'))
    // W = 0.5, b = 2 → Kelly = 0.5 − 0.5/2 = 0.25 → half = 12.5%
    expect(reviewStats([...win, ...loss]).halfKelly).toBeCloseTo(12.5)
    const bad = [...Array.from({ length: 10 }, () => trade(1, '2026-01-10')), ...Array.from({ length: 20 }, () => trade(-1, '2026-01-11'))]
    expect(reviewStats(bad).halfKelly).toBe(0)
  })
  it('filters by exit date and real/paper', () => {
    const recent = trade(1, '2026-03-01')
    const old = trade(1, '2026-01-01')
    expect(filterTrades([recent, old], 'week', 'all', '2026-03-05')).toEqual([recent])
    expect(filterTrades([recent, old], 'all', 'paper', '2026-03-05')).toEqual([])
  })
})

describe('excursion', () => {
  const b = (time: string, high: number, low: number) => ({ time, open: 100, high, low, close: 100, volume: 1 })
  it('measures the worst and best point while held in R', () => {
    const bars = [b('2026-01-01', 101, 99), b('2026-01-02', 110, 95), b('2026-01-03', 104, 97), b('2026-01-04', 130, 60)]
    expect(excursion(bars, '2026-01-01', '2026-01-03', 0.1, 100)).toEqual({ mfeR: expect.closeTo(1), maeR: expect.closeTo(-0.5) })
  })
  it('falls back to the entry day close when the entry price does not match the bars', () => {
    const bars = [b('2026-01-01', 101, 99), b('2026-01-02', 110, 95)]
    expect(excursion(bars, '2026-01-01', '2026-01-02', 0.1, 3500)).toEqual({ mfeR: expect.closeTo(1), maeR: expect.closeTo(-0.5) })
  })
})

describe('trade memory', () => {
  it('is Active while held, Closed after, and due for review on its date', () => {
    const h = holding({ reviewBy: '2026-02-01' })
    const txns = [tx('buy', '2026-01-01', 10, 1000)]
    expect(tradeStatus([])).toBeUndefined()
    expect(tradeStatus(txns)).toBe('active')
    expect(tradeStatus([...txns, tx('sell', '2026-01-03', 10, 1000)])).toBe('closed')
    expect(reviewsDue([h], txns, '2026-01-31')).toEqual([])
    expect(reviewsDue([h], txns, '2026-02-01')).toEqual([h])
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
  })
})
