// US stocks and ETFs. Two sources (NOTES.md "US stocks"):
// - Yahoo Finance through the dev server (usPlugin.ts): no key, prices and fundamentals, local only.
// - Twelve Data from the browser with the user's own key (BYOK): prices, daily and hourly bars and USD/IDR; works on
//   the deployed site. Free plan: 8 calls a minute, 800 a day, so calls queue (see `throttle`).
// Locally Yahoo is tried first and Twelve Data is the fallback; deployed, only Twelve Data.
import { z } from 'zod'
import { useSettings } from '@/settings'
import type { FundamentalRow } from './idx'
import { IdxFetchError } from './idx'
import type { Bar } from './indicators'
import { toUs4h, usDayOf } from './usTime'

export { toUs4h, usDayOf }

/** The dev server's Yahoo proxy exists (not in the static build). */
export const US_LOCAL = import.meta.env.DEV
const twelveKey = () => useSettings.getState().twelveDataKey || undefined
/** US prices can be fetched: locally always, deployed with a Twelve Data key. */
export const usAvailable = (key = twelveKey()) => US_LOCAL || !!key

/** A US ticker or ETF: 1–5 letters, a class share as BRK.B. */
export const US_SYMBOL = /^[A-Z]{1,5}(?:\.[A-Z])?$/
/** Yahoo writes class shares with a dash (BRK-B), Twelve Data with a dot. */
const yahooSymbol = (s: string) => s.replace('.', '-')

/** S&P 500 tracker: the index for the mood's trend and calm parts (an ETF, so both sources have it). */
export const US_INDEX = 'SPY'

// ---- Yahoo (dev server) ----

const num = z.number().nullable().optional()
const yahooChart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ symbol: z.string(), longName: z.string().optional(), shortName: z.string().optional(), gmtoffset: z.number().optional(), regularMarketPrice: z.number().optional() }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({ quote: z.array(z.object({ open: z.array(num), high: z.array(num), low: z.array(num), close: z.array(num), volume: z.array(num) })) }),
          events: z.object({ dividends: z.record(z.string(), z.object({ amount: z.number(), date: z.number() })).optional() }).optional(),
        }),
      )
      .nullable(),
  }),
})

/**
 * Pure: Yahoo v8 chart JSON → bars. Daily bars are dated in exchange time (the timestamp is the session open in UTC,
 * shifted by the exchange's offset); intraday bars keep their UTC ISO time. Rows with a missing price are skipped.
 */
