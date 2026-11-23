// Pure portfolio math. No clock, storage or UI access: every input is a parameter.
import type {
  AssetClass,
  Dividend,
  Group,
  GroupTotals,
  HeatInfo,
  Holding,
  HoldingQuest,
  LevelInfo,
  Liquidity,
  PositionSizeInput,
  PriceSource,
  Quest,
  QuestOptions,
  Rarity,
  Row,
  SizeQuote,
  Summary,
  TradeRisk,
  Transaction,
  TypeGroup,
  Valuation,
} from '@/types'
import { localDate } from './cashflow'
import { position } from './positions'
import { ASSET_CLASSES, LIQUIDITY } from './schema'

const DAY_MS = 86_400_000

export function valueHolding(h: Holding, txns: readonly Transaction[], usdIdr?: number): Valuation {
  const pos = position(txns)
  const priceSource: PriceSource = h.manualPrice != null ? 'manual' : 'cost'
  const price = h.manualPrice ?? pos.avgCost
  const marketValue = pos.quantity * price
  const unrealized = marketValue - pos.costBasis
  const fx = h.currency === 'IDR' ? 1 : (usdIdr ?? NaN)
  return {
    ...pos,
    price,
    priceSource,
    marketValue,
    unrealized,
    unrealizedPct: pos.costBasis ? (unrealized / pos.costBasis) * 100 : 0,
    valueIdr: marketValue * fx,
    costIdr: pos.costBasis * fx,
    realizedIdr: pos.realizedPnl * fx,
    fx,
  }
}

export function tradeRisk(h: Holding, v: Valuation, netWorth: number): TradeRisk {
  if (h.group !== 'trading' || v.quantity === 0) return { kind: 'none' }
  if (h.stop == null) return { kind: 'noStop' }
  const amountIdr = Math.max(0, v.price - h.stop) * v.quantity * v.fx
  return { kind: 'ok', amountIdr, pct: netWorth > 0 ? (amountIdr / netWorth) * 100 : 0 }
}

/** Days since the earliest transaction (0 when there are none). */
export function daysHeld(txns: readonly Transaction[], now: number): number {
  if (!txns.length) return 0
  const first = txns.reduce((min, t) => (t.date < min ? t.date : min), txns[0].date)
  return Math.max(0, Math.floor((now - Date.parse(first)) / DAY_MS))
}

/** Dividends of the last 12 months count toward the yield on cost. */
const YIELD_WINDOW_DAYS = 365

