// Trade review (ideas from the weekly-performance-digest and trade-performance-coach skills, and position-sizer's Kelly mode,
// github.com/tradermonty/claude-trading-skills, MIT). Pure: closed trades in, win rate, expectancy, profit factor, R,
// MAE/MFE and breakdowns out. Descriptive only: it never says what to buy or sell.
import type { Bar } from '@/market/indicators'
import type { ExitReason, Holding, Setup, Transaction } from '@/types'

/** One round trip: from the first buy until everything bought was sold. A holding traded again later gives another. */
export interface ClosedTrade {
  /** holdingId:n (n = round trip number, from 0). */
  key: string
  holding: Holding
  /** yyyy-mm-dd of the first buy and the last sell. */
  entryDate: string
  exitDate: string
  days: number
  /** Average buy and sell price per unit (fees not included). */
  avgEntry: number
  avgExit: number
  units: number
  /** Profit or loss after fees, in the holding's currency. */
  pnl: number
  /** In rupiah; NaN for a USD trade without a USD/IDR rate. */
  pnlIdr: number
  /** pnl ÷ what the buys cost, %. */
  pnlPct: number
  /** pnl ÷ the money at risk at entry ((avg entry − stop) × units). Undefined without a stop below the entry. */
  r?: number
  /** R was measured from the current stop because the trade has no saved initial stop (or it is a later round trip). */
  rApprox: boolean
  setup: Setup
  exitReason?: ExitReason
  paper: boolean
}

const day = (iso: string) => iso.slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

/** Pure: every finished round trip of the trading group's holdings, newest exit first. */
export function closedTrades(holdings: readonly Holding[], txns: readonly Transaction[], usdIdr?: number): ClosedTrade[] {
  const out: ClosedTrade[] = []
  for (const h of holdings) {
    if (h.group !== 'trading') continue
    const own = txns.filter((t) => t.holdingId === h.id).sort((a, b) => a.date.localeCompare(b.date))
    let cycle = 0
    let held = 0
    let buyQty = 0
    let buyValue = 0
    let sellQty = 0
    let sellValue = 0
    let fees = 0
    let first = ''
    for (const t of own) {
      if (t.type === 'buy') {
        if (held < 1e-9) first = t.date
        held += t.quantity
        buyQty += t.quantity
        buyValue += t.quantity * t.price
      } else {
        held -= t.quantity
        sellQty += t.quantity
        sellValue += t.quantity * t.price
      }
      fees += t.fee
      if (t.type === 'sell' && held < 1e-9 && buyQty > 0) {
        const avgEntry = buyValue / buyQty
        const pnl = sellValue - buyValue - fees
        const stop = cycle === 0 ? (h.initialStop ?? h.stop) : h.stop
        const riskPerUnit = stop === undefined ? 0 : avgEntry - stop
        out.push({
          key: `${h.id}:${cycle}`,
          holding: h,
          entryDate: day(first),
          exitDate: day(t.date),
          days: daysBetween(day(first), day(t.date)),
          avgEntry,
          avgExit: sellValue / sellQty,
          units: buyQty,
          pnl,
          pnlIdr: h.currency === 'IDR' ? pnl : usdIdr ? pnl * usdIdr : NaN,
          pnlPct: buyValue ? (pnl / buyValue) * 100 : 0,
          r: riskPerUnit > 0 ? pnl / (riskPerUnit * buyQty) : undefined,
          rApprox: cycle > 0 || h.initialStop === undefined,
          setup: h.setup ?? 'other',
          exitReason: h.exitReason,
          paper: h.paper,
        })
        cycle++
        held = buyQty = buyValue = sellQty = sellValue = fees = 0
      }
    }
  }
  return out.sort((a, b) => b.exitDate.localeCompare(a.exitDate))
}

export type ReviewPeriod = 'week' | 'month' | 'all'
export type ReviewKind = 'real' | 'paper' | 'all'
const PERIOD_DAYS: Record<Exclude<ReviewPeriod, 'all'>, number> = { week: 7, month: 30 }

/** Pure: trades closed in the last 7 or 30 days (or all), real money, paper or both. */
export function filterTrades(trades: readonly ClosedTrade[], period: ReviewPeriod, kind: ReviewKind, today: string): ClosedTrade[] {
  return trades.filter((t) => (kind === 'all' || t.paper === (kind === 'paper')) && (period === 'all' || daysBetween(t.exitDate, today) < PERIOD_DAYS[period]))
}

export interface GroupStats {
  key: string
  n: number
  winRate: number
  avgR?: number
  pnlIdr: number
}