export function parseYahooChart(json: unknown, intraday = false): { name?: string; bars: Bar[]; dividends: { date: string; amount: number }[] } {
  const r = yahooChart.parse(json).chart.result?.[0]
  if (!r) throw new IdxFetchError('not-found')
  const q = r.indicators.quote[0]
  const off = (r.meta.gmtoffset ?? 0) * 1000
  const bars: Bar[] = []
  ;(r.timestamp ?? []).forEach((ts, i) => {
    const [open, high, low, close] = [q.open[i], q.high[i], q.low[i], q.close[i]]
    if (open == null || high == null || low == null || close == null) return
    const time = intraday ? new Date(ts * 1000).toISOString() : new Date(ts * 1000 + off).toISOString().slice(0, 10)
    bars.push({ time, open, high, low, close, volume: q.volume[i] ?? 0 })
  })
  const dividends = Object.values(r.events?.dividends ?? {})
    .map((d) => ({ date: new Date(d.date * 1000 + off).toISOString().slice(0, 10), amount: d.amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return { name: r.meta.longName ?? r.meta.shortName, bars, dividends }
}

async function local(path: string): Promise<unknown> {
  const res = await fetch(path).catch(() => undefined)
  if (!res) throw new IdxFetchError('fetch-failed')
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new IdxFetchError((body as { error?: 'not-found' | 'bad-symbol' | 'rate-limited' }).error ?? 'fetch-failed')
  return body
}
const yahoo = (symbol: string, kind: 'daily' | 'hourly' | 'dividends' | 'quote') => local(`/api/us/chart?symbol=${encodeURIComponent(yahooSymbol(symbol))}&kind=${kind}`)

// ---- Twelve Data (browser, BYOK) ----

const TWELVE = 'https://api.twelvedata.com'
/** Free plan: 8 API credits a minute. */
const PER_MINUTE = 8
const sent: number[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Waits until a call fits in the last minute's budget; calls made in one burst queue one after another. */
let queue: Promise<void> = Promise.resolve()
function throttle(): Promise<void> {
  const turn = queue.then(async () => {
    for (;;) {
      const now = Date.now()
      while (sent.length && now - sent[0] > 60_000) sent.shift()
      if (sent.length < PER_MINUTE) break
      await sleep(60_000 - (now - sent[0]) + 50)
    }
    sent.push(Date.now())
  })
  queue = turn.catch(() => undefined)
  return turn
}

const twelveError = z.object({ status: z.literal('error'), code: z.number().optional(), message: z.string().optional() })
async function twelve(path: string, params: Record<string, string>, key = twelveKey()): Promise<unknown> {
  if (!key) throw new IdxFetchError('no-key')
  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle()
    const res = await fetch(`${TWELVE}${path}?${new URLSearchParams({ ...params, apikey: key })}`).catch(() => undefined)
    if (!res) throw new IdxFetchError('fetch-failed')
    const body: unknown = await res.json().catch(() => undefined)
    const err = twelveError.safeParse(body)
    const code = err.success ? (err.data.code ?? res.status) : res.status
    if (code === 429 && attempt === 0) {
      await sleep(61_000) // Out of this minute's credits (another tab, or a burst): wait one minute, once.
      continue
    }
    if (code === 429) throw new IdxFetchError('rate-limited')
    if (code === 401 || code === 403) throw new IdxFetchError('no-key')
    if (code === 400 || code === 404) throw new IdxFetchError('not-found')
    if (!res.ok || err.success) throw new IdxFetchError('fetch-failed')
    return body
  }
  throw new IdxFetchError('rate-limited')
}

const twelveSeries = z.object({
  meta: z.object({ symbol: z.string() }),
  values: z.array(z.object({ datetime: z.string(), open: z.string(), high: z.string(), low: z.string(), close: z.string(), volume: z.string().optional() })),
})

/**
 * Pure: Twelve Data time_series JSON → bars, oldest first. Daily bars keep their date; intraday times are asked for in
 * UTC (`timezone=UTC`) and become UTC ISO.
 */
export function parseTwelveSeries(json: unknown, intraday = false): Bar[] {
  return twelveSeries
    .parse(json)
    .values.map((v) => ({
      time: intraday ? `${v.datetime.replace(' ', 'T')}Z`.replace(/T(\d\d:\d\d)Z$/, 'T$1:00Z') : v.datetime.slice(0, 10),
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume ?? 0),
    }))
    .filter((b) => [b.open, b.high, b.low, b.close].every(Number.isFinite))
    .sort((a, b) => a.time.localeCompare(b.time))
}

/** Pure: Twelve Data /price for one or many symbols → price by symbol (one symbol answers without the wrapper). */
export function parseTwelvePrices(json: unknown, symbols: readonly string[]): Record<string, number> {
  const one = z.object({ price: z.string() })
  const out: Record<string, number> = {}
  const single = one.safeParse(json)
  if (single.success && symbols.length === 1) {
    const p = Number(single.data.price)
    if (Number.isFinite(p)) out[symbols[0]] = p
    return out
  }
  const many = z.record(z.string(), z.unknown()).parse(json)
  for (const s of symbols) {
    const r = one.safeParse(many[s])
    const p = r.success ? Number(r.data.price) : NaN
    if (Number.isFinite(p)) out[s] = p
  }
  return out
}

// ---- What the app calls ----

/** Both sources in order: Yahoo locally, then Twelve Data when there's a key. The first error is the one shown. */
async function either<T>(viaYahoo: () => Promise<T>, viaTwelve: () => Promise<T>): Promise<T> {
  if (!US_LOCAL) return viaTwelve()
  try {
    return await viaYahoo()
  } catch (e) {
    if (!twelveKey() || (e instanceof IdxFetchError && (e.code === 'not-found' || e.code === 'bad-symbol'))) throw e
    return viaTwelve()
  }
}

const checkSymbol = (s: string) => {
  if (!US_SYMBOL.test(s) && s !== US_INDEX) throw new IdxFetchError('bad-symbol')
}

/** About five years of daily bars (enough for MA200 and the backtest). */
export async function fetchUsHistory(symbol: string): Promise<{ name?: string; bars: Bar[] }> {
  checkSymbol(symbol)
  return either(
    async () => {
      const { name, bars } = parseYahooChart(await yahoo(symbol, 'daily'))
      return { name, bars }
    },
    async () => ({ bars: parseTwelveSeries(await twelve('/time_series', { symbol, interval: '1day', outputsize: '1300' })) }),
  )
}

/** About a year of hourly bars, regular session only. */
export async function fetchUsHourly(symbol: string): Promise<Bar[]> {
  checkSymbol(symbol)
  return either(
    async () => parseYahooChart(await yahoo(symbol, 'hourly'), true).bars,
    async () => parseTwelveSeries(await twelve('/time_series', { symbol, interval: '1h', outputsize: '1800', timezone: 'UTC' }), true),
  )
}

/** Latest price per symbol (USD). Unknown symbols are left out. */
export async function fetchUsPrices(symbols: readonly string[]): Promise<Record<string, number>> {
  const list = [...new Set(symbols.filter((s) => US_SYMBOL.test(s)))]
  if (!list.length) return {}
  return either(
    async () => {
      const out: Record<string, number> = {}
      for (const s of list) {
        try {
          const last = parseYahooChart(await yahoo(s, 'quote')).bars.at(-1)
          if (last) out[s] = last.close
        } catch {
          // One unknown ticker doesn't stop the others.
        }
      }
      return out
    },
    // Twelve Data charts one credit per symbol, so a batch counts against the minute's eight; split to stay inside.
    async () => {
      const out: Record<string, number> = {}
      for (let i = 0; i < list.length; i += PER_MINUTE) {
        const chunk = list.slice(i, i + PER_MINUTE)
        Object.assign(out, parseTwelvePrices(await twelve('/price', { symbol: chunk.join(',') }), chunk))
      }
      return out
    },
  )
}

/** Rupiah per US dollar. */
export async function fetchUsdIdr(): Promise<number> {
  const rate = await either(
    async () => parseYahooChart(await local('/api/us/chart?symbol=IDR%3DX&kind=quote')).bars.at(-1)?.close,
    async () => z.object({ rate: z.coerce.number() }).parse(await twelve('/exchange_rate', { symbol: 'USD/IDR' })).rate,
  )
  // A sanity band: a broken quote must never revalue every USD holding.
  if (rate === undefined || !(rate > 5_000 && rate < 50_000)) throw new IdxFetchError('fetch-failed')
  return rate
}

// ---- Fundamentals (Yahoo, local only) ----

const raw = z
  .object({ raw: z.number().optional() })
  .nullish()
  .transform((v) => (v?.raw !== undefined && Number.isFinite(v.raw) ? v.raw : null))
const summary = z.object({
  quoteSummary: z.object({
    result: z
      .array(
        z.object({
          price: z.object({ longName: z.string().nullish(), shortName: z.string().nullish(), marketCap: raw, currency: z.string().nullish() }).optional(),
          summaryDetail: z.object({ trailingPE: raw, dividendYield: raw, beta: raw, fiftyTwoWeekHigh: raw, fiftyTwoWeekLow: raw }).partial().optional(),
          defaultKeyStatistics: z.object({ priceToBook: raw, pegRatio: raw }).partial().optional(),
          financialData: z
            .object({ currentPrice: raw, returnOnEquity: raw, profitMargins: raw, debtToEquity: raw, earningsGrowth: raw, targetMeanPrice: raw, totalDebt: raw, totalCash: raw, currentRatio: raw })
            .partial()
            .optional(),
          assetProfile: z.object({ sector: z.string().nullish() }).partial().optional(),
        }),
      )
      .nullable(),
  }),
})

/** Pure: years in a row, ending last year (or this year if it already paid), with at least one cash dividend. */
export function dividendStreak(dates: readonly string[], today: string): number {
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))))
  let y = Number(today.slice(0, 4))
  if (!years.has(y)) y--
  let n = 0
  while (years.has(y)) {
    n++
    y--
  }
  return n
}

