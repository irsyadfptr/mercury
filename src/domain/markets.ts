import type { AssetClass, Group, Holding, JournalEntry, Summary } from '@/types'

/**
 * The app is split by what you own: one page per market. Crypto and Stocks are traded (scan, fundamentals, journal);
 * Funds (money market, bond funds, gold) are held. US stocks live under Stocks.
 */
export const MARKET_PAGES = ['crypto', 'stocks', 'funds'] as const
export type MarketPage = (typeof MARKET_PAGES)[number]
export const TRADE_MARKETS = ['crypto', 'stocks'] as const
export type TradeMarket = (typeof TRADE_MARKETS)[number]

export const MARKET_CLASSES: Record<MarketPage, readonly AssetClass[]> = {
  crypto: ['crypto'],
  stocks: ['idx_stock', 'us_stock'],
  funds: ['money_market', 'bond_fund', 'gold'],
}

/** The asset type a new holding starts with on each page. */
export const DEFAULT_CLASS: Record<MarketPage, AssetClass> = { crypto: 'crypto', stocks: 'idx_stock', funds: 'money_market' }

/** Stocks has two exchanges, switched at the top of the Stocks page. */
export const EXCHANGES = ['idx', 'us'] as const
export type Exchange = (typeof EXCHANGES)[number]
export const EXCHANGE_CLASS: Record<Exchange, AssetClass> = { idx: 'idx_stock', us: 'us_stock' }

/** A scanner / signal / mood market: crypto, or one stock exchange. */
export type ScanMarketId = 'crypto' | Exchange
/** The scanner market behind a trade market (Stocks: the exchange picked). */
export const scanMarketOf = (m: TradeMarket, ex: Exchange = 'idx'): ScanMarketId => (m === 'crypto' ? 'crypto' : ex)
export const tradeMarketOfScan = (m: ScanMarketId): TradeMarket => (m === 'crypto' ? 'crypto' : 'stocks')
/** Link params that open a scanner market's page on the right exchange. */
export const exchangeParams = (m: ScanMarketId): Record<string, string> => (m === 'us' ? { ex: 'us' } : m === 'idx' ? { ex: 'idx' } : {})
/** What a paper trade from that market's scanner is saved as, and its currency. */
export const PAPER_CLASS: Record<ScanMarketId, AssetClass> = { idx: 'idx_stock', crypto: 'crypto', us: 'us_stock' }
/** Priced in US dollars (USDT for crypto): sizing converts net worth with the USD/IDR rate. IDX trades in lots. */
export const pricedInUsd = (m: ScanMarketId) => m !== 'idx'
/** Short market name used inside sentences ("IDX mood", "US mood"). */
export const MARKET_SHORT: Record<ScanMarketId, string> = { idx: 'IDX', crypto: 'Crypto', us: 'US' }

/** The exchange a stock holding trades on. */
export const exchangeOfClass = (c: AssetClass): Exchange => (c === 'us_stock' ? 'us' : 'idx')
/** Link params that open a holding's market on its exchange (Stocks only). */
export const exchangeParamsOf = (c: AssetClass): Record<string, string> => (marketOfClass(c) === 'stocks' ? { ex: exchangeOfClass(c) } : {})

export const marketOfClass = (c: AssetClass): MarketPage => MARKET_PAGES.find((m) => MARKET_CLASSES[m].includes(c)) ?? 'stocks'

export const isTradeMarket = (m: MarketPage): m is TradeMarket => (TRADE_MARKETS as readonly string[]).includes(m)

/**
 * Which market's journal a note belongs to: its own `market`, else its holding's market (Funds holdings have no
 * journal, so they count as general). undefined = a general note, shown in both journals.
 */
export function journalMarket(e: Pick<JournalEntry, 'market' | 'holdingId'>, byId: ReadonlyMap<string, Holding>): TradeMarket | undefined {
  if (e.market) return e.market
  const h = e.holdingId ? byId.get(e.holdingId) : undefined
  if (!h) return undefined
  const m = marketOfClass(h.assetClass)
  return isTradeMarket(m) ? m : undefined
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * The whole-portfolio summary narrowed to some asset types. Rows keep their risk as % of the whole net worth (the heat
 * and per-trade limits are about all your money), so `heat` here is this market's share of the total heat.
 */
export function scopeSummary(s: Summary, classes: readonly AssetClass[]): Summary {
  const rows = s.rows.filter((r) => classes.includes(r.holding.assetClass))
  const priced = rows.filter((r) => Number.isFinite(r.v.valueIdr))
  const byGroup: Record<Group, number> = { investing: 0, trading: 0 }
  const byClass: Summary['byClass'] = {}
  for (const r of priced) {
    byGroup[r.holding.group] += r.v.valueIdr
    byClass[r.holding.assetClass] = (byClass[r.holding.assetClass] ?? 0) + r.v.valueIdr
  }
  const netWorth = sum(priced.map((r) => r.v.valueIdr))
  const invested = sum(priced.map((r) => r.v.costIdr))
  return {
    rows,
    netWorth,
    invested,
    unrealized: netWorth - invested,
    realized: sum(priced.map((r) => r.v.realizedIdr)),
    dividends: sum(rows.map((r) => r.dividends)),
    byGroup,
    byClass,
    heat: sum(rows.map((r) => (r.risk.kind === 'ok' ? r.risk.pct : 0))),
    missingFx: s.missingFx.filter((h) => classes.includes(h.assetClass)),
  }
}