export interface ReviewStats {
  n: number
  wins: number
  losses: number
  winRate?: number
  /** Trades with an R (a stop below the entry). */
  rCount: number
  /** Average R per trade: what one trade made on average, in units of risk. */
  expectancy?: number
  avgWinR?: number
  avgLossR?: number
  /** Gross profit ÷ gross loss (rupiah). Above 1 = made money. Undefined without a loss. */
  profitFactor?: number
  totalPnlIdr: number
  /** Most losing (or flat) trades in a row, by exit date. */
  worstStreak: number
  avgDays?: number
  /** Half of the Kelly fraction from your own R results, as % risk per trade; only with KELLY_MIN trades that have an R. */
  halfKelly?: number
  bySetup: GroupStats[]
  byExit: GroupStats[]
}

/** Fewer trades than this is too small a sample for a Kelly figure (position-sizer and backtest-expert both say 30+). */
export const KELLY_MIN = 30

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const finite = (x: number) => Number.isFinite(x)

function group(trades: readonly ClosedTrade[], keyOf: (t: ClosedTrade) => string): GroupStats[] {
  const by = new Map<string, ClosedTrade[]>()
  for (const t of trades) by.set(keyOf(t), [...(by.get(keyOf(t)) ?? []), t])
  return [...by]
    .map(([key, ts]) => ({
      key,
      n: ts.length,
      winRate: (ts.filter((t) => t.pnl > 0).length / ts.length) * 100,
      avgR: avg(ts.flatMap((t) => (t.r === undefined ? [] : [t.r]))),
      pnlIdr: ts.reduce((s, t) => s + (finite(t.pnlIdr) ? t.pnlIdr : 0), 0),
    }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
}

export function reviewStats(trades: readonly ClosedTrade[]): ReviewStats {
  const n = trades.length
  const wins = trades.filter((t) => t.pnl > 0).length
  const losses = trades.filter((t) => t.pnl < 0).length
  const rs = trades.flatMap((t) => (t.r === undefined ? [] : [t.r]))
  const winRs = rs.filter((r) => r > 0)
  const lossRs = rs.filter((r) => r <= 0)
  const idr = trades.map((t) => t.pnlIdr).filter(finite)
  const grossWin = idr.filter((x) => x > 0).reduce((a, b) => a + b, 0)
  const grossLoss = -idr.filter((x) => x < 0).reduce((a, b) => a + b, 0)
  let run = 0
  let worstStreak = 0
  for (const t of [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate))) {
    run = t.pnl > 0 ? 0 : run + 1
    worstStreak = Math.max(worstStreak, run)
  }
  const avgWinR = avg(winRs)
  const avgLossR = avg(lossRs)
  let halfKelly: number | undefined
  if (rs.length >= KELLY_MIN && avgWinR !== undefined && avgLossR !== undefined && avgLossR < 0) {
    const w = winRs.length / rs.length
    const kelly = w - (1 - w) / (avgWinR / -avgLossR)
    halfKelly = Math.max(0, kelly / 2) * 100
  }
  return {
    n,
    wins,
    losses,
    winRate: n ? (wins / n) * 100 : undefined,
    rCount: rs.length,
    expectancy: avg(rs),
    avgWinR,
    avgLossR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : undefined,
    totalPnlIdr: idr.reduce((a, b) => a + b, 0),
    worstStreak,
    avgDays: avg(trades.map((t) => t.days)),
    halfKelly,
    bySetup: group(trades, (t) => t.setup),
    byExit: group(trades, (t) => t.exitReason ?? 'unknown'),
  }
}

/** Most the average entry may differ from the entry day's close before excursion() falls back to the close. */
const MAX_REF_GAP = 0.5

/**
 * Pure: how far a trade went against you (MAE ≤ 0) and in your favour (MFE ≥ 0) while held, in R, from daily bars.
 * Moves are measured in % from `ref` (the average entry when the bars are in the trade's currency, else the entry day's
 * close), so a crypto trade booked in rupiah can use USDT bars. riskPct = (entry − stop) ÷ entry.
 */
export function excursion(bars: readonly Bar[], entryDate: string, exitDate: string, riskPct: number, ref?: number): { maeR: number; mfeR: number } | undefined {
  const held = bars.filter((b) => b.time.slice(0, 10) >= entryDate && b.time.slice(0, 10) <= exitDate)
  if (!held.length || !(riskPct > 0)) return undefined
  // A reference far from the day's prices means the bars don't match the trade (wrong currency or ticker): use the close.
  const base = ref !== undefined && Math.abs(held[0].close / ref - 1) <= MAX_REF_GAP ? ref : held[0].close
  const hi = Math.max(...held.map((b) => b.high))
  const lo = Math.min(...held.map((b) => b.low))
  return { mfeR: Math.max(0, hi / base - 1) / riskPct, maeR: Math.min(0, lo / base - 1) / riskPct }
}