const pctOf = (x: number | null) => (x === null ? null : x * 100)

/**
 * Pure: { summary: quoteSummary, dividends: chart | null } → the same score input as IDX. Yahoo gives ratios as
 * fractions (ROE 0.15) and debt-to-equity in percent (150 = 1.5×); both are converted. Market cap stays in USD (the
 * score takes a USD threshold for US, see `scoreFundamentals`).
 */
export function parseUsFundamentals(json: unknown, symbol: string, today: string): FundamentalRow {
  const body = z.object({ summary: z.unknown(), dividends: z.unknown().nullable() }).parse(json)
  const r = summary.parse(body.summary).quoteSummary.result?.[0]
  if (!r) throw new IdxFetchError('not-found')
  const p: { longName?: string | null; shortName?: string | null; marketCap?: number | null } = r.price ?? {}
  const s = r.summaryDetail ?? {}
  const k = r.defaultKeyStatistics ?? {}
  const f = r.financialData ?? {}
  let divYears: number | null = null
  if (body.dividends) {
    try {
      divYears = dividendStreak(parseYahooChart(body.dividends).dividends.map((d) => d.date), today)
    } catch {
      // Unknown, never zero.
    }
  }
  return {
    symbol,
    name: p.longName ?? p.shortName ?? undefined,
    sector: r.assetProfile?.sector ?? undefined,
    input: {
      price: f.currentPrice ?? null,
      marketCap: p.marketCap ?? null,
      roePct: pctOf(f.returnOnEquity ?? null),
      netMarginPct: pctOf(f.profitMargins ?? null),
      debtToEquity: f.debtToEquity == null ? null : f.debtToEquity / 100,
      dividendYears: divYears,
      earningsGrowthPct: pctOf(f.earningsGrowth ?? null),
      pe: s.trailingPE ?? null,
      pb: k.priceToBook ?? null,
      peg: k.pegRatio ?? null,
      dividendYieldPct: pctOf(s.dividendYield ?? null),
      targetMean: f.targetMeanPrice ?? null,
      totalDebt: f.totalDebt ?? null,
      totalCash: f.totalCash ?? null,
      beta: s.beta ?? null,
      high52: s.fiftyTwoWeekHigh ?? null,
      low52: s.fiftyTwoWeekLow ?? null,
      currentRatio: f.currentRatio ?? null,
    },
  }
}

/** Yahoo fundamentals through the dev server. Deployed: 'local-only' (Twelve Data's fundamentals are paid plans). */
export async function fetchUsFundamentals(symbol: string, today: string): Promise<FundamentalRow> {
  if (!US_LOCAL) throw new IdxFetchError('local-only')
  checkSymbol(symbol)
  return parseUsFundamentals(await local(`/api/us/fundamentals?symbol=${encodeURIComponent(yahooSymbol(symbol))}`), symbol, today)
}
