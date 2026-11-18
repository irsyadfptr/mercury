// One entry point for "what is this market's mood": the IDX formula (mood.ts) or crypto mood v2 (cryptoRegime.ts).
// Both share the same 0–100 scale and the same Defensive line (MOOD_DEFENSIVE), so the live rules treat them alike.
import { cryptoMood, cryptoMoodSeries, type CryptoMood, type RegimeExtras } from './cryptoRegime'
import type { Bar } from './indicators'
import { idxMood, moodSeries, type IdxMood, type MoodLight } from './mood'

export type MoodMarket = 'idx' | 'crypto'
export interface MarketMood {
  score: number
  light: MoodLight
  /** Set for IDX. */
  idx?: IdxMood
  /** Set for crypto. */
  crypto?: CryptoMood
}
/** A scanned ticker's daily bars. */
export interface MoodInput {
  symbol: string
  bars: readonly Bar[]
}

/** The crypto index (BTC) is scored on its own; the rest of the list is the alt universe. */
const CRYPTO_INDEX = 'BTC'
const alts = (rows: readonly MoodInput[]) => rows.filter((r) => r.symbol !== CRYPTO_INDEX).map((r) => r.bars)

export function marketMood(market: MoodMarket, index: readonly Bar[] | undefined, rows: readonly MoodInput[], extras?: RegimeExtras): MarketMood | undefined {
  if (market === 'idx') {
    const m = idxMood(index ?? [], rows.map((r) => r.bars))
    return m && { score: m.score, light: m.light, idx: m }
  }
  const m = cryptoMood(index ?? [], alts(rows), extras)
  return m && { score: m.score, light: m.light, crypto: m }
}

/** Mood score as of each past date (crypto: the price-only parts; see cryptoMoodSeries). */
export const marketMoodSeries = (market: MoodMarket, index: readonly Bar[] | undefined, rows: readonly MoodInput[]): Map<string, number> =>
  market === 'idx' ? moodSeries(index ?? [], rows.map((r) => r.bars)) : cryptoMoodSeries(index ?? [], alts(rows))
