// Binance public market data: daily crypto candles in USDT. No key, and callable from the browser, so it works on the deployed site too.
import { z } from 'zod'
import { IdxFetchError } from './idx'
import type { Bar } from './indicators'

const BASE = 'https://data-api.binance.vision/api/v3'
/** Coin tickers as typed: BTC, ETH, 1INCH… */
export const COIN = /^[A-Z0-9]{2,10}$/

// [openTime, open, high, low, close, volume, closeTime, ...]
const kline = z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string(), z.number()]).rest(z.unknown())

/** Pure: Binance klines → bars, dropping today's candle while it is still forming (it closes 00:00 UTC). */
export function parseKlines(json: unknown, now = Date.now()): Bar[] {
  return z
    .array(kline)
    .parse(json)
    .filter((k) => k[6] < now)
    .map(([openTime, open, high, low, close, volume]) => ({
      time: new Date(openTime).toISOString().slice(0, 10),
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
