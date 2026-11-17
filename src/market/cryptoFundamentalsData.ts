// Gathers the crypto fundamentals input for one coin from CoinGecko (user's key), DefiLlama (no key) and Binance (no key).
// Every field is parsed leniently: a missing or renamed field becomes null (unknown), it never breaks the check.
// shortcut: field names are from memory of these public APIs and not yet checked against a live response (NOTES.md).
import { z } from 'zod'
import { fetchCryptoHistory } from './binance'
import type { CryptoInput } from './cryptoFundamentals'
import type { Bar } from './indicators'

const CG = 'https://api.coingecko.com/api/v3'
const LLAMA = 'https://api.llama.fi'
const BINANCE = 'https://data-api.binance.vision/api/v3'

const num = z.number().nullish().catch(null).transform((v) => v ?? null)
const str = z.string().nullish().catch(null).transform((v) => v ?? null)

const cgMarket = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: num,
  market_cap: num,
  market_cap_rank: num,
  fully_diluted_valuation: num,
  total_volume: num,
  circulating_supply: num,
  total_supply: num,
  max_supply: num,
  ath: num,
  ath_change_percentage: num,
})
export type CoinMarketRow = z.infer<typeof cgMarket>
const cgCoin = z.object({
  genesis_date: str,
  developer_data: z.object({ commit_count_4_weeks: num }).nullish().catch(null),
})
const llamaChain = z.object({ name: z.string(), gecko_id: str, tvl: num })
const llamaProtocol = z.object({ name: z.string(), slug: str, gecko_id: str, tvl: num, change_7d: num })
const llamaSummary = z.object({ total7d: num, total30d: num, total1y: num })
const llamaHistory = z.array(z.object({ date: z.number(), tvl: z.number() }))

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
/** null instead of an error: one source failing leaves its metrics unknown. */
const soft = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
const arrayOf = <T extends z.ZodTypeAny>(item: T, data: unknown): z.infer<T>[] =>
  Array.isArray(data) ? data.flatMap((x) => (item.safeParse(x).success ? [item.parse(x)] : [])) : []

// Big lists, fetched once per visit.
let markets: Promise<CoinMarketRow[]> | undefined
let chains: Promise<z.infer<typeof llamaChain>[]> | undefined
let protocols: Promise<z.infer<typeof llamaProtocol>[]> | undefined

/** The 250 largest coins by market cap; a symbol maps to the largest coin using it. */
function topMarkets(key: string) {
  markets ??= json(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1`, { headers: { 'x-cg-demo-api-key': key } }).then((d) => arrayOf(cgMarket, d))
  markets.catch(() => (markets = undefined))
  return markets
}

export interface CryptoFundamentals {
  symbol: string
  name: string
  coingeckoId: string
  price: number | null
  rank: number | null
  input: CryptoInput
  /** Where the usage numbers came from: a DefiLlama chain, a protocol, or none (no on-chain usage data, e.g. meme coins). */
  usageSource: { kind: 'chain' | 'protocol'; name: string } | null
  /** Binance daily candles (for the expected range). */
  daily: Bar[]
}

export class CoinNotFound extends Error {}

export async function fetchCryptoFundamentals(symbol: string, key: string): Promise<CryptoFundamentals> {
  const m = (await topMarkets(key)).find((x) => x.symbol.toUpperCase() === symbol)
  if (!m) throw new CoinNotFound(symbol)

  const [coin, daily, first] = await Promise.all([
    soft(json(`${CG}/coins/${m.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=true&sparkline=false`, { headers: { 'x-cg-demo-api-key': key } }).then((d) => cgCoin.parse(d))),
    soft(fetchCryptoHistory(symbol).then((h) => h.bars)),
    soft(json(`${BINANCE}/klines?symbol=${symbol}USDT&interval=1d&startTime=0&limit=1`).then((d) => (Array.isArray(d) && Array.isArray(d[0]) ? Number(d[0][0]) : null))),
  ])

  // Usage: a chain (by CoinGecko id) first, else a DeFi protocol.
  chains ??= json(`${LLAMA}/v2/chains`).then((d) => arrayOf(llamaChain, d))
  chains.catch(() => (chains = undefined))
  const chain = (await soft(chains))?.find((c) => c.gecko_id === m.id) ?? null
  let protocol: z.infer<typeof llamaProtocol> | null = null
  if (!chain) {
    protocols ??= json(`${LLAMA}/protocols`).then((d) => arrayOf(llamaProtocol, d))
    protocols.catch(() => (protocols = undefined))
    protocol = (await soft(protocols))?.find((p) => p.gecko_id === m.id) ?? null
  }
  const slug = chain ? chain.name.toLowerCase() : protocol?.slug
  const [fees, revenue, history] = await Promise.all([
    slug ? soft(json(`${LLAMA}/summary/fees/${encodeURIComponent(slug)}?dataType=dailyFees`).then((d) => llamaSummary.parse(d))) : null,
    slug ? soft(json(`${LLAMA}/summary/fees/${encodeURIComponent(slug)}?dataType=dailyRevenue`).then((d) => llamaSummary.parse(d))) : null,
    chain ? soft(json(`${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(chain.name)}`).then((d) => llamaHistory.parse(d))) : null,
  ])
  let tvlChange7dPct = protocol?.change_7d ?? null
  if (history && history.length > 8) {
    const now = history[history.length - 1].tvl
    const before = history[history.length - 8].tvl
    tvlChange7dPct = before > 0 ? (now / before - 1) * 100 : null
  }

  const year = daily?.slice(-365) ?? []
  const input: CryptoInput = {
    marketCap: m.market_cap,
    fdv: m.fully_diluted_valuation,
    circulating: m.circulating_supply,
    total: m.total_supply,
    max: m.max_supply,
    athChangePct: m.ath_change_percentage,
    volume24h: m.total_volume,
    listedDays: first ? (Date.now() - first) / 864e5 : null,
    high365: year.length >= 300 ? Math.max(...year.map((b) => b.high)) : null,
    low365: year.length >= 300 ? Math.min(...year.map((b) => b.low)) : null,
    commits4w: coin?.developer_data?.commit_count_4_weeks ?? null,
    tvl: chain?.tvl ?? protocol?.tvl ?? null,
    tvlChange7dPct,
    fees7d: fees?.total7d ?? null,
    fees30d: fees?.total30d ?? null,
    revenue1y: revenue?.total1y ?? null,
  }
  return {
    symbol,
    name: m.name,
    coingeckoId: m.id,
    price: m.current_price,
    rank: m.market_cap_rank,
    input,
    usageSource: chain ? { kind: 'chain', name: chain.name } : protocol ? { kind: 'protocol', name: protocol.name } : null,
    daily: daily ?? [],
  }
}