export function summarize(holdings: readonly Holding[], txns: readonly Transaction[], usdIdr: number | undefined, now: number, dividends: readonly Dividend[] = []): Summary {
  const since = new Date(now - YIELD_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10)
  const base = holdings.map((holding) => {
    const own = txns.filter((t) => t.holdingId === holding.id)
    const v = valueHolding(holding, own, usdIdr)
    const divs = dividends.filter((d) => d.holdingId === holding.id)
    const lastYear = sum(divs.filter((d) => d.date >= since).map((d) => d.amount))
    return {
      holding,
      txns: own,
      v,
      daysHeld: daysHeld(own, now),
      dividends: sum(divs.map((d) => d.amount)),
      yieldOnCost: v.costIdr > 0 && Number.isFinite(v.costIdr) ? (lastYear / v.costIdr) * 100 : null,
    }
  })
  const isPriced = (r: { v: Valuation }) => Number.isFinite(r.v.valueIdr)
  const priced = base.filter(isPriced)
  const netWorth = sum(priced.map((r) => r.v.valueIdr))
  const rows: Row[] = base.map((r) => ({ ...r, risk: isPriced(r) ? tradeRisk(r.holding, r.v, netWorth) : { kind: 'none' } }))

  const byGroup: Record<Group, number> = { investing: 0, trading: 0 }
  const byClass: Summary['byClass'] = {}
  for (const r of priced) {
    byGroup[r.holding.group] += r.v.valueIdr
    byClass[r.holding.assetClass] = (byClass[r.holding.assetClass] ?? 0) + r.v.valueIdr
  }
  const invested = sum(priced.map((r) => r.v.costIdr))
  return {
    rows,
    netWorth,
    invested,
    unrealized: netWorth - invested,
    realized: sum(priced.map((r) => r.v.realizedIdr)),
    dividends: sum(dividends.map((d) => d.amount)),
    byGroup,
    byClass,
    heat: sum(rows.map((r) => (r.risk.kind === 'ok' ? r.risk.pct : 0))),
    missingFx: base.filter((r) => !isPriced(r)).map((r) => r.holding),
  }
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * A group's rows split by asset type, in ASSET_CLASSES order, types held only: value and P/L in IDR, and share of the
 * group's value (%). Rows without an IDR value (USD with no rate) are listed but left out of the totals.
 */
export function byType(rows: readonly Row[]): TypeGroup[] {
  return ASSET_CLASSES.flatMap((assetClass) => {
    const own = rows.filter((r) => r.holding.assetClass === assetClass)
    if (!own.length) return []
    const priced = own.filter((r) => Number.isFinite(r.v.valueIdr))
    const value = sum(priced.map((r) => r.v.valueIdr))
    const cost = sum(priced.map((r) => r.v.costIdr))
    return [{ assetClass, rows: own, value, pnl: value - cost, pnlPct: cost ? ((value - cost) / cost) * 100 : 0 }]
  }).map((g, _, all) => {
    const total = sum(all.map((x) => x.value))
    return { ...g, share: total ? (g.value / total) * 100 : 0 }
  })
}

// ---- Game layer (DESIGN.md: every game element is a number calculated here) ----

export const LEVEL_BASE = 10_000_000

/** Level = times net worth has doubled from Rp10M. */
export function level(netWorth: number): LevelInfo {
  if (netWorth < LEVEL_BASE) return { level: 0, xp: Math.max(0, netWorth) / LEVEL_BASE, next: LEVEL_BASE }
  const lv = Math.floor(Math.log2(netWorth / LEVEL_BASE)) + 1
  const floor = LEVEL_BASE * 2 ** (lv - 1)
  const next = floor * 2
  return { level: lv, xp: (netWorth - floor) / (next - floor), next }
}

export function heatTier(heat: number, limit: number): HeatInfo {
  const r = limit > 0 ? heat / limit : 0
  if (r < 0.3) return { tier: 'calm', flames: 0 }
  if (r < 0.6) return { tier: 'warm', flames: 1 }
  if (r < 0.85) return { tier: 'hot', flames: 2 }
  if (r <= 1) return { tier: 'onFire', flames: 3 }
  return { tier: 'overheated', flames: 4 }
}

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary']
/** Minimum days held for each rarity. */
export const RARITY_MIN_DAYS: Record<Rarity, number> = { common: 0, rare: 30, epic: 90, legendary: 180 }

export const rarity = (days: number): Rarity => [...RARITIES].reverse().find((r) => days >= RARITY_MIN_DAYS[r]) ?? 'common'

/** Speed stars from liquidity tier. */
export const SPEED: Record<Liquidity, number> = { instant: 3, '1-2 days': 2, days: 1, slow: 0 }
export const speedOf = (c: AssetClass): number => SPEED[LIQUIDITY[c]]

// ---- Position sizing ----

export const IDX_LOT = 100

/** Units to buy so a stop-out loses riskPct of capital. */
export function positionSize(p: PositionSizeInput): number {
  const perUnit = p.entry - p.stop
  if (!(perUnit > 0) || !(p.capital > 0) || !(p.riskPct > 0)) return 0
  const units = (p.capital * p.riskPct) / 100 / perUnit
  return p.lot ? Math.floor(units / p.lot) * p.lot : Math.floor(units * 1e8) / 1e8
}

/** Everything the size calculator shows, from raw inputs. */
export function sizeQuote(p: Partial<PositionSizeInput> & Pick<PositionSizeInput, 'capital' | 'riskPct'>): SizeQuote {
  if (!(p.entry && p.entry > 0) || p.stop == null || Number.isNaN(p.stop)) return { status: 'incomplete' }
  if (p.stop >= p.entry) return { status: 'stopAboveEntry' }
  const units = positionSize({ ...p, entry: p.entry, stop: p.stop })
  return { status: 'ok', units, cost: units * p.entry, lossAtStop: units * (p.entry - p.stop) }
}

// ---- Quests ----

export const STALE_PRICE_DAYS = 7
export const BACKUP_EVERY_DAYS = 7

/** To-dos from rule checks, in a stable order: per holding, then global. */
export function quests(s: Summary, opts: QuestOptions): Quest[] {
  const daysSince = (iso?: string) => (iso ? Math.floor((opts.now - Date.parse(iso)) / DAY_MS) : null)
  const out: Quest[] = []
  for (const r of s.rows) {
    if (r.v.quantity === 0) continue
    if (r.risk.kind === 'noStop') out.push({ kind: 'setStop', holding: r.holding })
    if (r.risk.kind === 'ok' && r.risk.pct > opts.tradeLimit) out.push({ kind: 'overRisk', holding: r.holding, pct: r.risk.pct })
    // Trade memory: an open trade past its review date (by default the rules' time stop).
    if (r.holding.group === 'trading' && r.holding.reviewBy && r.holding.reviewBy <= localDate(opts.now)) out.push({ kind: 'review', holding: r.holding, since: r.holding.reviewBy })
    const age = daysSince(r.holding.manualPriceAt)
    if (age == null || age > STALE_PRICE_DAYS) out.push({ kind: 'stalePrice', holding: r.holding, days: age })
  }
  if (s.missingFx.length) out.push({ kind: 'fxRate' })
  const sinceBackup = daysSince(opts.lastExportAt)
  if (s.rows.length && (sinceBackup == null || sinceBackup > BACKUP_EVERY_DAYS)) out.push({ kind: 'backup', days: sinceBackup })
  return out
}

/**
 * Open holdings with a real price (not valued at cost), best and worst by unrealized %: up to `n` winners (gain > 0,
 * best first) and `n` losers (loss < 0, worst first). Holdings without a USD/IDR rate are left out.
 */
export function winnersLosers(rows: readonly Row[], n = 3): { winners: Row[]; losers: Row[] } {
  const priced = rows.filter((r) => r.v.quantity > 0 && r.v.priceSource !== 'cost' && Number.isFinite(r.v.valueIdr) && Number.isFinite(r.v.unrealizedPct))
  const sorted = [...priced].sort((a, b) => b.v.unrealizedPct - a.v.unrealizedPct)
  return {
    winners: sorted.filter((r) => r.v.unrealizedPct > 0).slice(0, n),
    losers: sorted.filter((r) => r.v.unrealizedPct < 0).reverse().slice(0, n),
  }
}

/** A holding's unrealized gain or loss in rupiah (a USD holding without a rate counts its dollars as-is). */
export const idrPnl = (r: Row): number => r.v.unrealized * (Number.isFinite(r.v.fx) ? r.v.fx : 1)

/**
 * The open holdings of one group (Investing or Trading) and their totals in rupiah: value (holdings valued at cost
 * included, like Summary.byGroup), and gain or loss with its cost, from holdings with a real price only. Holdings
 * without a USD/IDR rate are listed but left out of every total.
 */
export function openGroup(rows: readonly Row[], group: Group): GroupTotals {
  const open = rows.filter((r) => r.holding.group === group && r.v.quantity > 0)
  const inIdr = open.filter((r) => Number.isFinite(r.v.valueIdr))
  const priced = inIdr.filter((r) => r.v.priceSource !== 'cost')
  const cost = sum(priced.map((r) => r.v.costIdr))
  const pnl = sum(priced.map((r) => r.v.valueIdr - r.v.costIdr))
  return { rows: open, value: sum(inIdr.map((r) => r.v.valueIdr)), cost, pnl, pnlPct: cost ? (pnl / cost) * 100 : 0 }
}

/** Fix-first order for a holding's to-dos: risk over the limit, then a missing stop, a review date, an old price. */
const FIX_ORDER: Record<HoldingQuest['kind'], number> = { overRisk: 0, setStop: 1, review: 2, stalePrice: 3 }

/** The quests about one holding (not backup or the USD rate), most urgent kind first, list order kept within a kind. */
export function holdingQuests(qs: readonly Quest[]): HoldingQuest[] {
  return qs.filter((q): q is HoldingQuest => 'holding' in q).sort((a, b) => FIX_ORDER[a.kind] - FIX_ORDER[b.kind])
}
