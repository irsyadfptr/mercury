// Binance public market data: daily crypto candles in USDT. No key, and callable from the browser, so it works on the deployed site too.
import { z } from 'zod'
import { IdxFetchError } from './idx'
import type { Bar } from './indicators'

const BASE = 'https://data-api.binance.vision/api/v3'
/** Coin tickers as typed: BTC, ETH, 1INCH… */
export const COIN = /^[A-Z0-9]{2,10}$/

// [openTime, open, high, low, close, volume, closeTime, ...]
const kline = z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string(), z.number()]).rest(z.unknown())

/**
 * Pure: Binance klines → bars, dropping the candle still forming (today's daily candle closes 00:00 UTC).
 * `intraday` keeps the full UTC timestamp as the time (hourly bars); otherwise it is the date.
 */
export function parseKlines(json: unknown, now = Date.now(), intraday = false): Bar[] {
  return z
    .array(kline)
    .parse(json)
    .filter((k) => k[6] < now)
    .map(([openTime, open, high, low, close, volume]) => ({
      time: intraday ? new Date(openTime).toISOString() : new Date(openTime).toISOString().slice(0, 10),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    }))
}

/** ~2.7 years of daily candles for COIN/USDT. */
export async function fetchCryptoHistory(coin: string): Promise<{ name?: string; bars: Bar[] }> {
  if (!COIN.test(coin)) throw new IdxFetchError('bad-symbol')
  const res = await fetch(`${BASE}/klines?symbol=${coin}USDT&interval=1d&limit=1000`).catch(() => undefined)
  if (res?.status === 400) throw new IdxFetchError('not-found') // Binance answers 400 for an unknown symbol
  if (!res?.ok) throw new IdxFetchError('fetch-failed')
  return { name: `${coin}/USDT`, bars: parseKlines(await res.json()) }
}

/** Chart-only candles for COIN/USDT at another bar size (1h, 4h, 1w, 1M), the latest 1,000. The forming candle is kept: it's a view, not a signal. */
export async function fetchCryptoFrame(coin: string, interval: '1h' | '4h' | '1w' | '1M'): Promise<Bar[]> {
  if (!COIN.test(coin)) throw new IdxFetchError('bad-symbol')
  const res = await fetch(`${BASE}/klines?symbol=${coin}USDT&interval=${interval}&limit=1000`).catch(() => undefined)
  if (!res?.ok) throw new IdxFetchError('fetch-failed')
  return parseKlines(await res.json(), Infinity, interval === '1h' || interval === '4h')
}
