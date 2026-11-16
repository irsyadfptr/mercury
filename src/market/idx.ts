// Client for the dev-server idx endpoints (idxPlugin.ts). Local only: the static build has no /api.
import { z } from 'zod'
import type { FundamentalInput } from './fundamentals'
import type { Bar } from './indicators'

/** False in the deployed static build, where the idx CLI can't run. */
export const IDX_AVAILABLE = import.meta.env.DEV

const candle = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
})
const history = z.object({ data: z.object({ symbol: z.string(), name: z.string().nullish(), candles: z.array(candle) }) })

export type IdxError = 'idx-missing' | 'not-found' | 'bad-symbol' | 'bad-screen' | 'idx-failed' | 'fetch-failed'
export class IdxFetchError extends Error {
  code: IdxError
  constructor(code: IdxError) {
    super(code)
    this.code = code
  }
}

/** Pure: idx.history.v1 JSON → bars. Candle time is ISO with the WIB offset, so its first 10 chars are the exchange date. */
export function parseHistory(json: unknown): { name?: string; bars: Bar[] } {
  const d = history.parse(json).data
  return { name: d.name ?? undefined, bars: d.candles.map((c) => ({ ...c, time: c.time.slice(0, 10) })) }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new IdxFetchError((body as { error?: IdxError }).error ?? 'idx-failed')
  return body
}

export const fetchHistory = async (symbol: string) => parseHistory(await getJson(`/api/idx/history?symbol=${encodeURIComponent(symbol)}`))

const n = z.number().nullish().transform((v) => v ?? null)
const fundamentals = z.object({
  data: z.object({
    symbol: z.string(),
    name: z.string().nullish(),
    sector: z.string().nullish(),
    currency: z.string().nullish(),
    financial_currency: z.string().nullish(),
    price: n,
    beta: n,
    week52_high: n,
    week52_low: n,
    valuation: z.object({ market_cap: n, pe_trailing: n, peg: n, price_to_book: n }),
    profitability: z.object({ roe_pct: n, net_margin_pct: n }),
    health: z.object({ debt_to_equity: n, current_ratio: n, total_debt: n, total_cash: n }),
    growth: z.object({ earnings_growth_pct: n }),
    dividend: z.object({ yield_pct: n }),
    analyst: z.object({ target_mean: n }),
  }),
})
// P/B over statements in another currency (ITMG, BSSR report in USD) is not a ratio.
const bookRatio = (pb: number | null, r: { currency?: string | null; financial_currency?: string | null }) =>
  r.financial_currency && r.currency && r.financial_currency !== r.currency ? null : pb
const dividends = z.object({ data: z.object({ consecutive_years: n }) }).nullable()

export interface FundamentalRow {
  symbol: string
  name?: string
  sector?: string
  input: FundamentalInput
}

/** Pure: { fundamentals: idx.fundamentals.v1, dividends: idx.dividends.v1 | null } → score input. */
export function parseFundamentals(json: unknown): FundamentalRow {
  const body = z.object({ fundamentals, dividends }).parse(json)
  const d = body.fundamentals.data
  return {
    symbol: d.symbol,
    name: d.name ?? undefined,
    sector: d.sector ?? undefined,
    input: {
      price: d.price,
      marketCap: d.valuation.market_cap,
      roePct: d.profitability.roe_pct,
      netMarginPct: d.profitability.net_margin_pct,
      debtToEquity: d.health.debt_to_equity,
      dividendYears: body.dividends?.data.consecutive_years ?? null,
      earningsGrowthPct: d.growth.earnings_growth_pct,
      pe: d.valuation.pe_trailing,
      pb: bookRatio(d.valuation.price_to_book, d),
      peg: d.valuation.peg,
      dividendYieldPct: d.dividend.yield_pct,
      targetMean: d.analyst.target_mean,
      totalDebt: d.health.total_debt,
      totalCash: d.health.total_cash,
      beta: d.beta,
      high52: d.week52_high,
      low52: d.week52_low,
      currentRatio: d.health.current_ratio,
    },
  }
}

const screenRow = z.object({
  symbol: z.string(),
  name: z.string().nullish(),
  sector: z.string().nullish(),
  fundamentals_checked: z.boolean(),
  currency: z.string().nullish(),
  financial_currency: z.string().nullish(),
  price: n,
  market_cap: n,
  pe_trailing: n,
  price_to_book: n,
  dividend_yield_pct: n,
  week52_high: n,
  week52_low: n,
  roe_pct: n,
  net_margin_pct: n,
  debt_to_equity: n,
  earnings_growth_pct: n,
  peg: n,
})
const screen = z.object({ data: z.object({ universe: z.number(), rows: z.array(screenRow) }) })

/** Pure: idx.screen.v1 → score inputs for the rows with fundamentals. The screen has no dividend streak, analyst target, cash/debt, beta or current ratio, so those stay unknown. */
export function parseScreen(json: unknown): { universe: number; rows: FundamentalRow[] } {
  const d = screen.parse(json).data
  return {
    universe: d.universe,
    rows: d.rows
      .filter((r) => r.fundamentals_checked)
      .map((r) => ({
        symbol: r.symbol,
        name: r.name ?? undefined,
        sector: r.sector ?? undefined,
        input: {
          price: r.price,
          marketCap: r.market_cap,
          roePct: r.roe_pct,
          netMarginPct: r.net_margin_pct,
          debtToEquity: r.debt_to_equity,
          dividendYears: null,
          earningsGrowthPct: r.earnings_growth_pct,
          pe: r.pe_trailing,
          pb: bookRatio(r.price_to_book, r),
          peg: r.peg,
          dividendYieldPct: r.dividend_yield_pct,
          targetMean: null,
          totalDebt: null,
          totalCash: null,
          beta: null,
          high52: r.week52_high,
          low52: r.week52_low,
          currentRatio: null,
        },
      })),
  }
}

export const fetchFundamentals = async (symbol: string) => parseFundamentals(await getJson(`/api/idx/fundamentals?symbol=${encodeURIComponent(symbol)}`))

export const SCREENS = ['large', 'quality', 'value', 'dividend'] as const
export type ScreenId = (typeof SCREENS)[number]
export const fetchScreen = async (id: ScreenId) => parseScreen(await getJson(`/api/idx/screen?screen=${id}`))
